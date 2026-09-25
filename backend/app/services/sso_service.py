"""
SSO/SAML authentication service.

Manages SAML 2.0 identity provider configurations and handles the
SSO callback flow: parse SAML response → extract attributes →
find or create user → return JWT.
"""

import logging
from dataclasses import dataclass, asdict
from typing import Optional
from datetime import datetime, timezone

from app.services.postgres_db import get_storage

logger = logging.getLogger(__name__)


@dataclass
class IdpConfig:
    """SAML Identity Provider configuration stored per team."""
    team_id: str
    idp_type: str  # okta, azure_ad, google_workspace, onelogin, custom
    entity_id: str
    sso_url: str
    x509_cert: str
    domain: str  # e.g. "company.com"
    metadata_xml: str = ""
    active: bool = True
    config_id: str = ""
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        """Handle extra fields from storage backend (e.g. 'id' field)."""
        pass

    @classmethod
    def from_dict(cls, data: dict) -> "IdpConfig":
        """Create IdpConfig from storage dict, ignoring extra keys."""
        known_fields = {"team_id", "idp_type", "entity_id", "sso_url", "x509_cert",
                       "domain", "metadata_xml", "active", "config_id", "created_at", "updated_at"}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        return cls(**filtered)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── CRUD ────────────────────────────────────────────────────────────────


async def save_config(config: IdpConfig) -> IdpConfig:
    """Create or update an IdP configuration."""
    storage = get_storage()
    now = _now()
    # Dynamic document ids are strings. A deterministic team key prevents two
    # concurrent first-time configuration writes from creating duplicate IdPs.
    config_id = config.config_id or f"team:{config.team_id}"
    config.config_id = config_id
    config.created_at = config.created_at or now
    config.updated_at = now

    existing = await storage.get_document("sso_idp_configs", config_id)
    if existing:
        await storage.update_document("sso_idp_configs", config_id, asdict(config))
    else:
        await storage.create_document("sso_idp_configs", config_id, asdict(config))
    return config


async def get_config(team_id: str) -> Optional[IdpConfig]:
    """Get the IdP configuration for a team."""
    storage = get_storage()
    docs = await storage.query_documents(
        "sso_idp_configs",
        [("team_id", "==", team_id)],
    )
    if not docs:
        return None
    return IdpConfig.from_dict(docs[0])


async def delete_config(team_id: str) -> bool:
    """Delete the IdP configuration for a team."""
    config = await get_config(team_id)
    if not config:
        return False
    storage = get_storage()
    await storage.delete_document("sso_idp_configs", config.config_id)
    return True


async def find_config_by_domain(domain: str) -> Optional[IdpConfig]:
    """Find an active IdP configuration matching the email domain."""
    storage = get_storage()
    docs = await storage.query_documents(
        "sso_idp_configs",
        [("domain", "==", domain), ("active", "==", True)],
    )
    if not docs:
        return None
    return IdpConfig.from_dict(docs[0])


# ── SAML helpers ────────────────────────────────────────────────────────


async def build_saml_settings(config: IdpConfig) -> dict:
    """Build SAML settings dict from an IdpConfig.

    Returns a dict compatible with python3-saml's OneLogin_Saml2_settings.
    In production this would construct the full settings object.
    """
    return {
        "strict": True,
        "debug": False,
        "sp": {
            "entityId": "onramp-saml-sp",
            "assertionConsumerService": {
                "url": "/api/v1/auth/sso/callback",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
        },
        "idp": {
            "entityId": config.entity_id,
            "singleSignOnService": {
                "url": config.sso_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": config.x509_cert,
        },
    }


async def parse_metadata_xml(metadata_xml: str) -> dict:
    """Reject metadata-only SSO configuration until a real XML parser is enabled.

    Returning synthetic entity IDs/certificates would make a configuration look
    valid while no usable IdP settings exist. Callers must provide explicit
    entity ID, SSO URL, and certificate fields instead.
    """
    if metadata_xml.strip():
        raise ValueError(
            "SAML metadata import is not enabled; provide entity_id, sso_url, and x509_cert explicitly"
        )
    return {}


async def handle_sso_callback(saml_response: str, relay_state: str = "") -> dict:
    """Fail closed until a signed SAML verifier is configured.

    This function previously returned a mock JWT and identity. Keeping a fake
    success path in an authentication service is unsafe if a route starts
    calling it accidentally, so authentication is explicitly unavailable.
    """
    logger.warning("SAML callback rejected because SAML verification is not configured")
    return {
        "success": False,
        "error": "SAML authentication is not configured",
    }


async def test_connection(team_id: str) -> dict:
    """Test the IdP connection by validating the stored configuration.

    Returns a dict with success status and any errors found.
    """
    config = await get_config(team_id)
    if not config:
        return {"success": False, "errors": ["No SSO configuration found"]}

    errors = []
    if not config.entity_id:
        errors.append("Entity ID is required")
    if not config.sso_url:
        errors.append("SSO URL is required")
    if not config.x509_cert:
        errors.append("X.509 certificate is required")
    if not config.domain:
        errors.append("Domain is required")

    if errors:
        return {"success": False, "errors": errors}

    return {
        "success": True,
        "message": f"Configuration valid for {config.idp_type} on domain {config.domain}",
        "idp_type": config.idp_type,
        "domain": config.domain,
    }

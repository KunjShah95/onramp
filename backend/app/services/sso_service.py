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

from app.services.postgres_db import get_storage, generate_id

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
    config_id = config.config_id or generate_id()
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
    """Parse IdP metadata XML and extract entity_id, sso_url, and x509_cert.

    In production this would parse actual SAML metadata XML. For now,
    returns a placeholder dict indicating metadata was provided.
    """
    if not metadata_xml.strip():
        return {}
    return {
        "entity_id": "parsed-from-metadata",
        "sso_url": "parsed-from-metadata",
        "x509_cert": "parsed-from-metadata",
        "metadata_provided": True,
    }


async def handle_sso_callback(saml_response: str, relay_state: str = "") -> dict:
    """Handle a SAML SSO callback response.

    In production this would:
    1. Instantiate OneLogin_Saml2_Response with the SAML response
    2. Validate the response signature
    3. Extract attributes (email, name)
    4. Find or create the user
    5. Generate a JWT

    For now, returns a structured result suitable for testing.
    """
    if not saml_response:
        return {"success": False, "error": "Empty SAML response"}

    # Placeholder: simulate attribute extraction
    attributes = {
        "email": "user@company.com",
        "name": "SSO User",
    }

    return {
        "success": True,
        "attributes": attributes,
        "relay_state": relay_state,
        "token": "mock-sso-jwt-token",
        "user_id": "mock-sso-user-id",
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

"""
Unit tests for the SSO/SAML authentication service.

Tests IdP configuration CRUD, SAML callback handling, domain-based
routing, and connection testing.

By default runs against InMemoryStorage. Pass --run-postgres to also run
against PostgreSQL:
  pytest tests/test_sso_service.py --run-postgres
"""

import os
import pytest
from app.services import sso_service as sso
from tests.conftest import TUID_TEAM_ALPHA


# ── Dual-backend parametrization ────────────────────────────────────────

pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(params=["memory", "postgres"])
def storage_backend(request):
    """Override conftest's storage_backend with parametrized version."""
    backend = request.param
    run_postgres = request.config.getoption("--run-postgres")

    if backend == "postgres" and not run_postgres:
        pytest.skip("PostgreSQL disabled (use --run-postgres)")

    os.environ["STORAGE_BACKEND"] = "" if backend == "postgres" else "memory"
    import app.services.postgres_db as postgres_db
    postgres_db._storage = None
    yield backend
    os.environ["STORAGE_BACKEND"] = "memory"
    postgres_db._storage = None


@pytest.fixture
def sample_config():
    """Create a sample IdP configuration fixture."""
    return sso.IdpConfig(
        team_id=TUID_TEAM_ALPHA,
        idp_type="okta",
        entity_id="https://dev-1234.okta.com/saml/metadata",
        sso_url="https://dev-1234.okta.com/saml/sso",
        x509_cert="-----BEGIN CERTIFICATE-----\nMIIBxTCCAS0CAQAwDQYJKoZIhvcNAQEF\n-----END CERTIFICATE-----",
        domain="company.com",
    )


# ═══════════════════════════════════════════════════════════════
# IdP Configuration CRUD
# ═══════════════════════════════════════════════════════════════


class TestSaveConfig:
    async def test_save_new_config(self, sample_config):
        """Saving a new IdP config creates it and assigns a config_id."""
        config = await sso.save_config(sample_config)
        assert config.config_id is not None
        assert config.config_id != ""
        assert config.team_id == TUID_TEAM_ALPHA
        assert config.idp_type == "okta"
        assert config.domain == "company.com"
        assert config.created_at is not None
        assert config.updated_at is not None

    async def test_save_update_existing(self, sample_config):
        """Saving an existing config updates it."""
        config = await sso.save_config(sample_config)
        original_id = config.config_id
        original_created = config.created_at

        config.domain = "newdomain.com"
        updated = await sso.save_config(config)

        assert updated.config_id == original_id
        assert updated.domain == "newdomain.com"
        assert updated.created_at == original_created
        assert updated.updated_at != original_created

    async def test_save_multiple_configs(self, sample_config):
        """Saving configs for different teams creates separate configs."""
        from tests.conftest import TUID_TEAM_BETA

        c1 = await sso.save_config(sample_config)
        # Create a second config with a fresh IdpConfig object
        from app.services.sso_service import IdpConfig
        c2_config = IdpConfig(
            team_id=TUID_TEAM_BETA,
            idp_type="okta",
            entity_id="https://dev-5678.okta.com/saml/metadata",
            sso_url="https://dev-5678.okta.com/saml/sso",
            x509_cert="test-cert",
            domain="beta-company.com",
        )
        c2 = await sso.save_config(c2_config)

        assert c1.config_id != c2.config_id
        assert c1.team_id != c2.team_id


class TestGetConfig:
    async def test_get_existing(self, sample_config):
        """Getting an existing config returns the full config."""
        saved = await sso.save_config(sample_config)
        fetched = await sso.get_config(TUID_TEAM_ALPHA)
        assert fetched is not None
        assert fetched.config_id == saved.config_id
        assert fetched.domain == "company.com"
        assert fetched.idp_type == "okta"

    async def test_get_nonexistent_team(self):
        """Getting a config for a team with no config returns None."""
        config = await sso.get_config("nonexistent-team-id")
        assert config is None


class TestDeleteConfig:
    async def test_delete_existing(self, sample_config):
        """Deleting an existing config returns True."""
        await sso.save_config(sample_config)
        result = await sso.delete_config(TUID_TEAM_ALPHA)
        assert result is True
        assert await sso.get_config(TUID_TEAM_ALPHA) is None

    async def test_delete_nonexistent(self):
        """Deleting a nonexistent config returns False."""
        result = await sso.delete_config("nonexistent-team-id")
        assert result is False


# ═══════════════════════════════════════════════════════════════
# Domain-Based Routing
# ═══════════════════════════════════════════════════════════════


class TestDomainRouting:
    async def test_find_by_domain(self, sample_config):
        """Finding a config by domain returns the matching config."""
        await sso.save_config(sample_config)
        config = await sso.find_config_by_domain("company.com")
        assert config is not None
        assert config.domain == "company.com"
        assert config.team_id == TUID_TEAM_ALPHA

    async def test_find_by_domain_nonexistent(self):
        """Finding a config by a domain with no match returns None."""
        config = await sso.find_config_by_domain("unknown.com")
        assert config is None

    async def test_find_inactive_config(self, sample_config):
        """Finding a config by domain ignores inactive configs."""
        sample_config.active = False
        await sso.save_config(sample_config)
        config = await sso.find_config_by_domain("company.com")
        assert config is None


# ═══════════════════════════════════════════════════════════════
# SAML Helpers
# ═══════════════════════════════════════════════════════════════


class TestBuildSamlSettings:
    async def test_build_settings(self, sample_config):
        """Building SAML settings returns the expected structure."""
        settings = await sso.build_saml_settings(sample_config)
        assert settings["strict"] is True
        assert settings["sp"]["entityId"] == "onramp-saml-sp"
        assert settings["idp"]["entityId"] == sample_config.entity_id
        assert settings["idp"]["singleSignOnService"]["url"] == sample_config.sso_url
        assert settings["idp"]["x509cert"] == sample_config.x509_cert


class TestParseMetadataXml:
    async def test_parse_valid_xml(self):
        """Parsing a metadata XML string returns extracted fields."""
        xml = """<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                         Location="https://idp.example.com/saml/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>"""
        result = await sso.parse_metadata_xml(xml)
        assert result.get("metadata_provided") is True

    async def test_parse_empty_xml(self):
        """Parsing empty metadata XML returns empty dict."""
        result = await sso.parse_metadata_xml("")
        assert result == {}


class TestHandleSsoCallback:
    async def test_valid_response(self):
        """Handling a valid SAML response returns success with attributes."""
        result = await sso.handle_sso_callback("valid-saml-response")
        assert result["success"] is True
        assert "email" in result["attributes"]
        assert "name" in result["attributes"]
        assert result["token"] is not None

    async def test_empty_response(self):
        """Handling an empty SAML response returns failure."""
        result = await sso.handle_sso_callback("")
        assert result["success"] is False
        assert "error" in result


# ═══════════════════════════════════════════════════════════════
# Connection Testing
# ═══════════════════════════════════════════════════════════════


class TestConnection:
    async def test_test_connection_success(self, sample_config):
        """Testing a valid connection returns success."""
        await sso.save_config(sample_config)
        result = await sso.test_connection(TUID_TEAM_ALPHA)
        assert result["success"] is True
        assert result["idp_type"] == "okta"
        assert result["domain"] == "company.com"

    async def test_test_connection_no_config(self):
        """Testing with no config returns failure with error list."""
        result = await sso.test_connection("nonexistent-team-id")
        assert result["success"] is False
        assert "errors" in result
        assert len(result["errors"]) > 0

    async def test_test_connection_missing_fields(self, sample_config):
        """Testing a config with missing fields returns validation errors."""
        sample_config.entity_id = ""
        sample_config.sso_url = ""
        await sso.save_config(sample_config)
        result = await sso.test_connection(TUID_TEAM_ALPHA)
        assert result["success"] is False
        assert any("Entity ID" in e for e in result["errors"])
        assert any("SSO URL" in e for e in result["errors"])

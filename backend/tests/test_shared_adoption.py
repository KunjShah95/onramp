from fastapi import HTTPException


def test_routing_store_delegates():
    from app.services import team_routing_settings as m
    assert hasattr(m, "_store")
    assert hasattr(m, "_invalidate_team_cache")
    assert hasattr(m, "COLLECTION")


def test_platform_store_delegates():
    from app.services import platform_provider_keys as m
    assert hasattr(m, "_store")
    assert hasattr(m, "_invalidate_cache")


def test_audit_store_present():
    from app.services import audit_service, audit_log_service
    assert hasattr(audit_service, "COLLECTION")
    assert hasattr(audit_service, "_store")
    assert hasattr(audit_log_service, "AUDIT_COLLECTION")
    assert hasattr(audit_log_service, "_store")


def test_quota_domain_errors():
    from app.services._shared import errors
    assert issubclass(errors.QuotaExceeded, errors.DomainError)
    assert issubclass(errors.PaymentRequired, errors.DomainError)


async def test_quota_http_shapes_preserved():
    from app.services import quota
    from app.services._shared.errors import PaymentRequired, QuotaExceeded
    # check_and_record with unknown scope should not raise for free tier
    # (usage tracker is memory-backed in tests); just verify mappers exist.
    assert hasattr(quota, "_quota_http")
    http_exc = quota._quota_http(
        QuotaExceeded("Monthly credit quota exceeded", details={"used": 1, "limit": 2, "tier": "free"})
    )
    assert isinstance(http_exc, HTTPException)
    assert http_exc.status_code == 429
    assert http_exc.detail["code"] == "QUOTA_EXCEEDED"

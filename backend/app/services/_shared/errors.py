"""Domain errors — services raise these, routers map to HTTP (shapes preserved)."""
from fastapi import HTTPException


class DomainError(Exception):
    status_code = 500
    code = "INTERNAL"

    def __init__(self, message="Internal error", *, details=None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class QuotaExceeded(DomainError):
    status_code = 429
    code = "QUOTA_EXCEEDED"


class PaymentRequired(DomainError):
    status_code = 402
    code = "INSUFFICIENT_CREDITS"


class NotFound(DomainError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(DomainError):
    status_code = 409
    code = "CONFLICT"


def to_http(exc: DomainError) -> HTTPException:
    detail = {"error": exc.message, "code": exc.code}
    detail.update(exc.details)
    return HTTPException(status_code=exc.status_code, detail=detail)

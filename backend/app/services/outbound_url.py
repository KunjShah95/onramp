"""SSRF-safe outbound URL validation for user-configured integrations.

This is intentionally conservative: integrations may only use HTTPS to a
public host, must not carry URL credentials, and must resolve to public IPs.
Callers must invoke this immediately before every request as DNS can change
between validation and connection.
"""
from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse


class OutboundURLError(ValueError):
    """Raised when a user-controlled outbound URL is unsafe."""


def _is_public_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value)
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
        or ip.is_multicast or ip.is_unspecified
    )


def validate_outbound_url(url: str, *, allow_http: bool = False) -> str:
    """Validate an outbound URL and return its normalized string.

    Raises ``OutboundURLError`` for malformed URLs, private/local destinations,
    URL credentials, and non-HTTPS production schemes.

    In non-production environments (ENV != production), HTTP and private/local
    destinations are permitted to support local n8n and other dev integrations.
    """
    dev_mode = os.getenv("ENV", "development").lower() != "production"
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ({"https", "http"} if (allow_http or dev_mode) else {"https"}):
        raise OutboundURLError("Outbound integrations must use HTTPS")
    if not parsed.hostname or parsed.username or parsed.password:
        raise OutboundURLError("Outbound URL must contain a host and no credentials")
    if parsed.fragment:
        raise OutboundURLError("Outbound URL fragments are not allowed")

    if dev_mode:
        return raw

    host = parsed.hostname.rstrip(".").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost"):
        raise OutboundURLError("Local destinations are not allowed")
    try:
        addresses = {ipaddress.ip_address(host)}
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise OutboundURLError("Outbound host could not be resolved") from exc
        addresses = set()
        for info in infos:
            try:
                addresses.add(ipaddress.ip_address(info[4][0]))
            except ValueError:
                continue
    if not addresses or any(not _is_public_ip(str(address)) for address in addresses):
        raise OutboundURLError("Private, local, and reserved destinations are not allowed")

    allowed = {
        item.strip().lower()
        for item in os.getenv("OUTBOUND_ALLOWED_HOSTS", "").split(",")
        if item.strip()
    }
    if allowed and host not in allowed:
        raise OutboundURLError("Outbound host is not allow-listed")
    return raw

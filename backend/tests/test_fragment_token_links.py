"""Emailed credentials must not travel in the query string.

A password-reset, email-verification, or team-invite token is a bearer
credential. In a query string it lands in every web server access log, every
proxy log, and the Referer header of anything the page loads. The fragment is
never sent to a server, so that is where it now goes.
"""
import pytest

from app.services.frontend_links import build_fragment_token_link


def test_token_is_in_the_fragment_not_the_query():
    link = build_fragment_token_link("https://onramp.app", "/reset-password", "abc123")
    assert link == "https://onramp.app/reset-password#token=abc123"
    assert "?" not in link, "a query string would be logged by the server"


@pytest.mark.parametrize("path", ["/reset-password", "/verify-email", "/join"])
def test_no_query_string_for_any_emailed_credential(path):
    link = build_fragment_token_link("https://onramp.app", path, "secret-token")
    assert link.startswith(f"https://onramp.app{path}#")
    assert "token=" in link
    assert "?" not in link


def test_base_url_trailing_slash_is_normalised():
    assert build_fragment_token_link(
        "https://onramp.app/", "/reset-password", "t"
    ) == "https://onramp.app/reset-password#token=t"


def test_path_without_leading_slash_is_tolerated():
    assert build_fragment_token_link(
        "https://onramp.app", "reset-password", "t"
    ) == "https://onramp.app/reset-password#token=t"


def test_jwt_survives_intact():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJ4In0.sig-part_here"
    link = build_fragment_token_link("https://onramp.app", "/reset-password", jwt)
    assert link.endswith(f"#token={jwt}")


def test_token_is_percent_encoded_so_nothing_can_be_injected():
    link = build_fragment_token_link(
        "https://onramp.app", "/reset-password", "tok&admin=true#evil"
    )
    # No raw & or # smuggled into the URL structure.
    assert link.count("#") == 1
    assert "&" not in link.split("#", 1)[1]


def test_empty_token_does_not_crash():
    assert build_fragment_token_link("https://onramp.app", "/join", "") == \
        "https://onramp.app/join#token="


def test_none_token_does_not_crash():
    assert build_fragment_token_link("https://onramp.app", "/join", None) == \
        "https://onramp.app/join#token="

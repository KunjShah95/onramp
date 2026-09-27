"""Helpers for building links we email to people.

Single-use credentials (password resets, email verification, team invites)
used to travel in the query string: ``/reset-password?token=<jwt>``. That puts
a bearer credential into every web server access log, every proxy log, and the
``Referer`` header of any resource the page loads. It is a real exposure for a
product whose entire pitch is how carefully customer data is handled.

The token now travels in the URL **fragment** instead. Fragments are never sent
to the server by the browser, so they cannot appear in a request log. This is
the same mechanism OAuth 2.0 uses for tokens for the same reason.

The frontend reads the fragment first and still accepts ``?token=`` as a
fallback, because reset and invite emails already sitting in inboxes were sent
with the old form and must keep working.
"""

from urllib.parse import quote


def build_fragment_token_link(base_url: str, path: str, token: str) -> str:
    """Build ``<base_url><path>#token=<token>`` with the token percent-encoded.

    ``path`` is expected to start with ``/``. The token is quoted so a JWT's
    base64url characters survive verbatim and nothing can be injected into the
    fragment.
    """
    base = (base_url or "").rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}#token={quote(token or '', safe='')}"

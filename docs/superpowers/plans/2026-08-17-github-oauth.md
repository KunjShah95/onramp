# Complete GitHub OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the GitHub OAuth experience: persistent OAuth sessions (refresh tokens), GitHub unlink, login/sign-up test coverage, and setup documentation.

**Architecture:** The OAuth backend (`backend/app/services/oauth_service.py`) currently issues bare 15-min access tokens with no refresh token, so OAuth sessions die while "remember me" password sessions persist. We switch the find-or-create and account-linking paths to `_issue_tokens(..., remember_me=True)`, pass the refresh token through the callback redirect, and store it on the frontend. Add an authenticated `POST /auth/oauth/github/unlink` endpoint (clears `github_id`/`github_username` to NULL via the existing `update_user_profile`, which already normalizes empty strings to `None`) with a Profile-page Disconnect action. Add login-mode tests reusing the established db-stub + mocked `httpx` patterns.

**Tech Stack:** Python/FastAPI/SQLAlchemy/httpx, pytest, React 19/TypeScript/Vite, Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-08-17-github-oauth-design.md`

**Conventions:**
- All backend test commands run from `backend/` (`python -m pytest <file> -v`).
- All frontend commands run from `web/` (`npm run build`, `npm run lint`).
- The `docs/superpowers/` tree is gitignored → commit with `git add -f`.

---

### Task 1: Login/sign-up mode tests (TDD — write the failing suite first)

**Files:**
- Create: `backend/tests/test_oauth_login.py`

- [ ] **Step 1: Write the test file**

```python
"""Tests for the GitHub OAuth login/sign-up flow (and a Google regression).

Covers the default login mode that test_oauth_linking.py skips:

- first-time GitHub login creates a user (provider "github.com")
- existing GitHub users sign in without re-creation (identity re-synced)
- provider mismatch with a password account is rejected
- GitHub user endpoint without an email falls back to /user/emails
- success responses include a refresh token so OAuth sessions persist
  (same as "remember me" password sessions) instead of dying after the
  15-minute access window
- Google login regression guard (shares the find-or-create helper)

The ORM block inside _find_or_create_oauth_user needs a database, so
db_config is stubbed with an in-memory fake session (same pattern as
test_auto_personal_team.py).
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.testclient import TestClient

from app.api.v1.auth import router as auth_router
from app.services import oauth_service
from app.services.oauth_service import (
    get_github_login_url,
    get_google_login_url,
    handle_github_callback,
    handle_google_callback,
    _state_store,
)
from app.services.user_service import create_user, update_user_profile


pytestmark = pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base")


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    """Keep OAuth state tests hermetic: no REDIS_URL → in-memory fallback."""
    monkeypatch.delenv("REDIS_URL", raising=False)
    import app.services.cache_service as cache_service

    cache_service._client = None
    oauth_service._redis_unavailable_until = 0.0
    _state_store.clear()
    yield
    cache_service._client = None
    oauth_service._redis_unavailable_until = 0.0
    _state_store.clear()


class _FakeResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json = json_data
        self.text = str(json_data)

    def json(self):
        return self._json


def _fake_github_client(post_response, get_response):
    client = AsyncMock()
    client.post.return_value = post_response
    client.get.return_value = get_response
    client.__aenter__.return_value = client
    client.__aexit__.return_value = False
    return client


def _state_from_url(url: str) -> str:
    from urllib.parse import parse_qs, urlsplit

    return parse_qs(urlsplit(url).query)["state"][0]


class _FakeScalarResult:
    def __init__(self, row=None):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeSession:
    def __init__(self, existing_row=None):
        self._existing_row = existing_row

    async def execute(self, *args, **kwargs):
        return _FakeScalarResult(self._existing_row)

    def add(self, obj):
        pass

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


async def _noop_ensure_engine():
    return None


def _stub_db_config(existing_row=None, monkeypatch=None):
    """Swap oauth_service.db_config for an in-memory fake (no Postgres needed)."""

    def _factory():
        return _FakeSession(existing_row)

    monkeypatch.setattr(oauth_service.db_config, "ensure_engine", _noop_ensure_engine)
    monkeypatch.setattr(oauth_service.db_config, "get_session_factory", lambda: _factory)


def _github_user(login="octocat", email="octocat@example.com", gid="4242"):
    return {"id": gid, "login": login, "name": "The Octocat", "email": email}


# ═══════════════════════════════════════════════════════════════════════
# GitHub login mode
# ═══════════════════════════════════════════════════════════════════════


class TestGithubLoginMode:
    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_new_user_created_on_first_github_login(self, mock_client_cls, monkeypatch):
        _stub_db_config(monkeypatch=monkeypatch)
        spy = []

        async def _spy_team(user_id, display_name, role="junior_dev"):
            spy.append((user_id, display_name, role))

        monkeypatch.setattr(oauth_service, "create_personal_team", _spy_team)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_login_token"}),
            _FakeResponse(200, _github_user()),
        )

        url = await get_github_login_url()
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["provider"] == "github.com"
        assert result["email"] == "octocat@example.com"
        assert result["token"]
        assert result.get("refresh_token")
        # A brand-new account was created and provisioned a personal team.
        assert len(spy) == 1
        assert spy[0][0] == result["uid"]

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_existing_github_user_signs_in_and_resyncs_identity(self, mock_client_cls, monkeypatch):
        existing = SimpleNamespace(
            provider="github.com",
            is_active=True,
            id="f0000000-0000-4000-a000-0000000000f1",
            email="octocat@example.com",
            name="Old Name",
            github_username="oldlogin",
            github_id="999",
            updated_at=None,
        )
        _stub_db_config(existing_row=existing, monkeypatch=monkeypatch)
        calls = []

        async def _spy_team(user_id, display_name, role="junior_dev"):
            calls.append((user_id, display_name, role))

        monkeypatch.setattr(oauth_service, "create_personal_team", _spy_team)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_login_token"}),
            _FakeResponse(200, _github_user()),
        )

        url = await get_github_login_url()
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["uid"] == existing.id
        assert result["token"]
        assert result.get("refresh_token")
        # No second account, no second team — identity is re-synced in place.
        assert calls == []
        assert existing.github_username == "octocat"
        assert existing.github_id == "4242"

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_provider_mismatch_with_password_account_raises(self, mock_client_cls, monkeypatch):
        existing = SimpleNamespace(
            provider="password",
            is_active=True,
            id="f0000000-0000-4000-a000-0000000000f2",
            email="pw@example.com",
            name="PW User",
            github_username=None,
            github_id=None,
            updated_at=None,
        )
        _stub_db_config(existing_row=existing, monkeypatch=monkeypatch)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "gho_login_token"}),
            _FakeResponse(200, _github_user(email="pw@example.com")),
        )

        url = await get_github_login_url()
        with pytest.raises(ValueError, match="already registered with password"):
            await handle_github_callback(code="test-code", state=_state_from_url(url))

    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_email_fallback_uses_primary_verified_email(self, mock_client_cls, monkeypatch):
        _stub_db_config(monkeypatch=monkeypatch)
        client = AsyncMock()
        client.post.return_value = _FakeResponse(200, {"access_token": "gho_login_token"})
        client.get.side_effect = [
            _FakeResponse(200, {"id": 4242, "login": "octocat", "name": "The Octocat", "email": None}),
            _FakeResponse(200, [
                {"email": "secondary@example.com", "primary": False, "verified": True},
                {"email": "octocat@example.com", "primary": True, "verified": True},
            ]),
        ]
        client.__aenter__.return_value = client
        client.__aexit__.return_value = False
        mock_client_cls.return_value = client

        url = await get_github_login_url()
        result = await handle_github_callback(code="test-code", state=_state_from_url(url))

        assert result["email"] == "octocat@example.com"
        assert result["token"]
        assert result.get("refresh_token")


# ═══════════════════════════════════════════════════════════════════════
# Google regression (shares the find-or-create helper)
# ═══════════════════════════════════════════════════════════════════════


class TestGoogleLoginMode:
    @patch("app.services.oauth_service.httpx.AsyncClient")
    async def test_google_login_returns_token_and_refresh_token(self, mock_client_cls, monkeypatch):
        _stub_db_config(monkeypatch=monkeypatch)
        mock_client_cls.return_value = _fake_github_client(
            _FakeResponse(200, {"access_token": "goog_token"}),
            _FakeResponse(200, {"id": "g-1", "email": "gmail@example.com", "name": "G User"}),
        )

        url = await get_google_login_url()
        result = await handle_google_callback(code="test-code", state=_state_from_url(url))

        assert result["provider"] == "google.com"
        assert result["email"] == "gmail@example.com"
        assert result["token"]
        assert result.get("refresh_token")


# ═══════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/oauth/github/unlink
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def unlink_client():
    app = FastAPI()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {
                "uid": "unlink-user",
                "email": "unlink@example.com",
                "name": "Unlinker",
                "provider": "password",
            }
            return await call_next(request)

    app.add_middleware(_SetUser)
    app.include_router(auth_router, prefix="/api/v1")
    return TestClient(app)


async def _seed_unlink_user():
    await create_user(
        uid="unlink-user", email="unlink@example.com", name="Unlinker", provider="password"
    )
    await update_user_profile("unlink-user", {"github_username": "octocat", "github_id": "4242"})


def test_unlink_requires_auth():
    plain_app = FastAPI()
    plain_app.include_router(auth_router, prefix="/api/v1")
    resp = TestClient(plain_app).post("/api/v1/auth/oauth/github/unlink", json={})
    assert resp.status_code == 401


def test_unlink_clears_github_identity(unlink_client):
    asyncio.run(_seed_unlink_user())
    resp = unlink_client.post("/api/v1/auth/oauth/github/unlink", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["uid"] == "unlink-user"
    assert body["github_username"] is None
    assert body["github_id"] is None
    # Account/email/provider untouched.
    assert body["provider"] == "password"
    assert body["email"] == "unlink@example.com"
```

- [ ] **Step 2: Run the tests — expect the refresh-token assertions to fail**

Run: `python -m pytest tests/test_oauth_login.py -v` (from `backend/`)
Expected: new-user/existing/fallback tests **FAIL** with `KeyError: 'refresh_token'` (the result dict has no refresh token yet); mismatch test passes; the **unlink** tests fail with `404`/`Not Found` (endpoint doesn't exist yet); Google test fails on the same missing refresh token.

- [ ] **Step 3: Commit the failing suite**

```bash
git add -f tests/test_oauth_login.py
git commit -m "test(auth): add GitHub OAuth login-mode and unlink tests"
```

---

### Task 2: Backend — issue refresh tokens for OAuth logins (session persistence)

**Files:**
- Modify: `backend/app/services/oauth_service.py:300-407` (link-mode branch) and `backend/app/services/oauth_service.py:485-584` (`_find_or_create_oauth_user`)
- Modify: `backend/app/api/v1/auth.py:290-363` (`_oauth_redirect` + both callbacks)

- [ ] **Step 1: Switch link-mode to `_issue_tokens`**

In `backend/app/services/oauth_service.py`, replace the link-mode token block inside `handle_github_callback`:

```python
        user = await link_github_identity(link_uid, github_id, github_username, email)
        from app.api.v1.auth import _generate_jwt

        token = _generate_jwt(
            user["uid"], user["email"], user["name"], user.get("provider", "password")
        )
        return {
            "uid": user["uid"],
            "email": user["email"],
            "name": user["name"],
            "provider": user.get("provider", "password"),
            "token": token,
        }
```

with:

```python
        user = await link_github_identity(link_uid, github_id, github_username, email)
        from app.api.v1.auth import _issue_tokens

        tokens = _issue_tokens(
            user["uid"],
            user["email"],
            user["name"],
            user.get("provider", "password"),
            remember_me=True,
        )
        return {
            "uid": user["uid"],
            "email": user["email"],
            "name": user["name"],
            "provider": user.get("provider", "password"),
            "token": tokens["token"],
            "refresh_token": tokens.get("refresh_token"),
        }
```

- [ ] **Step 2: Switch find-or-create to `_issue_tokens`**

In `_find_or_create_oauth_user`, replace:

```python
    from app.api.v1.auth import _generate_jwt
```

with:

```python
    from app.api.v1.auth import _issue_tokens
```

and replace the final token block:

```python
    token = _generate_jwt(uid, raw_email, raw_name, provider)
    return {
        "uid": uid,
        "email": raw_email,
        "name": raw_name,
        "provider": provider,
        "token": token,
    }
```

with:

```python
    tokens = _issue_tokens(uid, raw_email, raw_name, provider, remember_me=True)
    return {
        "uid": uid,
        "email": raw_email,
        "name": raw_name,
        "provider": provider,
        "token": tokens["token"],
        "refresh_token": tokens.get("refresh_token"),
    }
```

- [ ] **Step 3: Pass the refresh token through the callback redirect**

In `backend/app/api/v1/auth.py`, update `_oauth_redirect`:

```python
def _oauth_redirect(
    token: str | None = None,
    error: str | None = None,
    refresh_token: str | None = None,
) -> RedirectResponse:
    """Redirect back to the frontend OAuth callback with a token or an error.

    Errors (invalid/expired state, provider mismatch, denied consent, …) are
    delivered to ``/auth/callback?error=...`` so the frontend can render its
    friendly error screen instead of the browser showing a raw API 400 page.
    """
    frontend_url = os.getenv(
        "FRONTEND_URL",
        os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
    )
    params: dict[str, str] = {}
    if token:
        params["token"] = token
    if error:
        params["error"] = error
    if refresh_token:
        params["refresh_token"] = refresh_token
    return RedirectResponse(url=f"{frontend_url}/auth/callback?{urlencode(params)}")
```

Update `google_callback`:

```python
    try:
        result = await handle_google_callback(code, state)
        return _oauth_redirect(
            token=result["token"], refresh_token=result.get("refresh_token")
        )
```

Update `github_callback`:

```python
    try:
        result = await handle_github_callback(code, state)
        return _oauth_redirect(
            token=result["token"], refresh_token=result.get("refresh_token")
        )
```

- [ ] **Step 4: Run the tests**

Run: `python -m pytest tests/test_oauth_login.py tests/test_oauth_linking.py -v` (from `backend/`)
Expected: ALL pass. Login-mode tests now receive `refresh_token`; unlink tests pass; existing linking tests still pass (they assert `result["token"]` which is unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/services/oauth_service.py app/api/v1/auth.py
git commit -m "feat(auth): issue refresh tokens for OAuth logins so sessions persist"
```

---

### Task 3: Frontend — store the refresh token after OAuth callback

**Files:**
- Modify: `web/src/pages/AuthCallback.tsx:3` and `web/src/pages/AuthCallback.tsx:15-53`

- [ ] **Step 1: Read `refresh_token` and persist it**

In `web/src/pages/AuthCallback.tsx`, change the import:

```tsx
import { setToken, setRefreshToken } from '../lib/neon-auth'
```

and in the `useEffect`:

```tsx
    const token = searchParams.get('token')
    const refreshToken = searchParams.get('refresh_token')
    const error = searchParams.get('error')
```

then in the success branch:

```tsx
    // Store the JWT and redirect to the right landing page
    try {
      setToken(token)
      if (refreshToken) setRefreshToken(refreshToken)
      setStatus('success')
      setTimeout(() => {
        navigate(linkFlow ? '/profile' : '/dashboard', { replace: true })
      }, 500)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Failed to process authentication. Please try again.')
    }
```

- [ ] **Step 2: Verify the frontend compiles**

Run: `npm run build` (from `web/`)
Expected: `tsc -b` passes with no type errors and vite build completes.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AuthCallback.tsx
git commit -m "feat(auth): persist refresh token after OAuth callback"
```

---

### Task 4: Backend — GitHub unlink endpoint

**Files:**
- Modify: `backend/app/api/v1/auth.py` (add endpoint after `github_link`, near line 352)

The failing test was already written in Task 1 (`test_unlink_requires_auth`, `test_unlink_clears_github_identity`).

- [ ] **Step 1: Add the unlink endpoint**

In `backend/app/api/v1/auth.py`, immediately after the `github_link` endpoint:

```python
@router.post("/oauth/github/unlink", response_model=MeResponse)
async def github_unlink(user: dict = Depends(get_current_user)):
    """Remove the GitHub identity from the current account.

    Clears ``github_id`` and ``github_username`` to NULL while leaving the
    account, email, and provider untouched. A direct authenticated call — no
    OAuth round-trip. The user can reconnect anytime via ``/oauth/github/link``.
    """
    uid = user.get("uid", "")
    # update_user_profile normalizes empty strings to None (clears to NULL).
    updated = await update_user_profile(uid, {"github_username": "", "github_id": ""})
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found in backend")

    return MeResponse(
        uid=updated["uid"],
        email=updated["email"],
        name=updated["name"],
        provider=updated["provider"],
        position=updated.get("position"),
        avatar_url=updated.get("avatar_url"),
        github_username=updated.get("github_username"),
        github_id=updated.get("github_id"),
    )
```

- [ ] **Step 2: Run the tests**

Run: `python -m pytest tests/test_oauth_login.py -v` (from `backend/`)
Expected: ALL pass, including `test_unlink_requires_auth` and `test_unlink_clears_github_identity`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/auth.py
git commit -m "feat(auth): add endpoint to unlink GitHub identity"
```

---

### Task 5: Frontend — GitHub disconnect UI

**Files:**
- Modify: `web/src/lib/api.ts` (after `getGithubLinkUrl`, near line 3890)
- Modify: `web/src/pages/Profile.tsx`

- [ ] **Step 1: Add `unlinkGithub` to the API client**

In `web/src/lib/api.ts`, after `getGithubLinkUrl`:

```typescript
/**
 * Remove the GitHub identity (github_id + github_username) from the current
 * account. Direct authenticated call — no OAuth redirect. The account,
 * email, and provider are untouched; the user can reconnect via the link
 * flow on the Profile page.
 */
export async function unlinkGithub(): Promise<AuthMeResponse> {
  return request<AuthMeResponse>(`${API_BASE}/auth/oauth/github/unlink`, {})
}
```

- [ ] **Step 2: Wire the Disconnect action into Profile**

In `web/src/pages/Profile.tsx`:

1. Update imports (line 6 and line 8):

```tsx
import { fetchRepos, getGithubLinkUrl, unlinkGithub } from '../lib/api'
```

```tsx
import { ArrowRight, ArrowUpRight, GithubLogo, LinkBreak, SignOut } from '@phosphor-icons/react'
```

2. Update the auth destructure and add state (line 17 and line 22):

```tsx
  const { user, logout, updateUser } = useAuth()
```

```tsx
  const [disconnecting, setDisconnecting] = useState(false)
```

3. Add a `disconnectGithub` handler after `connectGithub` (line 80):

```tsx
  const disconnectGithub = async () => {
    if (disconnecting) return
    setDisconnecting(true)
    try {
      await unlinkGithub()
      updateUser({ githubUsername: undefined })
      toast.success('GitHub disconnected', 'Your GitHub identity was unlinked.')
    } catch (err) {
      toast.error(
        'GitHub disconnect failed',
        err instanceof Error ? err.message : 'Could not unlink GitHub.'
      )
    } finally {
      setDisconnecting(false)
    }
  }
```

4. Replace the GitHub button in the Repositories panel (lines 122-129):

```tsx
              {user?.githubUsername ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-caption text-go">
                    <GithubLogo size={12} weight="fill" />
                    Linked as @{user.githubUsername}
                  </span>
                  <button
                    onClick={disconnectGithub}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-1.5 text-caption text-abort hover:underline disabled:opacity-50"
                    aria-label="Disconnect GitHub"
                  >
                    <LinkBreak size={11} weight="bold" />
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectGithub}
                  className="mt-3 inline-flex items-center gap-1.5 text-caption text-go hover:underline"
                >
                  <GithubLogo size={12} weight="fill" />
                  Connect GitHub
                  <ArrowUpRight size={11} weight="bold" />
                </button>
              )}
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `npm run build` (from `web/`)
Expected: `tsc -b` passes with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/pages/Profile.tsx
git commit -m "feat(web): add GitHub disconnect action to Profile"
```

---

### Task 6: Setup documentation

**Files:**
- Create: `docs/github-oauth-setup.md`

- [ ] **Step 1: Write the doc**

```markdown
# GitHub OAuth Setup

Onramp supports sign-in/sign-up with GitHub (and Google) via OAuth 2.0, plus
GitHub **account linking** so email/password users can attach a GitHub
identity to their existing account.

## 1. Register an OAuth App

1. Go to <https://github.com/settings/developers> → **New OAuth App**.
2. Application name: `Onramp (dev)` (or your app name).
3. Homepage URL: `FRONTEND_URL` (e.g. `http://localhost:5173`).
4. Authorization callback URL — **must match exactly**:

   ```
   {BACKEND_URL}/api/v1/auth/oauth/github/callback
   ```

   For local dev: `http://localhost:8000/api/v1/auth/oauth/github/callback`

5. Register, then copy the **Client ID** and generate a **Client secret**.

> **Redirect-URI gotcha:** GitHub matches the callback URL character-for-character.
> If `BACKEND_URL` in `backend/.env` differs from what you register (e.g. trailing
> slash, `https` vs `http`, a deployed URL), the OAuth callback fails with a 400
> redirect-uri mismatch.

## 2. Environment variables

In `backend/.env`:

```
GITHUB_CLIENT_ID=Ov23...
GITHUB_CLIENT_SECRET=...
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
```

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from the OAuth App above.
- `BACKEND_URL` — public URL of the API; must match the registered callback.
- `FRONTEND_URL` — where the OAuth callback redirects the browser after login.

## 3. Scopes

Onramp requests `read:user user:email` — enough to identify the user and read
their email. We deliberately do **not** request `repo` scope: repo/PR features
are powered by a separate GitHub PAT configured in **Settings → GitHub**
(encrypted with `GITHUB_TOKEN_ENCRYPTION_KEY`).

## 4. Test the flow

1. Start the backend (`uvicorn app.main:app --port 8000 --reload`) and the web
   app (`npm run dev`).
2. Open `http://localhost:5173/login` → **GitHub**. Authorize.
3. Expect to land on `/auth/callback` → dashboard, **signed in**.
4. Confirm the session **persists** past the 15-minute access window
   (a refresh token is issued on OAuth login, matching "remember me" sessions).
5. **Linking:** sign in with email/password, open Profile → **Connect GitHub**.
   Authorize → returns to Profile showing `Linked as @username`.

## 5. Common failures

- **Invalid state parameter / CSRF** — the callback landed without a valid
  `state`. Usually a reload after the flow already completed, or the backend
  restarted mid-flow (in-memory state store). Just retry.
- **Already registered with password** — the GitHub email matches an existing
  email/password account. Use **Profile → Connect GitHub** to link instead.
- **GitHub did not provide an email** — the account's email is hidden/private.
  Make the GitHub email public, or grant email permission at consent.
```

- [ ] **Step 2: Commit**

```bash
git add docs/github-oauth-setup.md
git commit -m "docs(auth): add GitHub OAuth setup guide"
```

---

### Task 7: Verification

- [ ] **Step 1: Backend tests**

Run: `python -m pytest tests/test_oauth_login.py tests/test_oauth_linking.py -v` (from `backend/`)
Expected: ALL pass.

- [ ] **Step 2: Auth regression sweep**

Run: `python -m pytest tests/test_auto_personal_team.py tests/ -k "auth or oauth" -v` (from `backend/`)
Expected: ALL pass. (`test_auto_personal_team.py` covers the same `_find_or_create_oauth_user` helper and must stay green.)

- [ ] **Step 3: Frontend typecheck + build**

Run: `npm run build` (from `web/`)
Expected: `tsc -b` and `vite build` succeed.

- [ ] **Step 4: Frontend lint**

Run: `npm run lint` (from `web/`)
Expected: no errors on `Profile.tsx`, `AuthCallback.tsx`, `api.ts`.

- [ ] **Step 5: Fix anything that surfaced**

If any step fails, fix the issue in a new commit and re-run the failing command before moving on.

- [ ] **Step 6: Final commit of any fixes**

```bash
git add -A
git commit -m "fix(auth): resolve verification findings for GitHub OAuth completion"
```

(Only if Step 5 produced changes; otherwise skip.)
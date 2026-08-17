# Complete GitHub OAuth — Design Spec

**Date:** 2026-08-17
**Approach:** A — no OAuth token storage. GitHub PATs in Settings keep powering repo/PR features.

## Context

The GitHub OAuth stack already exists across the stack:

- **Backend** (`backend/app/api/v1/auth.py` + `backend/app/services/oauth_service.py`):
  `GET /auth/oauth/github/login`, `GET /auth/oauth/github/callback`,
  `POST /auth/oauth/github/link` (account linking), Redis-backed single-use
  state store with in-memory fallback, token exchange, email fallback, and
  find-or-create user logic.
- **Frontend** (`web/src/pages/Login.tsx`, `Register.tsx`, `AuthCallback.tsx`,
  `Profile.tsx`, `web/src/lib/api.ts`): GitHub buttons, token/error callback
  handling, and account-linking UI.
- **Tests** (`backend/tests/test_oauth_linking.py`): state store, linking mode,
  and the `/link` endpoint. Login/sign-up mode is untested.
- **Config**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BACKEND_URL`,
  `FRONTEND_URL` are set in `backend/.env`; documented in `backend/.env.example`.

### Gaps this spec closes

1. **OAuth sessions expire after 15 minutes with no refresh token.**
   `_find_or_create_oauth_user` (oauth_service.py:577) and the link-mode path
   (oauth_service.py:394) issue a bare access token via `_generate_jwt` —
   never a refresh token. `AuthCallback.tsx` stores only the access token.
   Email/password "remember me" sessions persist via rotating refresh tokens;
   OAuth logins do not. Sessions should behave consistently.
2. **No way to unlink GitHub.** Profile can connect but never disconnect.
3. **Login/sign-up mode has no backend test coverage.**
4. **No setup documentation** for registering/pointing the GitHub OAuth App.

## 1. Session lifetime fix

### Backend — `oauth_service.py`

- `_find_or_create_oauth_user(...)`: replace the final
  `token = _generate_jwt(uid, raw_email, raw_name, provider)` with
  `_issue_tokens(uid, raw_email, raw_name, provider, remember_me=True)` (lazy
  import from `app.api.v1.auth`, same pattern as the existing `_generate_jwt`
  import). Return dict gains `"refresh_token"`. Applies to both GitHub and
  Google since they share this helper.
- Link-mode branch in `handle_github_callback(...)`: same swap — return
  `"refresh_token"` alongside `"token"`.
- Result dicts keep `"token"` for backward compatibility with the endpoints.

### Backend — `auth.py`

- `_oauth_redirect`: add `refresh_token: str | None = None` parameter; include
  it in the query string when present.
- `github_callback` and `google_callback` handlers: pass
  `refresh_token=result.get("refresh_token")` to `_oauth_redirect`.

### Frontend — `AuthCallback.tsx`

- Read `refresh_token` from the URL query params.
- After `setToken(token)`, call `setRefreshToken(refresh_token)` when present.
- No behavior change to the success/error/redirect paths.

## 2. Unlink GitHub

### Backend — `auth.py`

- New `POST /auth/oauth/github/unlink`, auth-required
  (`Depends(get_current_user)`), no request body.
- Calls `update_user_profile(uid, {"github_id": None, "github_username": None})`.
- Returns the updated `MeResponse`. 404 if the user is missing.
- Verify `update_user_profile` actually persists `None` (clear) — if it drops
  `None` values, extend it to clear the columns explicitly. Confirmed during
  planning; behavior must be: fields become `NULL` in the DB.

### Frontend — `Profile.tsx` + `api.ts`

- `api.ts`: `unlinkGithub()` → `POST {API_BASE}/auth/oauth/github/unlink`,
  returns `MeResponse`.
- `Profile.tsx`: when `user.githubUsername` is set, the GitHub row shows a
  "Disconnect" action (small destructive-style text button) alongside the
  "Linked as @…" label. On success, refresh the profile (re-fetch `/me` and/or
  update the auth context) and toast. No OAuth round-trip, no sessionStorage
  flag — direct authenticated call.
- Keep the existing `connectGithub` flow untouched.

## 3. Login/sign-up mode tests

New backend tests in `backend/tests/test_oauth_login.py` (mirroring
`test_oauth_linking.py`'s mocked `httpx.AsyncClient` style):

- New user is created on first GitHub login; `provider == "github.com"`,
  `github_id`/`github_username` set.
- Existing user with the same provider signs in without re-creation; GitHub
  identity is re-synced.
- Provider mismatch raises the expected error (existing password account +
  GitHub login).
- GitHub user-info endpoint omits email → `user/emails` fallback is used
  (primary + verified first, then first available).
- Success response includes a `refresh_token` (session persistence).
- Google path (via `handle_google_callback`) still returns a token + refresh
  token (regression guard for the shared helper).

## 4. Setup documentation

- New `docs/github-oauth-setup.md`:
  - Register an OAuth App at github.com/settings/developers.
  - Exact redirect URI: `{BACKEND_URL}/api/v1/auth/oauth/github/callback`
    (local: `http://localhost:8000/api/v1/auth/oauth/github/callback`).
  - Scopes requested (`read:user user:email`) and why no `repo` scope.
  - Env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BACKEND_URL`,
    `FRONTEND_URL`.
  - How to test: start backend + web, click GitHub on /login, expect
    /auth/callback success and a persistent session; test linking from Profile.

## 5. Verification

- Backend: run `pytest tests/test_oauth_linking.py tests/test_oauth_login.py`
  (and the wider auth/registration suite for regressions).
- Frontend: run the TypeScript build/typecheck (`npm run build` or the repo's
  lint/typecheck command).
- Live smoke test: with dev servers running, drive the GitHub button through
  login and linking; confirm the session survives past the 15-min access
  window via refresh (timing-shortened locally if feasible).

## Out of scope

- Storing/rotating the GitHub OAuth access token (Approach B).
- Requesting `repo` scope; per-user GitHub tokens for PR/issue operations.
- Google account unlink (this spec is GitHub-only; the session-lifetime fix
  benefits Google as a side effect).
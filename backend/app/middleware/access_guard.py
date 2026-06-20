"""
Access Guard — FastAPI dependencies for module-level RBAC enforcement.

Provides composable dependency factories that check a user's module access
or team role before allowing a request to proceed.

Uses lazy imports to avoid circular dependencies at module load time.
Reads the authenticated user from ``request.state.user`` (set by AuthMiddleware).

Usage:

    @router.get("/tasks")
    async def list_tasks(
        team_id: str,
        user: dict = Depends(get_current_user),
        _: None = require_module_access("api-core"),
    ):
        ...

    @router.post("/teams/{team_id}/members")
    async def add_member(
        team_id: str,
        user: dict = Depends(get_current_user),
        _: None = require_team_role("owner"),
    ):
        ...
"""

from fastapi import Request, HTTPException, Depends

ROLE_HIERARCHY = {"owner": 3, "senior": 2, "member": 1}


def _get_user_or_401(request: Request) -> dict:
    """Read the authenticated user from request state (set by AuthMiddleware).

    This avoids importing get_current_user from app.api.v1.auth, which
    would create a circular import at module load time.
    """
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )
    return user


async def _extract_team_id(
    request: Request,
    param_name: str = "team_id",
) -> str | None:
    """Extract team_id from the request — checks path params, then query params.

    NOTE: We intentionally do NOT read the request body here, because
    consuming ``request.json()`` in a dependency makes the body stream
    unavailable for downstream Pydantic model parsing.
    """
    # 1. Path parameter (FastAPI puts path params in request.path_params)
    team_id = request.path_params.get(param_name)
    if team_id:
        return team_id

    # 2. Query parameter
    team_id = request.query_params.get(param_name)
    if team_id:
        return team_id

    return None


def require_module_access(
    module: str,
    team_id_param: str = "team_id",
) -> Depends:
    """FastAPI dependency: require the current user to have access to ``module``.

    The ``team_id`` is extracted from the request — path params first,
    then query params.

    Raises ``HTTP 403`` if access is denied.
    Raises ``HTTP 400`` if the team context cannot be determined.

    Usage::

        @router.get("/endpoint")
        async def handler(
            user: dict = Depends(get_current_user),
            _: None = Depends(require_module_access("api-core")),
        ):
            ...
    """

    async def _guard(request: Request) -> None:
        # Lazy import to avoid circular import at module load time
        from app.services.access_control_service import has_module_access

        user = _get_user_or_401(request)
        team_id = await _extract_team_id(request, team_id_param)

        if not team_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not determine team context. "
                    f"Provide '{team_id_param}' as a path or query parameter."
                ),
            )

        uid = user.get("uid", "")
        permitted = await has_module_access(team_id, uid, module)

        if not permitted:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": f"Access denied to module '{module}'",
                    "code": "MODULE_ACCESS_DENIED",
                    "module": module,
                    "team_id": team_id,
                    "hint": "Request module access from your team lead.",
                },
            )

    return Depends(_guard)


def require_team_role(
    required_role: str = "owner",
    team_id_param: str = "team_id",
) -> Depends:
    """FastAPI dependency: require the current user to have ``required_role``
    in the team.

    Raises ``HTTP 403`` if the role check fails.
    Raises ``HTTP 400`` if the team context cannot be determined.

    Usage::

        @router.post("/teams/{team_id}/settings")
        async def update_settings(
            team_id: str,
            user: dict = Depends(get_current_user),
            _: None = Depends(require_team_role("owner")),
        ):
            ...
    """

    async def _guard(request: Request) -> None:
        # Lazy import to avoid circular import at module load time
        from app.services.team_service import get_user_teams

        user = _get_user_or_401(request)
        team_id = await _extract_team_id(request, team_id_param)

        if not team_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not determine team context. "
                    f"Provide '{team_id_param}' as a path or query parameter."
                ),
            )

        uid = user.get("uid", "")
        teams = await get_user_teams(uid)

        user_role: str | None = None
        for team in teams:
            tid = team.get("team_id") or team.get("id", "")
            if tid == team_id:
                user_role = team.get("role")
                break

        if user_role != required_role:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": f"Required role '{required_role}' not held",
                    "code": "INSUFFICIENT_ROLE",
                    "required_role": required_role,
                    "user_role": user_role,
                    "team_id": team_id,
                },
            )

    return Depends(_guard)


def require_minimum_role(
    min_role: str = "member",
    team_id_param: str = "team_id",
) -> Depends:
    """FastAPI dependency: require user's team role >= min_role (owner > senior > member)."""

    async def _guard(request: Request) -> None:
        from app.services.team_service import get_user_teams

        user = _get_user_or_401(request)
        team_id = await _extract_team_id(request, team_id_param)

        if not team_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not determine team context. "
                    f"Provide '{team_id_param}' as a path or query parameter."
                ),
            )

        uid = user.get("uid", "")
        teams = await get_user_teams(uid)

        user_role: str | None = None
        for team in teams:
            tid = team.get("team_id") or team.get("id", "")
            if tid == team_id:
                user_role = team.get("role")
                break

        if user_role is None:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "Not a member of this team",
                    "code": "NOT_A_MEMBER",
                    "team_id": team_id,
                },
            )

        min_level = ROLE_HIERARCHY.get(min_role, 0)
        user_level = ROLE_HIERARCHY.get(user_role, 0)

        if user_level < min_level:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": f"Requires role >= '{min_role}'",
                    "code": "INSUFFICIENT_ROLE",
                    "user_role": user_role,
                    "required_min_role": min_role,
                    "team_id": team_id,
                },
            )

    return Depends(_guard)

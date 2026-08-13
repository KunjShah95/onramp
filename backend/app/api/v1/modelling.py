from fastapi import APIRouter, Depends, HTTPException, Request, status
from typing import Dict, Any, Optional
from app.api.v1.auth import get_current_user
from app.services.team_service import get_user_teams
from app.services import team_provider_keys, team_routing_settings

router = APIRouter(prefix="/modelling", tags=["modelling"])


def _get_llm(req: Request):
    """The app's LLM router from request state, or 503 when unavailable.

    Same pattern as every other router (openai_gateway, ai_gateway, ...) —
    the router lives on ``app.state.llm`` (see app/main.py), not as a
    module-level import.
    """
    llm = getattr(req.app.state, "llm", None)
    if llm is None or not hasattr(llm, "list_models"):
        raise HTTPException(status_code=503, detail="LLM router not initialized")
    return llm


@router.get("/models")
async def list_models(req: Request, user: dict = Depends(get_current_user)):
    """List available LLM models (OpenRouter-style catalog)."""
    return _get_llm(req).list_models()


@router.get("/models/{model_id}")
async def get_model(model_id: str, req: Request, user: dict = Depends(get_current_user)):
    """Get details of a specific model."""
    # For simplicity, we return the same as the list but filtered.
    # In a real implementation, we might fetch from a database or external catalog.
    catalog = _get_llm(req).list_models()
    # This is a placeholder; we would need to implement a proper model lookup.
    raise HTTPException(
        status_code=501,
        detail="Model details endpoint not implemented",
    )


@router.post("/pin")
async def pin_model(
    model_id: str,
    org_name: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Pin a model for a team or user to override the router's automatic selection.
    This would store the pinned model in the database or cache.
    """
    # Placeholder implementation
    # In reality, we would store this in a database table for pinned models.
    # For now, we just return success.
    return {
        "message": f"Model {model_id} pinned for organization {org_name or 'user'}",
        "model_id": model_id,
        "org_name": org_name,
    }


@router.get("/pinned")
async def get_pinned_model(
    org_name: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Get the currently pinned model for a team or user."""
    # Placeholder implementation
    return {
        "pinned_model": None,
        "org_name": org_name,
        "user_id": user.get("uid"),
    }


# Additional endpoints could be added for model configuration, etc.

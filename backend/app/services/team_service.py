"""
Team Service - PostgreSQL backend
Manages team creation, membership, and permissions
"""

from typing import Optional, List
from app.services.postgres_db import get_storage, generate_id


async def create_team(name: str, description: Optional[str] = None) -> dict:
    """Create a new team"""
    storage = get_storage()
    
    data = {
        "name": name,
        "description": description,
        "is_active": True,
    }
    
    team = await storage.create_document("teams", generate_id(), data)
    return team


async def get_team(team_id: str) -> Optional[dict]:
    """Get team by ID"""
    storage = get_storage()
    return await storage.get_document("teams", team_id)


async def update_team(team_id: str, data: dict) -> dict:
    """Update team information"""
    storage = get_storage()
    return await storage.update_document("teams", team_id, data)


async def delete_team(team_id: str) -> None:
    """Delete a team"""
    storage = get_storage()
    await storage.delete_document("teams", team_id)


async def add_member(team_id: str, user_id: str, role: str = "member") -> dict:
    """Add a user to a team"""
    storage = get_storage()
    
    member_data = {
        "user_id": user_id,
        "team_id": team_id,
        "role": role,
    }
    
    member = await storage.create_document("team_members", generate_id(), member_data)
    return member


async def remove_member(team_id: str, user_id: str) -> None:
    """Remove a user from a team"""
    storage = get_storage()
    
    members = await storage.query_documents(
        "team_members",
        [("team_id", "==", team_id), ("user_id", "==", user_id)]
    )
    
    for member in members:
        await storage.delete_document("team_members", member["id"])


async def get_team_members(team_id: str) -> List[dict]:
    """Get all members of a team"""
    storage = get_storage()
    
    members = await storage.query_documents(
        "team_members",
        [("team_id", "==", team_id)]
    )
    
    user_ids = [m["user_id"] for m in members]
    users = await storage.query_documents(
        "users",
        [("id", "in", user_ids)]
    )
    
    user_map = {u["id"]: u for u in users}
    
    result = []
    for member in members:
        user = user_map.get(member["user_id"])
        if user:
            result.append({
                **user,
                "role": member["role"],
                "joined_at": member["joined_at"],
            })
        else:
            result.append({
                "id": member["user_id"],
                "user_id": member["user_id"],
                "role": member["role"],
                "joined_at": member["joined_at"],
            })

    return result


async def get_user_teams(user_id: str) -> List[dict]:
    """Get all teams a user belongs to"""
    storage = get_storage()
    
    memberships = await storage.query_documents(
        "team_members",
        [("user_id", "==", user_id)]
    )
    
    team_ids = [m["team_id"] for m in memberships]
    teams = await storage.query_documents(
        "teams",
        [("id", "in", team_ids)]
    )
    
    team_map = {t["id"]: t for t in teams}
    
    result = []
    for membership in memberships:
        team = team_map.get(membership["team_id"])
        if team:
            result.append({
                **team,
                "role": membership["role"],
                "joined_at": membership["joined_at"],
            })
    
    return result


async def update_member_role(team_id: str, user_id: str, role: str) -> dict:
    """Update a member's role in a team"""
    storage = get_storage()
    
    members = await storage.query_documents(
        "team_members",
        [("team_id", "==", team_id), ("user_id", "==", user_id)]
    )
    
    if not members:
        raise ValueError("User is not a member of this team")
    
    member_id = members[0]["id"]
    return await storage.update_document("team_members", member_id, {"role": role})

class TeamService:
    """Class wrapper for TeamService backwards compatibility with routers and tests"""
    def __init__(self):
        pass

    async def create_team(self, name: str, owner: str, tier: str = "free") -> dict:
        team = await create_team(name=name, description="")
        await add_member(team["id"], owner, role="owner")
        team["owner"] = owner
        team["tier"] = tier
        team["team_id"] = team["id"]
        team["members"] = [{"user_id": owner, "role": "owner"}]
        return team

    async def get_team(self, team_id: str) -> Optional[dict]:
        team = await get_team(team_id)
        if team:
            team["team_id"] = team["id"]
        return team

    async def list_teams(self, user: str) -> List[dict]:
        if not user:
            return []
        teams = await get_user_teams(user)
        for t in teams:
            t["team_id"] = t.get("id")
        return teams

    async def add_member(self, team_id: str, user: str, role: str = "member") -> dict:
        try:
            # Check for duplicates
            members = await get_team_members(team_id)
            if any(m.get("id") == user for m in members):
                return {"error": "User already in team"}
            member = await add_member(team_id, user, role)
            return {"added": True, "user": user, "member": member}
        except Exception as e:
            return {"error": str(e)}

    async def remove_member(self, team_id: str, user: str) -> dict:
        await remove_member(team_id, user)
        return {"removed": True, "user": user}

    async def create_invite(self, team_id: str, email: str, invited_by: str, role: str = "member", message: str = "") -> dict:
        from app.services.invite_service import create_invite as _create
        return await _create(team_id, email, invited_by, role=role, message=message)

    async def get_invites(self, team_id: str) -> List[dict]:
        from app.services.invite_service import get_team_invites
        return await get_team_invites(team_id)

    async def change_tier(self, team_id: str, tier: str) -> dict:
        max_members = 5 if tier == "startup" else (20 if tier == "professional" else 1)
        return {"tier": tier, "max_members": max_members}
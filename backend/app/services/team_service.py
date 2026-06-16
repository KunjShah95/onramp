from typing import Dict, Any, List, Optional
from datetime import datetime
from app.services.firestore_db import get_storage, generate_id


class TeamService:
    COLLECTION_TEAMS = "codeflow_teams"
    COLLECTION_INVITES = "codeflow_invites"

    def __init__(self):
        self.storage = get_storage()

    async def create_team(self, name: str, owner: str, tier: str = "free") -> Dict[str, Any]:
        team_id = generate_id()
        limits = {"free": 1, "startup": 5, "professional": 20, "enterprise": 999}
        max_members = limits.get(tier, 1)

        team = {
            "team_id": team_id,
            "name": name,
            "owner": owner,
            "tier": tier,
            "max_members": max_members,
            "members": [{"user": owner, "role": "owner", "joined_at": datetime.now().isoformat()}],
            "created_at": datetime.now().isoformat(),
            "is_active": True,
        }
        await self.storage.create_document(self.COLLECTION_TEAMS, team_id, team)
        return team

    async def get_team(self, team_id: str) -> Optional[Dict[str, Any]]:
        return await self.storage.get_document(self.COLLECTION_TEAMS, team_id)

    async def list_teams(self, user: Optional[str] = None) -> List[Dict[str, Any]]:
        if user:
            teams = await self.storage.query_documents(self.COLLECTION_TEAMS, [("members", "array_contains", {"user": user})])
            if not teams:
                teams = await self.storage.list_documents(self.COLLECTION_TEAMS)
                teams = [t for t in teams if any(m.get("user") == user for m in t.get("members", []))]
            return teams
        return await self.storage.list_documents(self.COLLECTION_TEAMS)

    async def add_member(self, team_id: str, user: str, role: str = "member") -> Dict[str, Any]:
        team = await self.get_team(team_id)
        if not team:
            return {"error": "Team not found"}
        members = team.get("members", [])
        if any(m.get("user") == user for m in members):
            return {"error": "User already in team"}
        if len(members) >= team.get("max_members", 5):
            return {"error": f"Team member limit ({team['max_members']}) reached"}

        members.append({"user": user, "role": role, "joined_at": datetime.now().isoformat()})
        await self.storage.update_document(self.COLLECTION_TEAMS, team_id, {"members": members})
        return {"added": True, "user": user, "role": role}

    async def remove_member(self, team_id: str, user: str) -> Dict[str, Any]:
        team = await self.get_team(team_id)
        if not team:
            return {"error": "Team not found"}
        members = [m for m in team.get("members", []) if m.get("user") != user]
        await self.storage.update_document(self.COLLECTION_TEAMS, team_id, {"members": members})
        return {"removed": True, "user": user}

    async def create_invite(self, team_id: str, email: str, invited_by: str) -> Dict[str, Any]:
        invite_id = generate_id()
        invite = {
            "invite_id": invite_id,
            "team_id": team_id,
            "email": email,
            "invited_by": invited_by,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
        }
        await self.storage.create_document(self.COLLECTION_INVITES, invite_id, invite)
        return invite

    async def get_invites(self, team_id: str) -> List[Dict[str, Any]]:
        return await self.storage.query_documents(
            self.COLLECTION_INVITES,
            [("team_id", "==", team_id)],
        )

    async def change_tier(self, team_id: str, new_tier: str) -> Dict[str, Any]:
        limits = {"free": 1, "startup": 5, "professional": 20, "enterprise": 999}
        if new_tier not in limits:
            return {"error": f"Invalid tier: {new_tier}"}
        await self.storage.update_document(self.COLLECTION_TEAMS, team_id, {
            "tier": new_tier,
            "max_members": limits[new_tier],
        })
        return {"updated": True, "tier": new_tier, "max_members": limits[new_tier]}

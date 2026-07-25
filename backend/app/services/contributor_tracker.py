from typing import Dict, Any, List
from datetime import datetime, timezone
from app.services.postgres_db import get_storage, generate_id


class ContributorTracker:
    COLLECTION = "onramp_milestones"

    def __init__(self):
        self.storage = get_storage()

    async def track_event(self, event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        MILESTONE_TYPES = {
            "push": "first_commit",
            "pull_request": "first_pr",
            "pull_request_closed": "pr_merged",
            "issues": "first_issue",
        }

        milestone_type = MILESTONE_TYPES.get(event_type)
        if not milestone_type:
            return {"tracked": False, "reason": "unknown_event"}

        user = payload.get("sender", {}).get("login", "unknown")
        repo = payload.get("repository", {}).get("full_name", "unknown")

        # Check if this user already has this milestone type
        existing = await self.storage.query_documents(
            self.COLLECTION,
            [
                ("user", "==", user),
                ("type", "==", milestone_type),
            ],
        )
        is_first = len(existing) == 0

        if is_first:
            entry = {
                "user": user,
                "repo": repo,
                "type": milestone_type,
                "timestamp": datetime.now(timezone.utc),
                "metadata": payload,
            }
            entry_id = generate_id()
            await self.storage.create_document(self.COLLECTION, entry_id, entry)
            return {"tracked": True, "milestone": milestone_type, "is_first": True, "user": user}

        return {"tracked": True, "milestone": milestone_type, "is_first": False, "user": user}

    async def get_user_milestones(self, user: str) -> List[Dict[str, Any]]:
        return await self.storage.query_documents(
            self.COLLECTION,
            [("user", "==", user)],
        )

    async def get_repo_milestones(self, repo: str) -> List[Dict[str, Any]]:
        return await self.storage.query_documents(
            self.COLLECTION,
            [("repo", "==", repo)],
        )

    async def get_milestone_summary(self) -> Dict[str, Any]:
        milestones = await self.storage.list_documents(self.COLLECTION)
        users = set(m.get("user", "") for m in milestones)
        types: Dict[str, int] = {}
        for m in milestones:
            t = m.get("type", "unknown")
            types[t] = types.get(t, 0) + 1
        return {
            "total_milestones": len(milestones),
            "unique_users": len(users),
            "breakdown": types,
        }

"""GitHub-backed workspace operations for the in-browser IDE.

Reads the repository tree / file contents and writes a whole working copy as
ONE commit on a new branch (Git Data API: blobs → tree → commit → ref), then
optionally opens a pull request. Acts with the caller's saved GitHub token
(Settings → Integrations → GitHub) and falls back to the server GITHUB_TOKEN.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

API = "https://api.github.com"
MAX_FILE_BYTES = 1_000_000
MAX_TREE_ENTRIES = 20_000
MAX_COMMIT_FILES = 50
_BRANCH_RE = re.compile(r"^(?!/)(?!.*\.\.)(?!.*//)[A-Za-z0-9._/-]{1,200}(?<!/)(?<!\.lock)$")


class IdeError(Exception):
    """Workspace operation failed; ``status`` is the HTTP code to surface."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def valid_branch(name: str) -> bool:
    return bool(name) and bool(_BRANCH_RE.match(name))


def safe_path(path: str) -> str:
    """Normalise a repo-relative path; reject absolute/parent-escaping paths."""
    raw = (path or "").strip().replace("\\", "/")
    parts = [s for s in raw.split("/") if s not in ("", ".")]
    if not parts or raw.startswith("/") or ".." in parts:
        raise IdeError(f"Invalid path: {path!r}")
    return "/".join(parts)


async def resolve_token(user: dict) -> Optional[str]:
    """Caller's saved GitHub token, else the server token."""
    uid = user.get("uid") or ""
    if uid and not uid.startswith("api:"):
        try:
            from app.services.webhook_service import get_integration_config

            cfg = await get_integration_config(uid, "github")
            token = ((cfg or {}).get("config") or {}).get("token")
            if token:
                return token
        except Exception:
            logger.exception("Could not load saved GitHub token for user %s", uid[:8])
    return os.getenv("GITHUB_TOKEN") or None


class RepoIde:
    def __init__(self, owner: str, repo: str, token: Optional[str]):
        self.owner, self.repo, self.token = owner, repo, token

    async def _req(self, method: str, path: str, body: Optional[dict] = None) -> Any:
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "Onramp-IDE"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            # follow_redirects: renamed/transferred repos answer 301/307 (e.g. facebook/react).
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.request(method, f"{API}/repos/{self.owner}/{self.repo}{path}", headers=headers, json=body)
        except httpx.HTTPError as e:
            raise IdeError(f"GitHub unreachable: {type(e).__name__}", 502) from e
        if resp.status_code >= 400:
            msg = ""
            try:
                msg = resp.json().get("message", "")
            except Exception:
                pass
            if resp.status_code in (401, 403) and not self.token:
                raise IdeError("GitHub token required — connect GitHub in Settings → Integrations", 403)
            if resp.status_code in (401, 403, 404) and method != "GET":
                raise IdeError(f"GitHub refused the write ({resp.status_code} {msg}). "
                               "Check your token has write access to this repository.", 403)
            raise IdeError(f"GitHub {resp.status_code}: {msg or 'request failed'}", 404 if resp.status_code == 404 else 502)
        try:
            return resp.json() if resp.content else {}
        except ValueError as e:
            raise IdeError("GitHub returned an unexpected response", 502) from e

    async def branch_sha(self, branch: str) -> str:
        data = await self._req("GET", f"/git/ref/heads/{branch}")
        return data["object"]["sha"]

    async def tree(self, ref: str) -> Dict[str, Any]:
        sha = await self.branch_sha(ref)
        data = await self._req("GET", f"/git/trees/{sha}?recursive=1")
        entries = [
            {"path": e["path"], "type": "dir" if e["type"] == "tree" else "file", "size": e.get("size")}
            for e in data.get("tree", [])
            if e.get("type") in ("blob", "tree")
        ][:MAX_TREE_ENTRIES]
        return {"ref": ref, "sha": sha, "truncated": bool(data.get("truncated")), "entries": entries}

    async def file(self, path: str, ref: str) -> Dict[str, Any]:
        path = safe_path(path)
        data = await self._req("GET", f"/contents/{path}?ref={ref}")
        if isinstance(data, list) or data.get("type") != "file":
            raise IdeError("Not a file", 400)
        size = int(data.get("size") or 0)
        if size > MAX_FILE_BYTES:
            return {"path": path, "ref": ref, "size": size, "binary": False, "too_large": True, "content": ""}
        raw = base64.b64decode(data.get("content") or "") if data.get("encoding") == "base64" else b""
        if b"\x00" in raw[:8000]:
            return {"path": path, "ref": ref, "size": size, "binary": True, "too_large": False, "content": ""}
        return {"path": path, "ref": ref, "size": size, "binary": False, "too_large": False,
                "content": raw.decode("utf-8", errors="replace")}

    async def commit(
        self,
        base: str,
        branch: str,
        message: str,
        files: List[Dict[str, Optional[str]]],
    ) -> Dict[str, Any]:
        """Commit ``files`` ([{path, content|None=delete}]) as one commit on ``branch``.

        Creates ``branch`` from ``base`` if it doesn't exist; otherwise commits
        on top of it (fast-forward).
        """
        if not files:
            raise IdeError("No changes to commit")
        if len(files) > MAX_COMMIT_FILES:
            raise IdeError(f"Too many files in one commit (max {MAX_COMMIT_FILES})")
        for b in (base, branch):
            if not valid_branch(b):
                raise IdeError(f"Invalid branch name: {b!r}")

        branch_exists = True
        try:
            parent = await self.branch_sha(branch)
        except IdeError as e:
            if e.status != 404:
                raise
            branch_exists = False
            parent = await self.branch_sha(base)
        parent_commit = await self._req("GET", f"/git/commits/{parent}")

        tree_items = []
        for f in files:
            path = safe_path(f.get("path") or "")
            content = f.get("content")
            if content is None:
                tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
                continue
            if len(content.encode("utf-8")) > MAX_FILE_BYTES:
                raise IdeError(f"{path} exceeds 1 MB")
            blob = await self._req("POST", "/git/blobs", {"content": content, "encoding": "utf-8"})
            tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})

        tree = await self._req("POST", "/git/trees", {"base_tree": parent_commit["tree"]["sha"], "tree": tree_items})
        commit = await self._req("POST", "/git/commits", {"message": message, "tree": tree["sha"], "parents": [parent]})
        if branch_exists:
            await self._req("PATCH", f"/git/refs/heads/{branch}", {"sha": commit["sha"], "force": False})
        else:
            await self._req("POST", "/git/refs", {"ref": f"refs/heads/{branch}", "sha": commit["sha"]})
        return {
            "branch": branch,
            "commit_sha": commit["sha"],
            "commit_url": f"https://github.com/{self.owner}/{self.repo}/commit/{commit['sha']}",
            "files": len(tree_items),
        }

    async def open_pr(self, head: str, base: str, title: str, body: str = "") -> Dict[str, Any]:
        try:
            data = await self._req("POST", "/pulls", {"title": title, "head": head, "base": base, "body": body})
        except IdeError as e:
            # Already open for this branch → return the existing PR instead of failing.
            existing = await self._req("GET", f"/pulls?head={self.owner}:{head}&state=open")
            if existing:
                data = existing[0]
            else:
                raise e
        return {"pr_number": data["number"], "pr_url": data["html_url"]}

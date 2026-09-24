"""Tenant-scoped, read-only MCP tool server.

This implements the small server surface needed by MCP clients without adding
write-capable tools. Repository tools authorize the index before reading any
context, and all results are bounded before being returned.
"""

from __future__ import annotations

from typing import Any, Dict, List


class MCPError(Exception):
    """A safe error that can be returned as a JSON-RPC tool error."""


class ReadOnlyMCPServer:
    server_name = "onramp-readonly"
    server_version = "0.1.0"

    def list_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "repo_context",
                "description": "Read a bounded, requirement-selected repository context slice.",
                "inputSchema": {
                    "type": "object",
                    "required": ["index_id", "requirement"],
                    "properties": {
                        "index_id": {"type": "string", "maxLength": 100},
                        "requirement": {"type": "string", "maxLength": 500},
                        "max_tokens": {"type": "integer", "minimum": 256, "maximum": 8000, "default": 4000},
                    },
                    "additionalProperties": False,
                },
            },
            {
                "name": "repo_search",
                "description": "Search authorized repository source documents without calling an LLM.",
                "inputSchema": {
                    "type": "object",
                    "required": ["index_id", "question"],
                    "properties": {
                        "index_id": {"type": "string", "maxLength": 100},
                        "question": {"type": "string", "minLength": 1, "maxLength": 1000},
                        "top_k": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5},
                    },
                    "additionalProperties": False,
                },
            },
        ]

    async def call_tool(self, user: dict, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        if name == "repo_context":
            return await self._repo_context(user, arguments)
        if name == "repo_search":
            return await self._repo_search(user, arguments)
        raise MCPError(f"Unknown tool: {name}")

    async def _repo_context(self, user: dict, arguments: Dict[str, Any]) -> Dict[str, Any]:
        index_id = str(arguments.get("index_id", "")).strip()
        requirement = str(arguments.get("requirement", "")).strip()
        if not index_id or not requirement:
            raise MCPError("index_id and requirement are required")
        max_tokens = min(max(int(arguments.get("max_tokens", 4000)), 256), 8000)

        from app.api.v1.index_access import authorize_repo_index
        from app.services.repo_context import RepoContextService

        team_id = await authorize_repo_index(user, index_id)
        service = RepoContextService()
        doc = await service.get(index_id)
        if not doc:
            raise MCPError("Index not found")
        selected = await service.select_context(index_id, requirement, max_tokens=max_tokens)
        if not selected:
            raise MCPError("Index context not found")
        return {
            "index_id": index_id,
            "repo_url": doc.get("repo_url"),
            "branch": doc.get("branch"),
            "team_id": team_id,
            "selected_files": selected.get("selected_files", []),
            "context_text": selected.get("context_text", "")[: max_tokens * 4],
            "token_estimate": selected.get("token_estimate"),
        }

    async def _repo_search(self, user: dict, arguments: Dict[str, Any]) -> Dict[str, Any]:
        index_id = str(arguments.get("index_id", "")).strip()
        question = str(arguments.get("question", "")).strip()
        if not index_id or not question:
            raise MCPError("index_id and question are required")
        top_k = min(max(int(arguments.get("top_k", 5)), 1), 10)

        from app.api.v1.index_access import authorize_repo_index
        from app.agents.repo_qa import RepoQA

        team_id = await authorize_repo_index(user, index_id)
        documents = await RepoQA(None).embeddings.search(index_id, question, top_k=top_k)
        return {
            "index_id": index_id,
            "team_id": team_id,
            "sources": [
                {
                    "filename": doc.filename,
                    "doc_type": doc.doc_type,
                    "content": doc.content[:2000],
                }
                for doc in documents
            ],
        }


mcp_server = ReadOnlyMCPServer()

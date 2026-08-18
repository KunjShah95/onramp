"""Architecture drift detection agent.

Compares a repository's *actual* code structure against its *documented*
architecture (README / wiki / design docs) and flags where they diverge —
e.g. modules the docs describe that no longer exist, or significant code
components that the docs never mention. A heuristic pass produces the hard
signals (present/absent names); an optional LLM pass turns those into
severity-ranked, human-readable alerts.
"""

import logging
import re
from typing import Any, Dict, List

from app.agents.base_agent import BaseAgent
from app.llm import QueryType

logger = logging.getLogger(__name__)

# Tokens that look like a component/module reference inside prose or code spans:
# `auth_service`, `BillingService`, `api/v1`, `payments.py`, `UserModel`.
_DOC_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_./-]{2,}")

# An underscore *between* alphanumerics (auth_service) — not a leading/trailing one.
_INTERNAL_UNDERSCORE_RE = re.compile(r"[A-Za-z0-9]_[A-Za-z0-9]")

# CamelCase: a lowercase letter immediately followed by an uppercase one.
_CAMEL_CASE_RE = re.compile(r"[a-z][A-Z]")

# Source-file extensions that mark a token as a real code reference.
_CODE_EXTENSIONS = (
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".rb",
    ".php", ".cs", ".cpp", ".c", ".kt", ".swift", ".sql", ".sh", ".vue",
)

# Monorepo wrapper directories that are repo scaffolding, not architecture.
_WRAPPER_DIRS = {
    "backend", "frontend", "web", "src", "app", "packages", "package", "lib",
    "cmd", "internal", "pkg", "server", "client", "apps", "libs", "modules",
}

# Words that appear constantly in docs and carry no architectural signal.
_STOPWORDS = {
    "the", "and", "for", "you", "your", "this", "that", "with", "from", "into",
    "run", "use", "using", "how", "why", "what", "when", "our", "are", "can",
    "will", "all", "any", "see", "https", "http", "com", "www", "get", "post",
    "api", "app", "src", "com", "org", "dev", "readme", "docs", "documentation",
    "example", "examples", "note", "todo", "here", "then", "also", "add", "set",
}


class DriftDetector(BaseAgent):
    query_type = QueryType.REASONING
    async def execute(self, **kwargs) -> Dict[str, Any]:
        from app.services.repo_context import resolve_for_agent

        full, _sliced, context_text = await resolve_for_agent(
            kwargs.get("index_id"),
            kwargs.get("repo_structure") or {},
            requirement="architecture, modules, components, service boundaries, structure",
            max_tokens=kwargs.get("context_max_tokens", 2500),
            llm=self.llm,
        )
        return await self.detect(full, kwargs.get("docs") or "", context_text=context_text)

    async def detect(self, repo_structure: Dict, docs: str, context_text: str = "") -> Dict[str, Any]:
        code_names = self._code_identifiers(repo_structure)
        doc_names = self._doc_identifiers(docs)

        # Names the docs describe that have no match anywhere in the code.
        documented_but_missing = sorted(
            name for name in doc_names
            if not self._matches_any(name, code_names)
        )[:25]

        # Top-level modules/dirs in code the docs never reference.
        top_modules = self._top_level_modules(repo_structure)
        doc_blob = docs.lower()
        undocumented_components = sorted(
            mod for mod in top_modules
            if mod.lower() not in doc_blob
        )[:25]

        has_docs = bool(docs.strip())
        has_code = bool(code_names)

        # Drift score: 0 = perfectly aligned, 100 = fully diverged.
        if not has_docs or not has_code:
            drift_score = 100 if (has_code != has_docs) else 0
        else:
            missing_ratio = len(documented_but_missing) / max(1, len(doc_names))
            undoc_ratio = len(undocumented_components) / max(1, len(top_modules))
            drift_score = round(min(100, (missing_ratio * 60) + (undoc_ratio * 40)) * 100) / 100

        status = self._status(drift_score, has_docs, has_code)

        result = {
            "drift_score": drift_score,
            "status": status,
            "has_docs": has_docs,
            "documented_but_missing": documented_but_missing,
            "undocumented_components": undocumented_components,
            "code_component_count": len(top_modules),
            "documented_component_count": len(doc_names),
            "alerts": self._heuristic_alerts(
                documented_but_missing, undocumented_components, has_docs, has_code
            ),
        }

        if self.llm and has_docs and has_code and (documented_but_missing or undocumented_components):
            await self._enrich_with_llm(result, repo_structure, docs, context_text)
        else:
            result["summary"] = self._fallback_summary(result)

        return result

    # ── Heuristics ──────────────────────────────────────────────────────────

    def _code_identifiers(self, repo_structure: Dict) -> set:
        names: set = set()
        for f in repo_structure.get("files", []):
            path = f.get("path", "")
            if not path:
                continue
            names.add(path)
            names.add(path.split("/")[-1])              # basename
            names.add(path.split("/")[-1].split(".")[0])  # stem
            for part in path.split("/"):
                if part:
                    names.add(part)
        for c in repo_structure.get("classes", []):
            n = c.get("name") if isinstance(c, dict) else c
            if n:
                names.add(n)
        for fn in repo_structure.get("functions", []):
            n = fn.get("name") if isinstance(fn, dict) else fn
            if n:
                names.add(n)
        return {n.lower() for n in names if n}

    def _doc_identifiers(self, docs: str) -> set:
        found: set = set()
        for tok in _DOC_TOKEN_RE.findall(docs):
            clean = tok.strip("./-_")           # drop leading/trailing punctuation
            low = clean.lower()
            if not clean or low in _STOPWORDS or len(clean) < 3:
                continue
            # Keep only tokens that look like real code entities, ignoring
            # trailing prose punctuation ("deprecated." must NOT qualify):
            #   - internal underscore  (auth_service)
            #   - path separator       (api/v1)
            #   - a known source-file extension (payments.py)
            #   - CamelCase            (BillingService)
            looks_structural = (
                _INTERNAL_UNDERSCORE_RE.search(clean) is not None
                or "/" in clean
                or clean.lower().endswith(_CODE_EXTENSIONS)
                or _CAMEL_CASE_RE.search(clean) is not None
            )
            if looks_structural:
                found.add(low)
        return found

    def _top_level_modules(self, repo_structure: Dict) -> set:
        """First architecturally-meaningful path segment per file, skipping
        monorepo wrapper dirs (backend/web/src/app/...) so we surface real
        components (auth_service, billing, payments) rather than repo roots."""
        mods: set = set()
        for f in repo_structure.get("files", []):
            path = f.get("path", "")
            parts = [p for p in path.split("/") if p and not p.startswith(".")]
            meaningful = [p for p in parts if p.lower() not in _WRAPPER_DIRS]
            parts = meaningful or parts
            if not parts:
                continue
            seg = parts[0]
            # If the only remaining segment is the file itself, use its stem.
            mods.add(seg.split(".")[0] if "." in seg else seg)
        return {m for m in mods if m}

    @staticmethod
    def _matches_any(name: str, code_names: set) -> bool:
        if name in code_names:
            return True
        # normalized: strip extension / path, compare stems
        stem = name.split("/")[-1].split(".")[0]
        if stem and stem in code_names:
            return True
        # tolerate singular/plural and dash/underscore variance
        variants = {stem, stem.rstrip("s"), stem.replace("-", "_"), stem.replace("_", "")}
        return any(v and v in code_names for v in variants)

    def _status(self, drift_score: float, has_docs: bool, has_code: bool) -> str:
        if not has_docs:
            return "undocumented"
        if not has_code:
            return "no_code"
        if drift_score < 15:
            return "aligned"
        if drift_score < 40:
            return "minor_drift"
        return "major_drift"

    def _heuristic_alerts(
        self, missing: List[str], undocumented: List[str], has_docs: bool, has_code: bool
    ) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []
        if not has_docs:
            alerts.append({
                "type": "missing_docs",
                "severity": "high",
                "detail": "No architecture documentation was provided for this repository.",
                "recommendation": "Generate an onboarding wiki or README architecture section.",
            })
            return alerts
        if missing:
            alerts.append({
                "type": "documented_but_missing",
                "severity": "high" if len(missing) > 5 else "medium",
                "detail": f"{len(missing)} component(s) described in the docs are absent from the code: "
                          + ", ".join(missing[:8]) + ("…" if len(missing) > 8 else ""),
                "recommendation": "Update the docs to remove stale references, or restore/rename the components.",
            })
        if undocumented:
            alerts.append({
                "type": "undocumented_components",
                "severity": "medium" if len(undocumented) > 5 else "low",
                "detail": f"{len(undocumented)} code component(s) are not mentioned in the docs: "
                          + ", ".join(undocumented[:8]) + ("…" if len(undocumented) > 8 else ""),
                "recommendation": "Document these modules so new developers can discover them.",
            })
        return alerts

    # ── LLM enrichment ──────────────────────────────────────────────────────

    async def _enrich_with_llm(
        self, result: Dict[str, Any], repo_structure: Dict, docs: str, context_text: str = ""
    ) -> None:
        # Prefer the token-budgeted index slice for the LLM prompt.
        files_summary = context_text or "\n".join(
            f.get("path", "") for f in repo_structure.get("files", [])[:120]
        )[:2500]
        prompt = (
            "You are an architecture-drift analyst. Compare a repository's DOCUMENTED "
            "architecture against its ACTUAL code structure and summarize where they "
            "have diverged.\n\n"
            f"DOCS (excerpt):\n{docs[:2500]}\n\n"
            f"ACTUAL FILES:\n{files_summary}\n\n"
            f"Heuristic findings — documented-but-missing: {result['documented_but_missing'][:12]}; "
            f"undocumented-components: {result['undocumented_components'][:12]}.\n\n"
            "Return JSON only:\n"
            "{\n"
            '  "summary": "2-3 sentence plain-English drift assessment",\n'
            '  "alerts": [\n'
            '    {"type": "short_slug", "severity": "low|medium|high", "detail": "...", "recommendation": "..."}\n'
            "  ]\n"
            "}"
        )
        try:
            llm_out = await self.llm.json_chat(prompt)
            summary = llm_out.get("summary")
            if summary:
                result["summary"] = summary
            extra = llm_out.get("alerts")
            if isinstance(extra, list) and extra:
                # Keep heuristic alerts first (hard signals), append LLM narrative alerts.
                result["alerts"] = result["alerts"] + [
                    a for a in extra if isinstance(a, dict) and a.get("detail")
                ]
        except Exception:
            logger.exception("LLM drift enrichment failed")
            result["summary"] = self._fallback_summary(result)

    @staticmethod
    def _fallback_summary(result: Dict[str, Any]) -> str:
        status = result.get("status")
        score = result.get("drift_score", 0)
        if status == "aligned":
            return f"Docs and code are well aligned (drift {score}). No significant divergence detected."
        if status == "undocumented":
            return "No architecture docs found. Cannot assess drift. Documentation is the first gap to close."
        if status == "no_code":
            return "Docs exist but no code structure was provided to compare against."
        missing = len(result.get("documented_but_missing", []))
        undoc = len(result.get("undocumented_components", []))
        return (
            f"Detected {status.replace('_', ' ')} (drift {score}): "
            f"{missing} documented component(s) missing from code, "
            f"{undoc} code component(s) undocumented."
        )

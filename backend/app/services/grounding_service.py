"""Grounding check for AI answers — "an AI that can't make up your architecture".

After Ask produces an answer, this service verifies its *structural* claims
against the repository's import graph, deterministically:

* every file path the answer names is checked to exist in the graph
  (``unknown_paths`` catches invented files);
* every sentence that relates two named modules with a dependency verb
  ("X imports Y", "X calls Y", "X depends on Y") becomes a claim, graded
  ``direct`` (an edge exists), ``indirect`` (reachable through imports) or
  ``unsupported`` (no import path either way).

It deliberately does not judge prose it can't check — behavioural claims
stay unverified rather than being rubber-stamped.
"""

from __future__ import annotations

import re
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

from app.services.comprehension_service import GraphFacts

_CODE_EXT = (
    "py", "ts", "tsx", "js", "jsx", "mjs", "cjs", "go", "rs", "java", "kt", "rb",
    "php", "cs", "swift", "scala", "vue", "svelte", "c", "cc", "cpp", "h", "hpp",
)
_PATH = re.compile(r"(?<![\w/.-])([A-Za-z0-9_@.-]+(?:/[A-Za-z0-9_@.-]+)*\.(?:" + "|".join(_CODE_EXT) + r"))\b")
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_RELATION = re.compile(
    r"\b(import(?:s|ed|ing)?|use(?:s|d)?|call(?:s|ed)?|invoke(?:s|d)?|depend(?:s|ed)? on|"
    r"relies on|rely on|require(?:s|d)?|delegate(?:s|d)? to|wrap(?:s|ped)?|extend(?:s|ed)?)\b",
    re.IGNORECASE,
)
MAX_CLAIMS = 30


def _resolve(facts: GraphFacts, token: str, index: Dict[str, str], by_base: Dict[str, List[str]]) -> Optional[str]:
    tok = token.strip("./")
    if tok in index:
        return index[tok]
    # Suffix match for partial paths ("services/ramp.py" → "backend/app/services/ramp.py").
    matches = sorted({node for path, node in index.items() if path.endswith("/" + tok)})
    if len(matches) == 1:
        return matches[0]
    base = tok.rsplit("/", 1)[-1]
    owners = by_base.get(base) or []
    return owners[0] if "/" not in tok and len(owners) == 1 else None


def _indexes(facts: GraphFacts) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
    index: Dict[str, str] = {}
    by_base: Dict[str, set] = {}
    for n in facts.nodes:
        for f in (facts.node_files.get(n) or []) + [n]:
            index.setdefault(f, n)
            by_base.setdefault(f.rsplit("/", 1)[-1], set()).add(n)
    return index, {k: sorted(v) for k, v in by_base.items()}


def _reachable(facts: GraphFacts, src: str, dst: str, limit: int = 6) -> bool:
    """True when ``src`` reaches ``dst`` through imports within ``limit`` hops."""
    seen = {src}
    queue = deque([(src, 0)])
    while queue:
        cur, depth = queue.popleft()
        if depth >= limit:
            continue
        for nxt in facts.imports.get(cur, ()):
            if nxt == dst:
                return True
            if nxt not in seen:
                seen.add(nxt)
                queue.append((nxt, depth + 1))
    return False


def ground_answer(facts: GraphFacts, answer: str) -> Dict[str, Any]:
    index, by_base = _indexes(facts)
    mentioned: Dict[str, Optional[str]] = {}
    claims: List[Dict[str, Any]] = []

    for sentence in _SENTENCE.split(answer or ""):
        found: List[Tuple[str, Optional[str]]] = []
        for token in _PATH.findall(sentence):
            if token in mentioned:
                node = mentioned[token]
            else:
                node = _resolve(facts, token, index, by_base)
                mentioned[token] = node
            if not any(t == token for t, _ in found):
                found.append((token, node))
        verb = _RELATION.search(sentence)
        resolved = [(t, n) for t, n in found if n]
        if not verb or len(resolved) < 2 or len(claims) >= MAX_CLAIMS:
            continue
        subject_token, subject = resolved[0]
        for obj_token, obj in resolved[1:]:
            if obj == subject:
                continue
            if obj in facts.imports.get(subject, ()) or subject in facts.imports.get(obj, ()):
                verdict = "direct"
            elif _reachable(facts, subject, obj) or _reachable(facts, obj, subject):
                verdict = "indirect"
            else:
                verdict = "unsupported"
            claims.append({
                "sentence": sentence.strip()[:300],
                "relation": verb.group(0).lower(),
                "source": subject,
                "target": obj,
                "source_text": subject_token,
                "target_text": obj_token,
                "verdict": verdict,
            })

    known = sorted({n for n in mentioned.values() if n})
    unknown = sorted(t for t, n in mentioned.items() if not n)
    supported = sum(1 for c in claims if c["verdict"] != "unsupported")
    checked = len(claims) + len(mentioned)
    ok = supported + len(known)
    return {
        "available": True,
        "known_paths": known,
        "unknown_paths": unknown,
        "claims": claims,
        "summary": {
            "paths_checked": len(mentioned),
            "claims_checked": len(claims),
            "unsupported_claims": len(claims) - supported,
            "unknown_paths": len(unknown),
            # Share of checkable statements that the graph backs; None when
            # the answer made nothing structural to check.
            "score": round(100 * ok / checked) if checked else None,
        },
    }


async def ground_for_index(index_id: str, answer: str) -> Dict[str, Any]:
    """Load the graph behind an Ask index (cache, then durable snapshot) and ground."""
    from app.services.architecture_store import architecture_store
    from app.services.repo_context import RepoContextService

    doc = await RepoContextService().get(index_id) or {}
    graph = doc.get("graph") or {}
    snapshot: Optional[Dict[str, Any]] = {"graph": graph, "services": graph.get("services") or []} if graph else None
    if snapshot is None and doc.get("repo_url"):
        snapshot = await architecture_store.latest(repo_url=doc["repo_url"], branch=doc.get("branch") or "main")
    if not snapshot:
        return {"available": False, "reason": "No architecture graph for this repository yet"}
    facts = GraphFacts.from_snapshot(snapshot)
    if not facts.nodes:
        return {"available": False, "reason": "Architecture graph is empty"}
    return ground_answer(facts, answer)

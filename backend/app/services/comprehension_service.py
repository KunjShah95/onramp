"""Comprehension map — what a developer actually understands of a codebase.

The architecture snapshot (``architecture_store``) describes the *code*. This
service layers the *person* on top of it:

* **Fog of war** — every graph node starts fogged for a developer and is
  "lit" by verifiable evidence: passing a fact check on that node, or
  completing a senior walkthrough that covers it.
* **Fact checks** — questions are derived from real import edges in the
  snapshot, so the answer key is a graph fact, not an LLM judgement. The key
  never leaves the server; grading recomputes the question from the snapshot.
* **Knowledge decay** — each lit node stores a fingerprint of the node's
  neighbourhood. When a later commit changes it, the node reports
  ``changed`` ("you learned an older version of this").
* **Senior walkthroughs** — seniors record ordered tours over graph nodes
  with notes. Each step is pinned to the node fingerprint at record time, so
  a tour flags itself stale when the code under it moves.

Storage uses un-migrated fallback collections (``DynamicDocument``), the same
approach as ``architecture_store``. Updates on that path *replace* the stored
payload, so every write below sends the full document.

Graph convention (from ``app.graph``): ``snapshot["dependencies"][node]`` is
the list of nodes that import ``node``.
"""

from __future__ import annotations

import hashlib
import logging
import math
import random
import re
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Set, Tuple

from app.services.postgres_db import generate_id, get_storage

logger = logging.getLogger("onramp.comprehension")

STATE_COLLECTION = "comprehension_states"
WALKTHROUGH_COLLECTION = "walkthroughs"

# A fact check shows at most this many options, of which at most
# MAX_CORRECT_SHOWN are true.
MAX_OPTIONS = 5
MAX_CORRECT_SHOWN = 3

# Brute-forcing a 5-option multi-select takes <=32 guesses; cap failed
# attempts per node so passing a check stays meaningful.
MAX_FAILED_ATTEMPTS = 3
LOCKOUT = timedelta(minutes=10)

MAX_WALKTHROUGH_STEPS = 20
MAX_TITLE_LEN = 120
MAX_NOTE_LEN = 1000

# Roles allowed to author/curate walkthroughs and see team comprehension.
SENIOR_ROLES = {"senior_dev", "senior", "cto", "ceo", "admin"}

_TEST_MARKERS = ("/tests/", "/test/", "__tests__", ".test.", ".spec.", "/test_", "conftest")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime] = None) -> str:
    return (dt or _now()).isoformat()


def _parse_iso(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def repo_key(owner: str, name: str) -> str:
    return f"{owner}/{name}".lower()


def _is_test_node(node: str) -> bool:
    low = "/" + node.lower()
    return any(marker in low for marker in _TEST_MARKERS)


# ── Graph facts ─────────────────────────────────────────────────────────────


@dataclass
class GraphFacts:
    """Deterministic, query-friendly view of one architecture snapshot."""

    nodes: List[str]
    imports: Dict[str, Set[str]] = field(default_factory=dict)
    importers: Dict[str, Set[str]] = field(default_factory=dict)
    node_files: Dict[str, List[str]] = field(default_factory=dict)
    groups: Dict[str, str] = field(default_factory=dict)
    commit: Optional[str] = None
    built_at: Optional[str] = None

    @classmethod
    def from_snapshot(cls, snapshot: Dict[str, Any]) -> "GraphFacts":
        graph = snapshot.get("graph") or {}
        deps: Dict[str, List[str]] = graph.get("dependencies") or snapshot.get("dependencies") or {}
        modules: List[str] = list(graph.get("modules") or [])
        node_files: Dict[str, List[str]] = graph.get("node_files") or {}

        node_set: Set[str] = set(modules)
        for target, sources in deps.items():
            node_set.add(target)
            node_set.update(sources or [])
        nodes = sorted(node_set)

        imports: Dict[str, Set[str]] = {n: set() for n in nodes}
        importers: Dict[str, Set[str]] = {n: set() for n in nodes}
        for target, sources in deps.items():
            for source in sources or []:
                if source == target:
                    continue
                imports[source].add(target)
                importers[target].add(source)

        groups: Dict[str, str] = {}
        for service in snapshot.get("services") or []:
            name = str(service.get("label") or service.get("name") or "")
            for member in service.get("files") or []:
                if member in node_set and member not in groups:
                    groups[member] = name
        for n in nodes:
            groups.setdefault(n, n.split("/")[0] if "/" in n else "root")

        return cls(
            nodes=nodes,
            imports=imports,
            importers=importers,
            node_files={n: list(node_files.get(n) or []) for n in nodes},
            groups=groups,
            commit=snapshot.get("commit"),
            built_at=snapshot.get("built_at"),
        )

    def has(self, node: str) -> bool:
        return node in self.imports

    def fingerprint(self, node: str) -> Optional[str]:
        """Hash of a node's neighbourhood; changes when its code shape moves."""
        if not self.has(node):
            return None
        payload = "|".join([
            node,
            ",".join(sorted(self.node_files.get(node) or [])),
            ",".join(sorted(self.imports[node])),
            ",".join(sorted(self.importers[node])),
        ])
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def nodes_for_files(self, files: Iterable[str]) -> List[str]:
        """Map repo file paths onto graph nodes (handles collapsed clusters)."""
        index: Dict[str, str] = {}
        for n in self.nodes:
            index[n] = n
            for f in self.node_files.get(n) or []:
                index.setdefault(f, n)
        cleaned = (f.strip().lstrip("./") for f in files)
        return sorted({index[f] for f in cleaned if f in index})

    def dependents(self, nodes: Iterable[str]) -> Set[str]:
        """Transitive importers of ``nodes`` (what can break), excluding them."""
        start = {n for n in nodes if self.has(n)}
        seen: Set[str] = set()
        queue = deque(start)
        while queue:
            cur = queue.popleft()
            for up in self.importers.get(cur, ()):
                if up not in seen and up not in start:
                    seen.add(up)
                    queue.append(up)
        return seen

    def critical_nodes(self) -> List[str]:
        """Nodes a newcomer must understand first: highest fan-in hubs.

        Deterministic: ranked by (fan-in, fan-out, id); tests excluded; nodes
        with no edges at all are never critical.
        """
        candidates = [
            n for n in self.nodes
            if not _is_test_node(n) and (self.importers[n] or self.imports[n])
        ]
        if not candidates:
            return []
        budget = min(12, max(3, math.ceil(len(candidates) / 5)))
        ranked = sorted(
            candidates,
            key=lambda n: (-len(self.importers[n]), -len(self.imports[n]), n),
        )
        return ranked[:budget]


# ── Fact checks ─────────────────────────────────────────────────────────────

CHECK_KINDS = ("imports", "importers")


def _check_prompt(kind: str, node: str) -> str:
    if kind == "imports":
        return f"Which of these does `{node}` depend on directly? Select all that apply."
    return f"Which of these depend directly on `{node}`? Select all that apply."


def build_check(facts: GraphFacts, node: str, kind: str, uid: str) -> Optional[Dict[str, Any]]:
    """Build one multi-select question for ``node`` with its private answer key.

    Returns ``None`` when the graph can't support a verifiable question
    (no edges of that kind, or too few distractors).
    """
    if kind not in CHECK_KINDS or not facts.has(node):
        return None
    truth = facts.imports[node] if kind == "imports" else facts.importers[node]
    if not truth:
        return None
    pool = [n for n in facts.nodes if n != node and n not in truth]
    if not pool:
        return None

    seed = f"{uid}|{node}|{kind}|{facts.fingerprint(node)}"
    rng = random.Random(hashlib.sha256(seed.encode("utf-8")).hexdigest())
    correct = rng.sample(sorted(truth), min(MAX_CORRECT_SHOWN, len(truth)))
    wanted = max(1, MAX_OPTIONS - len(correct))
    distractors = rng.sample(sorted(pool), min(wanted, len(pool)))
    options = correct + distractors
    rng.shuffle(options)
    return {
        "id": f"{kind}:{node}",
        "node": node,
        "kind": kind,
        "prompt": _check_prompt(kind, node),
        "options": options,
        "_answer": sorted(correct),
    }


def build_checks(facts: GraphFacts, node: str, uid: str) -> List[Dict[str, Any]]:
    return [q for q in (build_check(facts, node, k, uid) for k in CHECK_KINDS) if q]


def public_check(question: Dict[str, Any]) -> Dict[str, Any]:
    """Strip the answer key before a question leaves the server."""
    return {k: v for k, v in question.items() if not k.startswith("_")}


def grade_checks(
    facts: GraphFacts, node: str, uid: str, answers: Dict[str, Iterable[str]]
) -> Dict[str, Any]:
    """Grade submitted answers against the graph. All questions must be right."""
    questions = build_checks(facts, node, uid)
    results = []
    for q in questions:
        chosen = sorted(set(answers.get(q["id"]) or []))
        ok = chosen == q["_answer"]
        results.append({
            "id": q["id"],
            "correct": ok,
            # Reveal the key only after a correct answer; a wrong one teaches
            # through the graph instead of handing over the key to retry.
            "answer": q["_answer"] if ok else None,
        })
    passed = bool(questions) and all(r["correct"] for r in results)
    return {"passed": passed, "results": results}


# ── Walkthrough staleness ───────────────────────────────────────────────────


def step_status(facts: GraphFacts, step: Dict[str, Any]) -> str:
    node = step.get("node") or ""
    if not facts.has(node):
        return "removed"
    return "fresh" if facts.fingerprint(node) == step.get("fingerprint") else "changed"


def annotate_walkthrough(facts: GraphFacts, doc: Dict[str, Any], completed_by: Iterable[str] = ()) -> Dict[str, Any]:
    steps = []
    for step in doc.get("steps") or []:
        steps.append({**step, "status": step_status(facts, step)})
    stale_steps = sum(1 for s in steps if s["status"] != "fresh")
    completed = set(completed_by)
    return {
        **{k: v for k, v in doc.items() if k != "completed_by"},
        "steps": steps,
        "stale_steps": stale_steps,
        "stale": stale_steps > 0,
        "completed_count": len(doc.get("completed_by") or []),
        "completed": bool(completed & set(doc.get("completed_by") or [])),
    }


# ── Map projection ──────────────────────────────────────────────────────────


def node_state(facts: GraphFacts, node: str, lit: Dict[str, Any]) -> str:
    rec = lit.get(node)
    if not rec:
        return "fog"
    return "lit" if rec.get("fingerprint") == facts.fingerprint(node) else "changed"


def build_map(facts: GraphFacts, state: Dict[str, Any]) -> Dict[str, Any]:
    lit: Dict[str, Any] = state.get("lit") or {}
    attempts: Dict[str, Any] = state.get("attempts") or {}
    critical = facts.critical_nodes()
    critical_set = set(critical)

    nodes = []
    for n in facts.nodes:
        rec = lit.get(n) or {}
        nodes.append({
            "id": n,
            "group": facts.groups.get(n, "root"),
            "files": facts.node_files.get(n) or [],
            "fan_in": len(facts.importers[n]),
            "fan_out": len(facts.imports[n]),
            "critical": n in critical_set,
            "state": node_state(facts, n, lit),
            "lit_source": rec.get("source"),
            "lit_at": rec.get("at"),
            "checkable": bool(facts.imports[n] or facts.importers[n]),
            "failed_attempts": int((attempts.get(n) or {}).get("fails") or 0),
        })
    edges = [
        {"source": s, "target": t}
        for s in facts.nodes for t in sorted(facts.imports[s])
    ]

    def _lit(ns: Iterable[str]) -> int:
        return sum(1 for n in ns if node_state(facts, n, lit) == "lit")

    critical_lit = _lit(critical)
    overall_lit = _lit(facts.nodes)
    # Suggest the next critical node to learn: first fogged/changed hub whose
    # dependencies are already understood (or the top fogged hub otherwise).
    next_up = None
    for n in critical:
        if node_state(facts, n, lit) == "lit":
            continue
        if all(node_state(facts, d, lit) == "lit" for d in facts.imports[n] if d in critical_set):
            next_up = n
            break
    if next_up is None:
        next_up = next((n for n in critical if node_state(facts, n, lit) != "lit"), None)

    return {
        "nodes": nodes,
        "edges": edges,
        "critical_path": critical,
        "next_up": next_up,
        "progress": {
            "critical_total": len(critical),
            "critical_lit": critical_lit,
            "critical_pct": round(100 * critical_lit / len(critical)) if critical else 0,
            "overall_total": len(facts.nodes),
            "overall_lit": overall_lit,
            "changed": sum(1 for n in facts.nodes if node_state(facts, n, lit) == "changed"),
        },
        "snapshot": {"commit": facts.commit, "built_at": facts.built_at},
    }


# ── Persistence ─────────────────────────────────────────────────────────────


def _state_id(uid: str, key: str, branch: str) -> str:
    return hashlib.sha256(f"{uid}|{key}|{branch}".encode("utf-8")).hexdigest()[:32]


class ComprehensionStore:
    """Per-user fog state + team walkthroughs (best-effort reads, strict writes)."""

    async def get_state(self, uid: str, key: str, branch: str) -> Dict[str, Any]:
        doc = await get_storage().get_document(STATE_COLLECTION, _state_id(uid, key, branch))
        return doc or {"uid": uid, "repo_key": key, "branch": branch, "lit": {}, "attempts": {}}

    async def _put_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        storage = get_storage()
        doc_id = _state_id(state["uid"], state["repo_key"], state["branch"])
        payload = {k: v for k, v in state.items() if k != "id"}
        payload["updated_at"] = _iso()
        if await storage.get_document(STATE_COLLECTION, doc_id):
            stored = await storage.update_document(STATE_COLLECTION, doc_id, payload)
        else:
            stored = await storage.create_document(STATE_COLLECTION, doc_id, payload)
        return stored or {**payload, "id": doc_id}

    async def light(
        self,
        facts: GraphFacts,
        *,
        uid: str,
        key: str,
        branch: str,
        team_id: Optional[str],
        nodes: Iterable[str],
        source: str,
    ) -> Dict[str, Any]:
        state = await self.get_state(uid, key, branch)
        lit = dict(state.get("lit") or {})
        attempts = dict(state.get("attempts") or {})
        for n in nodes:
            fp = facts.fingerprint(n)
            if fp is None:
                continue
            lit[n] = {"source": source, "at": _iso(), "fingerprint": fp}
            attempts.pop(n, None)
        state.update({"lit": lit, "attempts": attempts, "team_id": team_id})
        return await self._put_state(state)

    def lockout_remaining(self, state: Dict[str, Any], node: str) -> int:
        rec = (state.get("attempts") or {}).get(node) or {}
        if int(rec.get("fails") or 0) < MAX_FAILED_ATTEMPTS:
            return 0
        last = _parse_iso(rec.get("last_failed_at"))
        if not last:
            return 0
        remaining = (last + LOCKOUT) - _now()
        return max(0, int(remaining.total_seconds()))

    async def record_failure(self, *, uid: str, key: str, branch: str, team_id: Optional[str], node: str) -> Dict[str, Any]:
        state = await self.get_state(uid, key, branch)
        attempts = dict(state.get("attempts") or {})
        rec = dict(attempts.get(node) or {})
        # A lockout that has expired starts a fresh window, but the lifetime
        # total is kept — it's the "where people get stuck" signal.
        if int(rec.get("fails") or 0) >= MAX_FAILED_ATTEMPTS and self.lockout_remaining(state, node) == 0:
            rec["fails"] = 0
        rec["fails"] = int(rec.get("fails") or 0) + 1
        rec["total_fails"] = int(rec.get("total_fails") or 0) + 1
        rec["last_failed_at"] = _iso()
        attempts[node] = rec
        state.update({"attempts": attempts, "team_id": team_id})
        return await self._put_state(state)

    async def team_states(self, key: str, branch: str) -> List[Dict[str, Any]]:
        try:
            return await get_storage().query_documents(
                STATE_COLLECTION, [("repo_key", "==", key), ("branch", "==", branch)]
            )
        except Exception:
            logger.exception("Team comprehension query failed for %s", key)
            return []

    # ── Walkthroughs ────────────────────────────────────────────────────

    async def list_walkthroughs(self, key: str, branch: str) -> List[Dict[str, Any]]:
        try:
            rows = await get_storage().query_documents(
                WALKTHROUGH_COLLECTION, [("repo_key", "==", key), ("branch", "==", branch)]
            )
        except Exception:
            logger.exception("Walkthrough query failed for %s", key)
            return []
        rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        return rows

    async def get_walkthrough(self, walkthrough_id: str) -> Optional[Dict[str, Any]]:
        return await get_storage().get_document(WALKTHROUGH_COLLECTION, walkthrough_id)

    async def save_walkthrough(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        storage = get_storage()
        doc_id = doc.get("id") or generate_id()
        payload = {k: v for k, v in doc.items() if k != "id"}
        payload["updated_at"] = _iso()
        if doc.get("id") and await storage.get_document(WALKTHROUGH_COLLECTION, doc_id):
            stored = await storage.update_document(WALKTHROUGH_COLLECTION, doc_id, payload)
        else:
            payload.setdefault("created_at", payload["updated_at"])
            stored = await storage.create_document(WALKTHROUGH_COLLECTION, doc_id, payload)
        return stored or {**payload, "id": doc_id}

    async def delete_walkthrough(self, walkthrough_id: str) -> None:
        await get_storage().delete_document(WALKTHROUGH_COLLECTION, walkthrough_id)


def pin_steps(facts: GraphFacts, steps: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Validate steps against the graph and pin each to its node fingerprint."""
    pinned, unknown = [], []
    for step in steps:
        node = str(step.get("node") or "")
        fp = facts.fingerprint(node)
        if fp is None:
            unknown.append(node)
            continue
        pinned.append({"node": node, "note": str(step.get("note") or "")[:MAX_NOTE_LEN], "fingerprint": fp})
    return pinned, unknown


def team_overview(facts: GraphFacts, states: List[Dict[str, Any]], names: Dict[str, str]) -> Dict[str, Any]:
    """Per-member progress + the nodes where the team gets stuck.

    ``stuck`` ranks nodes by lifetime failed checks across the team, weighted
    toward critical hubs — where a senior walkthrough pays off most.
    """
    critical = facts.critical_nodes()
    critical_set = set(critical)
    members = []
    fails: Dict[str, int] = {}
    strugglers: Dict[str, Set[str]] = {}
    for st in states:
        lit = st.get("lit") or {}
        critical_lit = sum(1 for n in critical if node_state(facts, n, lit) == "lit")
        members.append({
            "uid": st.get("uid"),
            "name": names.get(str(st.get("uid")), ""),
            "critical_lit": critical_lit,
            "critical_total": len(critical),
            "critical_pct": round(100 * critical_lit / len(critical)) if critical else 0,
            "overall_lit": sum(1 for n in facts.nodes if node_state(facts, n, lit) == "lit"),
            "changed": sum(1 for n in lit if facts.has(n) and node_state(facts, n, lit) == "changed"),
            "updated_at": st.get("updated_at"),
        })
        for n, rec in (st.get("attempts") or {}).items():
            if not facts.has(n):
                continue
            total = int(rec.get("total_fails") or rec.get("fails") or 0)
            if total:
                fails[n] = fails.get(n, 0) + total
                strugglers.setdefault(n, set()).add(str(st.get("uid")))

    stuck = sorted(
        (
            {
                "node": n,
                "failed_checks": c,
                "developers": len(strugglers.get(n, ())),
                "critical": n in critical_set,
            }
            for n, c in fails.items()
        ),
        key=lambda r: (-(r["failed_checks"] * (2 if r["critical"] else 1)), r["node"]),
    )
    members.sort(key=lambda m: (m["critical_pct"], m["overall_lit"]))

    # Bus factor: how many people have *demonstrated* (non-decayed) understanding
    # of each critical module. 0-1 means the knowledge walks out with one person.
    bus_factor = []
    for n in critical:
        who = [
            names.get(str(st.get("uid")), "") or str(st.get("uid"))
            for st in states
            if node_state(facts, n, st.get("lit") or {}) == "lit"
        ]
        bus_factor.append({"node": n, "count": len(who), "understood_by": sorted(who)})
    bus_factor.sort(key=lambda b: (b["count"], critical.index(b["node"])))
    return {"members": members, "stuck": stuck[:10], "critical_path": critical, "bus_factor": bus_factor}


comprehension_store = ComprehensionStore()


# ── Diffs, blast radius, starter issues, PR impact ─────────────────────────

_DIFF_FILE = re.compile(r"^diff --git a/(.+?) b/(.+)$", re.MULTILINE)
_PATHISH = re.compile(r"[A-Za-z0-9_@./-]+\.[A-Za-z0-9]{1,6}\b|[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)+")


def changed_files_from_diff(diff: str) -> List[str]:
    """File paths touched by a unified diff (post-image path wins)."""
    out: List[str] = []
    for _a, b in _DIFF_FILE.findall(diff or ""):
        if b not in out:
            out.append(b)
    return out


def nodes_mentioned(facts: GraphFacts, text: str) -> List[str]:
    """Graph nodes an issue explicitly names by path or unique file name.

    Deliberately literal: no fuzzy/LLM guessing. An issue that names no file
    gets an *unknown* blast radius rather than an invented one.
    """
    if not text:
        return []
    by_path: Dict[str, str] = {}
    by_base: Dict[str, Set[str]] = {}
    for n in facts.nodes:
        for f in (facts.node_files.get(n) or []) + [n]:
            by_path.setdefault(f.lower(), n)
            base = f.rsplit("/", 1)[-1].lower()
            if "." in base:
                by_base.setdefault(base, set()).add(n)
    hits: Set[str] = set()
    for token in _PATHISH.findall(text):
        tok = token.strip("./").lower()
        if tok in by_path:
            hits.add(by_path[tok])
            continue
        owners = by_base.get(tok.rsplit("/", 1)[-1])
        if owners and len(owners) == 1:
            hits.update(owners)
    return sorted(hits)


def rank_starter_issues(
    facts: GraphFacts, issues: List[Dict[str, Any]], lit: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Rank issues by how safe they are for *this* developer.

    Safe = small blast radius, and the modules it touches are ones the
    developer has already shown they understand. Issues naming no module sort
    last with ``blast_radius=None``: honest about what we can't see.
    """
    critical = set(facts.critical_nodes())
    ranked = []
    for issue in issues:
        mods = nodes_mentioned(facts, f"{issue.get('title') or ''}\n{issue.get('body') or ''}")
        radius = facts.dependents(mods)
        known = [m for m in mods if node_state(facts, m, lit) == "lit"]
        unknown = [m for m in mods if m not in known]
        if not mods:
            reason = "Doesn't name a file, so its blast radius is unknown."
        elif not unknown:
            reason = f"Touches only modules you understand; {len(radius)} module(s) depend on them."
        else:
            reason = f"Touches {len(unknown)} module(s) you haven't learned yet; {len(radius)} depend on its modules."
        ranked.append({
            "number": issue.get("number"),
            "title": issue.get("title"),
            "url": issue.get("url"),
            "labels": issue.get("labels") or [],
            "modules": mods,
            "known_modules": known,
            "unknown_modules": unknown,
            "touches_critical": any(m in critical for m in mods),
            "blast_radius": len(radius) if mods else None,
            "reason": reason,
        })
    ranked.sort(key=lambda r: (
        r["blast_radius"] is None,
        len(r["unknown_modules"]),
        r["touches_critical"],
        r["blast_radius"] or 0,
        r["number"] or 0,
    ))
    return ranked


def pr_impact(
    facts: GraphFacts,
    files: List[str],
    states: List[Dict[str, Any]],
    names: Dict[str, str],
    exclude_uid: Optional[str] = None,
) -> Dict[str, Any]:
    """What a change touches, what can break, and who understands it.

    Reviewers are suggested from *demonstrated* understanding (lit, not
    decayed) of the changed modules, weighted over merely affected ones.
    """
    changed = facts.nodes_for_files(files)
    affected = sorted(facts.dependents(changed))
    critical = set(facts.critical_nodes())
    reviewers = []
    for st in states:
        uid = str(st.get("uid") or "")
        if not uid or uid == exclude_uid:
            continue
        lit = st.get("lit") or {}
        knows_changed = [n for n in changed if node_state(facts, n, lit) == "lit"]
        knows_affected = [n for n in affected if node_state(facts, n, lit) == "lit"]
        score = 2 * len(knows_changed) + len(knows_affected)
        if score:
            reviewers.append({
                "uid": uid,
                "name": names.get(uid, ""),
                "understands_changed": knows_changed,
                "understands_affected": len(knows_affected),
                "score": score,
            })
    reviewers.sort(key=lambda r: (-r["score"], r["name"], r["uid"]))
    top = reviewers[:5]
    return {
        "changed_modules": changed,
        "affected_modules": affected,
        "blast_radius": len(affected),
        "touches_critical": sorted(n for n in set(changed + affected) if n in critical),
        "unmapped_files": [f for f in files if not facts.nodes_for_files([f])],
        "reviewers": top,
        # Changed modules nobody on the team has demonstrated understanding of.
        "knowledge_gaps": [n for n in changed if not any(n in r["understands_changed"] for r in reviewers)],
    }


_PR_REF = re.compile(r"(?:#|pull request #|PR #)(\d{1,7})\b", re.IGNORECASE)


def module_context(
    facts: GraphFacts,
    node: str,
    evolution: Dict[str, Any],
    *,
    states: List[Dict[str, Any]],
    names: Dict[str, str],
    walkthroughs: List[Dict[str, Any]],
    repo_url: str = "",
) -> Dict[str, Any]:
    """The "why" and "who" of one module, from evidence only.

    * who **wrote** it — git history (authors by commits touching its files);
    * who **understands** it — demonstrated on the Knowledge Map (not decayed);
    * why it looks like this — recent commit subjects (with PR links when the
      subject references one), decision records that name its files, and
      senior walkthrough notes.
    """
    files = set(facts.node_files.get(node) or []) | {node}
    history_by_file: Dict[str, List[Dict[str, Any]]] = evolution.get("file_history") or {}
    ownership: Dict[str, Dict[str, Any]] = evolution.get("file_ownership") or {}

    commits: Dict[str, Dict[str, Any]] = {}
    author_commits: Dict[str, int] = {}
    for f in sorted(files):
        for entry in history_by_file.get(f) or []:
            sha = str(entry.get("sha") or "")
            if not sha or sha in commits:
                continue
            commits[sha] = entry
            author = str(entry.get("author") or "")
            if author:
                author_commits[author] = author_commits.get(author, 0) + 1
    if not author_commits:
        # Older snapshots only carry ownership tallies.
        for f in files:
            for author in (ownership.get(f) or {}).get("authors") or []:
                author_commits[author] = author_commits.get(author, 0) + 1

    base = repo_url.rstrip("/")
    recent = sorted(commits.values(), key=lambda c: str(c.get("date") or ""), reverse=True)[:8]
    history = []
    for c in recent:
        m = _PR_REF.search(str(c.get("subject") or ""))
        pr = int(m.group(1)) if m else None
        history.append({
            **c,
            "pr_number": pr,
            "pr_url": f"{base}/pull/{pr}" if pr and base.startswith("https://github.com/") else None,
        })

    decisions = [
        {"path": d.get("path"), "title": d.get("title"), "excerpt": d.get("excerpt")}
        for d in evolution.get("decision_records") or []
        if files & set(d.get("mentions") or [])
    ][:10]

    understood_by = sorted(
        names.get(str(st.get("uid")), "") or str(st.get("uid"))
        for st in states
        if node_state(facts, node, st.get("lit") or {}) == "lit"
    )
    notes = []
    for w in walkthroughs:
        for step in w.get("steps") or []:
            if step.get("node") == node and step.get("note"):
                notes.append({
                    "walkthrough_id": w.get("id"),
                    "walkthrough": w.get("title"),
                    "author": w.get("author_name"),
                    "note": step["note"],
                    "status": step_status(facts, step),
                })

    return {
        "node": node,
        "who": {
            "wrote": [{"name": a, "commits": n} for a, n in sorted(author_commits.items(), key=lambda kv: (-kv[1], kv[0]))][:5],
            "understands": understood_by,
            "bus_factor": len(understood_by),
        },
        "why": {
            "history": history,
            "decisions": decisions,
            "walkthrough_notes": notes,
        },
        "has_history": bool(history_by_file or ownership),
    }


async def light_from_merged_pr(
    *,
    owner: str,
    name: str,
    login: str,
    pr_number: int,
    base_branch: str,
    load_diff: Callable[[], Awaitable[str]],
) -> List[str]:
    """Light the modules a merged PR touched for its author.

    Shipping a merged change to a module is evidence of understanding it.
    Only applies to a registered repo whose team the author belongs to; the
    diff is fetched lazily, after those cheap checks pass.
    """
    if not (owner and name and login):
        return []
    from app.services.architecture_store import architecture_store

    storage = get_storage()
    repos = await storage.query_documents("repositories", [("owner", "==", owner), ("name", "==", name)])
    if not repos or not repos[0].get("team_id"):
        return []
    team_id = repos[0]["team_id"]
    users = await storage.query_documents("users", [("github_username", "==", login)])
    members = []
    for u in users:
        uid = str(u.get("id") or u.get("uid") or "")
        if uid and await storage.query_documents(
            "team_members", [("team_id", "==", team_id), ("user_id", "==", uid)]
        ):
            members.append(uid)
    if not members:
        return []

    branch = base_branch or "main"
    snapshot = await architecture_store.latest(owner=owner, name=name, branch=branch)
    if snapshot is None:
        return []
    facts = GraphFacts.from_snapshot(snapshot)
    nodes = facts.nodes_for_files(changed_files_from_diff(await load_diff()))
    for uid in members if nodes else []:
        await comprehension_store.light(
            facts, uid=uid, key=repo_key(owner, name), branch=branch,
            team_id=team_id, nodes=nodes, source=f"pr:{pr_number}",
        )
    return nodes

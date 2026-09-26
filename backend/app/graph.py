from typing import Dict, Any, List, Optional
from pathlib import Path
import logging
import posixpath
import networkx as nx

logger = logging.getLogger(__name__)


_JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_RESOLVABLE_EXTS = _JS_EXTS + (".py", ".go", ".rs", ".java", ".kt")
_INDEX_FILES = ("index.ts", "index.tsx", "index.js", "index.jsx", "__init__.py")

# Only source code becomes a graph node — docs, lockfiles and config would
# otherwise drown the real modules (and collapse the graph to top-level dirs).
_CODE_EXTS = frozenset(_RESOLVABLE_EXTS + (
    ".rb", ".php", ".cs", ".swift", ".scala", ".c", ".cc", ".cpp", ".h", ".hpp",
))
_VENDOR_SEGMENTS = frozenset({
    "node_modules", ".venv", "venv", "site-packages", "__pycache__", "dist", "build",
})


def _norm(path: str) -> str:
    return path.replace("\\", "/")


def _is_code_file(path: str) -> bool:
    path = _norm(path)
    if any(segment in _VENDOR_SEGMENTS for segment in path.split("/")):
        return False
    return posixpath.splitext(path)[1].lower() in _CODE_EXTS


class _ModuleResolver:
    """Resolve an import string to a file path inside the repository.

    Handles JS/TS relative paths (``../lib/api``), ``@/`` src aliases,
    Python absolute (``app.services.x``) and relative (``.x``) imports.
    Bare package names (``react``, ``logging``) never resolve to an
    unrelated same-named local file.
    """

    def __init__(self, paths):
        self.paths = {_norm(p) for p in paths}
        # "app/services/x" -> files whose extension-less path ends with it
        self.by_suffix: Dict[str, List[str]] = {}
        for path in self.paths:
            stem, ext = posixpath.splitext(path)
            if ext not in _RESOLVABLE_EXTS:
                continue
            parts = stem.split("/")
            if len(parts) > 1 and parts[-1] in ("__init__", "index"):
                parts = parts[:-1]
            for i in range(len(parts)):
                self.by_suffix.setdefault("/".join(parts[i:]), []).append(path)

    def _first_file(self, base: str) -> str:
        base = base.strip("/")
        if base in self.paths:
            return base
        for ext in _RESOLVABLE_EXTS:
            if base + ext in self.paths:
                return base + ext
        for index in _INDEX_FILES:
            if f"{base}/{index}" in self.paths:
                return f"{base}/{index}"
        return ""

    def _closest(self, candidates: List[str], source: str) -> str:
        """Prefer the candidate sharing the longest directory prefix with source."""
        def shared(path: str) -> int:
            n = 0
            for a, b in zip(path.split("/"), source.split("/")):
                if a != b:
                    break
                n += 1
            return n
        return max(sorted(candidates), key=shared)

    def _dotted(self, mod: str, source: str) -> str:
        parts = [p for p in mod.split(".") if p]
        src_dir = posixpath.dirname(source)
        for n in range(len(parts), 0, -1):
            key = "/".join(parts[:n])
            candidates = self.by_suffix.get(key, [])
            if n == 1:
                # A single name only resolves to a sibling module; otherwise
                # stdlib/package imports (``logging``) create false edges.
                candidates = [c for c in candidates if posixpath.dirname(c) == src_dir
                              or posixpath.dirname(posixpath.dirname(c)) == src_dir]
            if candidates:
                return self._closest(candidates, source)
        return ""

    def resolve(self, mod: str, source: str) -> str:
        mod = (mod or "").strip()
        if not mod:
            return ""
        source = _norm(source)
        src_dir = posixpath.dirname(source)
        is_js = source.endswith(_JS_EXTS)

        if mod.startswith("."):
            if is_js or "/" in mod:
                return self._first_file(posixpath.normpath(posixpath.join(src_dir, mod)))
            level = len(mod) - len(mod.lstrip("."))
            base_dir = src_dir
            for _ in range(level - 1):
                base_dir = posixpath.dirname(base_dir)
            rest = mod[level:].replace(".", "/")
            return self._first_file(posixpath.join(base_dir, rest) if rest else base_dir)

        if mod.startswith(("@/", "~/")):
            root = src_dir
            while root and posixpath.basename(root) != "src":
                root = posixpath.dirname(root)
            return self._first_file(posixpath.join(root, mod[2:])) if root else ""

        if is_js:
            return ""  # bare specifier = npm package
        if "/" in mod:
            return self._first_file(mod)
        return self._dotted(mod, source)


def _is_entry_point(fpath: str) -> bool:
    """True if the file path matches a conventional entry-point pattern."""
    name = Path(fpath).name.lower()
    return any(kw in name for kw in ["main", "index", "app", "cli", "server", "run", "entry"])


def _is_meta_node(node: str) -> bool:
    """Internal routing markers must not appear in the user-facing graph."""
    return node == "__entry__"


def _layer_for_path(path: str) -> str:
    """Return a stable top-level layer label for a repository path."""
    parts = [part for part in path.replace("\\", "/").split("/") if part]
    return parts[0] if len(parts) > 1 else "(root)"


def _adaptive_groups(nodes: List[str], max_nodes: int) -> Dict[str, List[str]]:
    """Group files into at most ``max_nodes`` directory nodes.

    Starts from top-level directories and repeatedly splits the largest
    group into its children while the budget allows — so big folders
    (``backend/app/services``) get resolved finely instead of the whole tree
    being cut at one uniform depth.
    """
    def prefix(path: str, depth: int) -> str:
        parts = path.split("/")
        return "/".join(parts[:depth]) if len(parts) > depth else path

    groups: Dict[str, List[str]] = {}
    for node in nodes:
        groups.setdefault(prefix(node, 1), []).append(node)
    depth_of = {g: 1 for g in groups}

    while True:
        changed = False
        for group in sorted((g for g in groups if len(groups[g]) > 1), key=lambda g: -len(groups[g])):
            depth = depth_of[group] + 1
            children: Dict[str, List[str]] = {}
            for f in groups[group]:
                children.setdefault(prefix(f, depth), []).append(f)
            if len(children) == 1:
                # Single sub-directory: descend without spending budget.
                (child, files), = children.items()
                del groups[group]
                groups[child] = files
                depth_of[child] = depth
                changed = True
                break
            if len(groups) - 1 + len(children) <= max_nodes:
                del groups[group]
                for child, files in children.items():
                    groups[child] = files
                    depth_of[child] = depth
                changed = True
                break
        if not changed:
            return groups


def _service_name(nodes: List[str], used: set, sizes: Optional[Dict[str, int]] = None) -> str:
    """Name a cluster after the directory its members share.

    Falls back to the cluster's largest member when the only shared prefix
    is a top-level folder (``backend``), which says nothing on its own.
    """
    sizes = sizes or {}
    dirs = [n if "." not in posixpath.basename(n) else posixpath.dirname(n) or n for n in nodes]
    try:
        common = posixpath.commonpath(dirs) if dirs else ""
    except ValueError:
        common = ""
    if "/" not in common:
        largest = max(sorted(nodes), key=lambda n: sizes.get(n, 1))
        common = largest if len(nodes) == 1 else f"{largest} +{len(nodes) - 1}"
    name = common
    n = 2
    while name in used:
        name = f"{common} ({n})"
        n += 1
    used.add(name)
    return name


def build_dependency_graph(entities: Dict) -> "DependencyGraph":
    """Build a :class:`DependencyGraph` from parsed entities.

    Single shared implementation used by both the repo-context index
    (parse-once) and ``ArchitectureExplorer`` so cached graphs and live
    graphs are identical.
    """
    graph = DependencyGraph()
    all_files = entities["files"]
    files = [f for f in all_files if _is_code_file(f["path"])] or all_files
    node_paths = {_norm(f["path"]) for f in files}
    resolver = _ModuleResolver(node_paths)

    for f in files:
        graph.add_module(_norm(f["path"]), {"language": f["language"]})

    def link(source: str, module: str) -> None:
        source = _norm(source)
        if source not in node_paths:
            return
        resolved = resolver.resolve(module, source)
        if resolved and resolved != source and resolved in node_paths:
            graph.add_dependency(source, resolved)

    for imp in entities["imports"]:
        link(imp["file"], imp["module"])

    for f in files:
        for dep in f.get("dependencies", []):
            link(f["path"], dep)

    graph.add_module("__entry__", {"language": "meta"})
    for f in files:
        has_exports = len(f.get("exports", [])) > 0
        if has_exports or _is_entry_point(f["path"]):
            graph.add_dependency("__entry__", _norm(f["path"]))

    return graph


class DependencyGraph:
    """Builds dependency graph using NetworkX."""

    def __init__(self):
        self.graph = nx.DiGraph()

    def add_module(self, name: str, metadata: Optional[Dict] = None):
        """Add node to graph with optional metadata."""
        self.graph.add_node(name, **(metadata or {}))

    def add_dependency(self, source: str, target: str, relationship: str = "imports"):
        """Add edge (source imports target)."""
        self.graph.add_edge(source, target, relationship=relationship)

    def get_topology(self) -> List[str]:
        """Return user-facing modules in topological order."""
        graph = self.graph.subgraph(
            node for node in self.graph.nodes if not _is_meta_node(node)
        ).copy()
        try:
            return list(nx.topological_sort(graph))
        except nx.NetworkXException:
            # Cycle detected - return all nodes as fallback
            return list(graph.nodes())

    def get_circular_dependencies(self) -> List[List[str]]:
        """Detect circular imports without exposing internal entry markers."""
        graph = self.graph.subgraph(
            node for node in self.graph.nodes if not _is_meta_node(node)
        ).copy()
        try:
            cycles = list(nx.simple_cycles(graph))
            return [list(cycle) for cycle in cycles]
        except Exception as exc:
            logger.debug("Failed to detect circular dependencies: %s", exc)
            return []

    def get_services(self) -> List[Dict[str, Any]]:
        communities = nx.community.greedy_modularity_communities(self.graph.to_undirected())
        services = []
        used: set = set()
        for community in communities:
            nodes = sorted(node for node in community if not _is_meta_node(node))
            if not nodes:
                continue
            services.append({
                "name": _service_name(nodes, used),
                "files": nodes,
                "description": f"Module cluster with {len(nodes)} files",
                "layer": _layer_for_path(nodes[0]),
            })
        return services

    def get_dependency_dict(self) -> Dict[str, List[str]]:
        deps = {}
        for node in self.graph.nodes():
            if _is_meta_node(node):
                continue
            predecessors = [
                predecessor for predecessor in self.graph.predecessors(node)
                if not _is_meta_node(predecessor)
            ]
            if predecessors:
                deps[node] = sorted(set(predecessors))
        return deps

    def detect_architecture_pattern(self) -> str:
        cycles = self.get_circular_dependencies()
        if cycles:
            return "modular"

        undirected = self.graph.subgraph(
            node for node in self.graph.nodes if not _is_meta_node(node)
        ).to_undirected()
        # Standalone files (scripts, configs) are not services.
        undirected = undirected.subgraph(n for n in undirected.nodes if undirected.degree(n) > 0)
        big_components = [c for c in nx.connected_components(undirected) if len(c) >= 5]
        if len(big_components) > 3:
            return "microservices"

        return "monolith"

    def generate_mermaid_diagram(self) -> str:
        lines = ["graph TD"]
        for source, target in self.graph.edges():
            if _is_meta_node(source) or _is_meta_node(target):
                continue
            lines.append(f"    {source} --> {target}")
        return "\n".join(lines)

    def collapse_graph(self, max_nodes: int = 150) -> Dict[str, Any]:
        """Group module nodes by directory path hierarchy when size exceeds max_nodes."""
        nodes = [node for node in self.graph.nodes() if not _is_meta_node(node)]
        if len(nodes) <= max_nodes:
            # Under threshold, return default serialization
            return {
                "modules": nodes,
                "dependencies": self.get_dependency_dict(),
                "topology": self.get_topology(),
                "circular_dependencies": self.get_circular_dependencies(),
                "services": self.get_services(),
                "architecture_pattern": self.detect_architecture_pattern(),
                "architecture_diagram": self.generate_mermaid_diagram(),
                "is_collapsed": False,
            }

        groups = _adaptive_groups(nodes, max_nodes)
        prefix_of = {f: prefix for prefix, files in groups.items() for f in files}

        # Construct new collapsed NetworkX Graph
        collapsed_graph = nx.DiGraph()

        # Map collapsed prefix to list of files it represents
        node_files: Dict[str, List[str]] = {p: sorted(f) for p, f in groups.items()}
        node_languages: Dict[str, set] = {
            p: {self.graph.nodes[f].get("language", "unknown") for f in files}
            for p, files in groups.items()
        }

        # Add nodes with metadata
        for prefix, files in node_files.items():
            langs = list(node_languages[prefix])
            lang_label = langs[0] if len(langs) == 1 else "mixed"
            collapsed_graph.add_node(
                prefix,
                is_cluster=True,
                files=files,
                language=lang_label,
            )

        # Map edges to collapsed prefix nodes
        for source, target in self.graph.edges():
            if _is_meta_node(source) or _is_meta_node(target):
                continue
            src_prefix = prefix_of[source]
            tgt_prefix = prefix_of[target]
            if src_prefix != tgt_prefix:
                collapsed_graph.add_edge(src_prefix, tgt_prefix)

        # Calculate properties on collapsed graph
        try:
            topology = list(nx.topological_sort(collapsed_graph))
        except nx.NetworkXException:
            # Collapsing can merge nodes into a cycle - fall back to plain order
            topology = list(collapsed_graph.nodes())

        try:
            cycles = [list(c) for c in nx.simple_cycles(collapsed_graph)]
        except Exception as exc:
            logger.debug("Failed to compute cycles on collapsed graph: %s", exc)
            cycles = []

        # Find communities/services
        services = []
        try:
            communities = nx.community.greedy_modularity_communities(collapsed_graph.to_undirected())
            used: set = set()
            for community in communities:
                nodes_list = sorted(node for node in community if not _is_meta_node(node))
                if not nodes_list:
                    continue
                file_count = sum(len(node_files.get(n, [n])) for n in nodes_list)
                services.append({
                    "name": _service_name(nodes_list, used, {k: len(v) for k, v in node_files.items()}),
                    "files": nodes_list,
                    "description": f"Module cluster with {file_count} files",
                    "layer": _layer_for_path(nodes_list[0]),
                })
        except Exception as exc:
            logger.debug("Failed to detect communities on collapsed graph: %s", exc)
            services = [{
                "name": "service_1",
                "files": list(collapsed_graph.nodes()),
                "description": f"All collapsed nodes ({len(collapsed_graph)} items)",
            }]

        # Rebuild dependency dictionary
        deps = {}
        for node in collapsed_graph.nodes():
            predecessors = list(collapsed_graph.predecessors(node))
            if predecessors:
                deps[node] = predecessors

        # Mermaid diagram for collapsed graph
        lines = ["graph TD"]
        for source, target in collapsed_graph.edges():
            lines.append(f"    {source} --> {target}")
        mermaid = "\n".join(lines)

        # Detect pattern
        pattern = self.detect_architecture_pattern()

        return {
            "modules": list(collapsed_graph.nodes()),
            "dependencies": deps,
            "topology": topology,
            "circular_dependencies": cycles,
            "services": services,
            "architecture_pattern": pattern,
            "architecture_diagram": mermaid,
            "node_files": node_files,
            "is_collapsed": True,
        }

    def to_dict(self, max_nodes: int = 150) -> Dict[str, Any]:
        """Serialize graph to dict for API response, automatically collapsing if node count exceeds max_nodes."""
        return self.collapse_graph(max_nodes)

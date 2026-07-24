from typing import Dict, Any, List, Optional
import logging
import networkx as nx

logger = logging.getLogger(__name__)


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
        """Return modules in topological order."""
        try:
            return list(nx.topological_sort(self.graph))
        except nx.NetworkXError:
            # Cycle detected - return all nodes as fallback
            return list(self.graph.nodes())

    def get_circular_dependencies(self) -> List[List[str]]:
        """Detect circular imports."""
        try:
            cycles = list(nx.simple_cycles(self.graph))
            return [list(cycle) for cycle in cycles]
        except Exception as exc:
            logger.debug("Failed to detect circular dependencies: %s", exc)
            return []

    def get_services(self) -> List[Dict[str, Any]]:
        communities = nx.community.greedy_modularity_communities(self.graph.to_undirected())
        services = []
        for i, community in enumerate(communities):
            nodes = sorted(community)
            services.append({
                "name": f"service_{i + 1}",
                "files": nodes,
                "description": f"Module cluster with {len(nodes)} files",
            })
        return services

    def get_dependency_dict(self) -> Dict[str, List[str]]:
        deps = {}
        for node in self.graph.nodes():
            predecessors = list(self.graph.predecessors(node))
            if predecessors:
                deps[node] = predecessors
        return deps

    def detect_architecture_pattern(self) -> str:
        cycles = self.get_circular_dependencies()
        if cycles:
            return "modular"

        undirected = self.graph.to_undirected()
        if nx.number_connected_components(undirected) > 3:
            return "microservices"

        return "monolith"

    def generate_mermaid_diagram(self) -> str:
        lines = ["graph TD"]
        for source, target in self.graph.edges():
            lines.append(f"    {source} --> {target}")
        return "\n".join(lines)

    def collapse_graph(self, max_nodes: int = 150) -> Dict[str, Any]:
        """Group module nodes by directory path hierarchy when size exceeds max_nodes."""
        nodes = list(self.graph.nodes())
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

        # Helper to get path prefix up to a given depth level
        def get_prefix(path: str, depth: int) -> str:
            parts = path.replace("\\", "/").split("/")
            if len(parts) <= depth:
                return path
            return "/".join(parts[:depth])

        # Find target depth resulting in node count <= max_nodes
        max_path_depth = 1
        for p in nodes:
            max_path_depth = max(max_path_depth, len(p.replace("\\", "/").split("/")))

        target_depth = max_path_depth
        collapsed_nodes = set()

        while target_depth > 1:
            collapsed_nodes = {get_prefix(node, target_depth) for node in nodes}
            if len(collapsed_nodes) <= max_nodes:
                break
            target_depth -= 1

        # Fallback if even depth 1 is too big
        if len(collapsed_nodes) > max_nodes:
            collapsed_nodes = {get_prefix(node, 1) for node in nodes}

        # Construct new collapsed NetworkX Graph
        collapsed_graph = nx.DiGraph()

        # Map collapsed prefix to list of files it represents
        node_files: Dict[str, List[str]] = {}
        node_languages: Dict[str, set] = {}

        for node in nodes:
            prefix = get_prefix(node, target_depth)
            node_files.setdefault(prefix, []).append(node)
            lang = self.graph.nodes[node].get("language", "unknown")
            node_languages.setdefault(prefix, set()).add(lang)

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
            src_prefix = get_prefix(source, target_depth)
            tgt_prefix = get_prefix(target, target_depth)
            if src_prefix != tgt_prefix:
                collapsed_graph.add_edge(src_prefix, tgt_prefix)

        # Calculate properties on collapsed graph
        try:
            topology = list(nx.topological_sort(collapsed_graph))
        except nx.NetworkXError:
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
            for i, community in enumerate(communities):
                nodes_list = sorted(community)
                services.append({
                    "name": f"service_{i + 1}",
                    "files": nodes_list,
                    "description": f"Module cluster with {len(nodes_list)} files",
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
        pattern = "monolith"
        if len(services) > 3:
            pattern = "microservices"
        elif len(cycles) > 0:
            pattern = "modular"

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

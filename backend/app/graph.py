from typing import Dict, Any, List, Optional
import networkx as nx


class DependencyGraph:
    def __init__(self):
        self.graph = nx.DiGraph()

    def add_module(self, name: str, metadata: Optional[Dict] = None):
        self.graph.add_node(name, **(metadata or {}))

    def add_dependency(self, source: str, target: str, relationship: str = "imports"):
        self.graph.add_edge(source, target, relationship=relationship)

    def get_topology(self) -> List[str]:
        try:
            return list(nx.topological_sort(self.graph))
        except nx.NetworkXUnfeasible:
            return []

    def get_circular_dependencies(self) -> List[List[str]]:
        cycles = list(nx.simple_cycles(self.graph))
        return [list(cycle) for cycle in cycles]

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

    def to_dict(self) -> Dict[str, Any]:
        return {
            "modules": list(self.graph.nodes()),
            "dependencies": self.get_dependency_dict(),
            "topology": self.get_topology(),
            "circular_dependencies": self.get_circular_dependencies(),
            "services": self.get_services(),
            "architecture_pattern": self.detect_architecture_pattern(),
            "architecture_diagram": self.generate_mermaid_diagram(),
        }

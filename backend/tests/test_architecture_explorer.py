import os
import tempfile
import pytest
from app.graph import DependencyGraph
from app.services.parser_service import ParserService


@pytest.fixture
def sample_python_repo():
    tmpdir = tempfile.mkdtemp()
    files = {
        "main.py": "from auth import login\nfrom database import connect\n\ndef start():\n    connect()\n    login()\n",
        "auth.py": "from database import connect\n\ndef login():\n    pass\n\nclass AuthService:\n    def authenticate(self):\n        pass\n",
        "database.py": "def connect():\n    pass\n\nclass Database:\n    def query(self):\n        pass\n",
        "utils.py": "import json\nimport os\n\ndef format_date():\n    pass\n",
    }
    for name, content in files.items():
        with open(os.path.join(tmpdir, name), "w") as f:
            f.write(content.lstrip("\n"))
    return tmpdir


class TestParserService:
    @pytest.mark.asyncio
    async def test_parse_python_files(self, sample_python_repo):
        parser = ParserService()
        result = await parser.parse_directory(sample_python_repo)

        assert len(result["files"]) == 4
        assert len(result["classes"]) >= 2
        assert len(result["functions"]) >= 3
        assert len(result["imports"]) >= 4
        assert "module_map" in result
        assert len(result["module_map"]) >= 4

        class_names = {c["name"] for c in result["classes"]}
        assert "AuthService" in class_names
        assert "Database" in class_names

    @pytest.mark.asyncio
    async def test_parse_js_file(self):
        tmpdir = tempfile.mkdtemp()
        with open(os.path.join(tmpdir, "app.js"), "w") as f:
            f.write("import React from 'react';\nimport { useState } from 'react';\nfunction App() { return null; }\nexport default App;\n")
        parser = ParserService()
        result = await parser.parse_directory(tmpdir)
        assert len(result["files"]) == 1
        assert result["files"][0]["language"] == "javascript"

    @pytest.mark.asyncio
    async def test_parse_tsx_file(self):
        tmpdir = tempfile.mkdtemp()
        with open(os.path.join(tmpdir, "component.tsx"), "w") as f:
            f.write("import React from 'react';\ninterface Props { name: string }\nexport const Comp: React.FC<Props> = () => null;\n")
        parser = ParserService()
        result = await parser.parse_directory(tmpdir)
        assert len(result["files"]) == 1
        assert result["files"][0]["language"] == "typescript"

    @pytest.mark.asyncio
    async def test_empty_directory(self):
        parser = ParserService()
        result = await parser.parse_directory(tempfile.mkdtemp())
        assert len(result["files"]) == 0

    @pytest.mark.asyncio
    async def test_parse_go_file(self):
        tmpdir = tempfile.mkdtemp()
        with open(os.path.join(tmpdir, "server.go"), "w") as f:
            f.write("package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"hello\") }\ntype Config struct { Name string }\n")
        parser = ParserService()
        result = await parser.parse_directory(tmpdir)
        assert len(result["files"]) == 1
        assert result["files"][0]["language"] == "go"

    @pytest.mark.asyncio
    async def test_parse_java_file(self):
        tmpdir = tempfile.mkdtemp()
        with open(os.path.join(tmpdir, "UserService.java"), "w") as f:
            f.write("import java.util.List;\npublic class UserService {\n    public User findUser() { return null; }\n}\n")
        parser = ParserService()
        result = await parser.parse_directory(tmpdir)
        assert len(result["files"]) == 1
        assert result["files"][0]["language"] == "java"
        assert len(result["classes"]) == 1
        assert result["classes"][0]["name"] == "UserService"

    @pytest.mark.asyncio
    async def test_parse_rust_file(self):
        tmpdir = tempfile.mkdtemp()
        with open(os.path.join(tmpdir, "lib.rs"), "w") as f:
            f.write("use std::collections::HashMap;\npub fn handle() -> String { String::new() }\npub struct User { name: String }\n")
        parser = ParserService()
        result = await parser.parse_directory(tmpdir)
        assert len(result["files"]) == 1
        assert result["files"][0]["language"] == "rust"


class TestDependencyGraph:
    def test_basic_graph(self):
        g = DependencyGraph()
        g.add_module("main.py")
        g.add_module("auth.py")
        g.add_module("database.py")
        g.add_dependency("main.py", "auth.py")
        g.add_dependency("main.py", "database.py")
        assert len(g.get_topology()) == 3

    def test_circular_dependencies(self):
        g = DependencyGraph()
        g.add_module("a")
        g.add_module("b")
        g.add_module("c")
        g.add_dependency("a", "b")
        g.add_dependency("b", "c")
        g.add_dependency("c", "a")
        assert len(g.get_circular_dependencies()) > 0

    def test_no_circular_dependencies(self):
        g = DependencyGraph()
        g.add_module("a")
        g.add_module("b")
        g.add_module("c")
        g.add_dependency("a", "b")
        g.add_dependency("b", "c")
        assert len(g.get_circular_dependencies()) == 0

    def test_mermaid_diagram(self):
        g = DependencyGraph()
        g.add_module("a")
        g.add_module("b")
        g.add_dependency("a", "b")
        diagram = g.generate_mermaid_diagram()
        assert diagram.startswith("graph TD")
        assert "a --> b" in diagram

    def test_architecture_pattern_detection(self):
        g = DependencyGraph()
        for m in ["main", "auth", "db", "api", "logger"]:
            g.add_module(m)
        g.add_dependency("main", "auth")
        g.add_dependency("main", "db")
        g.add_dependency("auth", "db")
        g.add_dependency("api", "auth")
        g.add_dependency("api", "db")
        pattern = g.detect_architecture_pattern()
        assert pattern in ("monolith", "modular", "microservices")

    def test_get_services_returns_clusters(self):
        g = DependencyGraph()
        for m in [f"module_{i}" for i in range(10)]:
            g.add_module(m)
        g.add_dependency("module_0", "module_1")
        g.add_dependency("module_2", "module_3")
        services = g.get_services()
        assert len(services) >= 1


class TestArchitectureExplorer:
    @pytest.mark.asyncio
    async def test_execute_no_llm(self, sample_python_repo):
        from app.agents.architecture_explorer import ArchitectureExplorer
        from app.services.parser_service import ParserService
        from app.graph import DependencyGraph

        parser = ParserService()
        entities = await parser.parse_directory(sample_python_repo)

        graph = DependencyGraph()
        for f in entities["files"]:
            graph.add_module(f["path"], {"language": f["language"]})
        for dep in entities["imports"]:
            source = dep["file"]
            for f in entities["files"]:
                if dep["module"] in f["path"]:
                    graph.add_dependency(source, f["path"])
        result = graph.to_dict()

        assert "modules" in result
        assert "dependencies" in result
        assert "architecture_diagram" in result
        assert len(result["modules"]) == 4

    @pytest.mark.asyncio
    async def test_architecture_explorer_execute():
        """Test that explorer can execute on a real repo."""
        from app.agents.architecture_explorer import ArchitectureExplorer

        explorer = ArchitectureExplorer(llm_client=None)

        # Use a small public repo for testing
        result = await explorer.execute(
            repo_url="https://github.com/octocat/Hello-World",
            branch="master"
        )

        assert result["repo"] == "https://github.com/octocat/Hello-World"
        assert "entities" in result
        assert "graph" in result
        assert isinstance(result["entities"]["files"], list)

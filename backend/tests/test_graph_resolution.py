"""Dependency-graph import resolution + collapse (app/graph.py)."""
from app.graph import _adaptive_groups, _ModuleResolver, build_dependency_graph


PATHS = [
    "web/src/pages/ExplorePage.tsx",
    "web/src/lib/api.ts",
    "web/src/components/ui/index.ts",
    "backend/app/api/v1/explore.py",
    "backend/app/services/architecture_store.py",
    "backend/app/services/__init__.py",
    "backend/app/middleware/logging.py",
    "backend/app/middleware/auth.py",
]


def test_js_relative_and_directory_index_imports():
    r = _ModuleResolver(PATHS)
    assert r.resolve("../lib/api", "web/src/pages/ExplorePage.tsx") == "web/src/lib/api.ts"
    assert r.resolve("../components/ui", "web/src/pages/ExplorePage.tsx") == "web/src/components/ui/index.ts"
    assert r.resolve("@/lib/api", "web/src/pages/ExplorePage.tsx") == "web/src/lib/api.ts"


def test_js_bare_specifier_is_a_package():
    assert _ModuleResolver(PATHS).resolve("react", "web/src/pages/ExplorePage.tsx") == ""


def test_python_absolute_import_under_nested_root():
    r = _ModuleResolver(PATHS)
    got = r.resolve("app.services.architecture_store.architecture_store", "backend/app/api/v1/explore.py")
    assert got == "backend/app/services/architecture_store.py"


def test_python_stdlib_name_does_not_match_unrelated_local_file():
    # `import logging` in explore.py must not link to middleware/logging.py
    assert _ModuleResolver(PATHS).resolve("logging", "backend/app/api/v1/explore.py") == ""


def test_python_relative_import():
    r = _ModuleResolver(PATHS)
    assert r.resolve(".logging", "backend/app/middleware/auth.py") == "backend/app/middleware/logging.py"


def test_graph_skips_docs_and_vendored_files():
    entities = {
        "files": [
            {"path": "README.md", "language": "markdown"},
            {"path": "backend/.venv/Lib/x.py", "language": "python"},
            {"path": "web/src/lib/api.ts", "language": "typescript"},
            {"path": "web/src/pages/ExplorePage.tsx", "language": "typescript"},
        ],
        "imports": [{"module": "../lib/api", "file": "web/src/pages/ExplorePage.tsx"}],
    }
    graph = build_dependency_graph(entities).graph
    assert "README.md" not in graph
    assert "backend/.venv/Lib/x.py" not in graph
    assert graph.has_edge("web/src/pages/ExplorePage.tsx", "web/src/lib/api.ts")


def test_adaptive_groups_respects_budget_and_splits_big_dirs():
    files = [f"backend/app/services/s{i}.py" for i in range(30)] + ["web/src/a.ts", "web/src/b.ts"]
    groups = _adaptive_groups(files, max_nodes=10)
    assert len(groups) <= 10
    assert sorted(f for fs in groups.values() for f in fs) == sorted(files)
    # the big directory is resolved below the top level
    assert "backend" not in groups

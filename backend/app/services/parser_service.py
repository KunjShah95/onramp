import os
import ast
import re
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

# ---------------------------------------------------------------------------
# Lazy tree-sitter initialisation – only imported when needed (non-Python files)
# ---------------------------------------------------------------------------
_TS_CACHE: Optional[Dict[str, Any]] = None


def _get_ts_languages():
    """Lazy-load tree-sitter languages on first use (avoids import-time cost)."""
    global _TS_CACHE
    if _TS_CACHE is not None:
        return _TS_CACHE

    from tree_sitter import Language, Parser, Query, QueryCursor

    import tree_sitter_javascript as _tspkg_js
    import tree_sitter_typescript as _tspkg_ts
    import tree_sitter_go as _tspkg_go
    import tree_sitter_rust as _tspkg_rust
    import tree_sitter_java as _tspkg_java

    langs = {
        "javascript": Language(_tspkg_js.language()),
        "typescript": Language(_tspkg_ts.language_typescript()),
        "tsx": Language(_tspkg_ts.language_tsx()),
        "go": Language(_tspkg_go.language()),
        "rust": Language(_tspkg_rust.language()),
        "java": Language(_tspkg_java.language()),
    }
    parsers = {name: Parser(lang) for name, lang in langs.items()}

    # ── Queries ──────────────────────────────────────────────────────────
    #   Each language gets a Query object + a dedicated QueryCursor
    #   that is re-used across parse calls.
    queries = {
        "javascript": Query(
            langs["javascript"],
            """
            (class_declaration name: (identifier) @class.name)
            (function_declaration name: (identifier) @func.name)
            (method_definition name: (property_identifier) @method.name)
            (import_statement source: (string) @import.source)
            (export_statement) @export
            """,
        ),
        "typescript": Query(
            langs["typescript"],
            """
            (class_declaration name: (type_identifier) @class.name)
            (function_declaration name: (identifier) @func.name)
            (method_definition name: (property_identifier) @method.name)
            (interface_declaration name: (type_identifier) @interface.name)
            (type_alias_declaration name: (type_identifier) @alias.name)
            (enum_declaration name: (identifier) @enum.name)
            (import_statement source: (string) @import.source)
            (export_statement) @export
            """,
        ),
        "tsx": Query(
            langs["tsx"],
            """
            (class_declaration name: (type_identifier) @class.name)
            (function_declaration name: (identifier) @func.name)
            (method_definition name: (property_identifier) @method.name)
            (interface_declaration name: (type_identifier) @interface.name)
            (type_alias_declaration name: (type_identifier) @alias.name)
            (enum_declaration name: (identifier) @enum.name)
            (import_statement source: (string) @import.source)
            (export_statement) @export
            """,
        ),
        "go": Query(
            langs["go"],
            """
            (function_declaration name: (identifier) @func.name)
            (method_declaration name: (field_identifier) @method.name)
            (type_declaration (type_spec name: (type_identifier) @type.name))
            (import_declaration
              (import_spec_list (import_spec name: (package_identifier) @import.name))) @import_stmt
            """,
        ),
        "rust": Query(
            langs["rust"],
            """
            (function_item name: (identifier) @func.name)
            (struct_item name: (type_identifier) @struct.name)
            (enum_item name: (type_identifier) @enum.name)
            (trait_item name: (type_identifier) @trait.name)
            (impl_item) @impl
            (use_declaration (scoped_identifier) @import.use)
            """,
        ),
        "java": Query(
            langs["java"],
            """
            (class_declaration name: (identifier) @class.name)
            (interface_declaration name: (identifier) @interface.name)
            (method_declaration name: (identifier) @method.name)
            (import_declaration (scoped_identifier) @import.path)
            """,
        ),
    }

    # ── Export sub-queries per language ──────────────────────────────────
    export_queries = {
        "javascript": Query(
            langs["javascript"],
            """
            (export_statement
              declaration: (function_declaration name: (identifier) @export.func))
            (export_statement
              declaration: (class_declaration name: (identifier) @export.class))
            (export_statement
              declaration: (variable_declaration
                (variable_declarator name: (identifier) @export.var)))
            (export_statement
              value: (identifier) @export.default)
            """,
        ),
        "typescript": Query(
            langs["typescript"],
            """
            (export_statement
              declaration: (function_declaration name: (identifier) @export.func))
            (export_statement
              declaration: (class_declaration name: (type_identifier) @export.class))
            (export_statement
              declaration: (variable_declaration
                (variable_declarator name: (identifier) @export.var)))
            (export_statement
              value: (identifier) @export.default)
            """,
        ),
        "tsx": Query(
            langs["tsx"],
            """
            (export_statement
              declaration: (function_declaration name: (identifier) @export.func))
            (export_statement
              declaration: (class_declaration name: (type_identifier) @export.class))
            (export_statement
              declaration: (variable_declaration
                (variable_declarator name: (identifier) @export.var)))
            (export_statement
              value: (identifier) @export.default)
            """,
        ),
    }

    _TS_CACHE = {
        "parsers": parsers,
        "queries": queries,
        "export_queries": export_queries,
        "langs": langs,
        "QueryCursor": QueryCursor,  # stored for use in _parse_with_tree_sitter
    }
    return _TS_CACHE


# ---------------------------------------------------------------------------
# Data container
# ---------------------------------------------------------------------------
class FileAnalysis:
    def __init__(self, path: str):
        self.path = path
        self.language = self._detect_language()
        self.classes: List[Dict] = []
        self.functions: List[Dict] = []
        self.imports: List[str] = []
        self.exports: List[str] = []
        self.dependencies: List[str] = []

    def _detect_language(self) -> str:
        ext = Path(self.path).suffix.lower()
        mapping = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",  # TSX uses the tsx tree-sitter parser internally
            ".go": "go",
            ".rs": "rust",
            ".java": "java",
        }
        return mapping.get(ext, "unknown")

    def to_dict(self) -> Dict:
        return {
            "path": self.path,
            "language": self.language,
            "classes": self.classes,
            "functions": self.functions,
            "imports": self.imports,
            "exports": self.exports,
            "dependencies": self.dependencies,
        }

    def _add_dep(self, module: str):
        """Add an import string and track its top-level dependency."""
        self.imports.append(module)
        top = module.split(".")[0].split("/")[0].split("::")[0]
        if top and top not in self.dependencies:
            self.dependencies.append(top)


# ---------------------------------------------------------------------------
# Main ParserService
# ---------------------------------------------------------------------------
class ParserService:
    SUPPORTED_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java"}
    IGNORE_DIRS = {
        "node_modules", "__pycache__", ".git", "venv", "dist", "build",
        ".next", "vendor", ".tox", "target", "egg-info", ".eggs",
    }

    # ── Public API ───────────────────────────────────────────────────────

    async def parse_directory(self, repo_path: str) -> Dict[str, Any]:
        entities = {
            "files": [],
            "classes": [],
            "functions": [],
            "imports": [],
            "exports": [],
            "module_map": {},
        }
        module_map = {}

        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in self.IGNORE_DIRS]
            for fname in files:
                fpath = os.path.join(root, fname)
                ext = Path(fname).suffix.lower()
                if ext not in self.SUPPORTED_EXTS:
                    continue
                try:
                    analysis = await self._parse_file(fpath)
                    rel_path = os.path.relpath(fpath, repo_path).replace("\\", "/")
                    analysis.path = rel_path

                    entities["files"].append(analysis.to_dict())
                    entities["classes"].extend(
                        {"name": c["name"], "file": rel_path, "language": analysis.language}
                        for c in analysis.classes
                    )
                    entities["functions"].extend(
                        {"name": f["name"], "file": rel_path, "language": analysis.language}
                        for f in analysis.functions
                    )
                    entities["imports"].extend(
                        {"module": imp, "file": rel_path, "language": analysis.language}
                        for imp in analysis.imports
                    )
                    entities["exports"].extend(
                        {"name": exp, "file": rel_path, "language": analysis.language}
                        for exp in analysis.exports
                    )
                    stem = Path(fname).stem
                    module_map[stem] = rel_path
                    module_map[rel_path] = rel_path
                except Exception:
                    pass

        entities["module_map"] = module_map
        return entities

    async def _parse_file(self, file_path: str) -> FileAnalysis:
        analysis = FileAnalysis(file_path)
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        lang = analysis.language
        # Map language label → internal parser key
        ts_lang_map = {
            "python": None,
            "javascript": "javascript",
            "typescript": "tsx" if Path(file_path).suffix.lower() == ".tsx" else "typescript",
            "go": "go",
            "rust": "rust",
            "java": "java",
        }
        ts_key = ts_lang_map.get(lang)
        if lang == "python":
            self._parse_python(content, analysis)
        elif ts_key:
            self._parse_with_tree_sitter(content, ts_key, analysis)
        return analysis

    # ── Python (built-in ast module) ─────────────────────────────────────

    def _parse_python(self, content: str, analysis: FileAnalysis):
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                methods = [
                    n.name
                    for n in node.body
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                ]
                bases = [self._get_name(b) for b in node.bases]
                analysis.classes.append({
                    "name": node.name,
                    "methods": methods,
                    "bases": bases,
                    "lineno": node.lineno,
                })

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                decorators = [self._get_name(d) for d in node.decorator_list]
                args = [a.arg for a in node.args.args]
                analysis.functions.append({
                    "name": node.name,
                    "args": args,
                    "decorators": decorators,
                    "lineno": node.lineno,
                })
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    analysis._add_dep(alias.name)
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for alias in node.names:
                    full = f"{module}.{alias.name}" if module else alias.name
                    analysis._add_dep(full)

    # ── Tree-sitter parsers (JS, TS, TSX, Go, Rust, Java) ────────────────

    def _parse_with_tree_sitter(self, content: str, lang: str, analysis: FileAnalysis):
        """Parse a file using tree-sitter, populating the FileAnalysis object."""
        ts = _get_ts_languages()
        parser = ts["parsers"].get(lang)
        query = ts["queries"].get(lang)
        if not parser or not query:
            return

        source_bytes = content.encode("utf-8")
        tree = parser.parse(source_bytes)
        root = tree.root_node

        # ── First pass: collect all captured nodes ───────────────────────
        cursor = ts["QueryCursor"](query)
        cap_map: Dict[str, List] = cursor.captures(root)
        # cap_map is e.g. {"func.name": [node1, node2], "class.name": [node3], ...}

        # ── Classes ──────────────────────────────────────────────────────
        class_nodes = (
            cap_map.get("class.name", [])
            + cap_map.get("interface.name", [])
            + cap_map.get("alias.name", [])
            + cap_map.get("enum.name", [])
            + cap_map.get("struct.name", [])
            + cap_map.get("trait.name", [])
            + cap_map.get("type.name", [])
        )
        seen_class_names = set()
        for node in class_nodes:
            name = self._node_text(node, source_bytes)
            if name and name not in seen_class_names:
                seen_class_names.add(name)
                analysis.classes.append({
                    "name": name,
                    "methods": [],
                    "bases": [],
                    "lineno": node.start_point[0] + 1,
                })

        # ── Functions ────────────────────────────────────────────────────
        func_nodes = cap_map.get("func.name", [])
        method_nodes = cap_map.get("method.name", [])
        seen_func_names = set()
        for node in func_nodes + method_nodes:
            name = self._node_text(node, source_bytes)
            if name and name not in seen_func_names:
                seen_func_names.add(name)
                analysis.functions.append({
                    "name": name,
                    "args": [],
                    "decorators": [],
                    "lineno": node.start_point[0] + 1,
                })

        # ── Arrow functions / variable function expressions (JS/TS/TSX) ──
        if lang in ("javascript", "typescript", "tsx"):
            self._extract_variable_funcs(root, source_bytes, analysis)

        # ── Imports ──────────────────────────────────────────────────────
        if lang in ("javascript", "typescript", "tsx"):
            for node in cap_map.get("import.source", []):
                raw = self._node_text(node, source_bytes)
                if raw:
                    analysis._add_dep(raw.strip("\"'"))
        elif lang == "go":
            # Go: import_spec_list has child import_spec nodes with package_identifier
            for stmt_node in cap_map.get("import_stmt", []):
                self._extract_go_imports(stmt_node, source_bytes, analysis)
        elif lang == "rust":
            for node in cap_map.get("import.use", []):
                raw = self._node_text(node, source_bytes)
                if raw:
                    analysis._add_dep(raw)
        elif lang == "java":
            for node in cap_map.get("import.path", []):
                raw = self._node_text(node, source_bytes)
                if raw:
                    analysis._add_dep(raw)

        # ── Exports (JS/TS/TSX) ─────────────────────────────────────────
        if lang in ("javascript", "typescript", "tsx"):
            export_q = ts["export_queries"].get(lang)
            if export_q:
                export_cursor = ts["QueryCursor"](export_q)
                export_caps = export_cursor.captures(root)
                for cap_name, nodes in export_caps.items():
                    for enode in nodes:
                        name = self._node_text(enode, source_bytes)
                        if name and name not in analysis.exports:
                            analysis.exports.append(name)
                # Also handle named re-exports like `export { foo }`
                self._extract_named_re_exports(root, source_bytes, analysis)

    # ── Helper: extract text from tree-sitter node ───────────────────────

    @staticmethod
    def _node_text(node, source_bytes: bytes) -> str:
        try:
            return source_bytes[node.start_byte : node.end_byte].decode("utf-8")
        except Exception:
            return ""

    # ── Helper: variable-declarator → arrow_function / function ----------

    def _extract_variable_funcs(self, root, source_bytes: bytes, analysis: FileAnalysis):
        """Detect `const foo = () => ...` or `const foo = function() ...`."""
        cursor = root.walk()
        visited = set()

        def walk(node):
            if id(node) in visited:
                return
            visited.add(id(node))

            if node.type == "variable_declarator":
                name_node = node.child_by_field_name("name")
                value_node = node.child_by_field_name("value")
                if name_node and value_node and value_node.type in (
                    "arrow_function", "function"
                ):
                    name = self._node_text(name_node, source_bytes)
                    all_func_names = {f["name"] for f in analysis.functions}
                    if name and name not in all_func_names:
                        analysis.functions.append({
                            "name": name,
                            "args": [],
                            "decorators": [],
                            "lineno": node.start_point[0] + 1,
                        })
            for child in node.children:
                walk(child)

        walk(root)

    # ── Helper: Go import extraction ─────────────────────────────────────

    def _extract_go_imports(self, stmt_node, source_bytes: bytes, analysis: FileAnalysis):
        """Walk import_spec_list children and extract package paths."""
        def walk_imports(node):
            if node.type == "import_spec":
                path_node = node.child_by_field_name("path")
                if path_node:
                    raw = self._node_text(path_node, source_bytes)
                    if raw:
                        analysis._add_dep(raw.strip("\"'"))
            for child in node.children:
                walk_imports(child)

        walk_imports(stmt_node)

    # ── Helper: named re-exports `export { foo }` ────────────────────────

    def _extract_named_re_exports(self, root, source_bytes: bytes, analysis: FileAnalysis):
        """Extract names from `export { foo, bar }` statements."""
        cursor = root.walk()
        visited = set()

        def walk(node):
            if id(node) in visited:
                return
            visited.add(id(node))

            if node.type == "export_statement":
                # Check for export_clause child: `export { foo, bar }`
                for child in node.children:
                    if child.type == "export_clause":
                        for spec in child.children:
                            if spec.type == "export_specifier":
                                alias_node = spec.child_by_field_name("alias")
                                if alias_node:
                                    # export { foo as bar } → export name is "bar"
                                    alias = self._node_text(alias_node, source_bytes)
                                    if alias and alias not in analysis.exports:
                                        analysis.exports.append(alias)
                                else:
                                    name_node = spec.child_by_field_name("name")
                                    if name_node:
                                        name = self._node_text(name_node, source_bytes)
                                        if name and name not in analysis.exports:
                                            analysis.exports.append(name)
            for child in node.children:
                walk(child)

        walk(root)

    # ── Helper: resolve AST names (Python) ──────────────────────────────

    @staticmethod
    def _get_name(node) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{ParserService._get_name(node.value)}.{node.attr}"
        elif isinstance(node, ast.Call):
            return ParserService._get_name(node.func)
        return ""

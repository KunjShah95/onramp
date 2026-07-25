import os
import ast
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

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

    # ── Core languages (existing) ─────────────────────────────────────────
    import tree_sitter_javascript as _tspkg_js
    import tree_sitter_typescript as _tspkg_ts
    import tree_sitter_go as _tspkg_go
    import tree_sitter_rust as _tspkg_rust
    import tree_sitter_java as _tspkg_java

    # ── New languages (14) ──────────────────────────────────────────────
    import tree_sitter_c as _tspkg_c
    import tree_sitter_cpp as _tspkg_cpp
    import tree_sitter_c_sharp as _tspkg_cs
    import tree_sitter_php as _tspkg_php
    import tree_sitter_ruby as _tspkg_rb
    import tree_sitter_swift as _tspkg_swift
    import tree_sitter_kotlin as _tspkg_kt
    import tree_sitter_bash as _tspkg_sh
    import tree_sitter_markdown as _tspkg_md
    import tree_sitter_yaml as _tspkg_yml
    import tree_sitter_json as _tspkg_json
    import tree_sitter_html as _tspkg_html
    import tree_sitter_css as _tspkg_css
    import tree_sitter_sql as _tspkg_sql

    langs = {
        # Existing
        "javascript": Language(_tspkg_js.language()),
        "typescript": Language(_tspkg_ts.language_typescript()),
        "tsx": Language(_tspkg_ts.language_tsx()),
        "go": Language(_tspkg_go.language()),
        "rust": Language(_tspkg_rust.language()),
        "java": Language(_tspkg_java.language()),
        # New
        "c": Language(_tspkg_c.language()),
        "cpp": Language(_tspkg_cpp.language()),
        "c_sharp": Language(_tspkg_cs.language()),
        "php": Language(_tspkg_php.language_php()),
        "ruby": Language(_tspkg_rb.language()),
        "swift": Language(_tspkg_swift.language()),
        "kotlin": Language(_tspkg_kt.language()),
        "bash": Language(_tspkg_sh.language()),
        "markdown": Language(_tspkg_md.language()),
        "yaml": Language(_tspkg_yml.language()),
        "json": Language(_tspkg_json.language()),
        "html": Language(_tspkg_html.language()),
        "css": Language(_tspkg_css.language()),
        "sql": Language(_tspkg_sql.language()),
    }
    parsers = {name: Parser(lang) for name, lang in langs.items()}

    # ── Queries ──────────────────────────────────────────────────────────
    queries: Dict[str, Query] = {}

    # --- JavaScript ---
    queries["javascript"] = Query(
        langs["javascript"],
        """
        (class_declaration name: (identifier) @class.name)
        (function_declaration name: (identifier) @func.name)
        (generator_function_declaration name: (identifier) @func.name)
        (method_definition name: (property_identifier) @method.name)
        (import_statement source: (string) @import.source)
        (export_statement) @export
        """,
    )

    # --- TypeScript ---
    queries["typescript"] = Query(
        langs["typescript"],
        """
        (class_declaration name: (type_identifier) @class.name)
        (abstract_class_declaration name: (type_identifier) @class.name)
        (function_declaration name: (identifier) @func.name)
        (generator_function_declaration name: (identifier) @func.name)
        (method_definition name: (property_identifier) @method.name)
        (interface_declaration name: (type_identifier) @interface.name)
        (type_alias_declaration name: (type_identifier) @alias.name)
        (enum_declaration name: (identifier) @enum.name)
        (import_statement source: (string) @import.source)
        (export_statement) @export
        """,
    )

    # --- TSX ---
    queries["tsx"] = Query(
        langs["tsx"],
        """
        (class_declaration name: (type_identifier) @class.name)
        (abstract_class_declaration name: (type_identifier) @class.name)
        (function_declaration name: (identifier) @func.name)
        (generator_function_declaration name: (identifier) @func.name)
        (method_definition name: (property_identifier) @method.name)
        (interface_declaration name: (type_identifier) @interface.name)
        (type_alias_declaration name: (type_identifier) @alias.name)
        (enum_declaration name: (identifier) @enum.name)
        (import_statement source: (string) @import.source)
        (export_statement) @export
        """,
    )

    # --- Go ---
    queries["go"] = Query(
        langs["go"],
        """
        (function_declaration name: (identifier) @func.name)
        (method_declaration name: (field_identifier) @method.name)
        (type_declaration (type_spec name: (type_identifier) @type.name))
        (import_declaration) @import_stmt
        """,
    )

    # --- Rust ---
    queries["rust"] = Query(
        langs["rust"],
        """
        (function_item name: (identifier) @func.name)
        (struct_item name: (type_identifier) @struct.name)
        (enum_item name: (type_identifier) @enum.name)
        (trait_item name: (type_identifier) @trait.name)
        (impl_item) @impl
        (use_declaration) @use_stmt
        """,
    )

    # --- Java ---
    queries["java"] = Query(
        langs["java"],
        """
        (class_declaration name: (identifier) @class.name)
        (interface_declaration name: (identifier) @interface.name)
        (method_declaration name: (identifier) @method.name)
        (constructor_declaration name: (identifier) @method.name)
        (import_declaration) @import_stmt
        """,
    )

    # --- C ---
    queries["c"] = Query(
        langs["c"],
        """
        (function_definition
          declarator: (function_declarator
            declarator: (identifier) @func.name))
        (struct_specifier name: (type_identifier) @struct.name)
        (union_specifier name: (type_identifier) @struct.name)
        (preproc_include) @include_stmt
        """,
    )

    # --- C++ ---
    queries["cpp"] = Query(
        langs["cpp"],
        """
        (function_definition
          declarator: (function_declarator
            declarator: (identifier) @func.name))
        (function_definition
          declarator: (function_declarator
            declarator: (qualified_identifier
              (identifier) @func.name)))
        (class_specifier name: (type_identifier) @class.name)
        (struct_specifier name: (type_identifier) @struct.name)
        (preproc_include) @include_stmt
        """,
    )

    # --- C# ---
    queries["c_sharp"] = Query(
        langs["c_sharp"],
        """
        (class_declaration name: (identifier) @class.name)
        (struct_declaration name: (identifier) @class.name)
        (interface_declaration name: (identifier) @interface.name)
        (method_declaration name: (identifier) @method.name)
        (using_directive) @using_stmt
        """,
    )

    # --- PHP ---
    queries["php"] = Query(
        langs["php"],
        """
        (class_declaration name: (name) @class.name)
        (interface_declaration name: (name) @interface.name)
        (function_definition name: (name) @func.name)
        (method_declaration name: (name) @method.name)
        (namespace_use_declaration) @use_stmt
        """,
    )

    # --- Ruby ---
    queries["ruby"] = Query(
        langs["ruby"],
        """
        (class name: (constant) @class.name)
        (module name: (constant) @module.name)
        (method name: (identifier) @method.name)
        (singleton_method name: (identifier) @method.name)
        """,
    )

    # --- Swift ---
    queries["swift"] = Query(
        langs["swift"],
        """
        (class_declaration name: (type_identifier) @class.name)
        (protocol_declaration name: (type_identifier) @interface.name)
        (function_declaration name: (simple_identifier) @func.name)
        (import_declaration) @import_stmt
        """,
    )

    # --- Kotlin ---
    queries["kotlin"] = Query(
        langs["kotlin"],
        """
        (class_declaration name: (identifier) @class.name)
        (object_declaration name: (identifier) @class.name)
        (function_declaration name: (identifier) @func.name)
        (import) @import_stmt
        """,
    )

    # --- Bash ---
    queries["bash"] = Query(
        langs["bash"],
        """
        (function_definition name: (word) @func.name)
        """,
    )

    # ── Markup / data / query languages (minimal — file is recorded but
    #    these have no traditional "classes" or "functions"). ─────────────
    #    We still create empty queries so the file is recognised & counted.
    for _lang in ("markdown", "yaml", "json", "html", "css", "sql"):
        queries[_lang] = Query(langs[_lang], "")

    # ── Export sub-queries per language ──────────────────────────────────
    export_queries: Dict[str, Query] = {}

    # --- JavaScript ---
    export_queries["javascript"] = Query(
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
          declaration: (lexical_declaration
            (variable_declarator name: (identifier) @export.var)))
        (export_statement
          value: (identifier) @export.default)
        """,
    )

    # --- TypeScript ---
    export_queries["typescript"] = Query(
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
          declaration: (lexical_declaration
            (variable_declarator name: (identifier) @export.var)))
        (export_statement
          value: (identifier) @export.default)
        """,
    )

    # --- TSX ---
    export_queries["tsx"] = Query(
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
          declaration: (lexical_declaration
            (variable_declarator name: (identifier) @export.var)))
        (export_statement
          value: (identifier) @export.default)
        """,
    )

    _TS_CACHE = {
        "parsers": parsers,
        "queries": queries,
        "export_queries": export_queries,
        "langs": langs,
        "QueryCursor": QueryCursor,
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
            ".js": "javascript", ".jsx": "javascript",
            ".ts": "typescript", ".tsx": "typescript",
            ".go": "go",
            ".rs": "rust",
            ".java": "java",
            # 14 new languages
            ".c": "c", ".h": "c",
            ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp", ".hxx": "cpp",
            ".cs": "c_sharp",
            ".php": "php", ".phtml": "php",
            ".rb": "ruby",
            ".swift": "swift",
            ".kt": "kotlin", ".kts": "kotlin",
            ".sh": "bash", ".bash": "bash",
            ".md": "markdown", ".mdx": "markdown",
            ".yml": "yaml", ".yaml": "yaml",
            ".json": "json",
            ".html": "html", ".htm": "html",
            ".css": "css",
            ".sql": "sql",
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
    SUPPORTED_EXTS = {
        # Python + original 5
        ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java",
        # 14 new languages
        ".c", ".h",
        ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx",
        ".cs",
        ".php", ".phtml",
        ".rb",
        ".swift",
        ".kt", ".kts",
        ".sh", ".bash",
        ".md", ".mdx",
        ".yml", ".yaml",
        ".json",
        ".html", ".htm",
        ".css",
        ".sql",
    }
    IGNORE_DIRS = {
        "node_modules", "__pycache__", ".git", "venv", "dist", "build",
        ".next", "vendor", ".tox", "target", "egg-info", ".eggs",
        ".cargo", "Cargo.lock",
    }

    # ── Public API ───────────────────────────────────────────────────────

    async def parse_directory(self, repo_path: str, max_files: int = 1000) -> Dict[str, Any]:
        entities = {
            "files": [],
            "classes": [],
            "functions": [],
            "imports": [],
            "exports": [],
            "module_map": {},
        }
        module_map = {}
        parsed_count = 0

        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in self.IGNORE_DIRS]
            for fname in files:
                fpath = os.path.join(root, fname)
                ext = Path(fname).suffix.lower()
                if ext not in self.SUPPORTED_EXTS:
                    continue
                
                if parsed_count >= max_files:
                    if parsed_count == max_files:
                        logger.warning(
                            "AST parsing limit hit: exceeded %d files. Skipping remaining files for performance.",
                            max_files,
                        )
                        parsed_count += 1
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
                    parsed_count += 1
                except Exception:
                    logger.exception("Failed to parse file %s", fname)

        entities["module_map"] = module_map
        return entities

    async def _parse_file(self, file_path: str) -> FileAnalysis:
        analysis = FileAnalysis(file_path)
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        lang = analysis.language
        ts_key = self._ts_language_key(file_path, lang)
        if lang == "python":
            self._parse_python(content, analysis)
        elif ts_key:
            self._parse_with_tree_sitter(content, ts_key, analysis)
        return analysis

    @staticmethod
    def _ts_language_key(file_path: str, lang: str) -> Optional[str]:
        """Map language label from FileAnalysis → internal tree-sitter parser key."""
        if lang == "python":
            return None
        if lang == "typescript":
            return "tsx" if Path(file_path).suffix.lower() == ".tsx" else "typescript"
        # All other languages use their label as the parser key
        parser_keys = {
            "javascript", "go", "rust", "java",
            "c", "cpp", "c_sharp", "php", "ruby", "swift", "kotlin",
            "bash", "markdown", "yaml", "json", "html", "css", "sql",
        }
        return lang if lang in parser_keys else None

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

    # ── Tree-sitter parsers ─────────────────────────────────────────────

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

        # ── Classes ──────────────────────────────────────────────────────
        class_nodes = (
            cap_map.get("class.name", [])
            + cap_map.get("interface.name", [])
            + cap_map.get("alias.name", [])
            + cap_map.get("enum.name", [])
            + cap_map.get("struct.name", [])
            + cap_map.get("trait.name", [])
            + cap_map.get("type.name", [])
            + cap_map.get("module.name", [])
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
            for stmt_node in cap_map.get("import_stmt", []):
                self._extract_go_imports(stmt_node, source_bytes, analysis)
        elif lang in ("java", "kotlin", "swift"):
            for stmt_node in cap_map.get("import_stmt", []):
                self._extract_simple_imports(stmt_node, source_bytes, analysis)
        elif lang in ("rust", "php"):
            for stmt_node in cap_map.get("use_stmt", []):
                self._extract_use_clauses(stmt_node, source_bytes, analysis)
        elif lang in ("c", "cpp"):
            for stmt_node in cap_map.get("include_stmt", []):
                self._extract_c_include(stmt_node, source_bytes, analysis)
        elif lang == "c_sharp":
            for stmt_node in cap_map.get("using_stmt", []):
                self._extract_csharp_using(stmt_node, source_bytes, analysis)

        # ── Ruby imports (require / require_relative calls) ──────────────
        if lang == "ruby":
            self._extract_ruby_requires(root, source_bytes, analysis)

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
                self._extract_named_re_exports(root, source_bytes, analysis)

        # ── Bash source / . includes ────────────────────────────────────
        if lang == "bash":
            self._extract_bash_sources(root, source_bytes, analysis)

    # ── Helper: extract text from tree-sitter node ───────────────────────

    @staticmethod
    def _node_text(node, source_bytes: bytes) -> str:
        try:
            return source_bytes[node.start_byte : node.end_byte].decode("utf-8")
        except Exception:
            return ""

    # ── Helper: variable-declarator → arrow / function expression ---------

    def _extract_variable_funcs(self, root, source_bytes: bytes, analysis: FileAnalysis):
        """Detect `const foo = () => ...` or `const foo = function() ...`."""
        visited = set()

        def walk(node):
            if id(node) in visited:
                return
            visited.add(id(node))
            if node.type == "variable_declarator":
                name_node = node.child_by_field_name("name")
                value_node = node.child_by_field_name("value")
                if name_node and value_node and value_node.type in (
                    "arrow_function", "function_expression"
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

    # ── Helper: Go / Java / Kotlin / Swift import extraction ────────────

    def _extract_simple_imports(self, stmt_node, source_bytes: bytes, analysis: FileAnalysis):
        """Extract imports by finding string/identifier children.
        Works for Go (interpreted_string_literal), Java (scoped_identifier + asterisk),
        Kotlin (identifier + dots), Swift (scoped_identifier or dotted identifiers)."""
        parts: List[str] = []
        has_star = False
        for child in stmt_node.children:
            t = child.type
            if t in ("interpreted_string_literal", "string_literal", "string", "string_content"):
                raw = self._node_text(child, source_bytes)
                parts.append(raw.strip("\"'"))
            elif t in ("scoped_identifier", "qualified_name", "identifier", "type_identifier",
                        "simple_identifier", "dotted_identifier", "qualified_identifier"):
                raw = self._node_text(child, source_bytes)
                if raw:
                    parts.append(raw)
            elif t == "asterisk":
                has_star = True
        if parts:
            path = ".".join(parts) if not parts[0].startswith(('"', "'")) else parts[0]
            if has_star:
                path += ".*"
            if path not in analysis.imports:
                analysis._add_dep(path)

    # ── Helper: Rust / PHP use extraction ──────────────────────────────

    def _extract_use_clauses(self, stmt_node, source_bytes: bytes, analysis: FileAnalysis):
        """Walk use_declaration children extracting scoped_identifier paths.
        Handles aliased (use X as Y), nested (use X::{A, B}), and PHP use stmts."""
        def walk_uses(node):
            if node.type in ("scoped_identifier", "namespace_name", "name",
                             "namespace_use_clause"):
                raw = self._node_text(node, source_bytes)
                if raw and raw not in analysis.imports:
                    analysis._add_dep(raw)
            for child in node.children:
                walk_uses(child)
        walk_uses(stmt_node)

    # ── Helper: C / C++ preproc_include extraction ────────────────────

    def _extract_c_include(self, stmt_node, source_bytes: bytes, analysis: FileAnalysis):
        """Extract #include path (string_literal or system_lib_string) from
        a preproc_include node."""
        for child in stmt_node.children:
            if child.type in ("string_literal", "system_lib_string"):
                raw = self._node_text(child, source_bytes)
                if raw:
                    analysis._add_dep(raw.strip("\"'<>"))

    # ── Helper: C# using directive extraction ─────────────────────────

    def _extract_csharp_using(self, stmt_node, source_bytes: bytes, analysis: FileAnalysis):
        """Extract the namespace from a C# using directive."""
        # using X.Y.Z;  → the identifier part, not the keywords
        for child in stmt_node.children:
            if child.type in ("identifier", "qualified_name",
                               "global_keyword", "name"):
                raw = self._node_text(child, source_bytes)
                if raw:
                    analysis._add_dep(raw)

    # ── Helper: Ruby require extraction ──────────────────────────────

    def _extract_ruby_requires(self, root, source_bytes: bytes, analysis: FileAnalysis):
        """Detect `require`, `require_relative`, `load`, `autoload` calls."""
        visited = set()

        def walk(node):
            if id(node) in visited:
                return
            visited.add(id(node))
            if node.type == "call":
                method_node = node.child_by_field_name("method")
                args_node = node.child_by_field_name("arguments")
                if method_node and args_node:
                    method = self._node_text(method_node, source_bytes)
                    if method in ("require", "require_relative", "load", "autoload"):
                        for arg in args_node.children:
                            if arg.type == "string":
                                raw = self._node_text(arg, source_bytes)
                                if raw:
                                    analysis._add_dep(raw.strip("\"'"))
            for child in node.children:
                walk(child)

        walk(root)

    # ── Helper: Bash source detection ─────────────────────────────────

    def _extract_bash_sources(self, root, source_bytes: bytes, analysis: FileAnalysis):
        """Detect `source file.sh` and `. file.sh` commands."""
        visited = set()

        def walk(node):
            if id(node) in visited:
                return
            visited.add(id(node))
            if node.type == "command":
                name_node = node.child_by_field_name("name")
                if name_node:
                    cmd = self._node_text(name_node, source_bytes)
                    if cmd in ("source", "."):
                        for arg in node.children:
                            if arg.type == "word":
                                raw = self._node_text(arg, source_bytes)
                                if raw and raw not in analysis.imports:
                                    analysis._add_dep(raw)
            for child in node.children:
                walk(child)

        walk(root)

    # ── Helper: Go import extraction ─────────────────────────────────────

    def _extract_go_imports(self, stmt_node, source_bytes: bytes, analysis: FileAnalysis):
        """Walk import_declaration children and extract package paths."""
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

    # ── Helper: named re-exports `export { foo }` ────────────────────

    def _extract_named_re_exports(self, root, source_bytes: bytes, analysis: FileAnalysis):
        """Extract names from `export { foo, bar }` statements."""
        visited = set()

        def walk(node):
            if id(node) in visited:
                return
            visited.add(id(node))
            if node.type == "export_statement":
                for child in node.children:
                    if child.type == "export_clause":
                        for spec in child.children:
                            if spec.type == "export_specifier":
                                alias_node = spec.child_by_field_name("alias")
                                if alias_node:
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

    # ── Helper: resolve AST names (Python) ──────────────────────────

    @staticmethod
    def _get_name(node) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{ParserService._get_name(node.value)}.{node.attr}"
        elif isinstance(node, ast.Call):
            return ParserService._get_name(node.func)
        return ""

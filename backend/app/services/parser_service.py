import os
import ast
import re
from typing import Dict, Any, List
from pathlib import Path


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
            ".py": "python", ".js": "javascript", ".jsx": "javascript",
            ".ts": "typescript", ".tsx": "typescript",
            ".go": "go", ".rs": "rust", ".java": "java",
        }
        return mapping.get(ext, "unknown")

    def to_dict(self) -> Dict:
        return {
            "path": self.path, "language": self.language,
            "classes": self.classes, "functions": self.functions,
            "imports": self.imports, "exports": self.exports,
            "dependencies": self.dependencies,
        }


class ParserService:
    SUPPORTED_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java"}
    IGNORE_DIRS = {"node_modules", "__pycache__", ".git", "venv", "dist", "build", ".next", "vendor", ".tox", "target", "egg-info", ".eggs"}

    async def parse_directory(self, repo_path: str) -> Dict[str, Any]:
        entities = {"files": [], "classes": [], "functions": [], "imports": [], "exports": [], "module_map": {}}
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
                    entities["files"].append(analysis.to_dict())
                    entities["classes"].extend(
                        {"name": c["name"], "file": fpath, "language": analysis.language}
                        for c in analysis.classes
                    )
                    entities["functions"].extend(
                        {"name": f["name"], "file": fpath, "language": analysis.language}
                        for f in analysis.functions
                    )
                    entities["imports"].extend(
                        {"module": imp, "file": fpath, "language": analysis.language}
                        for imp in analysis.imports
                    )
                    entities["exports"].extend(
                        {"name": exp, "file": fpath, "language": analysis.language}
                        for exp in analysis.exports
                    )
                    rel = Path(fpath).relative_to(repo_path)
                    stem = rel.stem
                    module_map[stem] = fpath
                    module_map[str(rel).replace("\\", "/")] = fpath
                except Exception:
                    pass

        entities["module_map"] = module_map
        return entities

    async def _parse_file(self, file_path: str) -> FileAnalysis:
        analysis = FileAnalysis(file_path)
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        parsers = {
            "python": self._parse_python,
            "javascript": self._parse_js_ts,
            "typescript": self._parse_js_ts,
            "go": self._parse_go,
            "rust": self._parse_rust,
            "java": self._parse_java,
        }
        parser = parsers.get(analysis.language)
        if parser:
            parser(content, analysis)
        return analysis

    def _parse_python(self, content: str, analysis: FileAnalysis):
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return

        class_stack = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                methods = [n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
                bases = [self._get_name(b) for b in node.bases]
                analysis.classes.append({
                    "name": node.name, "methods": methods, "bases": bases, "lineno": node.lineno,
                })
                class_stack.append(node.name)

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                in_class = any(
                    isinstance(parent, ast.ClassDef)
                    for parent in ast.walk(tree)
                    if isinstance(parent, ast.ClassDef) and node in list(ast.iter_child_nodes(parent))
                )
                if not in_class:
                    decorators = [self._get_name(d) for d in node.decorator_list]
                    args = [a.arg for a in node.args.args]
                    analysis.functions.append({
                        "name": node.name, "args": args, "decorators": decorators, "lineno": node.lineno,
                    })

            elif isinstance(node, ast.Import):
                for alias in node.names:
                    analysis.imports.append(alias.name)
                    top = alias.name.split(".")[0]
                    if top not in analysis.dependencies:
                        analysis.dependencies.append(top)

            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for alias in node.names:
                    full = f"{module}.{alias.name}" if module else alias.name
                    analysis.imports.append(full)
                    if module:
                        top = module.split(".")[0]
                        if top not in analysis.dependencies:
                            analysis.dependencies.append(top)

    def _parse_js_ts(self, content: str, analysis: FileAnalysis):
        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped or stripped.startswith("//") or stripped.startswith("/*"):
                continue

            m = re.match(r'^(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:,\s*\w+)?)\s+from\s+[\'"]([^\'"]+)[\'"]', stripped)
            if m:
                mod = m.group(1)
                analysis.imports.append(mod)
                top = mod.split("/")[0]
                if top not in analysis.dependencies:
                    analysis.dependencies.append(top)
                continue

            m = re.match(r'^(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)', stripped)
            if m:
                mod = m.group(1)
                analysis.imports.append(mod)
                top = mod.split("/")[0]
                if top not in analysis.dependencies:
                    analysis.dependencies.append(top)
                continue

            m = re.match(r'^(?:export\s+)?(?:default\s+)?(?:function|class)\s+(\w+)', stripped)
            if m:
                analysis.exports.append(m.group(1))
                analysis.functions.append({"name": m.group(1), "args": [], "lineno": 0})
                continue

            m = re.match(r'^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)', stripped)
            if m:
                analysis.classes.append({"name": m.group(1), "methods": [], "lineno": 0})
                continue

            m = re.match(r'^(?:export\s+)?(?:async\s+)?function\s+(\w+)', stripped)
            if m:
                analysis.functions.append({"name": m.group(1), "args": [], "lineno": 0})
                continue

            m = re.match(r'^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(', stripped)
            if m:
                analysis.functions.append({"name": m.group(1), "args": [], "lineno": 0})
                continue

    def _parse_go(self, content: str, analysis: FileAnalysis):
        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue

            m = re.match(r'^import\s+[\'"]([^\'"]+)[\'"]', stripped)
            if m:
                mod = m.group(1)
                analysis.imports.append(mod)
                top = mod.split("/")[0]
                if top not in analysis.dependencies:
                    analysis.dependencies.append(top)
                continue

            m = re.match(r'^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(', stripped)
            if m:
                analysis.functions.append({"name": m.group(1), "args": [], "lineno": 0})
                continue

            m = re.match(r'^type\s+(\w+)\s+(?:struct|interface)\s*\{?', stripped)
            if m:
                analysis.classes.append({"name": m.group(1), "methods": [], "lineno": 0})
                continue

    def _parse_rust(self, content: str, analysis: FileAnalysis):
        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue

            m = re.match(r'^use\s+([a-zA-Z0-9_:]+)', stripped)
            if m:
                mod = m.group(1)
                analysis.imports.append(mod)
                top = mod.split("::")[0]
                if top not in analysis.dependencies:
                    analysis.dependencies.append(top)
                continue

            m = re.match(r'^(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)', stripped)
            if m:
                analysis.functions.append({"name": m.group(1), "args": [], "lineno": 0})
                continue

            m = re.match(r'^(?:pub\s+)?struct\s+(\w+)', stripped)
            if m:
                analysis.classes.append({"name": m.group(1), "methods": [], "lineno": 0})
                continue

            m = re.match(r'^(?:pub\s+)?trait\s+(\w+)', stripped)
            if m:
                analysis.classes.append({"name": m.group(1), "methods": [], "lineno": 0})
                continue

    def _parse_java(self, content: str, analysis: FileAnalysis):
        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue

            m = re.match(r'^import\s+([a-zA-Z0-9_.*]+);', stripped)
            if m:
                mod = m.group(1)
                analysis.imports.append(mod)
                top = mod.split(".")[0]
                if top not in analysis.dependencies:
                    analysis.dependencies.append(top)
                continue

            m = re.match(r'^(?:public|private|protected)?\s*(?:abstract\s+)?(?:class|interface)\s+(\w+)', stripped)
            if m:
                analysis.classes.append({"name": m.group(1), "methods": [], "lineno": 0})
                continue

            m = re.match(r'^(?:public|private|protected|static|final|\s)*\s+(?:<[^>]*>\s+)?(\w+)\s+(\w+)\s*\(', stripped)
            if m and m.group(1) not in ("if", "while", "for", "switch", "catch", "return", "new", "instanceof", "throws"):
                analysis.functions.append({"name": m.group(2), "args": [], "lineno": 0})
                continue

    def _get_name(self, node) -> str:
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._get_name(node.value)}.{node.attr}"
        elif isinstance(node, ast.Call):
            return self._get_name(node.func)
        return ""

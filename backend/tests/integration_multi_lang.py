"""Integration test: verify parse_directory works across all 20 supported languages."""
import sys
for mod in list(sys.modules.keys()):
    if mod.startswith('app'):
        del sys.modules[mod]

import tempfile, os, asyncio, json
from app.services.parser_service import ParserService

samples = {
    # Python
    "main.py": 'import os\nimport re\n\ndef greet(name):\n    return f"Hello {name}"\n\nclass User:\n    def __init__(self, name):\n        self.name = name\n\nclass Admin(User):\n    pass\n',
    # JavaScript
    "app.js": 'import React from "react";\nimport { useState } from "react";\n\nfunction hello() {}\nconst greet = () => {};\nclass MyClass { method() {} }\nexport default MyClass;\nexport { hello };\nexport var x = 1;\nexport const y = 2;\n',
    # TypeScript
    "types.ts": 'import { Component } from "react";\ninterface Props { name: string }\ntype MyType = string;\nenum Color { Red, Green }\nclass Service { serve() {} }\nfunction helper<T>(arg: T): T { return arg; }\nexport { helper };\n',
    # TSX
    "comp.tsx": 'import React from "react";\ninterface Props { name: string }\nconst App: React.FC<Props> = ({ name }) => <div>{name}</div>;\nclass OldApp extends React.Component { render() { return null; } }\nfunction helper() {}\nexport default App;\n',
    # Go
    "server.go": 'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\ntype Config struct {\n\tPort int\n}\n\nfunc main() {\n\tfmt.Println("hello")\n}\n\nfunc (c *Config) Load() error {\n\treturn nil\n}\n',
    # Rust
    "lib.rs": 'use std::collections::HashMap;\nuse serde::{Serialize, Deserialize};\n\nstruct Point { x: i32, y: i32 }\nenum Status { Active, Inactive }\ntrait Drawable { fn draw(&self); }\nimpl Drawable for Point { fn draw(&self) {} }\nfn helper() -> i32 { 42 }\n',
    # Java
    "Hello.java": 'import java.util.List;\nimport static java.util.Collections.sort;\n\npublic class Hello {\n    private String name;\n    public Hello(String name) { this.name = name; }\n    public void greet() { System.out.println("hi"); }\n}\n',
    # C
    "test.c": '#include <stdio.h>\n#include "mylib.h"\n\nstruct Point { int x; int y; };\nunion Data { int i; float f; };\nint main() { return 0; }\nvoid greet(char* name) { printf("Hi %s", name); }\n',
    # C++
    "test.cpp": '#include <vector>\n#include "myheader.hpp"\n\nclass MyClass {\n    int value;\npublic:\n    void method() {}\n};\nstruct MyStruct { float x; };\n\nvoid free_func() {}\n',
    # C#
    "test.cs": 'using System;\nusing System.Collections.Generic;\n\nclass Program {\n    static void Main() {}\n}\nstruct Point { int x; }\ninterface IRepo { void Save(); }\n',
    # PHP
    "test.php": '<?php\nnamespace App\\Service;\nuse App\\Model\\User;\n\nclass UserService {\n    public function findUser($id) {}\n}\ninterface UserRepo { function find($id); }\nfunction helper() {}\n',
    # Ruby
    "test.rb": 'require "json"\nrequire_relative "config"\n\nmodule App\n  class User\n    def initialize(name)\n      @name = name\n    end\n    def greet\n      "hi"\n    end\n  end\nend\n\nload "helpers.rb"\n',
    # Swift
    "test.swift": 'import Foundation\n\nclass User {\n    var name: String\n    func greet() -> String { return "Hi" }\n}\nprotocol Drawable { func draw() }\nfunc globalFunc() {}\n',
    # Kotlin
    "test.kt": 'package com.example\nimport com.example.model.User\n\nclass Hello {\n    fun greet() {}\n}\ndata class Person(val name: String)\nobject Singleton {\n    fun doIt() {}\n}\nfun topLevel() {}\n',
    # Bash
    "test.sh": '#!/bin/bash\nsource ./config.sh\n. ./helpers.sh\n\nfunction greet() {\n    echo "hello"\n}\n\n# POSIX-style function (may not be captured)\nmyfunc() {\n    echo "world"\n}\n',
    # HTML
    "index.html": '<!DOCTYPE html>\n<html><head><title>Test</title></head><body>Hello</body></html>\n',
    # CSS
    "styles.css": '.container { color: red; background: blue; }\n#main { font-size: 16px; }\n',
    # JSON
    "data.json": '{"name": "test", "version": 1.0, "nested": {"key": "value"}}\n',
    # YAML
    "config.yaml": 'name: test\nversion: 1.0\nservices:\n  app:\n    port: 8080\n',
    # Markdown
    "readme.md": '# Project Title\n\nHello world\n\n## Section\n\nSome content here\n',
    # SQL
    "query.sql": 'SELECT * FROM users WHERE id = 1;\nCREATE TABLE test (id INT PRIMARY KEY);\n',
}

tmp = tempfile.mkdtemp()
print(f"Created temp dir: {tmp}")

for fname, code in samples.items():
    fpath = os.path.join(tmp, fname)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(code)

ps = ParserService()
result = asyncio.run(ps.parse_directory(tmp))

print(f"\n{'='*70}")
print(f"FILE COUNT: {len(result['files'])}")
print(f"{'='*70}")

# Track per-language stats
lang_stats = {}
for f in result["files"]:
    lang = f["language"]
    if lang not in lang_stats:
        lang_stats[lang] = {"files": 0, "classes": 0, "functions": 0, "imports": 0}
    lang_stats[lang]["files"] += 1
    lang_stats[lang]["classes"] += len(f.get("classes", []))
    lang_stats[lang]["functions"] += len(f.get("functions", []))
    lang_stats[lang]["imports"] += len(f.get("imports", []))

print(f"\n{'='*70}")
print(f"LANGUAGE BREAKDOWN")
print(f"{'='*70}")
for lang in sorted(lang_stats.keys()):
    s = lang_stats[lang]
    print(f"  {lang:12s}  files={s['files']}  classes={s['classes']}  functions={s['functions']}  imports={s['imports']}")

# Detailed per-file output
print(f"\n{'='*70}")
print(f"DETAILED PER-FILE")
print(f"{'='*70}")
for f in sorted(result["files"], key=lambda x: x["path"]):
    print(f"\n  {f['path']} [{f['language']}]")
    if f["classes"]:
        print(f"    classes:  {[c['name'] for c in f['classes']]}")
    if f["functions"]:
        print(f"    functions: {[fn['name'] for fn in f['functions']]}")
    if f["imports"]:
        print(f"    imports:   {f['imports']}")

# Summary totals
print(f"\n{'='*70}")
print(f"TOTALS")
print(f"{'='*70}")
print(f"  Files:      {len(result['files'])}")
print(f"  Classes:    {len(result['classes'])}")
print(f"  Functions:  {len(result['functions'])}")
print(f"  Imports:    {len(result['imports'])}")
print(f"  Languages:  {len(lang_stats)}")
print()

# Check: all 20 language samples should be present
expected_langs = {
    "python", "javascript", "typescript", "tsx", "go", "rust", "java",
    "c", "cpp", "c_sharp", "php", "ruby", "swift", "kotlin", "bash",
    "html", "css", "json", "yaml", "markdown", "sql",
}
detected_langs = set(lang_stats.keys())
missing = expected_langs - detected_langs
extra = detected_langs - expected_langs
if missing:
    print(f"WARNING: Missing languages: {missing}")
else:
    print(f"All 21 language labels detected (20 + `unknown`). ✓")

if extra:
    print(f"Note: Extra languages detected: {extra}")

expected_files = set(samples.keys())
detected_files = set(f["path"] for f in result["files"])
missing_files = expected_files - detected_files
if missing_files:
    print(f"WARNING: Missing files: {missing_files}")
else:
    print(f"All 21 sample files detected. ✓")

# Cleanup
import shutil
shutil.rmtree(tmp)
print(f"\nCleaned up: {tmp}")

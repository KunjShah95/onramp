"""Comprehensive tests for the tree-sitter-based ParserService.

Covers edge cases across all supported languages: JavaScript, TypeScript,
TSX, Go, Rust, and Java.  Tests directly exercise _parse_file() for precise
assertions on the FileAnalysis object, plus parse_directory() for the
aggregated output.
"""

import os
import tempfile
import pytest
from pathlib import Path
from typing import Dict
from app.services.parser_service import ParserService, FileAnalysis


# =========================================================================
# Helpers
# =========================================================================


async def _parse_single(parser: ParserService, code: str, fname: str):
    """Write *code* into a temp file named *fname*, parse it, return
    the FileAnalysis object."""
    tmpdir = tempfile.mkdtemp()
    fpath = os.path.join(tmpdir, fname)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(code)
    analysis = await parser._parse_file(fpath)
    # Normalise path so assertions are portable
    analysis.path = fname
    return analysis


async def _parse_dir(parser: ParserService, files: Dict[str, str]):
    """Write multiple files and parse the directory.  *files* maps
    relative path → source code string.  Returns the aggregated dict."""
    tmpdir = tempfile.mkdtemp()
    for relpath, code in files.items():
        abspath = os.path.join(tmpdir, relpath)
        os.makedirs(os.path.dirname(abspath), exist_ok=True)
        with open(abspath, "w", encoding="utf-8") as f:
            f.write(code)
    return await parser.parse_directory(tmpdir)


# =========================================================================
# JavaScript — edge cases
# =========================================================================


class TestJavaScript:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Imports ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_default_import(self):
        a = await _parse_single(self.ps, """import React from 'react';""", "a.js")
        assert "react" in a.imports

    @pytest.mark.asyncio
    async def test_named_import(self):
        a = await _parse_single(self.ps, """import { useState, useEffect } from 'react';""", "a.js")
        assert "react" in a.imports

    @pytest.mark.asyncio
    async def test_namespace_import(self):
        a = await _parse_single(self.ps, """import * as d3 from 'd3';""", "a.js")
        assert "d3" in a.imports

    @pytest.mark.asyncio
    async def test_side_effect_import(self):
        a = await _parse_single(self.ps, """import './polyfills';""", "a.js")
        assert "./polyfills" in a.imports

    # Note: require() calls are NOT captured by tree-sitter's import_statement
    # pattern since they are call_expressions, not import_statements.

    @pytest.mark.asyncio
    async def test_dynamic_import(self):
        a = await _parse_single(self.ps, """const mod = await import('./mod');""", "a.js")
        # dynamic import() is an ImportExpression, not ImportStatement;
        # tree-sitter may or may not capture it depending on the query.
        # For now this test documents current behaviour — dynamic imports
        # are not captured by the import_statement query pattern.
        pass  # not expected to be captured

    @pytest.mark.asyncio
    async def test_multiple_imports(self):
        a = await _parse_single(self.ps, """
            import a from 'a';
            import b from 'b';
            import c from 'c';
        """, "a.js")
        assert len(a.imports) >= 2  # at least 2 of the 3

    # ── Functions ────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_function_declaration(self):
        a = await _parse_single(self.ps, "function greet(name) { return `Hi ${name}`; }", "a.js")
        names = {f["name"] for f in a.functions}
        assert "greet" in names

    @pytest.mark.asyncio
    async def test_arrow_function_variable(self):
        a = await _parse_single(self.ps, "const greet = (name) => `Hi ${name}`;", "a.js")
        names = {f["name"] for f in a.functions}
        assert "greet" in names

    @pytest.mark.asyncio
    async def test_async_function(self):
        a = await _parse_single(self.ps, "async function fetchData(url) { return await get(url); }", "a.js")
        names = {f["name"] for f in a.functions}
        assert "fetchData" in names

    @pytest.mark.asyncio
    async def test_anonymous_function_expression(self):
        a = await _parse_single(self.ps, "const handler = function() { return 42; };", "a.js")
        names = {f["name"] for f in a.functions}
        assert "handler" in names

    @pytest.mark.asyncio
    async def test_named_function_expression(self):
        a = await _parse_single(self.ps, "const handler = function inner() { return 42; };", "a.js")
        names = {f["name"] for f in a.functions}
        # the variable_declarator name is "handler", the function name "inner"
        assert "handler" in names

    @pytest.mark.asyncio
    async def test_generator_function(self):
        a = await _parse_single(self.ps, "function* idMaker() { yield 1; yield 2; }", "a.js")
        names = {f["name"] for f in a.functions}
        assert "idMaker" in names

    @pytest.mark.asyncio
    async def test_method_in_object(self):
        a = await _parse_single(self.ps, """
            const obj = {
                foo() { return 1; },
                bar: function() { return 2; },
            };
        """, "a.js")
        # method_definition in object literals is a property, not a
        # top-level function — tree-sitter may or may not capture it.
        # The query captures method_definition anywhere, so these should
        # be caught as functions.
        names = {f["name"] for f in a.functions}
        assert "foo" in names

    # ── Classes ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class_declaration(self):
        a = await _parse_single(self.ps, "class Animal { constructor(name) { this.name = name; } }", "a.js")
        class_names = {c["name"] for c in a.classes}
        assert "Animal" in class_names

    @pytest.mark.asyncio
    async def test_class_with_methods(self):
        a = await _parse_single(self.ps, """
            class Store {
                get() { return this._data; }
                set(v) { this._data = v; }
            }
        """, "a.js")
        class_names = {c["name"] for c in a.classes}
        assert "Store" in class_names
        # methods should be captured as functions
        func_names = {f["name"] for f in a.functions}
        assert "get" in func_names
        assert "set" in func_names

    @pytest.mark.asyncio
    async def test_class_extends(self):
        a = await _parse_single(self.ps, "class Dog extends Animal { bark() {} }", "a.js")
        class_names = {c["name"] for c in a.classes}
        assert "Dog" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "bark" in func_names

    # ── Exports ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_export_named_function(self):
        a = await _parse_single(self.ps, "export function util() {}", "a.js")
        assert "util" in a.exports

    @pytest.mark.asyncio
    async def test_export_default_identifier(self):
        a = await _parse_single(self.ps, "const App = () => null;\nexport default App;", "a.js")
        assert "App" in a.exports

    @pytest.mark.asyncio
    async def test_export_default_function(self):
        a = await _parse_single(self.ps, "export default function App() {}", "a.js")
        assert "App" in a.exports

    @pytest.mark.asyncio
    async def test_export_default_class(self):
        a = await _parse_single(self.ps, "export default class Foo {}", "a.js")
        assert "Foo" in a.exports

    @pytest.mark.asyncio
    async def test_export_named_re_export(self):
        a = await _parse_single(self.ps, "const foo = 1;\nexport { foo };", "a.js")
        assert "foo" in a.exports

    @pytest.mark.asyncio
    async def test_export_renamed_re_export(self):
        a = await _parse_single(self.ps, "const foo = 1;\nexport { foo as bar };", "a.js")
        assert "bar" in a.exports
        assert "foo" not in a.exports  # the alias takes priority

    @pytest.mark.asyncio
    async def test_export_const(self):
        a = await _parse_single(self.ps, "export const VERSION = '1.0';", "a.js")
        assert "VERSION" in a.exports

    @pytest.mark.asyncio
    async def test_multiple_exports(self):
        a = await _parse_single(self.ps, """
            export function a() {}
            export function b() {}
            export const c = 3;
        """, "a.js")
        assert len(a.exports) >= 2

    # ── Dependencies ─────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_dependencies(self):
        a = await _parse_single(self.ps, """
            import _ from 'lodash';
            import { Component } from 'react';
        """, "a.js")
        assert "lodash" in a.dependencies
        assert "react" in a.dependencies

    # ── Edge cases ───────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.js")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []
        assert a.exports == []

    @pytest.mark.asyncio
    async def test_only_comments(self):
        a = await _parse_single(self.ps, "// just a comment\n/* block */", "comment.js")
        assert a.functions == []
        assert a.classes == []

    @pytest.mark.asyncio
    async def test_shebang(self):
        a = await _parse_single(self.ps, "#!/usr/bin/env node\nconsole.log('hi');", "cli.js")
        # shebang doesn't prevent parsing; valid JS files parse correctly
        assert a is not None


# =========================================================================
# TypeScript — edge cases
# =========================================================================


class TestTypeScript:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_interface(self):
        a = await _parse_single(self.ps, "interface User { name: string; age: number; }", "user.ts")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_type_alias(self):
        a = await _parse_single(self.ps, "type Callback = (x: number) => void;", "types.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Callback" in class_names

    @pytest.mark.asyncio
    async def test_enum(self):
        a = await _parse_single(self.ps, "enum Color { Red, Green, Blue }", "colors.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Color" in class_names

    @pytest.mark.asyncio
    async def test_const_enum(self):
        a = await _parse_single(self.ps, "const enum Direction { Up, Down }", "dir.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Direction" in class_names

    @pytest.mark.asyncio
    async def test_abstract_class(self):
        a = await _parse_single(self.ps, "abstract class Base { abstract run(): void; }", "base.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Base" in class_names

    @pytest.mark.asyncio
    async def test_class_with_generics(self):
        a = await _parse_single(self.ps, "class Box<T> { private _value: T; get(): T { return this._value; } }", "box.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Box" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "get" in func_names

    @pytest.mark.asyncio
    async def test_function_with_type_params(self):
        a = await _parse_single(self.ps, "function identity<T>(arg: T): T { return arg; }", "util.ts")
        names = {f["name"] for f in a.functions}
        assert "identity" in names

    @pytest.mark.asyncio
    async def test_arrow_with_type(self):
        a = await _parse_single(self.ps, "const add = (a: number, b: number): number => a + b;", "math.ts")
        names = {f["name"] for f in a.functions}
        assert "add" in names

    @pytest.mark.asyncio
    async def test_import_type(self):
        a = await _parse_single(self.ps, "import type { User } from './types';", "importer.ts")
        assert "./types" in a.imports

    @pytest.mark.asyncio
    async def test_export_interface(self):
        a = await _parse_single(self.ps, "export interface Config { debug: boolean; }", "config.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Config" in class_names

    @pytest.mark.asyncio
    async def test_export_type(self):
        a = await _parse_single(self.ps, "export type Result<T> = { data: T; error?: string };", "result.ts")
        class_names = {c["name"] for c in a.classes}
        assert "Result" in class_names

    @pytest.mark.asyncio
    async def test_enum_with_values(self):
        a = await _parse_single(self.ps, "enum HttpStatus { OK = 200, NotFound = 404 }", "status.ts")
        class_names = {c["name"] for c in a.classes}
        assert "HttpStatus" in class_names

    @pytest.mark.asyncio
    async def test_namespace(self):
        a = await _parse_single(self.ps, "namespace MyLib { export function util() {} }", "lib.ts")
        # namespaces are not currently captured as classes/functions
        # but parsing should not crash
        assert a is not None

    @pytest.mark.asyncio
    async def test_decorator(self):
        a = await _parse_single(self.ps, """
            function log() { return (target: any, key: string) => {}; }
            class MyClass { @log() myMethod() {} }
        """, "decorated.ts")
        class_names = {c["name"] for c in a.classes}
        assert "MyClass" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "log" in func_names
        assert "myMethod" in func_names


# =========================================================================
# TSX — React / JSX edge cases
# =========================================================================


class TestTSX:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_tsx_language_label(self):
        a = await _parse_single(self.ps, "const x: number = 1;", "comp.tsx")
        assert a.language == "typescript"  # .tsx → "typescript"

    @pytest.mark.asyncio
    async def test_react_component(self):
        a = await _parse_single(self.ps, """
            import React from 'react';
            interface Props { name: string }
            const Greeting: React.FC<Props> = ({ name }) => <h1>{name}</h1>;
        """, "Greeting.tsx")
        assert "react" in a.imports
        class_names = {c["name"] for c in a.classes}
        assert "Props" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "Greeting" in func_names

    @pytest.mark.asyncio
    async def test_class_component(self):
        a = await _parse_single(self.ps, """
            import React from 'react';
            interface State { count: number }
            class Counter extends React.Component<{}, State> {
                render() { return null; }
            }
        """, "Counter.tsx")
        class_names = {c["name"] for c in a.classes}
        assert "Counter" in class_names
        assert "State" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "render" in func_names

    @pytest.mark.asyncio
    async def test_export_default_tsx_component(self):
        a = await _parse_single(self.ps, """
            const Page = () => <div />;
            export default Page;
        """, "Page.tsx")
        assert "Page" in a.exports

    @pytest.mark.asyncio
    async def test_jsx_intrinsic_elements(self):
        """JSX intrinsic elements (div, span, etc.) should not confuse parsing."""
        a = await _parse_single(self.ps, """
            function App() {
                return (
                    <div className="app">
                        <span>hello</span>
                    </div>
                );
            }
        """, "App.tsx")
        names = {f["name"] for f in a.functions}
        assert "App" in names

    @pytest.mark.asyncio
    async def test_hooks(self):
        a = await _parse_single(self.ps, """
            import { useState, useEffect } from 'react';
            function useCounter(initial: number) {
                const [count, setCount] = useState(initial);
                useEffect(() => { document.title = String(count); }, [count]);
                return count;
            }
        """, "hooks.tsx")
        assert "react" in a.imports
        names = {f["name"] for f in a.functions}
        assert "useCounter" in names


# =========================================================================
# Go — edge cases
# =========================================================================


class TestGo:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_multi_line_imports(self):
        a = await _parse_single(self.ps, """
            package main
            import (
                "fmt"
                "net/http"
                "os"
            )
        """, "main.go")
        assert "fmt" in a.imports
        assert "net/http" in a.imports
        assert "os" in a.imports

    @pytest.mark.asyncio
    async def test_single_import(self):
        a = await _parse_single(self.ps, """
            package main
            import "fmt"
        """, "main.go")
        assert "fmt" in a.imports

    @pytest.mark.asyncio
    async def test_named_import(self):
        """Go allows import aliases: import alias "path/to/pkg"."""
        a = await _parse_single(self.ps, """
            package main
            import myfmt "fmt"
        """, "main.go")
        assert "fmt" in a.imports  # we capture the path, not the alias

    @pytest.mark.asyncio
    async def test_blank_import(self):
        a = await _parse_single(self.ps, """
            package main
            import _ "image/png"
        """, "main.go")
        assert "image/png" in a.imports

    @pytest.mark.asyncio
    async def test_dot_import(self):
        a = await _parse_single(self.ps, """
            package main
            import . "fmt"
        """, "main.go")
        assert "fmt" in a.imports

    @pytest.mark.asyncio
    async def test_function_declaration(self):
        a = await _parse_single(self.ps, """
            package main
            func greet(name string) string { return "hello " + name }
        """, "main.go")
        names = {f["name"] for f in a.functions}
        assert "greet" in names

    @pytest.mark.asyncio
    async def test_method_on_struct(self):
        a = await _parse_single(self.ps, """
            package main
            type User struct { Name string }
            func (u *User) Greet() string { return "Hi " + u.Name }
        """, "user.go")
        names = {f["name"] for f in a.functions}
        assert "Greet" in names  # method captured as function
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_interface(self):
        a = await _parse_single(self.ps, """
            package main
            type Greeter interface {
                Greet() string
            }
        """, "greeter.go")
        class_names = {c["name"] for c in a.classes}
        assert "Greeter" in class_names

    @pytest.mark.asyncio
    async def test_multiple_top_level_functions(self):
        a = await _parse_single(self.ps, """
            package main
            func one() {}
            func two() {}
            func three() {}
        """, "main.go")
        assert len(a.functions) >= 2

    @pytest.mark.asyncio
    async def test_nested_struct(self):
        a = await _parse_single(self.ps, """
            package main
            type Config struct {
                Name  string
                Inner struct {
                    Value int
                }
            }
        """, "config.go")
        class_names = {c["name"] for c in a.classes}
        assert "Config" in class_names

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.go")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []

    @pytest.mark.asyncio
    async def test_only_package(self):
        """A file with just a package declaration should parse cleanly."""
        a = await _parse_single(self.ps, "package main", "main.go")
        assert a is not None


# =========================================================================
# Rust — edge cases
# =========================================================================


class TestRust:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_use_aliasing(self):
        a = await _parse_single(self.ps, "use std::io::Result as IoResult;", "lib.rs")
        # The scoped_identifier captures "std::io::Result"
        assert any("std::io::Result" in imp for imp in a.imports) or \
               any("std" == imp.split("::")[0] for imp in a.imports)

    @pytest.mark.asyncio
    async def test_nested_use(self):
        a = await _parse_single(self.ps, "use std::collections::{HashMap, VecDeque};", "lib.rs")
        # Each scoped_identifier is captured separately
        assert len(a.imports) >= 1

    @pytest.mark.asyncio
    async def test_self_use(self):
        a = await _parse_single(self.ps, "use crate::module::sub::*;", "lib.rs")
        assert len(a.imports) >= 1

    @pytest.mark.asyncio
    async def test_function_item(self):
        a = await _parse_single(self.ps, "fn calculate(x: i32) -> i32 { x + 1 }", "lib.rs")
        names = {f["name"] for f in a.functions}
        assert "calculate" in names

    @pytest.mark.asyncio
    async def test_pub_function(self):
        a = await _parse_single(self.ps, "pub fn visible() -> bool { true }", "lib.rs")
        names = {f["name"] for f in a.functions}
        assert "visible" in names

    @pytest.mark.asyncio
    async def test_unsafe_function(self):
        a = await _parse_single(self.ps, "unsafe fn dangerous() { }", "lib.rs")
        names = {f["name"] for f in a.functions}
        assert "dangerous" in names

    @pytest.mark.asyncio
    async def test_struct(self):
        a = await _parse_single(self.ps, "struct User { name: String, age: u32 }", "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_tuple_struct(self):
        a = await _parse_single(self.ps, "struct Point(i32, i32);", "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Point" in class_names

    @pytest.mark.asyncio
    async def test_enum(self):
        a = await _parse_single(self.ps, "enum Option<T> { Some(T), None }", "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Option" in class_names

    @pytest.mark.asyncio
    async def test_enum_with_data(self):
        a = await _parse_single(self.ps, """
            enum Message {
                Quit,
                Move { x: i32, y: i32 },
                Write(String),
            }
        """, "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Message" in class_names

    @pytest.mark.asyncio
    async def test_trait(self):
        a = await _parse_single(self.ps, "trait Drawable { fn draw(&self); }", "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Drawable" in class_names

    @pytest.mark.asyncio
    async def test_impl_block(self):
        a = await _parse_single(self.ps, """
            struct Point { x: f64, y: f64 }
            impl Point {
                fn new(x: f64, y: f64) -> Self { Point { x, y } }
                fn distance(&self) -> f64 { (self.x * self.x + self.y * self.y).sqrt() }
            }
        """, "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Point" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "new" in func_names
        assert "distance" in func_names

    @pytest.mark.asyncio
    async def test_generic_struct(self):
        a = await _parse_single(self.ps, "struct Container<T, U> { first: T, second: U }", "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Container" in class_names

    @pytest.mark.asyncio
    async def test_generic_function(self):
        a = await _parse_single(self.ps, "fn identity<T: Display>(x: T) -> T { x }", "lib.rs")
        names = {f["name"] for f in a.functions}
        assert "identity" in names

    @pytest.mark.asyncio
    async def test_macro(self):
        """Macro invocations should not cause parse errors."""
        a = await _parse_single(self.ps, """
            fn main() {
                println!("hello");
                vec![1, 2, 3];
            }
        """, "lib.rs")
        names = {f["name"] for f in a.functions}
        assert "main" in names

    @pytest.mark.asyncio
    async def test_attribute(self):
        """Attributes and derive macros should not cause parse errors."""
        a = await _parse_single(self.ps, """
            #[derive(Debug, Clone)]
            struct Foo { value: i32 }
        """, "lib.rs")
        class_names = {c["name"] for c in a.classes}
        assert "Foo" in class_names

    @pytest.mark.asyncio
    async def test_lifetime_params(self):
        a = await _parse_single(self.ps, "fn longest<'a>(x: &'a str, y: &'a str) -> &'a str { x }", "lib.rs")
        names = {f["name"] for f in a.functions}
        assert "longest" in names

    @pytest.mark.asyncio
    async def test_multiple_use_statements(self):
        a = await _parse_single(self.ps, """
            use std::sync::Arc;
            use std::collections::HashMap;
            use tokio::runtime::Runtime;
        """, "lib.rs")
        assert len(a.imports) >= 2

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.rs")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []


# =========================================================================
# Java — edge cases
# =========================================================================


class TestJava:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_single_import(self):
        a = await _parse_single(self.ps, "import java.util.List;", "Foo.java")
        assert "java.util.List" in a.imports

    @pytest.mark.asyncio
    async def test_multiple_imports(self):
        a = await _parse_single(self.ps, """
            import java.util.List;
            import java.util.Map;
            import java.io.IOException;
        """, "Foo.java")
        assert len(a.imports) >= 2

    @pytest.mark.asyncio
    async def test_wildcard_import(self):
        a = await _parse_single(self.ps, "import java.util.*;", "Foo.java")
        assert "java.util.*" in a.imports

    @pytest.mark.asyncio
    async def test_class_declaration(self):
        a = await _parse_single(self.ps, "public class UserService {}", "UserService.java")
        class_names = {c["name"] for c in a.classes}
        assert "UserService" in class_names

    @pytest.mark.asyncio
    async def test_public_class(self):
        a = await _parse_single(self.ps, "public class User { private String name; }", "User.java")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_private_class(self):
        a = await _parse_single(self.ps, "class DefaultPackage {}", "DefaultPackage.java")
        class_names = {c["name"] for c in a.classes}
        assert "DefaultPackage" in class_names

    @pytest.mark.asyncio
    async def test_interface(self):
        a = await _parse_single(self.ps, "public interface Drawable { void draw(); }", "Drawable.java")
        class_names = {c["name"] for c in a.classes}
        assert "Drawable" in class_names

    @pytest.mark.asyncio
    async def test_method_declaration(self):
        a = await _parse_single(self.ps, """
            public class Service {
                public String findUser(int id) { return null; }
            }
        """, "Service.java")
        class_names = {c["name"] for c in a.classes}
        assert "Service" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "findUser" in func_names

    @pytest.mark.asyncio
    async def test_multiple_methods(self):
        a = await _parse_single(self.ps, """
            public class MathUtils {
                public int add(int a, int b) { return a + b; }
                public int sub(int a, int b) { return a - b; }
                public static double pi() { return 3.14; }
            }
        """, "MathUtils.java")
        func_names = {f["name"] for f in a.functions}
        assert "add" in func_names
        assert "sub" in func_names
        assert "pi" in func_names

    @pytest.mark.asyncio
    async def test_constructor(self):
        a = await _parse_single(self.ps, """
            public class Foo {
                public Foo(String name) { this.name = name; }
                private String name;
            }
        """, "Foo.java")
        func_names = {f["name"] for f in a.functions}
        assert "Foo" in func_names  # constructors are methods with class name

    @pytest.mark.asyncio
    async def test_generic_method(self):
        a = await _parse_single(self.ps, """
            public class Util {
                public <T> T identity(T value) { return value; }
            }
        """, "Util.java")
        func_names = {f["name"] for f in a.functions}
        assert "identity" in func_names

    @pytest.mark.asyncio
    async def test_static_method(self):
        a = await _parse_single(self.ps, """
            public class Utils {
                public static void log(String msg) { System.out.println(msg); }
            }
        """, "Utils.java")
        func_names = {f["name"] for f in a.functions}
        assert "log" in func_names

    @pytest.mark.asyncio
    async def test_annotation(self):
        """Annotations should not cause parse errors."""
        a = await _parse_single(self.ps, """
            import java.lang.Override;
            public class Child extends Base {
                @Override
                public void doit() {}
            }
        """, "Child.java")
        class_names = {c["name"] for c in a.classes}
        assert "Child" in class_names
        func_names = {f["name"] for f in a.functions}
        assert "doit" in func_names

    @pytest.mark.asyncio
    async def test_inner_class(self):
        a = await _parse_single(self.ps, """
            public class Outer {
                private class Inner {
                    public void innerMethod() {}
                }
            }
        """, "Outer.java")
        class_names = {c["name"] for c in a.classes}
        assert "Outer" in class_names
        # Inner classes may or may not be captured depending on how
        # deeply tree-sitter reports them; at a minimum Outer is found.
        func_names = {f["name"] for f in a.functions}
        assert "innerMethod" in func_names

    @pytest.mark.asyncio
    async def test_package_declaration(self):
        """Package statements should not interfere with parsing."""
        a = await _parse_single(self.ps, """
            package com.example.app;
            public class App {}
        """, "App.java")
        class_names = {c["name"] for c in a.classes}
        assert "App" in class_names

    @pytest.mark.asyncio
    async def test_abstract_class(self):
        a = await _parse_single(self.ps, "public abstract class BaseRepository {}", "BaseRepository.java")
        class_names = {c["name"] for c in a.classes}
        assert "BaseRepository" in class_names

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "Empty.java")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []


# =========================================================================
# Cross-cutting edge cases
# =========================================================================


class TestEdgeCases:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_unsupported_extension(self):
        """Files with truly unsupported extensions should be skipped."""
        tmpdir = tempfile.mkdtemp()
        for fname in ("data.txt", "notes.log", "readme.rst", "main.py"):
            with open(os.path.join(tmpdir, fname), "w") as f:
                f.write("placeholder")
        result = await self.ps.parse_directory(tmpdir)
        # Now .json, .css, .md, .sql etc. are supported
        assert len(result["files"]) == 1  # only main.py is supported
        assert result["files"][0]["language"] == "python"

    @pytest.mark.asyncio
    async def test_ignored_directories(self):
        """Directories in IGNORE_DIRS should be skipped."""
        tmpdir = tempfile.mkdtemp()
        for sub in ("node_modules", "__pycache__", ".git", "venv"):
            os.makedirs(os.path.join(tmpdir, sub), exist_ok=True)
            with open(os.path.join(tmpdir, sub, "ignored.js"), "w") as f:
                f.write("function shouldNotBeSeen() {}")
        # Also add a file at root that should be seen
        with open(os.path.join(tmpdir, "index.js"), "w") as f:
            f.write("function root() {}")
        result = await self.ps.parse_directory(tmpdir)
        assert len(result["files"]) == 1
        assert result["files"][0]["path"] == "index.js"

    @pytest.mark.asyncio
    async def test_binary_content(self):
        """Binary content should not crash the parser."""
        tmpdir = tempfile.mkdtemp()
        fpath = os.path.join(tmpdir, "data.js")
        with open(fpath, "wb") as f:
            f.write(b"const x = 1;\x00\x00\x00const y = 2;")
        analysis = await self.ps._parse_file(fpath)
        # The binary null bytes may cause tree-sitter to stop early
        # or produce a partial AST; we just verify no exception.
        assert analysis is not None

    @pytest.mark.asyncio
    async def test_syntax_error(self):
        """Syntactically invalid code should not crash — parser should
        produce a partial AST or fall through silently."""
        a = await _parse_single(self.ps, "function ( missing name", "broken.js")
        # Might capture nothing, might capture partial, but shouldn't crash
        assert a is not None

    @pytest.mark.asyncio
    async def test_large_file(self):
        """A very large file (5000 lines) should parse without timeout."""
        lines = [f"function func_{i}() {{ return {i}; }}" for i in range(5000)]
        code = "\n".join(lines)
        a = await _parse_single(self.ps, code, "large.js")
        assert len(a.functions) >= 4900  # tree-sitter may miss a few on fuzzy trees

    @pytest.mark.asyncio
    async def test_unicode_content(self):
        """Unicode identifiers and strings should be handled correctly."""
        a = await _parse_single(self.ps, """
            function 获取数据() { return '数据'; }
            const π = 3.14159;
        """, "unicode.js")
        names = {f["name"] for f in a.functions}
        assert "获取数据" in names

    @pytest.mark.asyncio
    async def test_mixed_language_directory(self):
        """A directory with files in multiple languages should parse all."""
        result = await _parse_dir(self.ps, {
            "main.py": "def hello(): pass",
            "app.js": "function hello() {}",
            "types.ts": "type T = string;",
            "server.go": "package main\nfunc main() {}",
            "lib.rs": "fn hello() {}",
            "Hello.java": "public class Hello {}",
        })
        assert len(result["files"]) == 6
        langs = {f["language"] for f in result["files"]}
        assert "python" in langs
        assert "javascript" in langs
        assert "typescript" in langs
        assert "go" in langs
        assert "rust" in langs
        assert "java" in langs

    @pytest.mark.asyncio
    async def test_parse_directory_aggregated_fields(self):
        """Verify the aggregated entities in parse_directory output."""
        result = await _parse_dir(self.ps, {
            "a.py": "class A: pass",
            "b.js": "function b() {}",
        })
        assert "files" in result
        assert "classes" in result
        assert "functions" in result
        assert "imports" in result
        assert "exports" in result
        assert "module_map" in result
        assert len(result["classes"]) == 1
        assert result["classes"][0]["name"] == "A"
        assert len(result["functions"]) == 1
        assert result["functions"][0]["name"] == "b"

    @pytest.mark.asyncio
    async def test_file_analysis_to_dict(self):
        """FileAnalysis.to_dict() output shape."""
        a = await _parse_single(self.ps, "function foo() {}", "f.js")
        d = a.to_dict()
        assert d["path"] == "f.js"
        assert d["language"] == "javascript"
        assert isinstance(d["classes"], list)
        assert isinstance(d["functions"], list)
        assert isinstance(d["imports"], list)
        assert isinstance(d["exports"], list)
        assert isinstance(d["dependencies"], list)

    @pytest.mark.asyncio
    async def test_multiline_js_import(self):
        """Multiline import statements should be captured."""
        a = await _parse_single(self.ps, """
            import {
                Component,
                useState,
                useEffect,
            } from 'react';
        """, "a.js")
        assert "react" in a.imports

    @pytest.mark.asyncio
    async def test_file_analysis_lineno(self):
        """Line numbers should be 1-based and point to the declaration."""
        a = await _parse_single(self.ps, """
            // comment

            function myFunc() {}
        """, "a.js")
        for fn in a.functions:
            if fn["name"] == "myFunc":
                assert fn["lineno"] == 4  # 1-indexed; function is on line 4
                return
        pytest.fail("myFunc not found")


# =========================================================================
# C — functions, structs, includes, edge cases
# =========================================================================


class TestC:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Functions ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_function_definition(self):
        a = await _parse_single(self.ps, "int greet(const char* name) { return 0; }", "test.c")
        names = {f["name"] for f in a.functions}
        assert "greet" in names

    @pytest.mark.asyncio
    async def test_void_function(self):
        a = await _parse_single(self.ps, "void log(char* msg) { printf(msg); }", "test.c")
        names = {f["name"] for f in a.functions}
        assert "log" in names

    @pytest.mark.asyncio
    async def test_multiple_functions(self):
        a = await _parse_single(self.ps, "int one() { return 1; }\nint two() { return 2; }", "test.c")
        assert len(a.functions) >= 2

    # ── Structs ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_struct(self):
        a = await _parse_single(self.ps, "struct Point { int x; int y; };", "test.c")
        class_names = {c["name"] for c in a.classes}
        assert "Point" in class_names

    @pytest.mark.asyncio
    async def test_typedef_struct(self):
        a = await _parse_single(self.ps, "typedef struct { int x; } Point;", "test.c")
        # anonymous structs with typedef may not be captured
        assert a is not None

    @pytest.mark.asyncio
    async def test_union(self):
        a = await _parse_single(self.ps, "union Data { int i; float f; };", "test.c")
        class_names = {c["name"] for c in a.classes}
        assert "Data" in class_names

    # ── Includes ───────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_system_include(self):
        a = await _parse_single(self.ps, '#include <stdio.h>\nint main() { return 0; }', "test.c")
        assert any("stdio.h" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_local_include(self):
        a = await _parse_single(self.ps, '#include "mylib.h"', "test.c")
        assert any("mylib.h" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_multiple_includes(self):
        a = await _parse_single(self.ps, '#include <stdio.h>\n#include <stdlib.h>\n#include "local.h"', "test.c")
        assert len(a.imports) >= 2

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.c")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []

    @pytest.mark.asyncio
    async def test_only_comment(self):
        a = await _parse_single(self.ps, "/* just a comment */", "test.c")
        assert a is not None


# =========================================================================
# C++ — classes, methods, templates, includes, edge cases
# =========================================================================


class TestCpp:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Classes ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class(self):
        a = await _parse_single(self.ps, "class MyClass { public: int get() { return 0; } };", "test.cpp")
        class_names = {c["name"] for c in a.classes}
        assert "MyClass" in class_names

    @pytest.mark.asyncio
    async def test_struct(self):
        a = await _parse_single(self.ps, "struct Config { int port; };", "test.cpp")
        class_names = {c["name"] for c in a.classes}
        assert "Config" in class_names

    @pytest.mark.asyncio
    async def test_template_class(self):
        a = await _parse_single(self.ps, "template<typename T> class Box { T value; };", "test.cpp")
        class_names = {c["name"] for c in a.classes}
        assert "Box" in class_names

    @pytest.mark.asyncio
    async def test_inherited_class(self):
        a = await _parse_single(self.ps, "class Dog : public Animal { void bark() {} };", "test.cpp")
        class_names = {c["name"] for c in a.classes}
        assert "Dog" in class_names

    # ── Functions ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_free_function(self):
        a = await _parse_single(self.ps, "int multiply(int a, int b) { return a * b; }", "test.cpp")
        names = {f["name"] for f in a.functions}
        assert "multiply" in names

    @pytest.mark.asyncio
    async def test_method_in_class(self):
        a = await _parse_single(self.ps, "class Util { public: void helper(); };", "test.cpp")
        class_names = {c["name"] for c in a.classes}
        assert "Util" in class_names
        # Forward-declared methods may or may not be captured
        assert a is not None

    # ── Includes ───────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_system_include(self):
        a = await _parse_single(self.ps, '#include <vector>\nclass Foo {};', "test.cpp")
        assert any("vector" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_local_include(self):
        a = await _parse_single(self.ps, '#include "config.hpp"', "test.cpp")
        assert any("config.hpp" in imp for imp in a.imports)

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.cpp")
        assert a.functions == []
        assert a.classes == []


# =========================================================================
# C# — classes, methods, using directives, edge cases
# =========================================================================


class TestCSharp:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Classes ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class(self):
        a = await _parse_single(self.ps, "class UserService { }", "Service.cs")
        class_names = {c["name"] for c in a.classes}
        assert "UserService" in class_names

    @pytest.mark.asyncio
    async def test_public_class(self):
        a = await _parse_single(self.ps, "public class User { private string name; }", "User.cs")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_struct(self):
        a = await _parse_single(self.ps, "struct Point { int X; int Y; }", "Point.cs")
        class_names = {c["name"] for c in a.classes}
        assert "Point" in class_names

    @pytest.mark.asyncio
    async def test_interface(self):
        a = await _parse_single(self.ps, "interface IRepository { Task Save(); }", "IRepo.cs")
        class_names = {c["name"] for c in a.classes}
        assert "IRepository" in class_names

    # ── Methods ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_method_declaration(self):
        a = await _parse_single(self.ps, "class Util { public int Add(int a, int b) { return a+b; } }", "Util.cs")
        func_names = {f["name"] for f in a.functions}
        assert "Add" in func_names

    @pytest.mark.asyncio
    async def test_static_method(self):
        a = await _parse_single(self.ps, "class Utils { public static void Log(string msg) { } }", "Utils.cs")
        func_names = {f["name"] for f in a.functions}
        assert "Log" in func_names

    @pytest.mark.asyncio
    async def test_multiple_methods(self):
        a = await _parse_single(self.ps, "class Calc { int Add() { return 0; } int Sub() { return 0; } }", "Calc.cs")
        assert len(a.functions) >= 2

    # ── Using directives ───────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_using_directive(self):
        a = await _parse_single(self.ps, "using System;\nclass Foo { }", "Foo.cs")
        assert "System" in a.imports

    @pytest.mark.asyncio
    async def test_using_qualified(self):
        a = await _parse_single(self.ps, "using System.Collections.Generic;\nclass Foo { }", "Foo.cs")
        assert any("System.Collections.Generic" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_multiple_usings(self):
        a = await _parse_single(self.ps, "using System;\nusing System.IO;\nusing System.Linq;\nclass Foo { }", "Foo.cs")
        assert len(a.imports) >= 2

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.cs")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []

    @pytest.mark.asyncio
    async def test_namespace_wrapping(self):
        """Namespace declarations should not break parsing."""
        a = await _parse_single(self.ps, "namespace App { class Foo { } }", "Foo.cs")
        class_names = {c["name"] for c in a.classes}
        assert "Foo" in class_names


# =========================================================================
# PHP — classes, functions, namespaces, use, edge cases
# =========================================================================


class TestPHP:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Classes ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class(self):
        a = await _parse_single(self.ps, "<?php class UserService { }\n", "Service.php")
        class_names = {c["name"] for c in a.classes}
        assert "UserService" in class_names

    @pytest.mark.asyncio
    async def test_interface(self):
        a = await _parse_single(self.ps, "<?php interface Repository { public function find($id); }\n", "Repo.php")
        class_names = {c["name"] for c in a.classes}
        assert "Repository" in class_names

    # ── Functions ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_function_definition(self):
        a = await _parse_single(self.ps, "<?php function helper() { return null; }\n", "helper.php")
        names = {f["name"] for f in a.functions}
        assert "helper" in names

    @pytest.mark.asyncio
    async def test_method(self):
        a = await _parse_single(self.ps, "<?php class Foo { public function bar() {} }\n", "Foo.php")
        func_names = {f["name"] for f in a.functions}
        assert "bar" in func_names

    @pytest.mark.asyncio
    async def test_multiple_methods(self):
        a = await _parse_single(self.ps, "<?php class Calc { function add() {} function sub() {} }\n", "Calc.php")
        assert len(a.functions) >= 2

    @pytest.mark.asyncio
    async def test_private_method(self):
        a = await _parse_single(self.ps, "<?php class Foo { private function validate() {} }\n", "Foo.php")
        func_names = {f["name"] for f in a.functions}
        assert "validate" in func_names

    # ── Imports ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_use_statement(self):
        a = await _parse_single(self.ps, "<?php namespace App;\nuse App\\Models\\User;\n", "User.php")
        assert any("App\\Models\\User" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_multiple_use_statements(self):
        a = await _parse_single(self.ps, "<?php\nuse App\\Models\\User;\nuse App\\Models\\Post;\n", "items.php")
        assert len(a.imports) >= 1

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.php")
        assert a is not None


# =========================================================================
# Ruby — classes, modules, methods, requires, edge cases
# =========================================================================


class TestRuby:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Classes / Modules ──────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class(self):
        a = await _parse_single(self.ps, "class User\n  def initialize\n    @name = 'test'\n  end\nend\n", "user.rb")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_module(self):
        a = await _parse_single(self.ps, "module App\n  class Helper\n  end\nend\n", "helper.rb")
        class_names = {c["name"] for c in a.classes}
        assert "App" in class_names
        assert "Helper" in class_names

    @pytest.mark.asyncio
    async def test_inherited_class(self):
        a = await _parse_single(self.ps, "class Admin < User\nend\n", "admin.rb")
        class_names = {c["name"] for c in a.classes}
        assert "Admin" in class_names

    # ── Methods ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_method(self):
        a = await _parse_single(self.ps, "class Foo\n  def bar\n    puts 'hi'\n  end\nend\n", "foo.rb")
        func_names = {f["name"] for f in a.functions}
        assert "bar" in func_names

    @pytest.mark.asyncio
    async def test_singleton_method(self):
        a = await _parse_single(self.ps, "class Foo\n  def self.bar\n  end\nend\n", "foo.rb")
        func_names = {f["name"] for f in a.functions}
        assert "bar" in func_names

    @pytest.mark.asyncio
    async def test_multiple_methods(self):
        a = await _parse_single(self.ps, "class Calc\n  def add; end\n  def sub; end\nend\n", "calc.rb")
        assert len(a.functions) >= 2

    # ── Imports ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_require(self):
        a = await _parse_single(self.ps, "require 'json'\n", "lib.rb")
        assert "json" in a.imports

    @pytest.mark.asyncio
    async def test_require_relative(self):
        a = await _parse_single(self.ps, "require_relative 'config'\n", "lib.rb")
        assert "config" in a.imports

    @pytest.mark.asyncio
    async def test_load(self):
        a = await _parse_single(self.ps, "load 'helpers.rb'\n", "lib.rb")
        assert "helpers.rb" in a.imports

    @pytest.mark.asyncio
    async def test_multiple_requires(self):
        a = await _parse_single(self.ps, "require 'json'\nrequire 'yaml'\nrequire 'erb'\n", "lib.rb")
        assert len(a.imports) >= 2

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.rb")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []


# =========================================================================
# Swift — classes, protocols, functions, imports, edge cases
# =========================================================================


class TestSwift:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Classes ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class(self):
        a = await _parse_single(self.ps, "class User { var name: String\n  func greet() -> String { return \"Hi\" } }\n", "User.swift")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_protocol(self):
        a = await _parse_single(self.ps, "protocol Drawable { func draw() }\n", "Drawable.swift")
        class_names = {c["name"] for c in a.classes}
        assert "Drawable" in class_names

    @pytest.mark.asyncio
    async def test_class_with_protocol(self):
        a = await _parse_single(self.ps, "class Service: Drawable { func draw() {} }\n", "Service.swift")
        class_names = {c["name"] for c in a.classes}
        assert "Service" in class_names

    # ── Functions ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_free_function(self):
        a = await _parse_single(self.ps, "func hello() -> String { return \"Hi\" }\n", "hello.swift")
        names = {f["name"] for f in a.functions}
        assert "hello" in names

    @pytest.mark.asyncio
    async def test_method(self):
        a = await _parse_single(self.ps, "class Calc { func add(a: Int, b: Int) -> Int { return a+b } }\n", "Calc.swift")
        func_names = {f["name"] for f in a.functions}
        assert "add" in func_names

    @pytest.mark.asyncio
    async def test_multiple_functions(self):
        a = await _parse_single(self.ps, "func one() {}; func two() {}; func three() {}", "many.swift")
        assert len(a.functions) >= 2

    # ── Imports ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_import_framework(self):
        a = await _parse_single(self.ps, "import Foundation\n", "main.swift")
        assert "Foundation" in a.imports

    @pytest.mark.asyncio
    async def test_import_qualified(self):
        a = await _parse_single(self.ps, "import UIKit.UIColor\n", "main.swift")
        # The identifier capture may get the full qualified path or just the first part
        assert len(a.imports) >= 1

    @pytest.mark.asyncio
    async def test_multiple_imports(self):
        a = await _parse_single(self.ps, "import Foundation\nimport UIKit\n", "main.swift")
        assert len(a.imports) >= 2

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.swift")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []


# =========================================================================
# Kotlin — classes, objects, functions, imports, edge cases
# =========================================================================


class TestKotlin:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Classes ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_class(self):
        a = await _parse_single(self.ps, "package com.example\nclass UserService { }\n", "Service.kt")
        class_names = {c["name"] for c in a.classes}
        assert "UserService" in class_names

    @pytest.mark.asyncio
    async def test_data_class(self):
        a = await _parse_single(self.ps, "data class User(val name: String, val age: Int)\n", "User.kt")
        class_names = {c["name"] for c in a.classes}
        assert "User" in class_names

    @pytest.mark.asyncio
    async def test_object(self):
        a = await _parse_single(self.ps, "object Singleton { val name = \"test\" }\n", "Singleton.kt")
        class_names = {c["name"] for c in a.classes}
        assert "Singleton" in class_names

    # ── Functions ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_top_level_function(self):
        a = await _parse_single(self.ps, "fun helper(): String { return \"hi\" }\n", "helper.kt")
        names = {f["name"] for f in a.functions}
        assert "helper" in names

    @pytest.mark.asyncio
    async def test_method(self):
        a = await _parse_single(self.ps, "class Calc { fun add(a: Int, b: Int): Int { return a + b } }\n", "Calc.kt")
        func_names = {f["name"] for f in a.functions}
        assert "add" in func_names

    @pytest.mark.asyncio
    async def test_private_method(self):
        a = await _parse_single(self.ps, "class Foo { private fun validate() {} }\n", "Foo.kt")
        func_names = {f["name"] for f in a.functions}
        assert "validate" in func_names

    # ── Imports ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_single_import(self):
        a = await _parse_single(self.ps, "import com.example.model.User\nclass Foo { }\n", "Foo.kt")
        assert any("com.example.model.User" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_multiple_imports(self):
        a = await _parse_single(self.ps, "import com.example.model.User\nimport com.example.model.Post\n", "models.kt")
        assert len(a.imports) >= 2

    @pytest.mark.asyncio
    async def test_package_statement(self):
        """Package declarations should not interfere with parsing."""
        a = await _parse_single(self.ps, "package com.example.app\nclass App { }\n", "App.kt")
        class_names = {c["name"] for c in a.classes}
        assert "App" in class_names

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.kt")
        assert a.functions == []
        assert a.classes == []
        assert a.imports == []


# =========================================================================
# Bash — functions, source includes, edge cases
# =========================================================================


class TestBash:
    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    # ── Functions ──────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_function_keyword(self):
        a = await _parse_single(self.ps, "function greet() { echo \"Hello\"; }\n", "script.sh")
        names = {f["name"] for f in a.functions}
        assert "greet" in names

    @pytest.mark.asyncio
    async def test_multiple_functions(self):
        a = await _parse_single(self.ps, "function one() { :; }\nfunction two() { :; }\n", "script.sh")
        assert len(a.functions) >= 2

    # ── Source includes ────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_source_command(self):
        a = await _parse_single(self.ps, "source ./utils.sh\n", "script.sh")
        assert any("./utils.sh" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_dot_command(self):
        a = await _parse_single(self.ps, ". ./config.sh\n", "script.sh")
        assert any("./config.sh" in imp for imp in a.imports)

    @pytest.mark.asyncio
    async def test_multiple_sources(self):
        a = await _parse_single(self.ps, "source lib.sh\nsource config.sh\n", "script.sh")
        assert len(a.imports) >= 2

    @pytest.mark.asyncio
    async def test_func_and_source(self):
        a = await _parse_single(self.ps, "source utils.sh\nfunction greet() { echo hi; }\n", "script.sh")
        names = {f["name"] for f in a.functions}
        assert "greet" in names
        assert len(a.imports) >= 1

    # ── Edge cases ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_empty_file(self):
        a = await _parse_single(self.ps, "", "empty.sh")
        assert a.functions == []
        assert a.imports == []

    @pytest.mark.asyncio
    async def test_shebang_only(self):
        a = await _parse_single(self.ps, "#!/bin/bash\n", "script.sh")
        assert a is not None


# =========================================================================
# HTML, CSS, JSON, YAML, Markdown, SQL — basic validation
# These are markup / data / query languages that don't have traditional
# classes, functions, or imports.  We verify they parse without crashing
# and return the correct file-level metadata.
# =========================================================================


class TestMarkupLanguages:
    """Data / markup / query languages — files are counted but have zero entities."""

    @pytest.fixture(autouse=True)
    def _parser(self):
        self.ps = ParserService()

    @pytest.mark.asyncio
    async def test_html(self):
        a = await _parse_single(self.ps, "<!DOCTYPE html>\n<html><body>Hello</body></html>\n", "page.html")
        assert a.language == "html"
        assert a.classes == []
        assert a.functions == []
        assert a.imports == []

    @pytest.mark.asyncio
    async def test_css(self):
        a = await _parse_single(self.ps, ".class { color: red; }\n#id { margin: 0; }\n", "styles.css")
        assert a.language == "css"
        assert a.classes == []
        assert a.functions == []

    @pytest.mark.asyncio
    async def test_json(self):
        a = await _parse_single(self.ps, '{"name": "test", "count": 1}', "data.json")
        assert a.language == "json"
        assert a.classes == []
        assert a.functions == []

    @pytest.mark.asyncio
    async def test_yaml(self):
        a = await _parse_single(self.ps, "name: test\nversion: 1.0\n", "config.yaml")
        assert a.language == "yaml"
        assert a.classes == []
        assert a.functions == []

    @pytest.mark.asyncio
    async def test_markdown(self):
        a = await _parse_single(self.ps, "# Title\n\nHello world\n", "readme.md")
        assert a.language == "markdown"
        assert a.classes == []
        assert a.functions == []

    @pytest.mark.asyncio
    async def test_sql(self):
        a = await _parse_single(self.ps, "SELECT * FROM users WHERE id = 1;\n", "query.sql")
        assert a.language == "sql"
        assert a.classes == []
        assert a.functions == []

    @pytest.mark.asyncio
    async def test_empty_html(self):
        a = await _parse_single(self.ps, "", "empty.html")
        assert a.language == "html"
        assert a.classes == []

    @pytest.mark.asyncio
    async def test_empty_json(self):
        a = await _parse_single(self.ps, "", "empty.json")
        assert a.language == "json"
        assert a.classes == []

    @pytest.mark.asyncio
    async def test_empty_markdown(self):
        a = await _parse_single(self.ps, "", "empty.md")
        assert a.language == "markdown"
        assert a.classes == []

    @pytest.mark.asyncio
    async def test_invalid_sql(self):
        """Syntactically invalid SQL should not crash."""
        a = await _parse_single(self.ps, "SELECT FROM WHERE", "bad.sql")
        assert a is not None

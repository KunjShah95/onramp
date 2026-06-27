"""Benchmark parser_service.py across all 20 languages to identify slow paths.

Usage:
    python benchmark_parser.py                            # standard output
    python benchmark_parser.py --json results.json         # write machine-readable JSON
    python benchmark_parser.py --baseline baseline.json    # compare against stored baseline
    python benchmark_parser.py --real-dir backend/app      # benchmark real project directory
    python benchmark_parser.py --real-dir backend/app --real-dir web/src  # multiple dirs
    python benchmark_parser.py --json res.json --baseline base.json --real-dir ../backend/app  # all flags
"""
import sys, argparse
for mod in list(sys.modules.keys()):
    if mod.startswith('app'):
        del sys.modules[mod]

import tempfile, os, asyncio, time, shutil, json
from app.services.parser_service import ParserService

# ---------------------------------------------------------------------------
# Sample file generators for each language at different sizes
# ---------------------------------------------------------------------------

def make_samples(size: str, count: int = 1):
    """Generate sample files at small (~10 lines), medium (~100), large (~500)."""
    samples = {}
    line_counts = {"small": 10, "medium": 100, "large": 500}
    n = line_counts[size]

    def python_code(n: int) -> str:
        lines = ['import os', 'import sys', 'import json', 'from typing import Optional']
        lines.extend([f'import module_{i}' for i in range(min(n // 5, 30))])
        lines.append('\nclass Base:')
        lines.append('    def __init__(self, v): self.v = v')
        for i in range(n // 10):
            lines.append(f'\nclass C_{i}(Base):')
            lines.append(f'    def m_{i}_a(self): return {i}')
            lines.append(f'    def m_{i}_b(self): return self.v')
            lines.append(f'\ndef f_{i}(a): return a')
        return '\n'.join(lines[:n])

    def js_code(n: int) -> str:
        lines = ['import React from "react";']
        lines.append('\nclass Base { constructor(p) { this.p = p; } }')
        for i in range(n // 8):
            lines.append(f'\nclass C_{i} extends Base {{')
            lines.append(f'  m_{i}() {{ return {i}; }}')
            lines.append(f'}}')
            lines.append(f'\nfunction f_{i}(a) {{ return a; }}')
            lines.append(f'\nconst af_{i} = () => {{ return {i}; }}')
        return '\n'.join(lines[:n])

    def ts_code(n: int) -> str:
        lines = ['import React from "react";']
        lines.append('\ninterface P { name: string }')
        lines.append('\ntype CB = () => void')
        for i in range(n // 8):
            lines.append(f'\nclass S_{i} {{')
            lines.append(f'  m_{i}(): void {{ return; }}')
            lines.append(f'}}')
            lines.append(f'\nfunction f_{i}<T>(a: T): T {{ return a; }}')
        return '\n'.join(lines[:n])

    def tsx_code(n: int) -> str:
        lines = ['import React from "react";']
        lines.append('\ninterface P { name: string }')
        for i in range(n // 8):
            lines.append(f'\nconst C_{i}: React.FC<P> = ({{ name }}) => (')
            lines.append(f'  <div>{{name}}_{i}</div>')
            lines.append(f');')
            lines.append(f'\nfunction h_{i}() {{ return {i}; }}')
        return '\n'.join(lines[:n])

    def go_code(n: int) -> str:
        lines = ['package main', '', 'import (', '\t"fmt"', '\t"os"', ')']
        for i in range(n // 8):
            lines.append(f'\ntype S_{i} struct {{ V int }}')
            lines.append(f'\nfunc (s *S_{i}) M_{i}() error {{ return nil }}')
            lines.append(f'\nfunc F_{i}() {{ fmt.Println({i}) }}')
        return '\n'.join(lines[:n])

    def rust_code(n: int) -> str:
        lines = ['use std::collections::HashMap;']
        for i in range(n // 8):
            lines.append(f'\nstruct S_{i} {{ value: i32 }}')
            lines.append(f'\nenum E_{i} {{ A, B({i}) }}')
            lines.append(f'\ntrait T_{i} {{ fn m(&self) -> i32; }}')
            lines.append(f'\nimpl T_{i} for S_{i} {{ fn m(&self) -> i32 {{ {i} }} }}')
            lines.append(f'\nfn f_{i}() -> i32 {{ {i} }}')
        return '\n'.join(lines[:n])

    def java_code(n: int) -> str:
        lines = ['import java.util.List;', 'import java.util.Map;']
        for i in range(n // 10):
            lines.append(f'\npublic class C_{i} {{')
            lines.append(f'    private int v_{i};')
            lines.append(f'    public C_{i}() {{ this.v_{i} = {i}; }}')
            lines.append(f'    public int m_{i}() {{ return v_{i}; }}')
            lines.append(f'}}')
        return '\n'.join(lines[:n])

    def c_code(n: int) -> str:
        lines = ['#include <stdio.h>', '#include <stdlib.h>']
        for i in range(n // 10):
            lines.append(f'\nstruct S_{i} {{ int x; int y; }};')
            lines.append(f'\nunion U_{i} {{ int i; float f; }};')
            lines.append(f'\nint f_{i}(int a) {{ return a + {i}; }}')
        return '\n'.join(lines[:n])

    def cpp_code(n: int) -> str:
        lines = ['#include <vector>', '#include <string>']
        for i in range(n // 10):
            lines.append(f'\nclass C_{i} {{')
            lines.append(f'    int v_{i};')
            lines.append(f'public:')
            lines.append(f'    void m_{i}() {{}}')
            lines.append(f'}};')
            lines.append(f'\nstruct S_{i} {{ float x; }};')
            lines.append(f'\nvoid f_{i}() {{}}')
        return '\n'.join(lines[:n])

    def cs_code(n: int) -> str:
        lines = ['using System;', 'using System.Collections.Generic;']
        for i in range(n // 10):
            lines.append(f'\nclass C_{i} {{')
            lines.append(f'    public void M_{i}() {{}}')
            lines.append(f'}}')
            lines.append(f'\nstruct S_{i} {{ public int V; }}')
            lines.append(f'\ninterface I_{i} {{ void D_{i}(); }}')
        return '\n'.join(lines[:n])

    def php_code(n: int) -> str:
        lines = ['<?php', 'namespace App;', 'use App\\Model\\User;']
        for i in range(n // 8):
            lines.append(f'\nclass C_{i} {{')
            lines.append(f'    public function m_{i}($a) {{ return $a; }}')
            lines.append(f'}}')
            lines.append(f'\ninterface I_{i} {{ public function d_{i}($a); }}')
            lines.append(f'\nfunction f_{i}($a) {{ return $a + {i}; }}')
        return '\n'.join(lines[:n])

    def ruby_code(n: int) -> str:
        lines = ['require "json"', 'require "net/http"']
        for i in range(n // 8):
            lines.append(f'\nmodule M_{i}')
            lines.append(f'  class C_{i}')
            lines.append(f'    def initialize(v)')
            lines.append(f'      @v = v')
            lines.append(f'    end')
            lines.append(f'    def m_{i}')
            lines.append(f'      @v + {i}')
            lines.append(f'    end')
            lines.append(f'  end')
            lines.append(f'end')
            lines.append(f'\ndef f_{i}(a)')
            lines.append(f'  a + {i}')
            lines.append(f'end')
        return '\n'.join(lines[:n])

    def swift_code(n: int) -> str:
        lines = ['import Foundation', 'import UIKit']
        for i in range(n // 10):
            lines.append(f'\nclass C_{i} {{')
            lines.append(f'    var v: Int = {i}')
            lines.append(f'    func m_{i}() -> Int {{ return v }}')
            lines.append(f'}}')
            lines.append(f'\nprotocol P_{i} {{ func d_{i}() }}')
            lines.append(f'\nfunc f_{i}() -> Int {{ return {i} }}')
        return '\n'.join(lines[:n])

    def kotlin_code(n: int) -> str:
        lines = ['package com.example', 'import com.example.model.User']
        for i in range(n // 10):
            lines.append(f'\nclass C_{i} {{')
            lines.append(f'    fun m_{i}(): Int {{ return {i} }}')
            lines.append(f'}}')
            lines.append(f'\ndata class D_{i}(val name: String)')
            lines.append(f'\nfun f_{i}(): Int {{ return {i} }}')
        return '\n'.join(lines[:n])

    def bash_code(n: int) -> str:
        lines = ['#!/bin/bash', 'source ./config.sh']
        for i in range(n // 8):
            lines.append(f'\nfunction f_{i}() {{')
            lines.append(f'    echo "hello_{i}"')
            lines.append(f'    return {i}')
            lines.append(f'}}')
            lines.append(f'\nf_posix_{i}() {{')
            lines.append(f'    echo "world_{i}"')
            lines.append(f'}}')
        return '\n'.join(lines[:n])

    def markup_code(n: int, lang: str) -> str:
        if lang == "html":
            lines = ['<!DOCTYPE html>', '<html><head><title>T</title></head><body>']
            for i in range(n // 5):
                lines.append(f'  <div class="c_{i}"><p>Line {i}</p></div>')
            lines.append('</body></html>')
            return '\n'.join(lines)
        elif lang == "css":
            return '\n'.join([f'.c_{i} {{ color: red; font-size: {12+i%10}px; }}' for i in range(n//5)])
        elif lang == "json":
            items = ', '.join([f'"{k}": {k}' for k in range(n//5)])
            return '{' + items + '}'
        elif lang == "yaml":
            return '\n'.join([f'svc_{i}:\n  host: local\n  port: {8000+i}' for i in range(n//5)])
        elif lang == "markdown":
            return '\n'.join([f'## Section {i}\nContent text here.' for i in range(n//5)])
        elif lang == "sql":
            return '\n'.join([f'SELECT * FROM t_{i} WHERE id = {i};' for i in range(n//4)])
        return ""

    gen_map = {
        ("python", ".py"): python_code,
        ("javascript", ".js"): js_code,
        ("typescript", ".ts"): ts_code,
        ("tsx", ".tsx"): tsx_code,
        ("go", ".go"): go_code,
        ("rust", ".rs"): rust_code,
        ("java", ".java"): java_code,
        ("c", ".c"): c_code,
        ("cpp", ".cpp"): cpp_code,
        ("c_sharp", ".cs"): cs_code,
        ("php", ".php"): php_code,
        ("ruby", ".rb"): ruby_code,
        ("swift", ".swift"): swift_code,
        ("kotlin", ".kt"): kotlin_code,
        ("bash", ".sh"): bash_code,
        ("html", ".html"): lambda n: markup_code(n, "html"),
        ("css", ".css"): lambda n: markup_code(n, "css"),
        ("json", ".json"): lambda n: markup_code(n, "json"),
        ("yaml", ".yaml"): lambda n: markup_code(n, "yaml"),
        ("markdown", ".md"): lambda n: markup_code(n, "markdown"),
        ("sql", ".sql"): lambda n: markup_code(n, "sql"),
    }

    for (lang, ext), gen in gen_map.items():
        code = gen(n)
        for idx in range(count):
            fname = f"{lang}_{size}_{idx}{ext}" if idx > 0 else f"{lang}_{size}{ext}"
            samples[fname] = code

    return samples


# ---------------------------------------------------------------------------
# Per-file benchmark
# ---------------------------------------------------------------------------

async def benchmark_per_file(ps: ParserService, samples: dict) -> dict:
    """Time each file individually, returning per-language stats."""
    results = {}
    for fname, code in samples.items():
        tmp = tempfile.mkdtemp()
        fpath = os.path.join(tmp, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(code)

        times = []
        for _ in range(3):
            start = time.perf_counter()
            analysis = await ps._parse_file(fpath)
            elapsed = time.perf_counter() - start
            times.append(elapsed)

        shutil.rmtree(tmp)

        lang = analysis.language if analysis else "unknown"
        base_lang = fname.split("_")[0]
        if base_lang not in results:
            results[base_lang] = {"min": float('inf'), "max": 0, "total": 0, "count": 0, "entities": 0}
        avg = sum(times) / len(times)
        st = results[base_lang]
        st["min"] = min(st["min"], avg)
        st["max"] = max(st["max"], avg)
        st["total"] += avg
        st["count"] += 1
        st["entities"] += len(analysis.classes) + len(analysis.functions) + len(analysis.imports) if analysis else 0

    return results


# ---------------------------------------------------------------------------
# Directory benchmark
# ---------------------------------------------------------------------------

async def benchmark_directory(ps: ParserService, samples: dict) -> dict:
    """Time parse_directory on a mixed-language directory."""
    tmp = tempfile.mkdtemp()
    for fname, code in samples.items():
        fpath = os.path.join(tmp, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(code)

    times = []
    for _ in range(3):
        start = time.perf_counter()
        result = await ps.parse_directory(tmp)
        elapsed = time.perf_counter() - start
        times.append(elapsed)

    shutil.rmtree(tmp)

    return {
        "min": min(times),
        "max": max(times),
        "avg": sum(times) / len(times),
        "files": len(result["files"]),
    }


# ---------------------------------------------------------------------------
# Baseline comparison
# ---------------------------------------------------------------------------

def check_regressions(new_results: dict, baseline: dict, threshold_pct: float = 20.0) -> list:
    """Compare new benchmark results against a baseline and report regressions.

    Returns list of dicts with lang, size, old_ms, new_ms, change_pct.
    A regression is flagged when new timing exceeds baseline by threshold_pct.
    """
    regressions = []
    for size in ("small", "medium", "large"):
        new_per_file = new_results.get(size, {}).get("per_file", {})
        base_per_file = baseline.get(size, {}).get("per_file", {})
        for lang, st in new_per_file.items():
            new_avg = st["avg_ms"]
            old = base_per_file.get(lang, {})
            old_avg = old.get("avg_ms", None)
            if old_avg and old_avg > 0:
                change_pct = ((new_avg - old_avg) / old_avg) * 100
                if change_pct > threshold_pct:
                    regressions.append({
                        "lang": lang,
                        "size": size,
                        "old_ms": round(old_avg, 2),
                        "new_ms": round(new_avg, 2),
                        "change_pct": round(change_pct, 1),
                    })
    return regressions


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Real-world directory benchmark
# ---------------------------------------------------------------------------

async def benchmark_real_directory(ps: ParserService, dir_path: str) -> dict:
    """Time parse_directory on a real project directory."""
    if not os.path.isdir(dir_path):
        return {"error": f"Directory not found: {dir_path}", "path": dir_path}

    times = []
    lang_counts = {}
    total_files = 0
    total_classes = 0
    total_functions = 0
    total_imports = 0

    for _ in range(3):
        start = time.perf_counter()
        result = await ps.parse_directory(dir_path)
        elapsed = time.perf_counter() - start
        times.append(elapsed)

        # Use last run for entity counts
        lang_counts = {}
        for f in result["files"]:
            lang = f["language"]
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
        total_files = len(result["files"])
        total_classes = len(result.get("classes", []))
        total_functions = len(result.get("functions", []))
        total_imports = len(result.get("imports", []))

    return {
        "path": os.path.normpath(dir_path),
        "min": min(times),
        "max": max(times),
        "avg": sum(times) / len(times),
        "files": total_files,
        "classes": total_classes,
        "functions": total_functions,
        "imports": total_imports,
        "languages": lang_counts,
    }


async def main():
    parser = argparse.ArgumentParser(
        description="Benchmark parser performance across 20 languages"
    )
    parser.add_argument(
        "--json", type=str, default=None,
        help="Write benchmark results as JSON to this file"
    )
    parser.add_argument(
        "--baseline", type=str, default=None,
        help="Path to a baseline JSON file to compare against for regression detection"
    )
    parser.add_argument(
        "--real-dir", type=str, action="append", default=None,
        dest="real_dirs",
        help="Real project directory to benchmark. Can be specified multiple times."
    )
    args = parser.parse_args()

    ps = ParserService()
    sizes = ["small", "medium", "large"]
    all_results = {}

    SEP = "-" * 70

    print(SEP)
    print("BENCHMARK: Parser Performance Across 20 Languages")
    print(SEP)

    for size in sizes:
        line_counts = {"small": 10, "medium": 100, "large": 500}
        n = line_counts[size]
        print(f"\n{SEP}")
        print(f"  SIZE: {size.upper()} (~{n} lines/file)")
        print(SEP)

        samples = make_samples(size)
        results = await benchmark_per_file(ps, samples)
        all_results[size] = {"per_file": {}, "directory": {}}

        sorted_langs = sorted(results.items(), key=lambda x: x[1]["total"] / x[1]["count"], reverse=True)

        print(f"\n  {'Language':<14} {'Avg(ms)':>8} {'Min(ms)':>8} {'Max(ms)':>8} {'Entities':>8}")
        print(f"  {'-'*14} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
        for lang, st in sorted_langs:
            avg_ms = st["total"] / st["count"] * 1000
            min_ms = st["min"] * 1000
            max_ms = st["max"] * 1000
            print(f"  {lang:<14} {avg_ms:>8.2f} {min_ms:>8.2f} {max_ms:>8.2f} {st['entities']:>8}")
            all_results[size]["per_file"][lang] = {
                "avg_ms": avg_ms, "min_ms": min_ms, "max_ms": max_ms, "entities": st["entities"]
            }

        dir_samples = make_samples(size, count=3)
        dir_result = await benchmark_directory(ps, dir_samples)
        dir_avg = dir_result["avg"] * 1000
        dir_min = dir_result["min"] * 1000
        dir_max = dir_result["max"] * 1000
        print(f"\n  Directory ({len(dir_samples)} files across 20 langs, 3 runs):")
        print(f"    Avg: {dir_avg:.2f}ms  |  Min: {dir_min:.2f}ms  |  Max: {dir_max:.2f}ms")
        all_results[size]["directory"] = dir_result

    # Summary: slowest by size
    print(f"\n{SEP}")
    print("  SUMMARY: Slowest Languages by Size")
    print(SEP)
    for size in sizes:
        langs = sorted(
            all_results[size]["per_file"].items(),
            key=lambda x: x[1]["avg_ms"],
            reverse=True,
        )
        top3 = langs[:3]
        print(f"\n  {size.upper()} files -- Top 3 slowest:")
        for lang, st in top3:
            print(f"    {lang:<14} {st['avg_ms']:>8.2f} ms  ({st['entities']} entities)")

    # Slow path analysis
    print(f"\n{SEP}")
    print("  SLOW PATH ANALYSIS")
    print(SEP)

    large = all_results.get("large", {}).get("per_file", {})
    tree_walkers = {"ruby", "bash", "javascript", "typescript", "tsx"}
    query_only = set(large.keys()) - tree_walkers

    if large:
        walker_items = [large[l] for l in tree_walkers if l in large]
        query_items = [large[l] for l in query_only if l in large]

        if walker_items and query_items:
            walker_avg = sum(s["avg_ms"] for s in walker_items) / len(walker_items)
            query_avg = sum(s["avg_ms"] for s in query_items) / len(query_items)
            print(f"\n  Tree-walking languages (Ruby, Bash, JS/TS/TSX extractions):")
            print(f"    Avg: {walker_avg:.2f} ms/file  ({len(walker_items)} languages)")
            print(f"\n  Query-only languages:")
            print(f"    Avg: {query_avg:.2f} ms/file  ({len(query_items)} languages)")

        slowest_lang = max(large.items(), key=lambda x: x[1]["avg_ms"])
        print(f"\n  Slowest language: {slowest_lang[0]} ({slowest_lang[1]['avg_ms']:.2f} ms)")

        slow_langs = [(lang, st) for lang, st in large.items() if st["avg_ms"] > 500]
        if slow_langs:
            print(f"\n  WARNING: Languages exceeding 500ms on large files:")
            for lang, st in sorted(slow_langs, key=lambda x: x[1]["avg_ms"], reverse=True):
                print(f"      {lang}: {st['avg_ms']:.2f} ms  ({st['entities']} entities)")
        else:
            print(f"\n  All languages under 500ms on large files.")

    # Print all large-file data for reference
    print(f"\n{SEP}")
    print("  ALL LANGUAGE TIMINGS (large files)")
    print(SEP)
    for lang, st in sorted(large.items(), key=lambda x: x[1]["avg_ms"], reverse=True):
        print(f"  {lang:<14} {st['avg_ms']:>8.2f} ms  ({st['entities']:>4} entities)")

    # ── Real-world directory benchmark ──────────────────────────────────
    if args.real_dirs:
        print(f"\n{SEP}")
        print("  REAL-WORLD DIRECTORY BENCHMARK")
        print(SEP)
        all_results["real_dirs"] = {}
        for d in args.real_dirs:
            resolved = os.path.abspath(d)
            if not os.path.isdir(resolved):
                print(f"\n  WARNING: Directory not found: {d}")
                continue
            print(f"\n  Benchmarking: {d}")
            r = await benchmark_real_directory(ps, resolved)
            dir_name = os.path.basename(resolved) or resolved
            all_results["real_dirs"][dir_name] = r
            if "error" in r:
                print(f"    ERROR: {r['error']}")
                continue
            avg_ms = r["avg"] * 1000
            min_ms = r["min"] * 1000
            max_ms = r["max"] * 1000
            langs_str = ", ".join(f"{k}: {v}" for k, v in sorted(r["languages"].items()))
            print(f"    Files: {r['files']}  |  Time: {avg_ms:.2f}ms avg ({min_ms:.2f}-{max_ms:.2f})")
            print(f"    Entities: {r['classes']} classes, {r['functions']} functions, {r['imports']} imports")
            print(f"    Languages: {langs_str}")

    # ── JSON output ──────────────────────────────────────────────────────
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2)
        print(f"\n  JSON results written to: {args.json}")

    # ── Baseline comparison ──────────────────────────────────────────────
    if args.baseline:
        if not os.path.exists(args.baseline):
            print(f"\n  Baseline file not found: {args.baseline} -- skipping comparison")
        else:
            with open(args.baseline, "r", encoding="utf-8") as f:
                baseline = json.load(f)
            regressions = check_regressions(all_results, baseline, threshold_pct=20.0)
            if regressions:
                print(f"\n{SEP}")
                print(f"  REGRESSIONS DETECTED (>20% slowdown)")
                print(f"  (These are informational -- the step is non-blocking.)")
                print(SEP)
                print(f"  {'Language':<14} {'Size':<8} {'Before(ms)':>10} {'After(ms)':>10} {'Change':>8}")
                print(f"  {'-'*14} {'-'*8} {'-'*10} {'-'*10} {'-'*8}")
                for r in regressions:
                    print(f"  {r['lang']:<14} {r['size']:<8} {r['old_ms']:>10.2f} {r['new_ms']:>10.2f} +{r['change_pct']:>6.1f}%")
            else:
                print(f"\n  No regressions detected. All languages within 20% of baseline.")

    print(f"\n{SEP}")
    print("  BENCHMARK COMPLETE")
    print(SEP)

    # Return results dict for programmatic use
    return all_results


if __name__ == "__main__":
    asyncio.run(main())

# Token-Efficiency Benchmark Report — Design

**Date:** 2026-08-09
**Status:** Approved (design review)

## Problem

Onramp competes with LLM/coding-agent tools (Claude Code, Cursor, Codex). To make a
credible efficiency claim, we need a live, reproducible benchmark that measures how many
tokens each tool consumes to comprehend a real-world repo, and compares that against
Onramp's repo-index pipeline.

## Goal

Produce a live benchmark report: run an identical repo-understanding task against a real
repo (subset of facebook/react) through Claude Code, Cursor, and Codex; capture token
usage and wall-clock time; normalize per tool; compare against Onramp's indexing pipeline;
render a markdown report with an Onramp efficiency delta.

## Scope

- **Repo:** shallow-clone `facebook/react`, then benchmark a representative subset:
  `packages/react/src`, `packages/react-dom/src`, `packages/react-reconciler`.
- **Task (identical for all tools):** *"Analyze this repo and produce: architecture
  summary, module dependency map, 5 key data-flow paths, and a test-strategy assessment."*
  Output length capped so output tokens stay comparable.
- **Tools measured:**
  - Claude Code — `claude -p --output-format stream-json` (per-message usage tokens)
  - Codex — `codex exec --json` (usage from JSONL events)
  - Cursor — GUI agent run; usage pulled from Cursor usage API/dashboard (no headless CLI
    token reporting exists)
  - Onramp — backend repo-index pipeline (chunking + embedding token count)
- **Out of scope:** full 2000-file repo run; cost-USD attribution across providers;
  fine-tuning the underlying models; changing product pricing.

## Architecture

```
scripts/benchmarks/
├── prepare_repo.sh        # shallow-clone facebook/react, extract subset dirs
├── run_claude_code.ps1    # claude -p stream-json -> usage.json
├── run_codex.ps1          # codex exec --json -> usage.jsonl -> usage.json
├── run_cursor.ps1         # launch GUI with --wait, capture elapsed; usage from API
├── run_onramp.ps1         # call Onramp indexing path -> token count for subset
├── normalize.ps1          # merge per-tool usage.json into results.json
└── render_report.ps1      # results.json -> docs/benchmarks/token-efficiency-<date>.md
```

Each runner emits a normalized `usage.json`:

```json
{
  "tool": "claude_code",
  "model": "claude-sonnet-4-x",
  "input_tokens": 123456,
  "output_tokens": 2345,
  "elapsed_s": 42.3,
  "loc_scanned": 18320,
  "status": "ok"
}
```

`normalize.ps1` merges into `results.json`; `render_report.ps1` renders:

- Per-tool table: input tokens, output tokens, total tokens, elapsed s, tokens/1k LOC.
- Model note per tool (they use different models — not apples-to-apples).
- Onramp row: tokens to index the subset once, plus note that indexing is reused across
  queries (subsequent queries add near-zero marginal indexing cost). Onramp's token count
  is computed concretely: run the subset through the Onramp chunking path
  (`EmbeddingsService._chunk_content`, max_chars=1500) and sum tokenizer tokens across all
  chunk contents (estimate: chars/4 if no tokenizer available).
- Efficiency delta: `(tool_total_tokens - onramp_index_tokens) / onramp_index_tokens` and a
  per-query amortization comparison.

## Data Flow

1. `prepare_repo.sh` clones react and stages the subset into `work/`.
2. Each runner executes the identical prompt against its tool, capturing usage + elapsed.
3. `normalize.ps1` merges usage JSONs.
4. `render_report.ps1` writes the markdown report.
5. Report is committed to `docs/benchmarks/token-efficiency-<date>.md`.

## Fairness & Caveats (must appear in the report)

- Different tools use different models (Claude models vs OpenAI via Codex vs Cursor
  models). Absolute token counts are not directly comparable; the report normalizes per
  tool and states each model.
- Cursor lacks a headless CLI token reporter; its numbers come from Cursor's usage
  dashboard/API and are the least precise.
- Onramp's advantage is indexing reuse: chunk once, query many times. The fair metric is
  "tokens per repo-comprehension", amortized over N queries.
- Wall-clock includes model latency which varies by load; report as best-effort.

## Error Handling

- Missing tool in PATH → runner reports `status: skipped` with reason, report still renders.
- Tool exit non-zero → `status: failed`, error captured, other tools unaffected.
- No token usage available (e.g. Cursor API unreachable) → `input_tokens`/`output_tokens`
  = null, report shows `n/a` and marks the row.
- Network failure cloning react → use a cached copy if present, else abort with clear error.

## Testing

- Dry-run each runner against a tiny fixture repo (5 files) and assert the normalized JSON
  shape.
- Assert `render_report.ps1` produces valid markdown tables for: all-ok, one-skipped,
  one-failed, and missing-usage cases.
- Idempotency: re-running normalize produces identical output for identical inputs.

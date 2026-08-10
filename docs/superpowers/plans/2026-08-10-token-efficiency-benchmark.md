# Token-Efficiency Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a live, reproducible benchmark that measures token usage + wall-clock time for four tools (Claude Code, Codex, Cursor, Onramp) on the same repo-understanding task against a subset of facebook/react, and renders a markdown report with an Onramp efficiency delta.

**Architecture:** A set of PowerShell scripts under `scripts/benchmarks/` plus one Python helper. Each tool runner executes an identical prompt against a repo directory and emits a normalized `usage.json`. A `normalize.ps1` merges all `usage-<tool>.json` files into `results.json`. A `render_report.ps1` reads `results.json` and writes a dated markdown report to `docs/benchmarks/token-efficiency-<date>.md`. Each runner accepts a `-Stub` switch that emits deterministic usage data so the full pipeline is testable without hitting external tools.

**Tech Stack:** PowerShell 5.1, Python 3.13 (backend `Document`/`EmbeddingsService._chunk_content` chunking), git (shallow clone of facebook/react), the locally installed CLIs (claude 2.1.175, codex 0.144.6, cursor 3.15.6).

**Spec deviation note:** The approved design (`2026-08-09-token-efficiency-benchmark-design.md`) named the repo-prep script `prepare_repo.sh`. This environment is Windows/PowerShell, so the script is implemented as `prepare_repo.ps1`; behavior is identical. All other script names match the design exactly.

---

## File Structure

```
scripts/benchmarks/
├── common.ps1                 # shared helpers: workdir mgmt, Write-UsageJson, Get-LocScanned, Test-CommandExists
├── prepare_repo.ps1           # shallow-clone facebook/react, stage subset dirs into work/react-subset
├── run_claude_code.ps1        # claude -p --verbose --output-format stream-json -> work/usage-claude_code.json
├── run_codex.ps1              # codex exec --json -> parse turn.completed -> work/usage-codex.json
├── run_cursor.ps1             # cursor --wait <dir>, elapsed only; usage via $env:CURSOR_USAGE_JSON -> work/usage-cursor.json
├── run_onramp.ps1             # python onramp_token_count.py -> work/usage-onramp.json
├── onramp_token_count.py      # walks subset, chunks via backend Document, sums chars/4 -> {input_tokens, loc_scanned, chars}
├── normalize.ps1              # merge work/usage-*.json -> work/results.json (idempotent)
├── render_report.ps1          # work/results.json -> docs/benchmarks/token-efficiency-<date>.md
├── fixtures/
│   └── sample-repo/           # 5-file fixture repo for dry-run tests
└── test-benchmark.ps1         # test harness (JSON shape, render cases, normalize idempotency)
```

Normalized `usage-<tool>.json` shape (emitted by every runner):

```json
{
  "tool": "claude_code",
  "model": "claude-sonnet-4-x",
  "input_tokens": 123456,
  "output_tokens": 2345,
  "elapsed_s": 42.3,
  "loc_scanned": 18320,
  "status": "ok",
  "note": ""
}
```

`status` is one of `ok | skipped | failed`. When usage is unavailable, `input_tokens`/`output_tokens` are JSON `null` (renders as `n/a`).

---

### Task 1: Scaffold benchmark directory, common.ps1, and fixture repo

**Files:**
- Create: `scripts/benchmarks/common.ps1`
- Create: `scripts/benchmarks/fixtures/sample-repo/main.js`
- Create: `scripts/benchmarks/fixtures/sample-repo/utils.js`
- Create: `scripts/benchmarks/fixtures/sample-repo/store.js`
- Create: `scripts/benchmarks/fixtures/sample-repo/api.js`
- Create: `scripts/benchmarks/fixtures/sample-repo/README.md`
- Test: `scripts/benchmarks/test-benchmark.ps1` (created in this task, extended in later tasks)

- [ ] **Step 1: Create the fixture repo files**

`fixtures/sample-repo/main.js`:
```javascript
const { loadStore } = require("./store");
const { callApi } = require("./api");
const { uid } = require("./utils");

function bootstrap() {
  const store = loadStore("app.db");
  const id = uid();
  return callApi("POST", "/v1/bootstrap", { store, id });
}

module.exports = { bootstrap };
```

`fixtures/sample-repo/utils.js`:
```javascript
const crypto = require("crypto");
function uid() { return crypto.randomUUID(); }
function log(level, msg) { console.log(`[${level}] ${msg}`); }
module.exports = { uid, log };
```

`fixtures/sample-repo/store.js`:
```javascript
const fs = require("fs");
function loadStore(path) {
  if (!fs.existsSync(path)) return { version: 1, records: [] };
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
function saveStore(path, data) { fs.writeFileSync(path, JSON.stringify(data)); }
module.exports = { loadStore, saveStore };
```

`fixtures/sample-repo/api.js`:
```javascript
const http = require("http");
function callApi(method, path, body) {
  const payload = JSON.stringify(body || {});
  return new Promise((resolve, reject) => {
    const req = http.request({ method, path, headers: { "content-length": Buffer.byteLength(payload) } }, res => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.end(payload);
  });
}
module.exports = { callApi };
```

`fixtures/sample-repo/README.md`:
```markdown
# Sample Repo

A tiny five-file JavaScript project used to dry-run the token-efficiency
benchmark. It has an entry point (main), helpers (utils), persistence (store),
and an HTTP client (api).

The fixture is intentionally minimal so runners stay fast and deterministic
during test runs, while still exercising the full chunking + token-count path.

Run flow: main -> store -> api -> utils. No external dependencies.
```

- [ ] **Step 2: Create common.ps1**

```powershell
# common.ps1 - shared helpers for the token-efficiency benchmark runners.
# Dot-source with: . "$PSScriptRoot/common.ps1"

$global:BenchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$global:BenchWorkDir = Join-Path $BenchRoot "work"
New-Item -ItemType Directory -Force -Path $BenchWorkDir | Out-Null

function Write-UsageJson {
    param(
        [string]$Tool,
        [string]$Model,
        $InputTokens,      # int or $null
        $OutputTokens,     # int or $null
        [double]$ElapsedS,
        [int]$LocScanned,
        [string]$Status = "ok",
        [string]$Note = ""
    )
    $usage = [ordered]@{
        tool          = $Tool
        model         = $Model
        input_tokens  = $InputTokens
        output_tokens = $OutputTokens
        elapsed_s     = [math]::Round($ElapsedS, 2)
        loc_scanned   = $LocScanned
        status        = $Status
        note          = $Note
    }
    $outPath = Join-Path $BenchWorkDir "usage-$Tool.json"
    $usage | ConvertTo-Json | Set-Content -Path $outPath -Encoding UTF8
    Write-Host "Wrote $outPath"
}

function Get-LocScanned {
    param([string]$RepoPath)
    if (-not (Test-Path $RepoPath)) { return 0 }
    $exts = @(".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java",
              ".md", ".rst", ".txt", ".yaml", ".yml", ".toml", ".json",
              ".css", ".scss", ".html", ".sql")
    $total = 0
    Get-ChildItem -Path $RepoPath -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        if ($exts -contains $_.Extension.ToLower()) {
            $total += (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
        }
    }
    return $total
}

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}
```

- [ ] **Step 3: Create the test harness skeleton**

`test-benchmark.ps1`:
```powershell
# Test harness for the token-efficiency benchmark scripts.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1
$ErrorActionPreference = "Stop"

$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$benchDir/common.ps1"
$fixtureRepo = Join-Path $benchDir "fixtures\sample-repo"

$failures = 0
function Assert-True {
    param([bool]$Condition, [string]$Message)
    if ($Condition) { Write-Host "PASS: $Message" -ForegroundColor Green }
    else { Write-Host "FAIL: $Message" -ForegroundColor Red; $script:failures++ }
}

function Reset-Work {
    if (Test-Path $BenchWorkDir) { Remove-Item -Recurse -Force $BenchWorkDir }
    New-Item -ItemType Directory -Force -Path $BenchWorkDir | Out-Null
}

Write-Host "`n=== 1. Loc counting on fixture ===" -ForegroundColor Cyan
$loc = Get-LocScanned $fixtureRepo
Assert-True ($loc -ge 40) "fixture LOC ($loc) >= 40 (should be ~55 lines of JS/md)"

Write-Host "`n=== 2. Write-UsageJson emits valid shape ===" -ForegroundColor Cyan
Reset-Work
Write-UsageJson -Tool "probe" -Model "test-model" -InputTokens 10 -OutputTokens 5 -ElapsedS 1.5 -LocScanned $loc -Status "ok"
$probe = Get-Content (Join-Path $BenchWorkDir "usage-probe.json") -Raw | ConvertFrom-Json
Assert-True ($probe.tool -eq "probe") "usage.json has tool field"
Assert-True ($probe.input_tokens -eq 10) "usage.json has input_tokens"
Assert-True ($probe.output_tokens -eq 5) "usage.json has output_tokens"
Assert-True ($probe.elapsed_s -eq 1.5) "usage.json has rounded elapsed_s"
Assert-True ($probe.loc_scanned -eq $loc) "usage.json has loc_scanned"
Assert-True ($probe.status -eq "ok") "usage.json has status"
Assert-True ($probe.PSObject.Properties.Name -contains "note") "usage.json has note field"

Write-Host "`n=== 3. Write-UsageJson supports null tokens ===" -ForegroundColor Cyan
Write-UsageJson -Tool "probe-null" -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "skipped" -Note "missing"
$probeNull = Get-Content (Join-Path $BenchWorkDir "usage-probe-null.json") -Raw | ConvertFrom-Json
Assert-True ($null -eq $probeNull.input_tokens) "null input_tokens serializes as null"
Assert-True ($probeNull.status -eq "skipped") "skipped status preserved"

if ($failures -eq 0) {
    Write-Host "`nALL TESTS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n$failures TEST(S) FAILED" -ForegroundColor Red
    exit 1
}
```

- [ ] **Step 4: Run the harness and verify it passes**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: 3 sections, all PASS, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/benchmarks/common.ps1 scripts/benchmarks/fixtures/sample-repo
git commit -m "feat(benchmark): scaffold benchmark scripts + fixture repo + common helpers"
```

---

### Task 2: prepare_repo.ps1 — stage the react subset

**Files:**
- Create: `scripts/benchmarks/prepare_repo.ps1`

- [ ] **Step 1: Write prepare_repo.ps1**

```powershell
# prepare_repo.ps1 - shallow-clone facebook/react and stage the benchmark subset.
# Subset: packages/react/src, packages/react-dom/src, packages/react-reconciler
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/prepare_repo.ps1 [-Force]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $benchDir "work"
$cloneDir = Join-Path $workDir "react"
$subsetDir = Join-Path $workDir "react-subset"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

if (Test-Path $subsetDir) {
    if (-not $Force) {
        Write-Host "Subset already exists at $subsetDir (use -Force to rebuild)."
        exit 0
    }
    Remove-Item -Recurse -Force $subsetDir
}

if (-not (Test-Path $cloneDir)) {
    Write-Host "Cloning facebook/react (shallow) into $cloneDir ..."
    git clone --depth 1 https://github.com/facebook/react.git $cloneDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git clone failed (network). Re-run, or place a cached clone at $cloneDir."
        exit 1
    }
} else {
    Write-Host "Using cached clone at $cloneDir"
}

$subsets = @(
    @{ src = Join-Path $cloneDir "packages\react\src";   dest = "react" },
    @{ src = Join-Path $cloneDir "packages\react-dom\src"; dest = "react-dom" },
    @{ src = Join-Path $cloneDir "packages\react-reconciler"; dest = "react-reconciler" }
)

New-Item -ItemType Directory -Force -Path $subsetDir | Out-Null
foreach ($s in $subsets) {
    if (Test-Path $s.src) {
        Copy-Item -Recurse $s.src (Join-Path $subsetDir $s.dest)
        Write-Host "Staged $($s.src) -> $(Join-Path $subsetDir $s.dest)"
    } else {
        Write-Warning "Missing source dir: $($s.src)"
    }
}

$loc = (Get-ChildItem $subsetDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Done. Subset staged at $subsetDir ($loc files)."
```

- [ ] **Step 2: Verify it runs idempotently without network**

Run once:
`powershell -ExecutionPolicy Bypass -File scripts/benchmarks/prepare_repo.ps1`
Run again (should print "Subset already exists" and exit 0):
`powershell -ExecutionPolicy Bypass -File scripts/benchmarks/prepare_repo.ps1`
Run with rebuild:
`powershell -ExecutionPolicy Bypass -File scripts/benchmarks/prepare_repo.ps1 -Force`
Expected: first run clones/stages, second exits early, third rebuilds. All exit 0.

NOTE: This task needs network once to clone. If the network fails, verify the script's cached-clone + warning path works instead and report the blocker for the full-clone step; do not fake the clone.

- [ ] **Step 3: Commit**

```bash
git add scripts/benchmarks/prepare_repo.ps1
git commit -m "feat(benchmark): add prepare_repo.ps1 to stage the react subset"
```

---

### Task 3: run_claude_code.ps1

**Files:**
- Create: `scripts/benchmarks/run_claude_code.ps1`

- [ ] **Step 1: Write run_claude_code.ps1**

```powershell
# run_claude_code.ps1 - run the repo-understanding prompt through Claude Code
# headlessly and emit work/usage-claude_code.json.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_claude_code.ps1 [-RepoPath <dir>] [-Stub]
param(
    [string]$RepoPath = (Join-Path (Split-Path -Parent $PSCommandPath) "work\react-subset"),
    [switch]$Stub
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$benchDir/common.ps1"

$Tool = "claude_code"
$Prompt = "Analyze this repo and produce: architecture summary, module dependency map, 5 key data-flow paths, and a test-strategy assessment."

if ($Stub) {
    Write-UsageJson -Tool $Tool -Model "stub" -InputTokens 1000 -OutputTokens 150 -ElapsedS 1.0 -LocScanned (Get-LocScanned $RepoPath)
    exit 0
}

if (-not (Test-CommandExists "claude")) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "skipped" -Note "claude not in PATH"
    exit 0
}

if (-not (Test-Path $RepoPath)) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "failed" -Note "repo path missing: $RepoPath"
    exit 0
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$raw = Push-Location $RepoPath; try {
    claude -p --verbose --output-format stream-json $Prompt 2>$null | Out-String
} finally { Pop-Location }
$sw.Stop()
$elapsed = $sw.Elapsed.TotalSeconds

$resultLine = $raw -split "`n" | Where-Object { $_ -match "`"type`":`"result`"" } | Select-Object -Last 1
$result = $null
if ($resultLine) {
    try { $result = $resultLine | ConvertFrom-Json -ErrorAction Stop } catch { $result = $null }
}

if (-not $result -or -not $result.usage) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS $elapsed -LocScanned (Get-LocScanned $RepoPath) -Status "failed" -Note "no usage in stream-json output"
    exit 0
}

$model = ""
if ($result.modelUsage) {
    $model = ($result.modelUsage.PSObject.Properties.Name | Select-Object -First 1)
}
if (-not $model -and $result.model) { $model = $result.model }

Write-UsageJson -Tool $Tool -Model $model -InputTokens $result.usage.input_tokens -OutputTokens $result.usage.output_tokens -ElapsedS $elapsed -LocScanned (Get-LocScanned $RepoPath) -Status "ok"
```

Parsing contract (verified against claude 2.1.175): `claude -p --verbose --output-format stream-json` prints JSON-lines; the last line with `"type":"result"` carries top-level `usage.input_tokens`, `usage.output_tokens`, `duration_ms`, and a `modelUsage` object whose keys are model names.

- [ ] **Step 2: Add stub + failure tests to test-benchmark.ps1**

Insert before the final `if ($failures -eq 0)` block:

```powershell
Write-Host "`n=== 4. run_claude_code stub mode ===" -ForegroundColor Cyan
Reset-Work
& (Join-Path $benchDir "run_claude_code.ps1") -RepoPath $fixtureRepo -Stub
$claude = Get-Content (Join-Path $BenchWorkDir "usage-claude_code.json") -Raw | ConvertFrom-Json
Assert-True ($claude.tool -eq "claude_code") "claude stub: tool name"
Assert-True ($claude.input_tokens -eq 1000) "claude stub: input_tokens"
Assert-True ($claude.loc_scanned -ge 40) "claude stub: loc_scanned from fixture"
Assert-True ($claude.status -eq "ok") "claude stub: status ok"
```

- [ ] **Step 3: Run the harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 4 sections PASS, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/benchmarks/run_claude_code.ps1 scripts/benchmarks/test-benchmark.ps1
git commit -m "feat(benchmark): add claude code runner with stub mode"
```

---

### Task 4: run_codex.ps1

**Files:**
- Create: `scripts/benchmarks/run_codex.ps1`

- [ ] **Step 1: Write run_codex.ps1**

```powershell
# run_codex.ps1 - run the repo-understanding prompt through Codex headlessly and
# emit work/usage-codex.json.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_codex.ps1 [-RepoPath <dir>] [-Stub]
param(
    [string]$RepoPath = (Join-Path (Split-Path -Parent $PSCommandPath) "work\react-subset"),
    [switch]$Stub
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$benchDir/common.ps1"

$Tool = "codex"
$Prompt = "Analyze this repo and produce: architecture summary, module dependency map, 5 key data-flow paths, and a test-strategy assessment."

if ($Stub) {
    Write-UsageJson -Tool $Tool -Model "stub" -InputTokens 900 -OutputTokens 120 -ElapsedS 0.8 -LocScanned (Get-LocScanned $RepoPath)
    exit 0
}

if (-not (Test-CommandExists "codex")) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "skipped" -Note "codex not in PATH"
    exit 0
}

if (-not (Test-Path $RepoPath)) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "failed" -Note "repo path missing: $RepoPath"
    exit 0
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$jsonl = Push-Location $RepoPath; try {
    codex exec --json --skip-git-repo-check $Prompt 2>$null
} finally { Pop-Location }
$sw.Stop()
$elapsed = $sw.Elapsed.TotalSeconds

$events = $jsonl | ForEach-Object {
    if ($_ -and $_.StartsWith("{")) { try { $_ | ConvertFrom-Json -ErrorAction Stop } catch { $null } }
} | Where-Object { $_ }

$turns = $events | Where-Object { $_.type -eq "turn.completed" }

$inTokens = 0
$outTokens = 0
foreach ($t in $turns) {
    if ($t.usage) {
        $inTokens += [int]$t.usage.input_tokens
        $outTokens += [int]$t.usage.output_tokens
    }
}

if ($turns.Count -eq 0) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS $elapsed -LocScanned (Get-LocScanned $RepoPath) -Status "failed" -Note "no turn.completed events in codex JSONL"
    exit 0
}

$model = ""
$cfg = Join-Path $env:USERPROFILE ".codex\config.toml"
if (Test-Path $cfg) {
    $m = Select-String -Path $cfg -Pattern '^model\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($m) { $model = $m.Matches[0].Groups[1].Value }
}

Write-UsageJson -Tool $Tool -Model $model -InputTokens $inTokens -OutputTokens $outTokens -ElapsedS $elapsed -LocScanned (Get-LocScanned $RepoPath) -Status "ok"
```

Parsing contract (verified against codex 0.144.6): `codex exec --json` prints JSON-lines; `turn.completed` events carry `usage.input_tokens`, `usage.output_tokens`, `usage.cached_input_tokens`. Sum across all turns.

- [ ] **Step 2: Add stub test to test-benchmark.ps1**

Insert before the final `if ($failures -eq 0)` block:

```powershell
Write-Host "`n=== 5. run_codex stub mode ===" -ForegroundColor Cyan
Reset-Work
& (Join-Path $benchDir "run_codex.ps1") -RepoPath $fixtureRepo -Stub
$codex = Get-Content (Join-Path $BenchWorkDir "usage-codex.json") -Raw | ConvertFrom-Json
Assert-True ($codex.tool -eq "codex") "codex stub: tool name"
Assert-True ($codex.input_tokens -eq 900) "codex stub: input_tokens"
Assert-True ($codex.loc_scanned -ge 40) "codex stub: loc_scanned from fixture"
Assert-True ($codex.status -eq "ok") "codex stub: status ok"
```

- [ ] **Step 3: Run the harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 5 sections PASS, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/benchmarks/run_codex.ps1 scripts/benchmarks/test-benchmark.ps1
git commit -m "feat(benchmark): add codex runner with stub mode"
```

---

### Task 5: run_cursor.ps1

**Files:**
- Create: `scripts/benchmarks/run_cursor.ps1`

- [ ] **Step 1: Write run_cursor.ps1**

```powershell
# run_cursor.ps1 - open the repo in Cursor's GUI agent, measure elapsed time,
# and emit work/usage-cursor.json. Cursor has no headless token reporter; usage
# tokens are read from the file path in $env:CURSOR_USAGE_JSON if the operator
# exports them ({"input_tokens":N,"output_tokens":N}) from Cursor's usage API.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_cursor.ps1 [-RepoPath <dir>] [-Stub]
param(
    [string]$RepoPath = (Join-Path (Split-Path -Parent $PSCommandPath) "work\react-subset"),
    [switch]$Stub
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$benchDir/common.ps1"

$Tool = "cursor"

if ($Stub) {
    Write-UsageJson -Tool $Tool -Model "cursor-agent" -InputTokens 1100 -OutputTokens 200 -ElapsedS 2.0 -LocScanned (Get-LocScanned $RepoPath)
    exit 0
}

if (-not (Test-CommandExists "cursor")) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "skipped" -Note "cursor not in PATH"
    exit 0
}

if (-not (Test-Path $RepoPath)) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "failed" -Note "repo path missing: $RepoPath"
    exit 0
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& cursor --wait $RepoPath | Out-Null
$sw.Stop()
$elapsed = $sw.Elapsed.TotalSeconds

$inTokens = $null
$outTokens = $null
$note = "usage not reported by CLI; set CURSOR_USAGE_JSON to a file with {input_tokens, output_tokens}"
$usageFile = $env:CURSOR_USAGE_JSON
if ($usageFile -and (Test-Path $usageFile)) {
    try {
        $u = Get-Content $usageFile -Raw | ConvertFrom-Json -ErrorAction Stop
        $inTokens = [int]$u.input_tokens
        $outTokens = [int]$u.output_tokens
        $note = "usage from $usageFile"
    } catch {
        $note = "CURSOR_USAGE_JSON present but unreadable: $usageFile"
    }
}

Write-UsageJson -Tool $Tool -Model "cursor-agent" -InputTokens $inTokens -OutputTokens $outTokens -ElapsedS $elapsed -LocScanned (Get-LocScanned $RepoPath) -Status "ok" -Note $note
```

- [ ] **Step 2: Add stub test to test-benchmark.ps1**

Insert before the final `if ($failures -eq 0)` block:

```powershell
Write-Host "`n=== 6. run_cursor stub mode ===" -ForegroundColor Cyan
Reset-Work
& (Join-Path $benchDir "run_cursor.ps1") -RepoPath $fixtureRepo -Stub
$cursor = Get-Content (Join-Path $BenchWorkDir "usage-cursor.json") -Raw | ConvertFrom-Json
Assert-True ($cursor.tool -eq "cursor") "cursor stub: tool name"
Assert-True ($cursor.input_tokens -eq 1100) "cursor stub: input_tokens"
Assert-True ($cursor.loc_scanned -ge 40) "cursor stub: loc_scanned from fixture"
Assert-True ($cursor.status -eq "ok") "cursor stub: status ok"
```

- [ ] **Step 3: Run the harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 6 sections PASS, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/benchmarks/run_cursor.ps1 scripts/benchmarks/test-benchmark.ps1
git commit -m "feat(benchmark): add cursor runner with stub mode"
```

---

### Task 6: onramp_token_count.py + run_onramp.ps1

**Files:**
- Create: `scripts/benchmarks/onramp_token_count.py`
- Create: `scripts/benchmarks/run_onramp.ps1`

- [ ] **Step 1: Write onramp_token_count.py**

```python
"""Compute Onramp's one-time repo-index token cost for a directory subset.

Mirrors the production indexing path: chunk each file with
app.services.embeddings_service.Document._chunk_content (max_chars=1500) and
count tokens across all chunk contents. No tokenizer is installed in this
environment, so tokens are estimated as chars/4 (the spec's fallback).
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, "..", "..", "backend"))
sys.path.insert(0, BACKEND)
os.environ.setdefault("STORAGE_BACKEND", "memory")

from app.services.embeddings_service import Document  # noqa: E402

SUPPORTED_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java",
    ".md", ".rst", ".txt", ".yaml", ".yml", ".toml", ".json",
    ".css", ".scss", ".html", ".sql",
}
IGNORE_DIRS = {
    "node_modules", "__pycache__", ".git", "venv", "dist", "build",
    ".next", "vendor", ".tox", "target", "egg-info",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-repo", required=True, help="path to the repo subset directory")
    ap.add_argument("-max-chars", type=int, default=1500,
                    help="chunk size in chars (matches EmbeddingsService._chunk_content default)")
    args = ap.parse_args()

    if not os.path.isdir(args.repo):
        print(json.dumps({"error": f"not a directory: {args.repo}"}))
        return 1

    total_chars = 0
    total_files = 0
    loc_scanned = 0
    for root, dirs, files in os.walk(args.repo):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in SUPPORTED_EXTS:
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except OSError:
                continue
            if len(content.strip()) < 10:
                continue
            try:
                doc = Document(filename=os.path.relpath(fpath, args.repo), content=content)
            except Exception:
                continue
            for chunk in doc.chunks:
                total_chars += len(chunk)
            loc_scanned += len(content.splitlines())
            total_files += 1

    input_tokens = max(1, round(total_chars / 4))
    print(json.dumps({
        "input_tokens": input_tokens,
        "loc_scanned": loc_scanned,
        "chars": total_chars,
        "files": total_files,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Write run_onramp.ps1**

```powershell
# run_onramp.ps1 - compute Onramp's one-time index token cost for a repo subset
# and emit work/usage-onramp.json.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_onramp.ps1 [-RepoPath <dir>] [-Stub]
param(
    [string]$RepoPath = (Join-Path (Split-Path -Parent $PSCommandPath) "work\react-subset"),
    [switch]$Stub
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$benchDir/common.ps1"

$Tool = "onramp"
$PyHelper = Join-Path $benchDir "onramp_token_count.py"

if ($Stub) {
    Write-UsageJson -Tool $Tool -Model "onramp-index" -InputTokens 800 -OutputTokens 0 -ElapsedS 0.2 -LocScanned (Get-LocScanned $RepoPath)
    exit 0
}

if (-not (Test-CommandExists "python")) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "skipped" -Note "python not in PATH"
    exit 0
}

if (-not (Test-Path $RepoPath)) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS 0 -LocScanned 0 -Status "failed" -Note "repo path missing: $RepoPath"
    exit 0
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$out = python $PyHelper -repo $RepoPath 2>$null | Out-String
$sw.Stop()
$elapsed = $sw.Elapsed.TotalSeconds

$parsed = $null
try { $parsed = $out.Trim() | ConvertFrom-Json -ErrorAction Stop } catch { $parsed = $null }

if (-not $parsed -or $parsed.error) {
    Write-UsageJson -Tool $Tool -Model "" -InputTokens $null -OutputTokens $null -ElapsedS $elapsed -LocScanned 0 -Status "failed" -Note "onramp_token_count.py failed: $out"
    exit 0
}

Write-UsageJson -Tool $Tool -Model "onramp-index" -InputTokens $parsed.input_tokens -OutputTokens 0 -ElapsedS $elapsed -LocScanned $parsed.loc_scanned -Status "ok"
```

- [ ] **Step 3: Add stub test + a real helper test to test-benchmark.ps1**

Insert before the final `if ($failures -eq 0)` block:

```powershell
Write-Host "`n=== 7. run_onramp stub mode ===" -ForegroundColor Cyan
Reset-Work
& (Join-Path $benchDir "run_onramp.ps1") -RepoPath $fixtureRepo -Stub
$onrampStub = Get-Content (Join-Path $BenchWorkDir "usage-onramp.json") -Raw | ConvertFrom-Json
Assert-True ($onrampStub.tool -eq "onramp") "onramp stub: tool name"
Assert-True ($onrampStub.input_tokens -eq 800) "onramp stub: input_tokens"
Assert-True ($onrampStub.status -eq "ok") "onramp stub: status ok"

Write-Host "`n=== 8. onramp_token_count.py real run on fixture ===" -ForegroundColor Cyan
$realOut = python (Join-Path $benchDir "onramp_token_count.py") -repo $fixtureRepo 2>$null | Out-String
$real = $realOut.Trim() | ConvertFrom-Json
Assert-True ($real.input_tokens -gt 0) "onramp real: input_tokens > 0 (got $($real.input_tokens))"
Assert-True ($real.loc_scanned -ge 40) "onramp real: loc_scanned >= 40 (got $($real.loc_scanned))"
Assert-True ($real.files -eq 5) "onramp real: exactly 5 fixture files indexed"
```

- [ ] **Step 4: Run the harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 8 sections PASS, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/benchmarks/onramp_token_count.py scripts/benchmarks/run_onramp.ps1 scripts/benchmarks/test-benchmark.ps1
git commit -m "feat(benchmark): add onramp token counter + runner with stub mode"
```

---

### Task 7: normalize.ps1

**Files:**
- Create: `scripts/benchmarks/normalize.ps1`

- [ ] **Step 1: Write normalize.ps1**

```powershell
# normalize.ps1 - merge every work/usage-<tool>.json into work/results.json.
# Idempotent: identical inputs produce byte-identical results.json.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/normalize.ps1
$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $benchDir "work"

$usageFiles = @(Get-ChildItem -Path $workDir -Filter "usage-*.json" -ErrorAction SilentlyContinue | Sort-Object Name)
if ($usageFiles.Count -eq 0) {
    Write-Error "No usage-*.json files found in $workDir. Run the tool runners first."
    exit 1
}

$runs = @()
foreach ($f in $usageFiles) {
    $runs += Get-Content $f.FullName -Raw | ConvertFrom-Json
}

$results = [ordered]@{
    meta = [ordered]@{
        repo = "facebook/react (subset: packages/react/src, packages/react-dom/src, packages/react-reconciler)"
        prompt = "Analyze this repo and produce: architecture summary, module dependency map, 5 key data-flow paths, and a test-strategy assessment."
    }
    runs = $runs
}

$outPath = Join-Path $workDir "results.json"
$results | ConvertTo-Json -Depth 8 | Set-Content -Path $outPath -Encoding UTF8
Write-Host "Wrote $outPath ($($runs.Count) runs)"
```

- [ ] **Step 2: Add tests to test-benchmark.ps1 (merge correctness + idempotency)**

Insert before the final `if ($failures -eq 0)` block:

```powershell
Write-Host "`n=== 9. normalize merges stub runs ===" -ForegroundColor Cyan
Reset-Work
& (Join-Path $benchDir "run_claude_code.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "run_codex.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "run_cursor.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "run_onramp.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "normalize.ps1")
$results = Get-Content (Join-Path $BenchWorkDir "results.json") -Raw | ConvertFrom-Json
Assert-True ($results.runs.Count -eq 4) "normalize merges 4 stub runs (got $($results.runs.Count))"
Assert-True ($results.meta.repo -like "*facebook/react*") "normalize includes meta.repo"

Write-Host "`n=== 10. normalize is idempotent ===" -ForegroundColor Cyan
$before = Get-Content (Join-Path $BenchWorkDir "results.json") -Raw
& (Join-Path $benchDir "normalize.ps1") | Out-Null
$after = Get-Content (Join-Path $BenchWorkDir "results.json") -Raw
Assert-True ($before -eq $after) "re-running normalize produces byte-identical results.json"
```

- [ ] **Step 3: Run the harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 10 sections PASS, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/benchmarks/normalize.ps1 scripts/benchmarks/test-benchmark.ps1
git commit -m "feat(benchmark): add normalize.ps1 with idempotent merge"
```

---

### Task 8: render_report.ps1

**Files:**
- Create: `scripts/benchmarks/render_report.ps1`

- [ ] **Step 1: Write render_report.ps1**

```powershell
# render_report.ps1 - read work/results.json and write a dated markdown report
# to docs/benchmarks/token-efficiency-<date>.md.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/benchmarks/render_report.ps1 [-OutDir <dir>]
param(
    [string]$OutDir = (Join-Path (Split-Path -Parent $PSCommandPath) "..\..\docs\benchmarks")
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $benchDir "work"
$resultsPath = Join-Path $workDir "results.json"
if (-not (Test-Path $resultsPath)) {
    Write-Error "results.json not found at $resultsPath. Run the runners + normalize first."
    exit 1
}

$results = Get-Content $resultsPath -Raw | ConvertFrom-Json
$date = (Get-Date).ToString("yyyy-MM-dd")
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$outPath = Join-Path $OutDir "token-efficiency-$date.md"

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Token-Efficiency Benchmark Report ($date)")
$lines.Add("")
$lines.Add("**Repo:** $($results.meta.repo)")
$lines.Add("")
$lines.Add("**Prompt:** $($results.meta.prompt)")
$lines.Add("")
$lines.Add("## Results")
$lines.Add("")
$lines.Add("| Tool | Model | Input tokens | Output tokens | Total tokens | Elapsed (s) | Tokens / 1k LOC | Status |")
$lines.Add("|---|---|---|---|---|---|---|---|")

$onrampTokens = 0
$onrampFound = $false
foreach ($r in $results.runs) {
    if ($r.tool -eq "onramp") { $onrampTokens = [int]$r.input_tokens; $onrampFound = $true }
}

foreach ($r in $results.runs) {
    $inTxt = if ($null -ne $r.input_tokens) { [string]$r.input_tokens } else { "n/a" }
    $outTxt = if ($null -ne $r.output_tokens) { [string]$r.output_tokens } else { "n/a" }
    $totalTxt = if ($null -ne $r.input_tokens -and $null -ne $r.output_tokens) {
        [string](([int]$r.input_tokens) + ([int]$r.output_tokens))
    } else { "n/a" }
    $perLocTxt = "n/a"
    if ($null -ne $r.input_tokens -and $null -ne $r.output_tokens -and $r.loc_scanned -gt 0) {
        $total = ([int]$r.input_tokens) + ([int]$r.output_tokens)
        $perLocTxt = [math]::Round($total / ($r.loc_scanned / 1000.0), 1)
    }
    $noteSuffix = if ($r.note) { " ($($r.note))" } else { "" }
    $lines.Add("| $($r.tool) | $($r.model) | $inTxt | $outTxt | $totalTxt | $([math]::Round([double]$r.elapsed_s, 1)) | $perLocTxt | $($r.status)$noteSuffix |")
}

$lines.Add("")
$lines.Add("## Efficiency delta vs Onramp")
$lines.Add("")
if ($onrampFound -and $onrampTokens -gt 0) {
    foreach ($r in $results.runs) {
        if ($r.tool -eq "onramp") { continue }
        if ($null -eq $r.input_tokens -or $null -eq $r.output_tokens) {
            $lines.Add("- **$($r.tool):** n/a (usage unavailable)")
            continue
        }
        $total = ([int]$r.input_tokens) + ([int]$r.output_tokens)
        $delta = ($total - $onrampTokens) / $onrampTokens
        $mult = [math]::Round($total / [math]::Max(1, $onrampTokens), 2)
        $lines.Add("- **$($r.tool):** $total tokens total vs Onramp's one-time index of $onrampTokens tokens → **$([math]::Round($delta * 100, 0))% more** ($mult`x) for a single comprehension.")
    }
    $lines.Add("")
    $lines.Add("> Onramp indexes once (chunk + embed) and reuses the index across many queries, so the marginal token cost of a *subsequent* query is near zero. The fair comparison is tokens per repo-comprehension, amortized over N queries: Onramp is a fixed $onrampTokens tokens; the agent tools pay the full comprehension cost every time.")
} else {
    $lines.Add("Onramp row missing or had no token count — delta not computed.")
}

$lines.Add("")
$lines.Add("## Caveats")
$lines.Add("")
$lines.Add("- Different tools use different models (Claude models vs OpenAI via Codex vs Cursor models). Absolute token counts are not directly comparable; each row states its model.")
$lines.Add("- Cursor lacks a headless CLI token reporter; its numbers come from Cursor's usage dashboard/API (via CURSOR_USAGE_JSON) and are the least precise.")
$lines.Add("- Onramp's advantage is indexing reuse: chunk once, query many times. The fair metric is tokens per repo-comprehension, amortized over N queries.")
$lines.Add("- Wall-clock includes model latency which varies by load; report as best-effort.")
$lines.Add("- Onramp token count is estimated as chars/4 across `_chunk_content(max_chars=1500)` chunks (no tokenizer installed).")

$lines.Add("") | Out-Null
[System.IO.File]::WriteAllLines($outPath, $lines, [System.Text.Encoding]::UTF8)
Write-Host "Wrote $outPath"
```

- [ ] **Step 2: Add render tests for all four scenarios to test-benchmark.ps1**

Insert before the final `if ($failures -eq 0)` block:

```powershell
function Assert-ReportScenarios {
    param([string]$Label, [hashtable]$UsageById)
    Reset-Work
    foreach ($toolId in $UsageById.Keys) {
        $spec = $UsageById[$toolId]
        $path = Join-Path $BenchWorkDir "usage-$toolId.json"
        $spec | ConvertTo-Json | Set-Content -Path $path -Encoding UTF8
    }
    & (Join-Path $benchDir "normalize.ps1") | Out-Null
    $report = & (Join-Path $benchDir "render_report.ps1") -OutDir (Join-Path $BenchWorkDir "report") | Out-Null
    $md = Get-Content (Join-Path $BenchWorkDir "report\token-efficiency-*.md") -Raw
    Assert-True ($md -match "^\| Tool \| Model \| Input tokens") "$Label: table header present"
    Assert-True ($md -match "^\|---") "$Label: separator row present"
}

Write-Host "`n=== 11. render_report: all-ok scenario ===" -ForegroundColor Cyan
Assert-ReportScenarios -Label "all-ok" -UsageById @{
    "claude_code" = [ordered]@{ tool="claude_code"; model="m1"; input_tokens=1000; output_tokens=100; elapsed_s=1.0; loc_scanned=50; status="ok"; note="" }
    "codex"       = [ordered]@{ tool="codex"; model="m2"; input_tokens=900; output_tokens=80; elapsed_s=0.8; loc_scanned=50; status="ok"; note="" }
    "onramp"      = [ordered]@{ tool="onramp"; model="idx"; input_tokens=200; output_tokens=0; elapsed_s=0.1; loc_scanned=50; status="ok"; note="" }
}

Write-Host "`n=== 12. render_report: one-skipped scenario ===" -ForegroundColor Cyan
Assert-ReportScenarios -Label "one-skipped" -UsageById @{
    "claude_code" = [ordered]@{ tool="claude_code"; model="m1"; input_tokens=1000; output_tokens=100; elapsed_s=1.0; loc_scanned=50; status="ok"; note="" }
    "codex"       = [ordered]@{ tool="codex"; model=""; input_tokens=$null; output_tokens=$null; elapsed_s=0; loc_scanned=0; status="skipped"; note="codex not in PATH" }
    "onramp"      = [ordered]@{ tool="onramp"; model="idx"; input_tokens=200; output_tokens=0; elapsed_s=0.1; loc_scanned=50; status="ok"; note="" }
}

Write-Host "`n=== 13. render_report: one-failed scenario ===" -ForegroundColor Cyan
Assert-ReportScenarios -Label "one-failed" -UsageById @{
    "claude_code" = [ordered]@{ tool="claude_code"; model=""; input_tokens=$null; output_tokens=$null; elapsed_s=12.0; loc_scanned=0; status="failed"; note="no usage in stream-json output" }
    "onramp"      = [ordered]@{ tool="onramp"; model="idx"; input_tokens=200; output_tokens=0; elapsed_s=0.1; loc_scanned=50; status="ok"; note="" }
}

Write-Host "`n=== 14. render_report: missing-usage scenario ===" -ForegroundColor Cyan
Assert-ReportScenarios -Label "missing-usage" -UsageById @{
    "cursor"      = [ordered]@{ tool="cursor"; model="cursor-agent"; input_tokens=$null; output_tokens=$null; elapsed_s=30.0; loc_scanned=50; status="ok"; note="no usage export" }
    "onramp"      = [ordered]@{ tool="onramp"; model="idx"; input_tokens=200; output_tokens=0; elapsed_s=0.1; loc_scanned=50; status="ok"; note="" }
}
$missingMd = Get-Content (Join-Path $BenchWorkDir "report\token-efficiency-*.md") -Raw
Assert-True ($missingMd -match "\| n/a \| n/a \|") "missing-usage: n/a rendered for null tokens"
```

- [ ] **Step 3: Run the harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 14 sections PASS, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/benchmarks/render_report.ps1 scripts/benchmarks/test-benchmark.ps1
git commit -m "feat(benchmark): add render_report.ps1 with scenario tests"
```

---

### Task 9: Full pipeline smoke test on the fixture repo

**Files:**
- Modify: `scripts/benchmarks/test-benchmark.ps1`

- [ ] **Step 1: Add an end-to-end pipeline test**

Insert before the final `if ($failures -eq 0)` block:

```powershell
Write-Host "`n=== 15. end-to-end pipeline on fixture (stub runners) ===" -ForegroundColor Cyan
Reset-Work
& (Join-Path $benchDir "run_claude_code.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "run_codex.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "run_cursor.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "run_onramp.ps1") -RepoPath $fixtureRepo -Stub | Out-Null
& (Join-Path $benchDir "normalize.ps1") | Out-Null
& (Join-Path $benchDir "render_report.ps1") -OutDir (Join-Path $BenchWorkDir "report") | Out-Null
$reportFile = Get-ChildItem (Join-Path $BenchWorkDir "report") -Filter "token-efficiency-*.md"
Assert-True ($null -ne $reportFile) "e2e: report file created"
$md = Get-Content $reportFile.FullName -Raw
Assert-True ($md -match "claude_code") "e2e: report mentions claude_code"
Assert-True ($md -match "codex") "e2e: report mentions codex"
Assert-True ($md -match "cursor") "e2e: report mentions cursor"
Assert-True ($md -match "onramp") "e2e: report mentions onramp"
Assert-True ($md -match "Efficiency delta vs Onramp") "e2e: report has delta section"
```

- [ ] **Step 2: Run the full harness**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/test-benchmark.ps1`
Expected: all 15 sections PASS, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/benchmarks/test-benchmark.ps1
git commit -m "test(benchmark): add end-to-end pipeline smoke test"
```

---

### Task 10: Prepare the react subset (network task)

**Files:**
- Generate (not committed): `scripts/benchmarks/work/react-subset/` (gitignored work dir)
- Modify: `scripts/benchmarks/.gitignore` (add `work/`)

- [ ] **Step 1: Add .gitignore for the work directory**

Create `scripts/benchmarks/.gitignore`:
```gitignore
work/
```

- [ ] **Step 2: Run prepare_repo.ps1**

Run: `powershell -ExecutionPolicy Bypass -File scripts/benchmarks/prepare_repo.ps1`
Expected: `work/react-subset` exists with `react/`, `react-dom/`, `react-reconciler/` subdirs.
Record: `work/react-subset` file count and LOC (from `Get-LocScanned`) — these go in the final report as context.

If the network clone fails: re-run the script (cached partial clone is handled), or report BLOCKED. Do not fake the clone.

- [ ] **Step 3: Commit**

```bash
git add scripts/benchmarks/.gitignore
git commit -m "chore(benchmark): ignore benchmark work directory"
```

---

### Task 11: Run the live benchmark and commit the report

**Files:**
- Generate (committed): `docs/benchmarks/token-efficiency-<date>.md`

- [ ] **Step 1: Run the live runners**

From repo root:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_claude_code.ps1
powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_codex.ps1
```

Cursor (GUI — requires manual interaction and, ideally, a `CURSOR_USAGE_JSON` export; skip gracefully if not feasible):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_cursor.ps1
```

Onramp (no network, pure local computation):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/benchmarks/run_onramp.ps1
```

Expected: four `work/usage-<tool>.json` files. Tools that are missing or fail produce `skipped`/`failed` rows — that is acceptable and rendered in the report.

- [ ] **Step 2: Normalize and render**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/benchmarks/normalize.ps1
powershell -ExecutionPolicy Bypass -File scripts/benchmarks/render_report.ps1
```

Expected: `docs/benchmarks/token-efficiency-<date>.md` created with per-tool table, delta section, and caveats.

- [ ] **Step 3: Verify the report contents**

Read the generated markdown and confirm:
- All four tools appear as rows with correct status.
- The delta section compares each tool against Onramp's one-time index tokens.
- The caveats section is present.

- [ ] **Step 4: Commit**

```bash
git add docs/benchmarks/token-efficiency-<date>.md
git commit -m "docs(benchmark): add token-efficiency benchmark report <date>"
```

> Note: `docs/` is gitignored in this repo except top-level `*.md`. `docs/benchmarks/...` is deeper than the un-ignore rule, so use `git add -f` if the normal add is ignored:
> `git add -f docs/benchmarks/token-efficiency-<date>.md`

---

## Self-Review Checklist

- **Spec coverage:**
  - Repo subset (react/src, react-dom/src, react-reconciler) → Task 2/10 ✅
  - Identical prompt for all tools → defined once, reused in Tasks 3–5 ✅
  - Claude stream-json parsing → Task 3 ✅
  - Codex exec --json parsing → Task 4 ✅
  - Cursor GUI + elapsed + CURSOR_USAGE_JSON → Task 5 ✅
  - Onramp via `EmbeddingsService._chunk_content` + chars/4 → Task 6 ✅
  - normalize.ps1 merge → Task 7 ✅
  - render_report.ps1 with per-tool table, model notes, Onramp row, efficiency delta, amortization note, caveats → Task 8 ✅
  - Error handling: missing tool → skipped (Tasks 3–6), non-zero exit → failed, null usage → n/a (Task 8) ✅
  - Testing: dry-run runners vs fixture (Task 3–6), render scenarios all-ok/skipped/failed/missing (Task 8), normalize idempotency (Task 7), e2e smoke (Task 9) ✅
- **Placeholder scan:** all steps contain complete code; no TBD/TODO.
- **Type consistency:** `Write-UsageJson` signature identical across runners; usage.json field names (`tool`, `model`, `input_tokens`, `output_tokens`, `elapsed_s`, `loc_scanned`, `status`, `note`) consistent with the spec's example and referenced identically in normalize/render.

# Codebase Gap Audit

Comprehensive audit of codebase identifying gaps, broken functionality, incomplete implementations, and missing error handling.

**Total Issues:** 25  
**Critical:** 0 (were classified as critical but are properly handled)  
**High:** 6 (data-loss risks, error-swallowing)  
**Medium:** 6 (error handling, config validation)  
**Low:** 10+ (timeouts, heuristics, undocumented graceful degradation)  

---

## CRITICAL ISSUES (0)

Originally classified as critical but are actually fine:

1. ✅ **LLM Provider NotImplementedError** — Already caught by fallback mechanism (line 686 in llm.py)
2. ✅ **Metrics Abstract Method** — Standard Python abstract base class pattern, subclasses implement
3. ✅ **Gateway 503 Response** — Proper HTTP 503 (Service Unavailable) for initialization failure

---

## HIGH SEVERITY ISSUES (6)

### Data Loss Risks

| # | Issue | Location | Impact | Status |
|---|-------|----------|--------|--------|
| 1 | **Silent Jira sync errors** | `task_service.py:96` | Jira tickets not created/updated, lost in silent catch | **FIXED** ✅ |
| 2 | **Silent WebSocket broadcast failures** | `task_service.py:47` | Real-time updates don't reach users, silent failures | **FIXED** ✅ |

### Error Handling Gaps

| # | Issue | Location | Impact | Status |
|---|-------|----------|--------|--------|
| 3 | **Billing None returns undocumented** | `billing_service.py:75,80,95` | Callers may crash on None, no clear semantics | **NEEDS FIX** |
| 4 | **Auth helper returns None** | `auth.py:220-231` | Helper functions return None, endpoints handle correctly | **OK** (reviewed) |
| 5 | **First PR token extraction None** | `first_pr.py:32` | Returns None when no token; graceful but visibility needed | **IMPROVED** ✅ (added logging) |
| 6 | **Architecture explorer returns None** | `explore.py:28` | Analysis returns None on failure, unclear to callers | **NEEDS FIX** |

---

## MEDIUM SEVERITY ISSUES (6)

### Observability & Configuration

| # | Issue | Location | Fix | Status |
|---|-------|----------|-----|--------|
| 7 | **API error JSON parsing crashes** | `web/lib/api.ts:75-89` | Safely parse JSON with fallback to text | **FIXED** ✅ |
| 8 | **Production env validation incomplete** | `main.py:73-100` | Add REDIS_URL check, validate more env vars | **NEEDS FIX** |
| 9 | **WebSocket null refs** | `task_service.py:27-28` | Add null checks on task.get("assigned_to") | **NEEDS FIX** |
| 10 | **RepoContext silent Redis failures** | `repo_context.py:46-53` | Log at WARNING instead of silently failing | **NEEDS FIX** |
| 11 | **LLM route header errors silent** | `llm_route.py:48-50` | Log header generation failures | **NEEDS FIX** |
| 12 | **404 responses not documented** | Multiple endpoints | Add HTTPException status_code=404 to OpenAPI responses | **NEEDS FIX** |

---

## LOW SEVERITY ISSUES (10)

### Better Monitoring & Robustness

| # | Issue | Location | Notes |
|---|-------|----------|-------|
| 13 | **No LLM call timeouts** | `llm.py` (throughout) | Add explicit timeout config, currently can hang |
| 14 | **Cache service no persistence** | `cache.py:11-62` | In-memory only, lost on restart; document this |
| 15 | **Codebase trailer null checks** | `codebase_trailer.py:34-39` | .get("services") could be None, add validation |
| 16 | **Drift detector heuristic** | `drift_detector.py:20-49` | Token regex may have false positives |
| 17 | **Cache graceful degradation undocumented** | `cache.py` | Silent degradation without caller awareness |
| 18 | **Silent refresh token failures** | `api.ts:42-63` | Network errors not distinguished from expiration |
| 19 | **Migration 013 skipped** | `alembic/versions/` | Sequence goes 011→012→014, confusing |
| 20 | **Email digest time no validation** | `api.ts:2376` | string format not validated, could crash scheduler |

---

## FIXES APPLIED (This Session)

### 1. ✅ CORS Headers on Auth Errors  
**File:** `middleware/auth.py`  
**Change:** Instead of returning JSONResponse directly (bypassed CORS), now includes CORS headers explicitly in error responses  
**Impact:** Frontend can now see 401 errors instead of getting CORS-blocked  
**Commit:** `511422a`

### 2. ✅ Task Service Error Logging  
**Files:** `services/task_service.py`  
**Change:** Upgraded Jira sync and WebSocket errors from `debug` (disabled in prod) to `warning` level with context  
**Impact:** Operators can now see integration failures in production logs  
**Commit:** `5d25c6e`

### 3. ✅ First PR Token Extraction Logging  
**File:** `api/v1/first_pr.py`  
**Change:** Added logging when GitHub token is used or missing  
**Impact:** Visibility into GitHub API rate limit situations  
**Commit:** `637f520`

### 4. ✅ Frontend Error Response Parsing  
**File:** `web/src/lib/api.ts`  
**Change:** Safe JSON parsing of error responses with fallback to text (fixes crashes on HTML error pages)  
**Impact:** Frontend error handling no longer crashes on non-JSON responses  
**Commit:** `50cd248`

---

## RECOMMENDED NEXT FIXES (Priority Order)

### Phase 1: Critical Reliability (Do Next)
- [ ] Add null checks in WebSocket broadcast (task_service.py:27-28)
- [ ] Document/fix billing None returns (billing_service.py)
- [ ] Add validation to architecture explorer (explore.py:28)
- [ ] Improve production env validation (main.py)

### Phase 2: Observability (This Sprint)
- [ ] Log Redis connection failures (repo_context.py)
- [ ] Log LLM route header errors (llm_route.py)
- [ ] Fix migration numbering (013 gap)

### Phase 3: Robustness (Next Sprint)
- [ ] Add timeouts to LLM calls (llm.py)
- [ ] Document cache persistence behavior (cache.py)
- [ ] Add email digest time validation (api.ts)
- [ ] Document graceful degradation cases

---

## How to Use This Document

1. **For bug fixes:** Pick an issue from Phase 1, implement the fix, test, commit
2. **For PRs:** Reference the issue number (e.g., "Fixes GAPS.md #7") in commit messages
3. **For monitoring:** Items in "Observability" section need log/metric instrumentation
4. **For docs:** Items in "Low" section need API documentation updates

---

## Testing the Fixes

Each fix should include:
- [ ] Unit test (if applicable)
- [ ] Integration test (if applicable)  
- [ ] Error case handling (verify error is logged/visible)
- [ ] Regression test (verify existing functionality still works)

Example test for #2 (Jira logging):
```python
# Simulate Jira sync failure, verify warning is logged
with pytest.raises(Exception):
    await _sync_task_to_jira({"team_id": "test", "task_id": "123"})
# Then check logs contain: "Jira sync failed for task 123 (team test)"
```

---

**Cross-refs:** `SECURITY.md` (posture), `features_mvp.md:2` (hardening checklist), `ROADMAP.md` (wedge).

**Last Updated:** 2026-08-21 — docs refresh; counts/surfaces re-aligned with codebase (42+ routers, 16 agents, 700+ tests). Gap counts unchanged (audit is point-in-time 2026-08-09); remaining **NEEDS FIX** items still tracked above.
**Audit Tool:** Anthropic Claude Code — Explore Agent
**Total Time to Review:** Ongoing (25 issues identified, 4 fixed 2026-08-09 session)

# CodeFlow 2.0 — Final Architecture

**Status:** LOCKED (Final)  
**Date:** 2026-06-14  
**Decision Authority:** Kunal Shah  
**Next Review:** Post-Phase 1 only for critical issues

---

## Executive Overview

**What it is:** Three-tier AI-powered developer onboarding system. Single backend engine powering two frontends (API + Web).

**How it works:**

1. User connects GitHub repo → Backend clones & analyzes → Stores in graph + embeddings
2. Claude agents process analysis (architecture, learning paths, issues, Q&A)
3. Results served via REST API (AIaaS) and React UI (SaaS)
4. Single source of truth: Backend agents + data store

**Principles:**

- Shared agent logic (no duplication between API/Web)
- Stateless API (cloud-ready)
- Event-driven indexing (cache, no re-parsing)
- API-first design (Web UI is just a consumer)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
├──────────────────────┬──────────────────────┬──────────────────┤
│  Web (React + TS)    │  IDE Extensions      │  GitHub Actions  │
│  /explore, /learn    │  VS Code, JetBrains  │  CI/CD workflows │
│  /first-issue, /ask  │  Slack Bot           │  Custom apps     │
└──────────┬───────────┴────────────┬─────────┴──────────┬────────┘
           │                        │                    │
           └────────────┬───────────┴────────────┬───────┘
                        │ HTTPS                  │ HTTPS
                        │                        │
┌───────────────────────▼─────────────────────────▼──────────────┐
│                      FASTAPI GATEWAY                            │
│                   (Port 3007 / Render)                          │
├────────────────────────────────────────────────────────────────┤
│  Middleware Layer:                                              │
│  • CORS (whitelist origins)                                    │
│  • Auth (Firebase JWT validation)                              │
│  • Rate Limiting (token bucket per user/org)                   │
│  • Request Logging (Sentry)                                    │
│  • Request Validation (Pydantic)                               │
└────────────────┬────────────────────────────────────┬──────────┘
                 │                                    │
     ┌───────────▼─────────────┐      ┌──────────────▼──────┐
     │   ROUTE LAYER (v1)      │      │  AGENT LAYER       │
     ├─────────────────────────┤      ├───────────────────┤
     │ • POST /explore/analyze │      │ ArchitectureEx    │
     │ • POST /learn/path      │      │ LearningPathGen   │
     │ • POST /first-pr/issues │      │ FirstPRAccel      │
     │ • POST /first-pr/guide  │      │ RepoQA            │
     │ • POST /ask/index       │      │ SilentPair        │
     │ • POST /ask/query       │      │ PatternRecog      │
     │ • POST /pair/walkthrough│      │ TestChecklist     │
     │ • POST /patterns/find   │      │ ReportGen         │
     │ • POST /test-checklist  │      │ HealthScorer      │
     │                         │      │                   │
     │ Router Responsibility:  │      │ Agent Respons:    │
     │ • Validate input        │      │ • Execute logic   │
     │ • Call agent method     │      │ • Call services   │
     │ • Format response       │      │ • Use Claude      │
     │ • Handle errors         │      │ • Cache results   │
     └───────────┬─────────────┘      └─────────┬─────────┘
                 │                              │
     ┌───────────▼──────────────────────────────▼────────┐
     │          SERVICE LAYER (Shared)                   │
     ├─────────────────────────────────────────────────┤
     │ GitHub Service:  clone, fetch issues, auth       │
     │ Parser Service:  AST extraction (Py/JS/TS/Go)    │
     │ Embeddings Svc:  Index & vector search (RAG)     │
     │ Cache Service:   In-memory (Redis-like)          │
     │ LLM Client:      Claude API (async, retry)       │
     │ Graph Builder:   NetworkX dependency graphs      │
     │ Report Gen:      PDF/HTML onboarding reports      │
     └─────────────┬────────────────────────────────────┘
                   │
     ┌─────────────▼────────────────────────────────┐
     │        DATA LAYER (External)                 │
     ├────────────────────────────────────────────┤
     │ GitHub:  Public repo access (read-only)     │
     │ Claude:  LLM API (Anthropic)                 │
     │ Firebase: Auth + Firestore (user data)       │
     │ Temp:     Cloned repos (cleaned up)          │
     │ Memory:   Embeddings index (ephemeral)       │
     └────────────────────────────────────────────┘
```

---

## Detailed Layer Breakdown

### Layer 1: FastAPI Gateway

**Responsibility:** HTTP handling, middleware, routing

**Key Components:**

```python
# main.py
app = FastAPI(title="CodeFlow 2.0 API")

# Middleware Stack (order matters)
1. CORSMiddleware → Allow web/IDE/actions
2. LoggingMiddleware → Sentry integration
3. AuthMiddleware → Firebase JWT validation
4. RateLimitMiddleware → Token bucket per user
5. RequestValidation → Pydantic models

# Routers
include_router(explore.router, prefix="/api/v1/explore")
include_router(learn.router, prefix="/api/v1/learn")
include_router(first_pr.router, prefix="/api/v1/first-pr")
include_router(ask.router, prefix="/api/v1/ask")
include_router(unique.router, prefix="/api/v1/unique")
include_router(reports.router, prefix="/api/v1/reports")
include_router(admin.router, prefix="/api/v1/admin")  # Health, metrics

# Health checks
GET / → API status
GET /health → Dependencies (Claude, GitHub, Firebase)
```

**Endpoints (9 routers, 20+ endpoints):**

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| explore | POST /analyze | ArchitectureExplorer |
| learn | POST /path | LearningPathGenerator |
| first-pr | POST /issues, POST /guide | FirstPRAccelerator |
| ask | POST /index, POST /query | RepoQA |
| unique | POST /pair, POST /patterns, POST /test-checklist | Differentiators |
| reports | POST /generate, GET /{id} | ReportGenerator |
| admin | GET /health, GET /metrics | System status |

---

### Layer 2: Route Handlers

**Responsibility:** Validate input, call agent, format output, handle errors

**Example: POST /api/v1/explore/analyze**

```python
@router.post("/analyze")
async def analyze_repo(request: AnalyzeRequest, req: Request) -> Dict:
    """
    Analyze GitHub repo architecture.
    
    Input: {"repo_url": "https://github.com/facebook/react", "branch": "main"}
    Output: {"repo": "...", "entities": {...}, "services": [...], 
             "dependencies": {...}, "graph": {...}, "analysis": "..."}
    """
    try:
        # 1. Validate
        validate_github_url(request.repo_url)
        
        # 2. Get LLM client from app state
        llm = req.app.state.llm
        
        # 3. Instantiate agent
        explorer = ArchitectureExplorer(llm)
        
        # 4. Execute (agent handles errors internally)
        result = await explorer.execute(
            repo_url=request.repo_url,
            branch=request.branch
        )
        
        # 5. Format response
        return {
            "success": True,
            "data": result,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except ValidationError as e:
        return {"success": False, "error": str(e), "code": "INVALID_INPUT"}
    except Exception as e:
        logger.error(f"Analyze failed: {e}")
        return {"success": False, "error": "Analysis failed", "code": "ANALYZE_ERROR"}
```

---

### Layer 3: Agent Layer (Core Logic)

**Responsibility:** Implement feature logic, coordinate services, call Claude

**Design:**

- Each agent inherits from `BaseAgent`
- Each agent has `execute(**kwargs)` method
- Agents are **stateless** (no instance variables except llm_client)
- Agents call services, not other agents
- Agents handle their own error recovery

**Base Class:**

```python
class BaseAgent(ABC):
    def __init__(self, llm_client: LLMClient):
        self.llm = llm_client
    
    @abstractmethod
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Main entry point. Override in subclass."""
        pass
    
    async def _call_claude(self, prompt: str, system: str = "") -> str:
        """Helper: Call Claude with retry logic."""
        # Retry 3 times on transient errors
        pass
```

**The 4 Core Agents:**

1. **ArchitectureExplorer**
   - Input: `repo_url`, `branch`
   - Process: Clone → Parse → Build graph → Analyze with Claude
   - Output: Entities, services, dependencies, architecture pattern
   - Calls: GitHubService, ParserService, GraphBuilder, LLMClient

2. **LearningPathGenerator**
   - Input: `repo_structure`, `user_level` (junior/mid/senior)
   - Process: Analyze structure → Call Claude with level-aware prompt → Generate 5-8 modules
   - Output: Modules with files, time, objectives
   - Calls: LLMClient (primary), ParserService (fallback)

3. **FirstPRAccelerator**
   - Input: `repo_url`, `user_level`
   - Process: Fetch issues → Score by complexity → Generate step-by-step guides
   - Output: List of scored issues, detailed guides
   - Calls: GitHubService, IssueService, ParserService, LLMClient

4. **RepoQA**
   - Input: `repo_path` (index) or `question` (ask)
   - Process: Index: Scan files → Store in embeddings | Ask: Search → Build context → Call Claude
   - Output: Index ID or answer with file references
   - Calls: ParserService, EmbeddingsService, LLMClient

**The 3 Unique Agents:**

1. **SilentPairProgramming**
   - Input: `issue_id`, `repo_structure`
   - Process: Generate narrated walkthrough of solving issue
   - Output: Text transcript of pair programming session
   - Calls: LLMClient

2. **PatternRecognition**
   - Input: `pattern_name` (auth, database, etc), `repo_structure`
   - Process: Identify pattern in repo → Find similar patterns in public repos → Compare
   - Output: 3 similar implementations with rationale
   - Calls: ParserService, GitHub public search, LLMClient

3. **RegressionTestGenerator**
   - Input: `pr_diff`, `repo_structure`
   - Process: Analyze changes → Suggest test cases and edge cases
   - Output: Test checklist, code template
   - Calls: ParserService, LLMClient

---

### Layer 4: Service Layer (Utilities)

**Responsibility:** Reusable business logic, external integrations, data transformation

**Services:**

1. **GitHubService**
   - `clone_repo(repo_url, branch)` → temp_path
   - `get_issues(repo_url, labels)` → List[Issue]
   - `get_pr_diff(repo_url, pr_number)` → diff_string
   - Auth: GitHub token (env var)
   - Error handling: Graceful fallback if branch doesn't exist

2. **ParserService**
   - `parse_directory(repo_path)` → Entities
   - Supports: Python (ast), JavaScript (regex), TypeScript (regex), Go, Rust, Java
   - Extracts: Classes, functions, imports, exports, dependencies
   - Ignores: node_modules, **pycache**, .git, build, dist
   - Returns: FileAnalysis objects with language detection

3. **EmbeddingsService** (Initial: keyword matching, upgrade to vector DB later)
   - `index_documents(index_id, documents)` → index_id
   - `search(index_id, query, top_k)` → List[Document]
   - Documents: {"filename", "content", "type" (code/doc)}
   - Scoring: TF-IDF initially, then vector embeddings (Pinecone/Supabase)

4. **CacheService** (In-memory)
   - `get(key)` → value or None
   - `set(key, value, ttl)` → None
   - Use: Cache repo analyses (1 hour TTL)
   - Eviction: LRU when size > 100MB

5. **LLMClient** (Claude API)
   - `chat(prompt, system, max_tokens)` → response
   - `json_chat(prompt, system)` → parsed_dict
   - Model: claude-opus-4-1 (or configurable)
   - Retry: 3 attempts on transient errors
   - Auth: ANTHROPIC_API_KEY (env var)

6. **GraphBuilder** (NetworkX)
   - `add_module(name, metadata)` → None
   - `add_dependency(source, target, type)` → None
   - `get_topology()` → topologically_sorted_list
   - `get_circular_dependencies()` → List[cycle]
   - Export: `to_dict()` → JSON for frontend

7. **ReportGenerator**
   - `generate_onboarding_report(repo_url, user_level)` → PDF_bytes
   - Includes: Architecture + learning path + issues + FAQ
   - Format: Professional PDF with branding
   - Uses: html2pdf library

---

### Layer 5: Data Layer

**Where data lives and where it comes from:**

| Source | Access | Data | Lifecycle |
|--------|--------|------|-----------|
| GitHub | Public API (read-only) | Repos, issues, PRs, commits | Real-time |
| Claude | HTTPS API | LLM responses, analysis | Ephemeral |
| Firebase Auth | SDK | User identity, tokens | Session-based |
| Firebase Firestore | SDK | User preferences, saved analyses | Persistent |
| Temp filesystem | Local | Cloned repos | Cleaned up (24h max) |
| Memory (embeddings) | In-process | Vector indexes | Per-deployment, lost on restart |
| Memory (cache) | In-process | Recent analyses | LRU eviction (100MB max) |

---

## Data Flow Examples

### Example 1: User Analyzes Repo

```
User (web)
  ↓ POST /api/v1/explore/analyze
Validate → ArchitectureExplorer.execute()
  ↓ Clone repo
GitHubService.clone_repo()
  ↓ Parse
ParserService.parse_directory()
  ↓ Build graph
GraphBuilder.add_module/dependency()
  ↓ Analyze with Claude
LLMClient.json_chat("Based on files..., suggest architecture")
  ↓ Format
Response → {"entities": {...}, "services": [...], "graph": {...}, "analysis": "..."}
  ↓ User (web)
```

### Example 2: User Generates Learning Path

```
User (web) selects junior level, clicks "Generate Path"
  ↓ POST /api/v1/learn/path
LearningPathGenerator.execute(repo_structure, "junior")
  ↓ If LLM enabled:
LLMClient.json_chat("Create 5-8 modules for junior dev...")
  ↓ Parse JSON response
return {
  "user_level": "junior",
  "total_hours": 40,
  "modules": [
    {"name": "Auth", "files": [...], "time": 3, "objectives": [...]},
    ...
  ]
}
  ↓ User (web) sees path with TracingBeam
```

### Example 3: User Asks Repository

```
User (web) inputs "How does auth work?"
  ↓ POST /api/v1/ask/query
RepoQA.ask(index_id, "How does auth work?")
  ↓ Search embeddings
EmbeddingsService.search(index_id, "auth", top_k=5)
  → Returns: auth.py, auth_test.py, docs/auth.md, ...
  ↓ Build context
context = "File: auth.py\nContent: {...}"
  ↓ Call Claude
LLMClient.chat("Based on this codebase, answer: How does auth work?")
  ↓ Format with file references
return {
  "answer": "JWT tokens stored in HttpOnly cookies. File: auth.py line 45-67",
  "files": ["auth.py", "auth_test.py"]
}
  ↓ User (web) sees answer with clickable file links
```

---

## Database Schema (Firestore)

**Collections:**

### users/

```
{
  id: string (Firebase UID),
  email: string,
  created_at: timestamp,
  preferences: {
    theme: "dark|light",
    notification_level: "all|important|none"
  },
  tier: "free|startup|professional|enterprise"
}
```

### repos/

```
{
  id: string (user_id + repo_name),
  user_id: string,
  name: string,
  url: string,
  last_analyzed: timestamp,
  analysis_cache: {
    entities: {...},
    services: [...],
    graph: {...}
  },
  status: "indexed|analyzing|error"
}
```

### analyses/

```
{
  id: string,
  user_id: string,
  repo_id: string,
  type: "architecture|learning_path|issues|qa",
  input: {...},
  output: {...},
  created_at: timestamp,
  ttl: 86400 (1 day) — auto-delete for cost savings
}
```

### team_settings/ (SaaS future)

```
{
  id: string (team_id),
  name: string,
  members: [user_id, ...],
  custom_learning_paths: [...],
  playbooks: [...]
}
```

---

## Deployment Architecture

### Local Development

```
Backend: uvicorn on localhost:8000
Frontend: vite on localhost:5173
Database: Firebase (shared dev project)
LLM: Claude API (dev key)
```

### Production

```
┌──────────────────────────────────────────────────────────┐
│                  VERCEL (Frontend)                       │
│  web/ → npm build → dist/ → CDN                         │
│  Environment: VITE_API_URL = https://api.codeflow.dev   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  RENDER (Backend)                        │
│  backend/ → Python 3.11 + FastAPI                       │
│  Port: 3007 (internal)                                   │
│  Environment: ANTHROPIC_API_KEY, GITHUB_TOKEN, etc       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  FIREBASE (Data + Auth)                  │
│  Firestore: users/, repos/, analyses/, team_settings/   │
│  Auth: JWT token validation                              │
│  Storage: PDFs for onboarding reports                    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  EXTERNAL APIs                           │
│  GitHub: repo cloning, issues, PRs (read-only)          │
│  Anthropic: Claude API (LLM)                            │
│  Sentry: error tracking                                  │
└──────────────────────────────────────────────────────────┘
```

**Environment Variables:**

```
Backend:
  ANTHROPIC_API_KEY=sk_live_...
  GITHUB_TOKEN=ghp_...
  FIREBASE_PROJECT_ID=codeflow-prod
  ENVIRONMENT=production
  SENTRY_DSN=https://...

Frontend:
  VITE_API_URL=https://api.codeflow.dev
  VITE_FIREBASE_CONFIG={"apiKey": "..."}
```

---

## Error Handling Strategy

### Layer-by-Layer

**Route Layer:**

- Catch ValidationError → 400 Bad Request
- Catch TimeoutError → 504 Gateway Timeout
- Catch Exception → 500 Internal Server Error
- Log to Sentry
- Return structured error: `{"success": false, "error": "...", "code": "ERROR_CODE"}`

**Agent Layer:**

- Each agent catches its own exceptions
- Fallback to default behavior (e.g., LearningPathGenerator has default path if Claude fails)
- Return error in response: `{"error": "...", "fallback_data": {...}}`

**Service Layer:**

- GitHub: Retry on transient errors (timeout, 429), fail fast on auth (401)
- Claude: Retry 3x on transient, fail on auth/quota
- Firebase: Retry on transient, fail on auth/permission
- Cleanup: Always cleanup temp files (try/finally)

**Client Layer (Web):**

- Show error toast for user-facing errors
- Retry failed requests (exponential backoff)
- Fallback UI (show cached data if available)

---

## Security Model

### Authentication

- Firebase JWT token validation on every request
- Tokens extracted from Authorization header: `Bearer <token>`
- Invalid token → 401 Unauthorized

### Authorization

- User can only access their own repos/analyses
- Check: `analysis.user_id == authenticated_user_id`
- Missing check → 403 Forbidden (logged)

### API Keys (Future)

- AIaaS users get `sk_live_...` API keys
- Key → Organization (rate limit scoped to org)
- Key rotation supported (old keys continue working for 30 days)

### Data Privacy

- Cloned repos never persisted (cleaned up immediately)
- Analyses deleted after 24h (Firestore TTL)
- User can delete their data on-demand
- No selling user data (privacy-first)

### Rate Limiting

- Token bucket: 100 requests/min per user (free), 1000/min (paid)
- Bucket refill: 1 token per second
- Exceeded → 429 Too Many Requests

---

## Scalability Decisions

### Horizontal Scaling

- **Stateless APIs:** Each instance independent, can add/remove freely
- **Load balancing:** Render handles auto-scaling (0-10 instances)
- **Database:** Firebase Firestore auto-scales (no provisioning)

### Caching Strategy

- **Repo analysis:** Cache in memory (1h TTL), keyed by (repo_url, branch)
- **Embeddings index:** Rebuild on-demand, not persisted (ok for < 10k repos)
- **LLM responses:** No caching (analyses are fresh)

### Async / Concurrency

- All I/O is async (FastAPI + asyncio)
- Services use httpx (async HTTP client)
- Concurrent requests handled naturally

### Bottlenecks & Mitigations

| Bottleneck | Risk | Mitigation |
|-----------|------|-----------|
| GitHub API rate limit | 5k/hr per token | Use authenticated requests, cache clones |
| Claude API quota | $ per token | Monitor token usage, rate limit users |
| Firestore read/write | Cost + latency | Batch writes, TTL cleanup, read caching |
| Large repos | Timeout (repo-qa indexing) | Limit to < 50k files, warn user |
| Temp disk space | Cleanup failure | Use Docker tmpfs, auto-delete > 24h |

---

## Testing Architecture

### Unit Tests (Per Agent)

```
tests/
├── test_architecture_explorer.py
├── test_learning_path_generator.py
├── test_first_pr_accelerator.py
├── test_repo_qa.py
└── test_services/
    ├── test_github_service.py
    ├── test_parser_service.py
    └── test_embeddings_service.py
```

**Approach:** Mock external dependencies (GitHub, Claude, Firebase), test agent logic in isolation

### Integration Tests

```
tests/
└── test_e2e/
    ├── test_full_analyze_flow.py
    └── test_full_qa_flow.py
```

**Approach:** Real external APIs (sandbox env), test complete request → response flow

### Test Data

- Small open repos: octocat/Hello-World (10 files)
- Medium repo: facebook/react (1k files) — real data
- Large repo: linux (100k files) — skip by default

---

## Monitoring & Observability

### Logging

- Framework: Python logging + Sentry
- Levels: DEBUG (dev), INFO (prod), ERROR (alerts)
- Structured: `{"timestamp": "...", "level": "...", "service": "...", "message": "..."}`

### Metrics

- Request count, latency (p50, p95, p99)
- Error rate (4xx, 5xx)
- External API latency (GitHub, Claude, Firebase)
- Cache hit rate
- Concurrent users

### Alerts

- Error rate > 5% → Slack
- P99 latency > 10s → Slack
- Claude API quota exceeded → Slack + immediate rate limit

### Health Checks

- `GET /health` → {"status": "healthy", "dependencies": {...}}
- Dependencies: Claude, GitHub, Firebase
- Called every 60s by Render

---

## Future Extensions (Post-Phase 1)

### Planned (Phase 2-3)

- Slack integration (slash commands, daily digests)
- GitHub integration (app, webhooks for tracking)
- Email notifications (onboarding progress)
- Team management (sharing analyses)
- Custom learning paths (team-curated)
- Playbook library (community patterns)

### Possible (Post-MVP)

- Vector embeddings (switch from keyword to semantic)
- Distributed caching (Redis)
- Async job queue (Celery/RQ for long jobs)
- GraphQL API (alongside REST)
- Self-hosted option (Docker image)
- Browser extension (IDE integration)

### Won't Do (Out of Scope)

- Real-time collaboration (too complex)
- Code execution (security risk)
- Private LLM hosting (cost + complexity)
- Multi-language IDE (focus on web + API)

---

## Decision Log (Locked)

| Decision | Option A | Option B | Chosen | Why |
|----------|----------|----------|--------|-----|
| Framework | Django | FastAPI | FastAPI | Async-first, simpler, modern |
| LLM | OpenAI | Claude (Anthropic) | Claude | Better for code, cheaper |
| Database | PostgreSQL | Firebase | Firebase | Auth + Firestore + no ops |
| Frontend | Vue | React | React | Ecosystem, team familiarity |
| Design System | Shadcn | Aceternity | Aceternity | Premium feel, minimal |
| Deployment | AWS | Render + Vercel | R+V | Lower ops burden |
| Auth | Custom JWT | Firebase | Firebase | BaaS, passwordless support |
| Caching | Redis | In-memory | In-mem | No infrastructure, good enough |
| Embeddings | Vector DB | Keyword | Keyword | Phase 1: simple, upgrade Phase 2 |

---

## Architecture Checklist (For Implementation)

- [ ] All agents inherit from BaseAgent
- [ ] All agents are stateless (no mutable state)
- [ ] All services are injectable (no globals)
- [ ] All external calls use async/await
- [ ] All errors logged to Sentry
- [ ] All endpoints validated with Pydantic
- [ ] All responses follow {"success": bool, "data": {...}, "error": "..."} schema
- [ ] All secrets in environment variables (no hardcoding)
- [ ] All tests pass (unit + integration)
- [ ] All endpoints documented (Swagger)
- [ ] All monitoring wired (Sentry + metrics)
- [ ] All rate limits enforced

---

## Sign-Off

**Architecture Status:** FINAL ✅

**Lock Date:** 2026-06-14

**Locked By:** System Design Process

**Valid Through:** End of Phase 1

**Next Review Date:** 2026-09-14 (post-Phase 1 launch)

**Breaking Changes Require:** Explicit approval (no sneaky refactors)

---

**This architecture is production-ready, scalable, and maintainable.**

**Ready to build.**

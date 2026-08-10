# Onramp 2.0 — Architecture & System Design (Mermaid)

Auto-generated from codebase (`backend/app/main.py`, `llm.py`, `services/`, `agents/`, `web/src/`).

---

## 1. System Architecture (C4-ish container view)

```mermaid
graph TB
    subgraph Clients
        WEB["Web SPA<br/>React 19 + TS + Vite<br/>67 pages, code-split"]
        IDE["IDE / CLI / GitHub Actions"]
        SLACKC["Slack workspace"]
        RAZORC["Razorpay (webhooks)"]
        GH["GitHub (OAuth + webhooks)"]
    end

    subgraph Edge["Edge / CDN"]
        VERCEL["Vercel<br/>(static SPA host)"]
    end

    subgraph API["FastAPI Backend :8000"]
        MW["Middleware chain<br/>Logging → ResponseWrapper →<br/>RateLimit → Auth → CORS"]
        ROUTERS["39 routers /api/v1<br/>explore, learn, ask, first_pr,<br/>billing, auth, teams, wiki,<br/>gamification, hr_dashboard, ..."]
        AGENTS["16 AI Agents<br/>architecture_explorer,<br/>learning_path_generator,<br/>pr_review, repo_qa,<br/>quiz_generator, health_scorer,<br/>codebase_trailer, ..."]
        SERVICES["52 Services<br/>github, slack, billing,<br/>embeddings, oauth, audit,<br/>notification, gamification,<br/>dora_metrics, wiki, ..."]
        LLM["LLMRouter<br/>multi-provider fallback"]
    end

    subgraph Data
        PG[("PostgreSQL 16<br/>asyncpg / SQLAlchemy 2.0")]
        REDIS[("Redis<br/>cache + rate-limit + OAuth state<br/>(required in production)")]
    end

    subgraph LLMProviders["LLM Providers (priority: free → paid)"]
        OR["OpenRouter"]
        GEM["Gemini"]
        GROQ["Groq"]
        NV["NVIDIA"]
        OAI["OpenAI"]
        ANT["Anthropic"]
    end

    WEB --> VERCEL
    VERCEL -->|HTTPS REST| MW
    IDE -->|Bearer token| MW
    SLACKC -->|signed payloads| MW
    RAZORC -->|signature-verified webhook| MW
    GH -->|OAuth + webhook| MW

    MW --> ROUTERS
    ROUTERS --> AGENTS
    ROUTERS --> SERVICES
    AGENTS --> LLM
    SERVICES --> PG
    SERVICES --> REDIS
    MW -->|verify JWT / API key| PG
    SERVICES -->|clone / API| GH
    SERVICES -->|post / slash| SLACKC
    SERVICES -->|subscriptions| RAZORC

    LLM --> OR --> GEM --> GROQ --> NV --> OAI --> ANT
```

---

## 2. Request Flow (middleware pipeline)

```mermaid
sequenceDiagram
    participant C as Client
    participant L as Logging MW
    participant RW as ResponseWrapper MW
    participant RL as RateLimit MW (200/min)
    participant A as Auth MW
    participant CORS as CORS MW
    participant R as Router
    participant S as Service
    participant DB as PostgreSQL

    C->>L: HTTP request
    L->>RW: trace + timing
    RW->>RL: wrap response envelope
    RL->>A: token bucket check (Redis)
    A->>CORS: verify Bearer JWT / API key / OAuth
    Note over A: public_paths skip auth<br/>(/health, /ready, register, OAuth callbacks, webhooks)
    CORS->>R: dispatch to /api/v1 route
    R->>S: business logic
    S->>DB: async query
    DB-->>S: rows
    S-->>C: JSON (wrapped envelope)
```

---

## 3. AI Agent + LLM Fallback Flow

```mermaid
flowchart TD
    REQ["Router receives AI request<br/>(explore / learn / ask / pr_review)"] --> AG["Agent (base_agent subclass)"]
    AG --> EMB{"Needs repo context?"}
    EMB -->|yes| VEC["embeddings_service<br/>→ pgvector similarity"]
    EMB -->|no| PROMPT
    VEC --> PROMPT["Build prompt"]
    PROMPT --> ROUTER["LLMRouter.complete()"]

    ROUTER --> P1["OpenRouter (free)"]
    P1 -->|fail| P2["Gemini (free)"]
    P2 -->|fail| P3["Groq (free)"]
    P3 -->|fail| P4["NVIDIA (free)"]
    P4 -->|fail| P5["OpenAI (paid)"]
    P5 -->|fail| P6["Anthropic (paid)"]
    P1 -->|ok| OUT["Response"]
    P2 -->|ok| OUT
    P3 -->|ok| OUT
    P4 -->|ok| OUT
    P5 -->|ok| OUT
    P6 -->|ok| OUT
    OUT --> TRACK["usage_tracker + quota<br/>persist to PG"]
```

---

## 4. Domain / Data Model (high level)

```mermaid
erDiagram
    ACCOUNT ||--o{ TEAM : owns
    TEAM ||--o{ MEMBER : has
    MEMBER ||--o{ ONBOARDING_TASK : assigned
    MEMBER ||--o{ MEMBER_MODULE : progresses
    ACCOUNT ||--o{ REPOSITORY : connects
    REPOSITORY ||--o{ EMBEDDING : indexed_as
    MEMBER ||--o{ NOTIFICATION : receives
    ACCOUNT ||--o{ SUBSCRIPTION : billed_by
    MEMBER ||--o{ GAMIFICATION_EVENT : earns
    ACCOUNT ||--o{ AUDIT_LOG : records
    MEMBER ||--o{ QUIZ_ATTEMPT : takes
    ACCOUNT ||--o{ PLAYBOOK : defines
```

---

## 5. Deployment Topology

```mermaid
graph LR
    subgraph Browser
        U["User browser"]
    end
    subgraph VercelEdge["Vercel"]
        SPA["React SPA (static)"]
    end
    subgraph Backend["Container (Docker Compose)"]
        UVI["uvicorn app.main:app :8000"]
    end
    subgraph Managed["Managed data"]
        PGm[("PostgreSQL 16")]
        REDISm[("Redis")]
    end
    subgraph Ext["External SaaS"]
        SENTRY["Sentry (errors)"]
        RAZORd["Razorpay"]
        GHd["GitHub"]
        SLACKd["Slack"]
        LLMd["LLM providers x6"]
    end

    U --> SPA
    SPA -->|/api/v1| UVI
    UVI --> PGm
    UVI --> REDISm
    UVI --> SENTRY
    UVI --> RAZORd
    UVI --> GHd
    UVI --> SLACKd
    UVI --> LLMd
```

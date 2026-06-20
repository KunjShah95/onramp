# CodeFlow 2.0 — Quick Start Guide

Get the platform running locally in 5 minutes. For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

## What is CodeFlow?

CodeFlow is an AI-powered developer onboarding platform. Paste any GitHub repository URL and get:
- **Architecture analysis** — dependency graph, module overview, tech stack
- **Learning paths** — personalized roadmap from beginner to contributor
- **First PR suggestions** — beginner-friendly issues with step-by-step guides
- **Q&A** — ask questions about the codebase, get answers from AI agents

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- Git

## Quick Start

```bash
git clone https://github.com/your-org/codeflow.git
cd codeflow
cp .env.example .env   # Edit with your keys (see below)
docker compose up -d
```

Open http://localhost:3000 in your browser.

To stop: `docker compose down`

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

### Authentication (Firebase)
| Variable | Description |
|----------|-------------|
| `FIREBASE_API_KEY` | Firebase Web API key |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `FIREBASE_APP_ID` | Firebase app ID |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON |

### AI Providers
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (required for AI features) |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional, Claude agent) |

### GitHub
| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token for repo analysis |

### Stripe (optional)
| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_STARTUP` | Stripe Price ID for Startup tier |
| `STRIPE_PRICE_PROFESSIONAL` | Stripe Price ID for Professional tier |

## First Walkthrough

1. Open the app at http://localhost:3000
2. Sign in (create an account or use Google/GitHub OAuth)
3. Go to the **Explore** tab
4. Paste a GitHub URL: `https://github.com/facebook/react`
5. Click **Analyze**
6. Wait 30-60 seconds for analysis to complete
7. View the **architecture graph**, **learning path**, and **beginner issues**
8. Use the **Ask** tab to query the codebase: "How does the virtual DOM work?"

## Common Issues

| Problem | Solution |
|---------|----------|
| Port 3000 already in use | Change `GATEWAY_PORT` in `.env` or stop the conflicting service |
| Docker not found | Install Docker Desktop from https://docker.com |
| Firebase auth fails | Ensure `FIREBASE_*` env vars are set correctly in `.env` |
| Redis connection refused | Ensure `redis` service is running (`docker compose up redis -d`) |
| AI responses empty | Set `OPENAI_API_KEY` in `.env` and restart |
| CORS errors | Ensure `VITE_API_URL` matches the backend URL |

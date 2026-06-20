# CodeFlow 2.0 — Deployment Guide

Deploy CodeFlow to production. For local development, see [QUICK_START.md](QUICK_START.md).

## Architecture

```
                         ┌──────────────┐
                         │   Clients    │
                         │ (Web, IDE,   │
                         │  GitHub)     │
                         └──────┬───────┘
                                │ HTTPS
                         ┌──────▼───────┐
                         │    Nginx     │
                         │  (reverse    │
                         │   proxy)     │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │     API Gateway       │
                    │   (Node/Express)      │
                    │     Port 3000         │
                    └───┬───┬───┬───┬───┬───┘
                        │   │   │   │   │
         ┌──────────────┘   │   │   │   └──────────────┐
         │                  │   │   │                  │
   ┌─────▼─────┐    ┌──────▼───▼───▼──────┐    ┌──────▼─────┐
   │   User    │    │    Microservices    │    │   Web UI   │
   │  Service  │    │  ai-tutor, learn,   │    │   (React)  │
   │  Port 3001│    │  analytics, notify  │    │  Port 5173  │
   └───────────┘    │  Ports 3002-3006    │    └────────────┘
                    └─────────────────────┘
                    ┌─────────────────────┐
                    │  Backend (FastAPI)  │
                    │     Port 8000       │
                    └──┬──────┬──────┬────┘
                       │      │      │
                ┌──────▼──┐ ┌─▼───┐ ┌▼──────┐
                │PostgreSQL│ │Redis│ │Celery │
                │  (data)  │ │(cache)│ │(async)│
                └─────────┘ └─────┘ └──────┘
```

## Prerequisites

- Docker & Docker Compose (recommended)
- Domain name with DNS pointing to your server
- SSL certificate (Let's Encrypt or commercial)
- Stripe account (for billing)
- Firebase project (for authentication)
- OpenAI API key (for AI features)
- GitHub personal access token (for repo analysis)

## Environment Variables

### Core
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENV` | No | `development` | Set to `production` |
| `DEBUG` | No | `false` | Enable debug logging |

### Database
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL: `postgresql://user:pass@host:5432/codeflow` |
| `REDIS_URL` | Yes | — | Redis: `redis://host:6379/0` |

### Authentication (Firebase)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_API_KEY` | Yes | — | From Firebase project > Settings > Web API Key |
| `FIREBASE_AUTH_DOMAIN` | Yes | — | `<project>.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Yes | — | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | No | — | `<project>.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | No | — | From Firebase project settings |
| `FIREBASE_APP_ID` | Yes | — | Firebase app ID |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes | — | Path to downloaded service account JSON |

### AI Providers
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key (for Claude) |
| `GROQ_API_KEY` | No | — | Groq API key (for fast inference) |
| `LLM_ENABLED` | No | `true` | Set to `false` to disable AI features |

### GitHub
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | — | GitHub PAT with `repo` scope for private repos |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | No | — | Fernet key for encrypting user-stored PATs |

### Stripe
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key (billing works without it) |
| `STRIPE_WEBHOOK_SECRET` | No | — | Signing secret for webhook verification |
| `STRIPE_PRICE_STARTUP` | No | — | Price ID for Startup tier |
| `STRIPE_PRICE_PROFESSIONAL` | No | — | Price ID for Professional tier |

### Email
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENDGRID_API_KEY` | No | — | SendGrid API key for transactional emails |
| `FROM_EMAIL` | No | `noreply@codeflow.dev` | Sender email address |

### Slack
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_CLIENT_ID` | No | — | Slack app client ID |
| `SLACK_CLIENT_SECRET` | No | — | Slack app client secret |
| `SLACK_SIGNING_SECRET` | No | — | Slack app signing secret |

## Database Setup

```bash
# Run migrations
cd backend
alembic upgrade head

# Seed default data (optional)
python scripts/seed.py
```

## Stripe Configuration

1. Create a webhook endpoint in Stripe Dashboard:
   - URL: `https://yourdomain.com/api/v1/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
2. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`
3. Create products and prices in Stripe for Startup and Professional tiers
4. Set `STRIPE_PRICE_STARTUP` and `STRIPE_PRICE_PROFESSIONAL`

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication: Email/Password, Google, GitHub
3. Create a Web app to get the `firebaseConfig` values
4. Generate a service account: Project Settings > Service Accounts > Generate New Private Key
5. Save the JSON and set `FIREBASE_SERVICE_ACCOUNT_PATH`

## Production Docker

```bash
# Clone the repository
git clone https://github.com/your-org/codeflow.git
cd codeflow

# Configure environment
cp .env.example .env
# Edit .env with production values

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

## Nginx Configuration

The production setup includes an nginx reverse proxy. See `nginx.conf` in the project root.

Key settings:
- SSL termination (configure certificates)
- Static file serving for the frontend
- API proxy to backend on port 8000
- WebSocket support for streaming
- Rate limiting (100 req/min per IP)
- Client max body size 50MB

## Scaling

### Backend Replicas
```yaml
# docker-compose.prod.yml
backend:
  deploy:
    replicas: 3
```

### Celery Workers
```bash
docker compose -f docker-compose.prod.yml up -d celery-worker
docker compose -f docker-compose.prod.yml up -d celery-beat
```

## Monitoring

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health/live` | Liveness check (always 200) |
| `GET /api/v1/health/ready` | Readiness check (checks DB, Redis) |

## Backup

```bash
# PostgreSQL
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql

# Redis (RDB snapshot)
redis-cli -u "$REDIS_URL" SAVE
```

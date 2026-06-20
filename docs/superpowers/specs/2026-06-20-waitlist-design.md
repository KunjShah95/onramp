# Waitlist System Design
**Date:** 2026-06-20  
**Project:** CodeFlow — AI-Powered Developer Onboarding  
**Status:** Approved, pending implementation

---

## Overview

Pre-launch waitlist capturing early interest before CodeFlow opens publicly. Users register at `/waitlist`, data writes to Google Sheets, confirmation emails fire via SendGrid.

---

## Architecture

```
Browser
  └─ /waitlist (React page)
       └─ POST http://localhost:3008/api/v1/waitlist/join
            └─ waitlist-service (FastAPI, port 3008)
                 ├─ Validate fields (Pydantic)
                 ├─ Append row → Google Sheets (gspread + service account)
                 ├─ Send email → SendGrid (user confirmation + admin alert)
                 └─ Return { position: N, message: "..." }
```

New service at `services/waitlist-service/app/main.py`. Single endpoint. Mirrors structure of `services/user-service/`.

---

## Backend

### Service
- **Location:** `services/waitlist-service/app/main.py`
- **Port:** 3008
- **Framework:** FastAPI (same as all other services)

### Endpoint

```
POST /api/v1/waitlist/join
GET  /api/v1/waitlist/count   (returns { count: N } for social proof strip)
GET  /health
```

### Request Body
```json
{
  "email": "dev@company.com",
  "name": "Jane Smith",
  "role": "developer | manager | cto",
  "company": "Acme Corp",
  "team_size": "1-10 | 11-50 | 51-200 | 200+",
  "use_case": "free text, max 500 chars"
}
```

### Response
```json
{ "success": true, "position": 42, "message": "You're #42 on the list!" }
```

### Duplicate Handling
Email already in sheet → return 409 `{ "detail": "Already on the list" }`. No second row written, no second email.

### Rate Limiting
5 requests/IP/hour — same `RateLimitMiddleware` pattern as `user-service`.

### Environment Variables
```
GOOGLE_CREDENTIALS_JSON=<service account JSON string>
GOOGLE_SHEET_ID=<spreadsheet ID from URL>
SENDGRID_API_KEY=<same key used by notification-service>
SENDGRID_FROM_EMAIL=noreply@codeflow.dev
ADMIN_EMAIL=kkshah2005@gmail.com
```

---

## Google Sheets

### Auth
Service account JSON stored in `GOOGLE_CREDENTIALS_JSON` env var. Library: `gspread` + `google-auth`.

### Sheet Columns (in order)
| Column | Value |
|--------|-------|
| Timestamp | ISO 8601 UTC |
| Name | string |
| Email | string |
| Role | developer / manager / cto |
| Company | string |
| Team Size | 1-10 / 11-50 / 51-200 / 200+ |
| Use Case | string |
| Position | integer (row count at time of insert) |

Duplicate check: scan email column before writing. If found, 409.

---

## Email (SendGrid)

Both emails fire async (`asyncio.create_task()`) after sheet write confirms. Signup never fails due to email failure.

### User Confirmation
```
To: {email}
Subject: You're on the CodeFlow waitlist!
From: noreply@codeflow.dev

Hi {name},

You're #{position} on the CodeFlow early access list.

We'll email you the moment we launch. In the meantime, reply to
tell us more about your team — we read every message.

— The CodeFlow Team
```

### Admin Alert
```
To: kkshah2005@gmail.com
Subject: New waitlist signup — {name} from {company}
Body: All fields + timestamp + position number
```

---

## Frontend

### Route
`/waitlist` — public, no auth required. Added to `App.tsx` routes.

### Nav Changes (`LandingPage.tsx`)
- Add "Join Waitlist" link in nav → `/waitlist`
- Replace "Get Started Free" hero CTA → "Join Waitlist" (links to `/waitlist`)

### Page Structure
```
[Floating nav — same as LandingPage]

[Hero section]
  Status pill: "Coming Soon" (orange pulse dot)
  H1: "Be first to transform how your team onboards"
  Subtext: early access / launch framing

[Form card — centered, max-w-lg, dark card bg]
  Name          [text input]
  Email         [email input]
  Role          [select: Developer / Manager / CTO]
  Company       [text input]
  Team Size     [select: 1-10 / 11-50 / 51-200 / 200+]
  Use Case      [textarea, 500 char max]
  [Join Waitlist →] button — orange, full-width, loading state

[Success state — replaces form after submit]
  "You're #42 on the list! Check your email."
  Framer Motion pulse/confetti animation

[Social proof strip]
  "X developers already waiting"
  Count fetched from GET /api/v1/waitlist/count on page load
```

### Design Tokens (match existing)
- Background: `#050505`
- Accent: `#FF8C00` / `#FFB347`
- Text: `#FDFBF8`
- Font display: `font-display`, body: `font-body`
- Same `ShaderBackground` + `Spotlight` components as LandingPage

---

## Files to Create / Modify

### Create
- `services/waitlist-service/app/main.py`
- `services/waitlist-service/pyproject.toml`
- `web/src/pages/WaitlistPage.tsx`

### Modify
- `web/src/App.tsx` — add `/waitlist` route
- `web/src/pages/LandingPage.tsx` — update nav + hero CTA
- `docker-compose.yml` — add `waitlist-service`

---

## Out of Scope
- Admin dashboard to view/export signups (use Google Sheets directly)
- Waitlist position emailing in batches
- Referral / invite system

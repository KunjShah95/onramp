# 🎯 Onramp — Problem Statement

**Last updated:** 21 Aug 2026
**Status:** Validated with customer conversations · Wedge built (v1.4-v1.6 + Phase 0) · Next: 5-team validation interviews

---

## The problem (one sentence)

> **New developers waste expensive senior-developer time while ramping up, and engineering leaders have no way to track the ramp or intercept the drain — costing senior devs their focus and companies real money.**

### The root cause

Institutional knowledge fails to flow to the people who need it. It lives in senior devs' heads and stale docs, so every new hire re-asks the same questions, every slow ramp burns the most expensive hours in engineering, and leaders are blind to all of it until it shows up in attrition or delivery slippage.

All four pains we hear about — slow ramp-up, review bottlenecks, no visibility, stale docs — are symptoms of this single root cause.

## Why we believe it (evidence)

From direct conversations with engineering teams:

- **Leaders could not track new devs.** No visibility into who was ramping, who was stuck, or how much senior time was being consumed.
- **New devs wasted senior devs' time.** Repeated questions, re-explaining, review cycles — time spent on things that should be self-serve.
- **The stakes are financial.** Senior time is the most expensive hour in engineering; every hour re-answered and every week of slow ramp is lost cost — for the senior dev and for the company.

### Cost math (working numbers — pressure-test with 3–5 customers)

| Factor | Estimate |
| --- | --- |
| Fully-loaded senior dev cost | ~$75–100 / hour |
| Senior time burned per new dev | ~30–60 min / day (questions + context-switch + review) |
| Ramp lag cost | ~3 months at ~50% productivity ≈ 25% of a new dev's salary wasted |
| Team with 10 new devs / year | ≈ $50k–100k / year in burned senior time alone |

*These are estimates to validate in interviews — not claims.*

## Who feels it

| Persona | Pain | Wants |
| --- | --- | --- |
| **Engineering leaders (CTO / EM)** | Blind to ramp progress; can't quantify or fix the senior-time drain | Tracking, alerts, a cost story |
| **Senior devs** | Repeated questions, slow reviews, context-switching | Self-serve answers; less re-explaining |
| **New devs** | No clear path; stuck silently; don't know what "productive" looks like | Guided ramp, instant answers, clear milestones |
| **HR / Talent** | No data on onboarding health | Progress and retention signals |

## Our wedge — Ramp Visibility & Senior-Time Protection

One complete loop, proven end-to-end before anything else:

1. **Track** — every new dev's ramp is visible: what they've learned, what they're working on, where they're stuck.
2. **Quantify** — measure the cost: senior hours burned, review cycles, ramp lag vs. a team benchmark.
3. **Intercept** — when a new dev is stuck or burning senior time, route to self-serve (Repo Q&A, learning paths, wiki) and alert the leader **before** more time is lost.

## The four pillars (one root problem)

| Pillar | Pain point | Persona | Primary metric | Status |
| --- | --- | --- | --- | --- |
| **P1 · Ramp-up** | Ramp-up too slow; senior time drained | New devs + leads | Time-to-first-merged-PR ↓ | 🔴 **Wedge — now** |
| **P2 · Reviews** | Review bottleneck | Senior devs, leads | Review turnaround ↓ · senior hours saved ↑ | 🟡 Phase 2 |
| **P3 · Visibility** | Leaders blind to progress | CTO / EM / HR | Stuck devs surfaced in <24h | 🟡 Phase 3 |
| **P4 · Stale docs** | Docs drift from code | Everyone | Questions answered without a human ↑ | 🔵 Folded into P1 |

## Success metrics (the loop is done when…)

- Median time-to-first-merged-PR drops measurably vs. a measured baseline.
- Senior time burned per new dev drops ≥ 50% once interception is live.
- ≥ 70% of new-dev questions resolve without a senior.
- Leaders get a stuck-dev alert within 24 hours of the stall.

## What we will NOT do (yet)

- ❌ **AIaaS public gateway / SDK-as-a-product / usage-based billing** — a different business (reselling AI APIs). Revisit only if we deliberately pivot.
- ❌ **Community marketplace, Ollama self-hosting** — ecosystem plays, not problem-solving.
- ❌ **"Senior Dev Roast", codebase trailers, hot-take reviews, DevScore crowns** — garnish with no problem attached.
- ⏸️ **SSO/SAML, SCIM, SOC2, tenant isolation, secrets vault** — enterprise *stage-gates*. Pull forward only when a real deal demands them.

---

*Every feature in the roadmap must trace back to this statement. If it doesn't, it's cut.*

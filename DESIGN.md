# Visual Constitution: Onramp Redesign

> **Last updated:** 2026-09-19 — **calm revision.** The AI-SaaS motion layer (spotlights, glow
> pools, animated ribbons, springs, count-ups, gradient headlines) has been removed from every
> surface: landing, auth, dashboards, and workspace. See §06 for the motion policy and
> `web/UI-REVIEW.md` for the audit this revision responds to.

This document is the single source of truth for Onramp's design language. It defines a precise,
editorial, and technical identity — *calm at first glance, deep on inspection.*

## 01 — Design Principles
- **Precision over Decoration:** Every line, pixel, and weight must have a functional reason.
- **Decision-Centricity:** Interfaces guide the user toward a decision, not just display data.
- **Composition over Components:** Design the page as a cohesive layout, not a collection of floating cards.
- **Restrained Sophistication:** Calm at first glance, deep and technical upon exploration.
- **Stillness is a feature:** A screen that does not move is a screen you can read. Motion is a
  last resort, never a default.

---

## 02 — Typography System
Typography is the primary tool for hierarchy. We avoid oversized headings and excessive weights.

### The Type Scale
- **Display (L1):** `text-xl` to `text-2xl` | Semi-bold | For primary page titles only.
- **Section (L2):** `text-base` to `text-lg` | Medium | For distinct content regions.
- **Body (L3):** `text-sm` | Regular | The workhorse. Optimized for readability and line-length.
- **Metadata (L4):** `text-xs` | Regular/Medium | For timestamps, labels, and secondary hints. Monospace for technical IDs.

### Typographic Rules
- **Numerical Precision:** Tabular numbers for all data tables to ensure vertical alignment.
- **Contrast:** Use tonal contrast (e.g., Slate-900 → Slate-500) rather than just size to denote importance.
- **Intentionality:** No "giant" hero text in dashboards. The title identifies the page; the data drives the experience.
- **No gradient text.** Headlines are set in ink. `--ink` on `--room`, nothing else. The
  `.text-gradient` class is retained only as an inert alias and renders solid ink.
- **One weight step per level.** Do not mix `font-bold`, `font-semibold`, and `font-medium`
  on the same control. Body copy is `400`; emphasis is one step up, never two.

---

## 03 — Surface & Depth System
**The "Anti-Card" Mandate:** Cards are used only for distinct, portable units of information. Layouts are built using a "Pane and Divider" architecture.

### Surface Hierarchy
- **Level 0 (Base):** The primary canvas. Neutral, low-contrast. Flat — no ambient glows, no
  background grids, no blurred color pools behind content.
- **Level 1 (Panels):** Defined by 1px borders or subtle tonal shifts. Used for sidebars,
  toolbars, and main content regions.
- **Level 2 (Overlays):** Contextual menus, modals, and tooltips. Hairline border plus one soft
  shadow. No blur-backed "glass", no neon rims.

### The Border System
- **Hairline Precision:** 1px borders are the primary separator.
- **Tonal Borders:** Borders are slightly darker/lighter than the surface they bound, creating a
  "physical" feel without heavy shadows.
- **Geometry:** Small, intentional corner radii (3px–6px). No "pill" shapes for main containers.
  Pills are reserved for genuine tags and segmented controls.
- **Shadows:** Essentially absent. Depth is expressed by borders and tone. No glow shadows.

---

## 04 — Color Palette
Color is a signal, not a decoration.

### Functional Palette
- **Primary:** A single deep tone used for primary actions and active states (`--go`).
- **Accent:** Used sparingly for "Attention" or "Success."
- **Status Signals:**
    - `Critical`: high-contrast red (error/danger)
    - `Warning`: amber (attention/drift)
    - `Success`: sage/emerald (completed/healthy)
    - `Info`: steel blue (neutral info)

### Surface Tones
- **Dark Mode:** Deep charcoals and slates. No pure blacks.
- **Light Mode:** Warm whites and soft greys. No sterile `#FFFFFF` canvases.

### Color Rules
- **One accent per view.** Status hues appear only where a status exists.
- **No stock-hue utilities.** Use `text-go` / `text-caution` / `text-abort` / `text-mission`
  (and their `bg-`/`border-` forms). Literal Tailwind hues (`text-emerald-400`,
  `bg-violet-400/10`, …) are not permitted in product surfaces — the legacy `signalRamp` bridge
  in `tailwind.config.ts` exists for migration only, not as a palette.
- **No gradients.** Gradient fills, gradient text, and gradient seams are decoration without
  function and are not part of the system.
- **Alpha modifiers need the `-rgb` bridge.** Every Folio token defines both
  `--ink-muted: #888D98` (for raw CSS, canvas, SVG) and `--ink-muted-rgb: 136 141 152` (for
  Tailwind). `tailwind.config.ts` wires the colour utilities to the `-rgb` form with
  `<alpha-value>`, which is what makes `text-ink-muted/60`, `bg-well/40`, `bg-go/10` and
  `border-seam/50` actually render. A token without its `-rgb` companion silently drops every
  opacity utility — if you add a token, add the triplet in the same block.

---

## 05 — Layout & Grid
### The Editorial Grid
- **Asymmetry:** Allow for 2/3 and 1/3 splits. The "Main Content" area is wide; "Contextual Panels" are narrow.
- **Vertical Rhythm:** Strict 4px/8px spacing scale.
- **Alignment:** Hard left-alignment for most technical views to mirror editorial design.
- **Marketing sections:** One shared container width (`max-w-6xl`), consistent vertical rhythm
  (`py-16` / `lg:py-20`), and hairline-divided bands. Sections differ by content, not by
  decoration.

---

## 06 — Interaction & Motion

### State Logic
- **Hover:** A subtle shift in background tone or border weight (CSS `transition`, 120–150ms).
- **Active:** A clear, tactile "pressed" state.
- **Focus:** A high-visibility, high-contrast ring for accessibility.

### Motion Policy (calm revision)
The following are **prohibited** in product and marketing surfaces:

- Cursor-following spotlights, magnetic buttons, and pointer parallax.
- Infinite loops: marquees, drifting beams, pulse/ping rings, rotating conic borders.
- Spring physics and staggered entrance choreography.
- Number count-ups and typewriter effects.
- Ambient glow pools, bloom/glow layers, and blurred color blobs behind content.
- Route-transition animations.

What remains:

- CSS-only hover/focus transitions on interactive elements.
- The loading spinner and the skeleton shimmer — signalling work in progress, not decorating it.
- Opacity/visibility toggles driven by state (no animated entrance).

**Implementation:** motion is expressed with CSS transitions in `src/index.css` and the
`.btn*` / `.input` / `.status-tile` component classes. `framer-motion` is no longer imported by
application code; `src/components/ui/landing-motion.tsx` retains the historical primitive names as
inert, static components so older call sites keep compiling. `useReducedMotion` is replaced by
`prefersReducedMotion()` from `src/lib/device.ts`.

# Visual Constitution: Onramp Redesign

> **Last updated:** 2026-08-21 — constitution unchanged; Workbench implementation in `web/src/components/` + `web/THEMES.md` (slate/ember/aurora/paper) follows this spec.
> See `docs/ARCHITECTURE.md` (delta section), `PROJECT.md` (arch diagram), and `ROADMAP.md` for the current product context.

This document defines the original design language for Onramp. It is the single source of truth for the authenticated experience, moving away from "AI-SaaS" generics toward a precise, editorial, and technical identity.

## 01 — Design Principles
- **Precision over Decoration:** Every line, pixel, and weight must have a functional reason.
- **Decision-Centricity:** Interfaces should guide the user toward a decision, not just display data.
- **Composition over Components:** Design the page as a cohesive layout, not a collection of floating cards.
- **Restrained Sophistication:** Calm at first glance, deep and technical upon exploration.

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
- **Contrast:** Use tonal contrast (e.g., Slate-900 $\rightarrow$ Slate-500) rather than just size to denote importance.
- **Intentionality:** No "giant" hero text in dashboards. The title identifies the page; the data drives the experience.

---

## 03 — Surface & Depth System
**The "Anti-Card" Mandate:** Cards are used only for distinct, portable units of information. Layouts are built using a "Pane and Divider" architecture.

### Surface Hierarchy
- **Level 0 (Base):** The primary canvas. Neutral, low-contrast.
- **Level 1 (Panels):** Defined by borders or subtle tonal shifts. Used for sidebars, toolbars, and main content regions.
- **Level 2 (Overlays):** Contextual menus, modals, and tooltips. Use subtle shadows and high-contrast borders.

### The Border System
- **Hairline Precision:** 1px borders are the primary separator.
- **Tonal Borders:** Borders should be slightly darker/lighter than the surface they bound, creating a "physical" feel without heavy shadows.
- **Geometry:** Small, intentional corner radii (e.g., 4px–6px). No "pill" shapes for main containers.

---

## 04 — Color Palette
Color is a signal, not a decoration.

### Functional Palette
- **Primary:** A single, sophisticated deep-tone (e.g., a refined Navy or Charcoal) used for primary actions and active states.
- **Accent:** Used sparingly for "Attention" or "Success."
- **Status Signals:**
    - `Critical`: High-contrast Red (Error/Danger)
    - `Warning`: Amber (Attention/Drift)
    - `Success`: Sage/Emerald (Completed/Healthy)
    - `Info`: Steel Blue (Neutral Info)

### Surface Tones
- **Dark Mode:** Deep charcoals and slates. No pure blacks.
- **Light Mode:** Warm whites and soft greys. No sterile `#FFFFFF`.

---

## 05 — Layout & Grid
### The Editorial Grid
- **Asymmetry:** Allow for 2/3 and 1/3 splits. The "Main Content" area is wide; "Contextual Panels" are narrow.
- **Vertical Rhythm:** Strict 4px/8px spacing scale.
- **Alignment:** Hard left-alignment for most technical views to mirror editorial design.

---

## 06 — Interaction & Motion
### State Logic
- **Hover:** Subtle shift in background tone or border weight.
- **Active:** A clear, tactile "pressed" state.
- **Focus:** High-visibility, high-contrast ring for accessibility.

### Motion Language
- **Purpose:** Motion explains *spatial relationship* (where did this panel come from?) or *status change* (data updating).
- **Execution:** Fast, linear-to-ease-out transitions. No "bouncy" or "playful" animations.

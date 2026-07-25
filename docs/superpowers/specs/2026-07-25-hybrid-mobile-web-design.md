# Hybrid mobile web shell — BEXO product app

**Date:** 2026-07-25  
**Status:** Approved for implementation  
**Scope:** `bexo-web` product app (+ marketing site mobile fit). Native apps out of scope.

## Goal

On phones, BEXO should feel calm, thumb-first, and smooth — not a shrunk desktop. Desktop layout stays unchanged.

## Approach: Hybrid C

- **Dashboard (<768px):** slim top bar + bottom tab bar  
- **Onboarding:** sticky thumb CTA dock (existing, tightened)  
- **Auth / checkout / welcome:** full-bleed, thumb-primary actions, no tabs  
- **Low-power:** mobile defaults to lite motion (no drifting orbs / heavy blur)

## Bottom tabs

| Tab | Route |
| --- | --- |
| Home | `/dashboard` |
| Edit | `/dashboard/edit-profile` |
| Updates | `/dashboard/updates` |
| Inbox | `/dashboard/inbox` |
| More | Sheet: Analytics, Settings, Billing, Visit site, Sign out |

## Feel / performance

- `100dvh` + safe-area insets  
- Min 44×44pt taps; press `scale(0.97)` ease-out ~180ms  
- Animate only `transform` / `opacity`  
- Respect `prefers-reduced-motion` and `data-bexo-motion=lite|reduced`  
- Content bottom padding clears the tab bar  

## Components

- `MobileTabBar` + More sheet  
- `resolveMobileTab(path)` helper  
- CSS: `--bexo-mobile-tab-h`, `.bexo-mobile-tabbar`, mobile atmosphere lite  

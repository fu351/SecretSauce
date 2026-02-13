# Theming Style Guide

## Agent Metadata

- `Doc Kind`: `guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `app/globals.css`, `contexts/theme-context.tsx`, `components/providers/theme-sync.tsx`, `app/layout.tsx`, `tailwind.config.ts`
- `Update Trigger`: Theme tokens, palette strategy, provider behavior, or cross-site styling conventions change.

## Agent Use

- `Read this when`: updating dark/light mode behavior, adding UI that must match existing visual language, or refactoring color/token usage.
- `Stop reading when`: you need business-domain behavior not related to presentation/theme.
- `Escalate to`: `docs/agent-canonical-context.md` for policy conflicts, implementation files listed above for source-of-truth behavior.

## Purpose

Document the current, implementation-backed theming conventions used across the website so new UI work stays visually and behaviorally consistent.

## Theme Architecture

1. Theme engine is `next-themes` via `contexts/theme-context.tsx`.
2. Theme is class-driven on `<html>` (`attribute="class"`), with `defaultTheme="dark"` and `enableSystem={false}`.
3. `app/layout.tsx` initializes `<html className="dark">` to reduce initial flash and match dark-default behavior.
4. `components/providers/theme-sync.tsx` syncs authenticated profile preference (`theme_preference`) into runtime theme and defaults invalid/missing values to `dark`.
5. Theme preference is persisted through profile updates (notably settings and onboarding flows) and mirrored in local theme state.

## Color Token Conventions

The site uses semantic Tailwind color names mapped to CSS variables.

- Token definitions: `app/globals.css` under `:root` (light/warm mode) and `.dark` (dark/warm mode).
- Token-to-utility mapping: `tailwind.config.ts` (`background`, `foreground`, `card`, `primary`, `muted`, `accent`, `border`, `ring`, `sidebar`, `chart`).
- Preferred usage in components:
  - `bg-background`, `text-foreground`
  - `bg-card`, `text-card-foreground`
  - `bg-primary`, `text-primary-foreground`
  - `text-muted-foreground`
  - `border-border`, `ring-ring`

Key brand palette tokens currently implemented:

| Token | Light Mode (`:root`) | Dark Mode (`.dark`) |
|---|---|---|
| `--background` | `43 67% 94%` (warm cream) | `36 16% 7%` (warm charcoal) |
| `--foreground` | `20 14% 20%` | `45 42% 87%` |
| `--primary` | `25 85% 50%` (orange) | `45 60% 74%` (gold) |
| `--ring` | `25 85% 50%` | `45 62% 72%` |
| `--border` | `39 20% 80%` | `45 20% 20%` |

## Typography Conventions

1. `Inter` is loaded as the base body font and applied with `font-sans` in `app/layout.tsx`.
2. `Playfair Display` is loaded for editorial/display styling; headings commonly use `font-serif font-light`.
3. Existing visual tone favors high-contrast serif headlines and lighter body/supporting copy.

## Component Styling Conventions

1. Prefer semantic utilities and shared UI primitives (`components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/input.tsx`, `components/ui/badge.tsx`) over new ad-hoc color classes.
2. Prefer tokenized variants (`primary`, `secondary`, `destructive`, etc.) before introducing page-local styling branches.
3. Use `dark:` modifiers for narrow exceptions, not as the primary styling strategy for all components.
4. When a component must branch by theme at runtime, use `useTheme()` from `contexts/theme-context.tsx`.

## Accessibility and UX Conventions

1. Global focus treatment uses `*:focus-visible` with `outline-ring` from theme tokens (`app/globals.css`).
2. Motion reduction is enforced globally via `@media (prefers-reduced-motion: reduce)`.
3. Placeholder text is globally de-emphasized using `--muted-foreground` alpha values.
4. Theme-specific logo assets are selected by mode (for example `/logo-dark.png` vs `/logo-warm.png`).

## Legacy Patterns and Migration Guidance

The codebase currently contains two styling patterns:

1. Canonical tokenized styling (preferred): semantic Tailwind classes backed by CSS variables.
2. Legacy hard-coded palette usage (still present): explicit values like `#181813`, `#1f1e1a`, `#e8dcc4` in `isDark` class branches.

To preserve behavior while migration is ongoing, `app/globals.css` includes dark-mode compatibility overrides that remap many legacy hard-coded classes to tokenized values.

Conventions for new work:

1. Do not introduce new hard-coded dark palette hex classes when a semantic token exists.
2. When touching legacy screens, prefer incremental replacement with semantic token classes.
3. If a one-off hard-coded class is temporarily necessary, add a follow-up migration note and keep behavior compatible with `.dark`.
4. Treat `styles/globals.css` as legacy reference only; active global styling is driven by `app/globals.css`.

## Practical Checklist for New UI

1. Use semantic classes first (`bg-background`, `text-foreground`, `border-border`, `ring-ring`).
2. Verify both modes manually (`light` and `dark`) using settings or `setTheme`.
3. Confirm focus-visible states remain clear in both modes.
4. Confirm contrast for muted/supporting text against current background.
5. Avoid introducing mode-specific duplicated class trees unless required by layout/art direction.

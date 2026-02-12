# Agent Canonical Context

## Subscription Tiers (Current Truth)

- Valid tiers are only `free` and `premium`.
- `enterprise` is legacy/deprecated and should not be used in new code, docs, experiments, or access checks.
- If legacy data appears with a third-tier value, treat it as migration debt and normalize to `premium`.

## Access Rules

- `requireAuth()` means user must be signed in.
- `requireTier("free")` means any signed-in user.
- `requireTier("premium")` means active premium user.

## Agent Guardrails

- Do not generate examples using `requireTier("enterprise")`.
- Do not describe a three-tier model.
- When in doubt, defer to `lib/auth/subscription.ts` and `hooks/use-subscription.ts` for current behavior.

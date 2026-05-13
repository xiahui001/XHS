# Regression Baseline

This project has a focused baseline for the ActivityWang-to-draft workflow.

## Protected Behavior

- ActivityWang original-image entitlement is read from `vip_down_count` and `vip_last_down_count`, not from generic UI copy or free-trial counters.
- ActivityWang collection searches live results first, paginates/scrolls, dedupes, and only backfills from the local image pool when live images are insufficient or unavailable.
- Drafts keep assigned `generatedImages` and report real publishable image counts from usable URLs or local paths.
- Draft library loading, auth session restore, mobile package creation, and mobile publish pages keep the current working behavior.

## Command

Run this before and after changing the guarded workflow:

```bash
npm run test:baseline
```

The command exits non-zero on failure. Before shipping broader changes, also run:

```bash
npm run regression
```

## Current Evidence

The baseline was created after manually verifying that the 2026-05-13 `校园路演` run downloaded 12 ActivityWang original images into `data/eventwang-gallery/keyword-校园路演/2026-05-13T14-20-16-356Z` and assigned them to draft `8d4c1791-0cf6-4a6d-b94e-66004ce70aaa`.

The entitlement check for the actual downloaded gallery IDs returned `vip_down_count: 50` and `vip_last_down_count: 38`, proving those 12 original-image downloads were counted by ActivityWang.

Suggested checkpoint tag after committing a known-good state:

```bash
git tag baseline-2026-05-13-activitywang-drafts
```

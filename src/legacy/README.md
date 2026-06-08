# Legacy

Disabled or retired code kept for reference. **Nothing here is wired into
`manifest.json`, so none of it ships or runs in the extension.** It still lives
under `src/`, so `tsc` type-checks it and any `declare global` it contains stays
visible to the rest of the project.

## alarm-sync

Cloudflare D1 + Discord webhook alarm pipeline. Disabled via
`ALARM_FEATURE_ENABLED = false`; the whole IIFE is a no-op and
`globalThis.ASMAlarmFeature` is never set, so the calendar UI's alarm controls
(in `features/mentoring-registration-history/calendar/CalendarHeader.tsx`) stay
inert and the page-load auto-sync in
`entrypoints/mentoring-registration-history/index.ts` is skipped by its
existing null-check.

Retired from the build on 2026-06-08 (was previously a no-op content script).

### Re-enable

1. Move `legacy/alarm-sync/` back under `src/features/`.
2. In `manifest.json`, re-add to the second content_script: a thin
   `src/entrypoints/alarm-client.ts` (`import '@features/alarm-sync/alarm-client';`)
   to the `js` array, and `src/features/alarm-sync/alarm-client.css` to `css`.
3. Set `ALARM_FEATURE_ENABLED = true`.

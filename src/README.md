# Source Layout

This project is a React + TypeScript + Vite Chrome extension.

- `entrypoints/`: manifest-facing Vite inputs. Keep these files thin; they should route page/runtime events into feature modules.
- `features/`: product behavior grouped by domain, such as the mentoring board, mentoring registration history, conflict checks, calendar export, alarm sync, and schedules.
- `shared/`: cross-feature building blocks for UI, Shadow DOM mounting, storage, date parsing, and SOMA URL/location helpers.

Import rules:

- Use `@features/*` for cross-feature domain imports.
- Use `@shared/*` for reusable infrastructure and UI.
- Use relative imports inside the same feature folder.
- Keep browser extension wiring in `entrypoints/`, not in shared helpers.

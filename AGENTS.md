# Repo Atlas — Agent Instructions

## Project overview

Repo Atlas is an offline-first desktop Git repository visualizer built with Electron, React, Vite, Tailwind CSS, and Radix/shadcn-style UI primitives. It reads local repository metadata and keeps Git operations safe and explicit.

Read `README.md`, `docs/ARCHITECTURE.md`, and the relevant implementation plan under `docs/plan/` before making broad changes.

## Requirements and commands

- Node.js 22 or newer, npm 10 or newer, and Git on `PATH`.
- Install dependencies with `npm install`.
- Run the app with `npm run dev`.
- Run tests with `npm test`.
- Check Electron entry points with `npm run check:electron`.
- Build the renderer with `npm run build`.
- Build installers with `npm run dist` only when packaging is requested; packaging is target-platform dependent.

Validation expectations:

- Changes to Electron or Git services: run `npm test` and `npm run check:electron`.
- Changes to React, Vite, or styling: run `npm test` and `npm run build`.
- Documentation-only changes do not require a build unless their examples or commands change.

## Architecture and safety constraints

- Keep the renderer isolated from Node.js. Preserve `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the explicit `contextBridge` API.
- Add narrowly scoped IPC channels and validate payloads. Do not introduce generic APIs such as `runShell`, `runGit`, `readAnyFile`, or unrestricted IPC forwarding.
- Execute Git through `execFile` with an argument array, never through a shell command string.
- Keep normal operations read-only. Cherry-pick is the only supported write operation and must remain behind preview, confirmation, and repository-state guards.
- Preserve browser/demo mode and offline-first behavior; do not add telemetry, authentication, cloud storage, or remote network calls without an explicit requirement.
- Validate repository-relative paths, commit hashes, and ref names at the Electron boundary.

## Repository layout

- `electron/`: main process, preload bridge, and Git service.
- `src/`: React renderer, feature components, UI primitives, and client-side helpers.
- `tests/`: Node test suites for Git parsing/integration and graph layout invariants.
- `docs/`: architecture, roadmap, and implementation plans.
- `graphify-out/`: generated graph artifacts; ignored by Git and not committed unless explicitly requested.

## Graphify

When the user invokes `/graphify`, follow `.codex/skills/graphify/SKILL.md` before inspecting the codebase. If `graphify-out/graph.json` exists and the user asks a codebase question, use the graphify query/path/explain flow first as appropriate. Never invent graph relationships; preserve the extraction confidence labels and audit trail.

## Git workflow

- Inspect `git status` before editing and preserve unrelated user changes.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, or `chore:`).
- Stage only the files relevant to the requested task, then verify the staged diff before committing.
- Do not push, rewrite history, reset, clean, or alter remotes unless explicitly requested.

# MVP validation report

Validated on 2026-08-02 from `chore/mvp-validation`, based on `origin/main` at `96c3ef1`.

## Result

The fixture-provider MVP backend workflow is operational with real PostgreSQL persistence, and the Windows Tauri application builds and runs against that API. Validation found and fixed one release-blocking integration defect: Tauri WebView requests could not pass the API's CORS preflight. The desktop production bootstrap was also corrected to identify the API-backed mode rather than mock mode.

The following workflow was verified with persisted records and real application services:

1. Observation collection, local queue persistence, and API upload.
2. Goal inference after the configured observation windows.
3. Native Goal confirmation and restoration after restart.
4. Checkpoint creation, Gap creation, continuity planning, deterministic policy evaluation, tool execution, Gap completion, recovery generation, and History retrieval through the real API and database.

The current deterministic policy produces only `AUTO_EXECUTE` or `DOWNGRADE` decisions for the fixture plan. It therefore creates no approval-pending action in this scenario. Approval approve/reject behavior remains covered by the automated API suite; changing the finalized policy merely to force an approval prompt was outside validation scope.

## Verification evidence

- Database migrations `0001`, `0002`, and `0003` applied successfully.
- API health and Tauri-origin CORS preflight succeeded on an isolated local port.
- A strict persisted workflow produced a checkpoint, Gap, continuity plan, two action results, completed recovery, and a completed History entry.
- Native observation uploads drained the persisted local queue to zero and increased remote activity records.
- A confirmed Goal (`goal-002`) and the observation work session survived a native application restart.
- `pnpm test`: all six workspace tasks passed; 257 tests passed and one was skipped.
- `pnpm typecheck`: all six workspace tasks passed.
- `pnpm lint`: command passed; no workspace lint tasks are configured.
- `cargo check`: passed.
- Rust tests: 16 passed.
- Tauri production build: passed and produced `continuity-desktop.exe`.

## Manual E2E checklist

- [x] Start the database-backed fixture API.
- [x] Launch the native Tauri application.
- [x] Collect and upload desktop observations.
- [x] Infer and confirm a Goal in the native overlay.
- [x] Restart and confirm persisted Goal/session restoration.
- [x] Execute checkpoint-to-History workflow against the real API/database.
- [x] Confirm recovery and completed History records.
- [ ] Re-run the Gap start/end clicks and Recovery overlay visually in an interactive Windows desktop session. The validation host lost usable screen-capture/input handles late in the run; no product failure was observed, but this visual-only pass should be repeated before release sign-off.

## Release notes and remaining risks

- Use the repository-pinned `pnpm@10.0.0` through Corepack. The host fallback package manager was `pnpm@11.9.0` and enforced a minimum-release-age policy incompatible with the existing lockfile.
- Lint currently provides no source coverage because no package defines a lint task.
- The Tauri configuration produces the executable but does not currently define an installer bundle.
- A locally modified `.env.example` was intentionally excluded from this work. It contains credential-shaped values and must be sanitized, and any real credentials in it rotated, before the working tree is shared or committed.

## MVP disposition

Functionally ready for a controlled MVP demo using the fixture agent provider. Release freeze remains conditional on the final interactive Gap/Recovery UI click-through, credential sanitation/rotation, and a decision on whether installer packaging and actual lint coverage are required for the MVP distribution.

# PRODUCTION-OPS — rules for touching the deployed visualizer

Carried over from AnotherStoryBLDR (same rules, same reasons). These bind every task doc in `docs/tasks/`.

1. **Dev first, always.** Nothing reaches production that was not run and verified in a dev environment
   (the Replit workspace against the dev DB, or local Postgres) with real output: `curl` the route, query the table, open the page.
   "Published" / "deployed" status text is not evidence — the prior platform reported success falsely.
2. **Explicit OK before any production deploy.** Ben (or SSC once they own operations) says go. A merged PR
   is not a deploy authorization.
3. **Never type credentials.** API keys, tokens and passwords are entered by the account owner in the
   Replit Secrets pane (workspace AND deployment). Claude Code never pastes a secret, never commits one, never echoes one in a log.
4. **Schema changes are additive only.** `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` in
   `store-pg.js` and mirrored by `migrate.js`. No drops, no renames, no destructive backfills in boot code.
5. **Paid calls are gated.** Street View, Gemini and Postmark spend money; every entry point has a per-IP
   rate limit, session-owner check, and one-render-per-combination caching. Do not add an unauthenticated
   route that triggers any of them.
6. **Verify artifacts, not vibes.** Every render row stores `prompt_version`, the BOM and a `qa_score`.
   Every assessment is stored and re-runnable. A change to a prompt template bumps its version and is
   round-trip verified on the fixtures before it ships (`scripts/verify-template.js`).
7. **No DNS / registrar / billing changes by Claude.** Print the checklist; the account owner does it.
8. **Production is the published Replit deployment, not the workspace.** Republish ships the WORKSPACE, not
   GitHub main, so a merged fix can be absent from prod. `/admin/version` answers "is the fix live?" by
   reporting prompt versions and `replDeployment` — use it before re-diagnosing a bug that is already fixed.
9. **Test sends go to Ben first.** Postmark templates are sent to Ben's inbox before `sales@` ever receives
   one (TASK-009).
10. **Leads are never lost to a render failure.** A quote row is written before email is attempted, and a
    session row before any external call.

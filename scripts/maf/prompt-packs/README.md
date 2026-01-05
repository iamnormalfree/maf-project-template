# Prompt Packs (for `/broadcast-targeted`)

`/broadcast-targeted` in the Telegram bot drafts role prompts based on:
- Beads ready/in-progress state
- `bv --robot-triage` recommendations (label-aware)
- Current bead reservations (`.agent-mail/reservations/*.json`)

“Prompt packs” let you add **plan-specific guardrails + test commands + label preferences**
without editing `mcp_agent_mail/telegram-bot.js` each time.

## How it works

1) Put a JSON file in `scripts/maf/prompt-packs/<pack>.json`.
2) Set the active pack:
   - Telegram: `/broadcast-pack set <pack>`
   - Or write `.maf/config/broadcast-pack.json` manually.
3) Run: `/broadcast-targeted` (draft + supervisor approve) or `/broadcast-targeted auto` (send immediately).

Notes:
- The active selection file `.maf/config/broadcast-pack.json` is local (ignored by git).
- Adding/editing a pack JSON does not require restarting the bot service.
- When using `/broadcast-targeted auto`, the bot also sends the assignment via Agent Mail for durable reference.

## Meta-process (plan → beads → pack → broadcast loop)

This is the repeatable “operator SOP” for any new implementation plan:

1) Write the plan doc
- Add `docs/plans/<plan>.md` with goals + acceptance criteria + testing commands.

2) Create Beads (task authority)
- Create an epic + child tasks (use a stable ID prefix like `myplan-abc.*`).
- Add dependencies so `bd ready` only shows truly unblocked work.
- Apply labels that match routing domains (`backend`, `site`, `docs`, `publish`, `db`, etc).

3) Create the prompt pack (prompt authority)
- Add `scripts/maf/prompt-packs/<epic>.json` and commit it.
- Use:
  - `id_prefixes` to keep fallback selection inside the epic (prevents agents drifting).
  - `label_preferences` to steer `bv --robot-triage` picks per implementor.
  - `test_commands` so “questionable taste” engineers still run the right checks.
  - `guardrails` to keep behavior consistent (TDD, no pushes, etc).

4) Activate + run in Telegram
- `/broadcast-pack set <epic>`
- Prefer: `/broadcast-targeted` → `/broadcast-apply`
- Use: `/broadcast-targeted auto` only when the pack is stable.
- Monitor: `/activity`, `/snapshot`, `/stale`; fix stuck panes via `/unblock`.

## JSON schema (minimal)

```jsonc
{
  "id": "roundtable-jlh",
  "title": "Production-ready launch: snapshots + safe publish",
  "id_prefixes": ["roundtable-jlh."],
  "base_prefix": "Optional message prefix for all roles.",
  "supervisor": { "extra": "Optional extra supervisor instructions." },
  "reviewer": { "extra": "Optional extra reviewer instructions." },
  "implementor_1": {
    "label_preferences": ["site", "dx"],
    "reserve_paths_hint": "apps/site/**",
    "test_commands": ["pnpm --filter @roundtable/site test", "pnpm --filter @roundtable/site build"]
  },
  "implementor_2": {
    "label_preferences": ["backend", "db", "publish"],
    "reserve_paths_hint": "apps/backend/**",
    "test_commands": ["pnpm --filter backend test"]
  },
  "guardrails": [
    "Do not run git commit/push.",
    "Reserve only paths you touch.",
    "Write failing test first."
  ],
  "commit_protocol": {
    "implementors": "DO NOT commit - mark beads as closed with bd close, Reviewer will verify.",
    "reviewer": "DO NOT commit - review and approve/reopen beads.",
    "supervisor": "After reviewer sign-off, use ./scripts/maf/agent-commit.sh to commit completed epic work. This adds agent attribution to the commit message."
  }
}
```

Notes:
- `label_preferences` drives which `bv` recommendations get picked per implementor.
- `id_prefixes` restricts fallback selection from `bd ready` to a specific epic.

## Receipt Enforcement

**Policy: No receipt → no close.**

All prompt packs enforce receipt production and verification:

### Implementor Receipts
Implementor_1 and Implementor_2 must produce a receipt when closing beads:
- **What to include**: Summary of changes made, files modified, tests run, and any deviations from the plan
- **Format**: Structured receipt in Agent Mail message or bead closure note
- **Example receipt format**:
  ```
  Receipt for bead [id]:
  - Files modified: [list]
  - Tests run: [list] with results
  - Changes summary: [brief description]
  - Any deviations: [yes/no with explanation]
  ```

### Reviewer Verification
Reviewer must verify receipts before approving beads:
- **What to check**: All changes match the bead requirements, tests pass, no uncommitted changes
- **Verification step**: Run `git status` and `git diff` to verify changes match receipt
- **Approval**: Only approve if receipt is complete and accurate
- **Rejection**: Re-open bead with specific feedback if receipt is incomplete or inaccurate

### Enforcement
- Implementors: Add receipt to `extra` field or send via Agent Mail before `bd close`
- Reviewers: Check for receipt before approving - no receipt = automatic re-open
- Supervisor: Verify reviewer checked receipt before epic commit

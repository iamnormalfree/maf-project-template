# /response-awareness-light — Lightweight Implementation Protocol

Use this for medium complexity changes (typically ~3–5 files) where you want extra rigor without a full multi-phase orchestration.

## How to run

In your Claude Code pane, run:

`/response-awareness-light "<task description>"`

Example:
`/response-awareness-light "Implement roundtable-jlh.9: E2E verification for clone publish snapshots"`

## Protocol (keep it tight)

1) **Scope + files**
   - Identify the 1–2 likely entry files and adjacent callers.
   - Confirm the acceptance criteria / test command up front.

2) **Micro-plan**
   - 3–6 bullets: changes, files, and exact test commands.
   - Call out the riskiest assumption.

3) **Implement**
   - Make minimal, local changes; follow existing patterns.
   - Avoid unrelated refactors.

4) **Verify**
   - Run the bead’s target tests (or the smallest relevant subset).
   - If you can’t run them, state why and add compensating checks.

5) **Report**
   - Post a short “ready for review” update including: files touched + test command + result.


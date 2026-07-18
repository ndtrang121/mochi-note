# Stateful development workflow

## Source of truth

`.project/state.json` is the only current-state source. Roadmap and architecture documents describe intent; they do not override active state.

## Read protocol

At the start of each work session:

1. Read `AGENTS.md`.
2. Run `scripts/check-project-state.ps1 show`.
3. Read only the active task's `requiredDocs`.
4. Inspect files in the active task's `scope` as needed.

Do not recursively read `docs/`, old commits, build output, or unrelated feature folders unless the active task explicitly requires them.

## Task state machine

```text
ready -> in_progress -> verify -> committed
                  \-> blocked -> in_progress
```

- `ready`: task is selected and scoped, with no edits started.
- `in_progress`: exactly one task owns the current edits.
- `verify`: implementation is complete and every declared check is being run.
- `blocked`: progress requires a concrete external decision or unavailable dependency; record `blockedReason`.
- `committed`: represented by `lastCompletedTask`, not as an active status.

## Completion protocol

1. Confirm every changed path is inside `activeTask.scope`.
2. Set status to `verify`.
3. Run all commands in `activeTask.checks`.
4. Review `git diff --check` and `git status --short`.
5. Replace `activeTask` with the next roadmap task in `ready` state.
6. Move the completed task summary to `lastCompletedTask` with its commit hash added after commit when practical; the next commit may record the previous hash to avoid amending.
7. Commit immediately using the task's `commitMessage`.

Never hide a failing check, commit generated secrets, or mix opportunistic refactors into the active task.

## Task sizing

A task should be one reviewable outcome, normally touching one architectural layer or one vertical UI slice. Split it when it has multiple independent acceptance criteria or could reasonably require separate rollback.

## Change control

If implementation discovers a required change outside scope, update the state and roadmap first. Product-scope changes also require `docs/PRODUCT.md`; visual deviations require a fidelity-ledger entry in the final QA task.

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

## Verification policy

Choose the smallest checks that directly cover the changed behavior and its realistic failure modes. Verification is proportional to risk, not to the number of commands available in the repository.

- Keep `activeTask.checks` to one or two focused commands for normal tasks.
- Do not run `pnpm run quality`, the complete unit suite, E2E, or browser QA by default.
- Every declared check must have a short, concrete reason it could catch a regression from the task.
- Do not add broad checks only for extra confidence when narrower evidence already proves the change.
- If the planned checks are broader than the final change, reduce them in state before entering `verify`.

Use these defaults:

| Change | Default verification |
| --- | --- |
| Documentation, roadmap, or state only | Project-state validator only |
| CSS tokens, colors, spacing, or copy only | One focused visual or contrast check; add build only when syntax, imports, or bundling can realistically break; no unit suite, typecheck, E2E, or full browser matrix |
| Isolated TypeScript logic | Targeted unit test for the changed module; add typecheck only when types or public signatures changed |
| React component behavior | Targeted component test; add build or one browser interaction only when rendering or bundling is affected |
| Database, sync, migration, or auth behavior | The narrow local integration script that exercises the changed contract |
| Dependency, build tooling, shared cross-layer contract, release, or explicit QA task | Full quality or release suite when the task genuinely spans those risks |

Run full-suite verification only when the change crosses multiple architectural layers, changes shared infrastructure or dependencies, prepares a release, fixes an unknown regression surface, or the user explicitly requests it.

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

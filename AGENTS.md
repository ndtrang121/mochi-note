# MochiNote agent router

This repository uses task-scoped documentation. Do not read all files in `docs/`.

1. Run `powershell -ExecutionPolicy Bypass -File scripts/check-project-state.ps1 show`.
2. Read only `.project/state.json`, this file, and the files listed in `activeTask.requiredDocs`.
3. Work only inside `activeTask.scope`. If the task needs broader scope, update the state first.
4. Keep exactly one task `in_progress`. Use the transitions in `docs/WORKFLOW.md`.
5. Run every command in `activeTask.checks` before completing the task.
6. Update `.project/state.json`, then commit the completed task immediately with the planned commit message.
7. Never combine unrelated roadmap tasks in one commit.

The accepted visual reference is the image named in `docs/DESIGN.md`. Preserve unrelated user changes.

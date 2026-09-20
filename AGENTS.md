# Agent operating rules

## Startup and task ownership

GitHub Issues are the persistent task pool and project state. Use Issues, PRs, commits and repository documentation for durable knowledge; chat history is not authoritative project memory.

Keep Issues concise and human-readable: what we want to do, what is done and what comes next, with links to details. Use plain language in Issues, PR summaries and user updates; avoid unnecessary engineering jargon. Put detailed requirements and validation evidence in docs and PRs instead of repeating them. Track the first Mock milestone in Issue #4; use its M1-M5 checklist and related PRs rather than separate phase Issues. Close the tracker only when all phases are accepted. Keep checkpoints brief but sufficient to resume.

1. Read this file, README, `docs/project-state.md` and relevant design documents.
2. Inspect the current branch, working tree, Issues and related PRs. Preserve unrelated changes.
3. Query `agent:resume` first, then `status:pending`; exclude `agent:blocked` and unresolved dependencies.
4. Choose work by explicit user direction, dependencies, priority, Loved and continuity. Do not silently abandon resumable work for an unrelated task.
5. Inspect the Issue, latest Checkpoint, branch, PR, commits and diff before resuming.
6. Claim one actionable Issue, change Pending to WIP, remove stale Agent labels, and create or continue its branch.

## Lifecycle and review

Use exactly one `status:*` label: Graveyard, Idle, Pending, WIP, Qualified or Ranked (lowercase label values). Types, P0-P3 priority, `loved` and Agent state are separate dimensions. `loved` must not override blocking dependencies or urgent higher-priority work.

- Idle: not yet actionable. Pending: ready to be claimed. WIP: active work.
- Qualified: implementation and applicable checks complete, awaiting human review.
- Ranked: formally accepted and merged; close the Issue only after acceptance.
- Graveyard: abandoned or rejected; keep the Issue and record why.

Run applicable checks, update documentation, create or update a PR, then move WIP to Qualified with `agent:review`. Do not self-approve or automatically promote work to Ranked. Keep scope within the Issue and necessary dependencies.

## Interruption

Before stopping unfinished work, preserve changes, make a WIP commit, push when permitted and create or update a Draft PR when possible. Add a Checkpoint using `docs/checkpoint-template.md`. Return the Issue to Pending with `agent:resume`; retain `agent:blocked` if an external dependency prevents resumption. Record exact local commit IDs and the permission blocker when a push is impossible. Agents must remain replaceable, pausable and resumable.

## Authentication and privacy

For GitHub operations requiring or reasonably expecting authentication (including auth status/login, private repository access, authenticated clone/fetch/pull/push, Issues, PRs and repository management), request sandbox escalation immediately for the specific `gh` or `git` command. Explain that it needs the host's existing GitHub CLI, Git Credential Manager, SSH agent or browser authentication state. Local Git inspection may remain sandboxed.

Do not infer logout or missing permission from a sandbox-only failure; perform the minimum verification outside the sandbox. Prefer existing host authentication. Never request pasted tokens, print credentials, or commit private configuration. If escalation is denied, stop the authenticated operation and report the blocker.

Follow session-provided notification instructions when work finishes or needs human action. Keep private addresses and machine-specific credentials out of public Issues and commits.

## Validation

Run `python scripts/check_repository.py` and `git diff --check` for repository changes. CI runs the same repository checks. Once an application stack is selected, document and add its appropriate tests/build checks. A document check does not establish application functionality.

See `docs/task-workflow.md` for label definitions, task queries and transition rules.

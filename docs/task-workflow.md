# Issue-driven workflow

## Labels and task state

`.github/labels.json` is the repository-level fallback for GitHub Projects fields. Preserve existing unrelated labels. Personal repositories use `type:*` labels instead of organization Issue Types.

| Dimension | Values |
| --- | --- |
| Status (exactly one) | `status:graveyard`, `status:idle`, `status:pending`, `status:wip`, `status:qualified`, `status:ranked` |
| Type | `type:epic`, `type:feature`, `type:bug`, `type:task`, `type:research`, `type:refactor`, `type:chore` |
| Priority | `priority:p0` (critical), `priority:p1` (high), `priority:p2` (normal), `priority:p3` (low) |
| Loved | `loved` present = Yes; absent = No |
| Agent | `agent:ready`, `agent:resume`, `agent:blocked`, `agent:review` |

Agent state mapping: Available = Pending + ready; Working = WIP; Paused = Pending + resume; Blocked = blocked; Review = Qualified + review. A paused task can also be blocked. Never claim blocked work automatically.

Feature and Research forms start in Idle so an untriaged idea is not claimed automatically. Task and Bug forms also start in Idle; move them to Pending + ready after requirements, dependencies and acceptance criteria have been checked.

## Normal and interrupted work

Normal: `Idle -> Pending + ready -> WIP -> Qualified + review -> Ranked (closed)`.

Interrupted: `WIP -> Pending + resume -> WIP`. Add blocked if an external dependency remains. Remove ready when claiming, resume when resuming, and review when returning work to implementation. Replace the old status label rather than retaining multiple statuses.

Ranked requires satisfied acceptance criteria, applicable checks, completed review and formal acceptance/merge. It is never inferred from an Agent saying "done". Graveyard records rejection or abandonment without deleting history.

Prefer native parent/sub-Issue and blocked-by relationships when supported. Document dependencies in the Issue as well; do not add artificial task hierarchies.

## Query views

Run `gh issue list --repo HirasawaNiji/ai-karuta-arena --state all --search '<filter>'` with:

| View | Filter |
| --- | --- |
| Task Pool | `is:open label:status:pending -label:agent:blocked` |
| Resume | `is:open label:agent:resume -label:agent:blocked` |
| WIP | `is:open label:status:wip` |
| Review | `is:open label:status:qualified` |
| Blocked | `is:open label:agent:blocked` |
| Loved | `label:loved -label:status:ranked -label:status:graveyard` |
| Idle Ideas | `is:open label:status:idle` |
| Graveyard | `label:status:graveyard` |
| Completed / Ranked | `is:closed label:status:ranked` |

These are query definitions, not pre-created GitHub Project saved views. Project setup is optional until an account with the required Project permissions is available. If added later, use Status, Priority, Loved and Agent State fields with the same semantics and preserve a searchable `agent:resume` label.

## Initial remote setup

Authenticated `gh`/`git` commands require host authentication access outside the sandbox, as described in AGENTS.md. With repository write permission, inspect existing labels first:

```sh
gh label list --repo HirasawaNiji/ai-karuta-arena --limit 100
```

For each missing entry in `.github/labels.json`, run `gh label create NAME --repo HirasawaNiji/ai-karuta-arena --color COLOR --description DESCRIPTION`. Do not overwrite existing labels without checking their meaning. Issue form labels must exist remotely before the forms can apply them.

For a completely empty remote, publish the minimal baseline on local `main` first, then publish the initialization branch and create its PR. Check the remote again before doing so; if another contributor has established main, fetch and reconcile the histories instead of force-pushing.

No lifecycle automation is installed. Forms supply the initial labels after merge; contributors maintain later transitions. The only Actions workflow validates repository files and cannot accept or merge tasks.

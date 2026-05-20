# Protocol — Auto-Validate Hook (PostToolUse)

**Tier:** optional
**Applies to:** Steps 1, 2, 3, 4 (schemas, types, section routers)

When this protocol is installed, bootstrap registers a Claude Code `PostToolUse` hook that runs `npx @extragraj/stackshift-skills validate --hook` on every `Write` or `Edit`. The `--hook` flag reads the Claude Code PostToolUse JSON payload from stdin and extracts `tool_input.file_path` — that's the documented hook contract. The validator is path-aware: it short-circuits silently for files outside `schemas/custom/**/*.ts` and `components/sections/**/index.tsx`, so the hook is safe to apply project-wide.

**StackShift owns the validator and the hook installation.** UI Forge's `auto-verify-hook` is the parallel protocol for variant bodies — both hooks can coexist without overlap.

---

## What the hook checks

The validator runs the per-protocol checks documented in `cli/src/validate.ts`. Only protocols in `.stackshift/installed.json` are active; if a protocol is not installed, its check is skipped.

| Protocol | File scope | Static check |
|---|---|---|
| `factory-function-pattern` | `schemas/custom/**/common/fields.ts` | No `defineField(` / `defineType(` calls inside factories — factories return plain object literals. |
| `sub-field-visibility` | `schemas/custom/**/sections/**/*.ts` | No duplicate `name: 'foo'` entries within a single file. |
| `variant-router` | `components/sections/**/index.tsx` | Exported `<Name>Props` interface, `?? undefined` (not `?? null`), `if (!Variant) return null;` fallback, `{ data }: SectionsProps` signature. |
| `preview-conventions` | `schemas/custom/**/*.ts` | Every `type: 'array'` / `type: 'object'` block has a `preview` key. |

The check list grows as new protocols add static rules.

---

## Exit codes

- **0** — No findings, or only `recommended`/`optional`-tier findings. Recommended findings print as `warn` lines but do not fail the hook.
- **1** — At least one `required`-tier finding. The hook exits non-zero and Claude Code surfaces the validator output inline.

Required-tier failures do not retroactively delete the write — the file is already on disk. The agent must read the violation and revert or fix on the next turn.

---

## Workflow integration

Each workflow step's "Done when" list gains a single new item:

- [ ] **Validate:** `npx @extragraj/stackshift-skills validate --file <output>` exits 0 (auto-fires via PostToolUse hook when this protocol is active).

When the hook is active, the step passes the moment the most recent Write/Edit completes without a hook error. When the hook is not active (no Claude Code, or protocol not installed), the agent runs the command manually as a postcondition.

---

## Bootstrap behavior

When this protocol is in the materialized set, bootstrap writes (or merges into) `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @extragraj/stackshift-skills validate --hook"
          }
        ]
      }
    ]
  }
}
```

The write is idempotent. Re-running bootstrap detects an existing StackShift validate entry by command substring (`stackshift-skills validate`) and replaces it in place. Unrelated hook entries — including UI Forge's `verify.js` entry from `auto-verify-hook` — are preserved.

---

## Opting out per-write

Claude Code supports `--no-hooks` on `/edit` and `/write` for one-off bypasses. The hook resumes on the next write.

For the wider project: deleting only the StackShift validate hook entry from `.claude/settings.json` disables the hook without removing the protocol. Re-running `init` re-adds the entry.

---

## Activation

Selected during bootstrap (optional — unchecked by default).

To add after initial bootstrap:
1. Append the registry entry to `.stackshift/protocols/_registry.json` (`tier: "optional"`, `file: "auto-validate-hook.md"`).
2. Copy `protocols/auto-validate-hook.md` from the skill bundle to `.stackshift/protocols/`.
3. Add the snippet above to `.claude/settings.json` manually, or re-run `npx @extragraj/stackshift-skills init` and the bootstrap will write it.

To remove the runtime hook only: delete the StackShift validate entry from `.claude/settings.json`.

---

## See also

- `factory-function-pattern.md`, `sub-field-visibility.md`, `variant-router.md`, `preview-conventions.md` — the protocols whose invariants this hook enforces statically.
- `auto-verify-hook.md` — sibling protocol for UI Forge variant contract checks on `.tsx` writes.
- `cli/src/validate.ts` (in the source repo) — implementation.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A monorepo (pnpm workspaces) containing:
- **`skills/`** — Agentic skill files (Markdown + JSON) that AI agents load at runtime to implement StackShift sections
- **`cli/`** — A TypeScript CLI (`npx @extragraj/stackshift-skills init`) that installs skills into target projects

The skills themselves are not executed code — they are structured Markdown documents that AI agents read as instructions. The CLI is the only runnable TypeScript in this repo.

## Commands

All CLI commands run from the `cli/` directory:

```bash
# Build the CLI
cd cli && pnpm build       # tsc → outputs to cli/dist/

# Run CLI in dev (without building)
cd cli && pnpm dev         # tsx src/index.ts

# Run the interactive installer
npx @extragraj/stackshift-skills init

# Statically validate schemas + section routers against active protocols
npx @extragraj/stackshift-skills validate              # whole project
npx @extragraj/stackshift-skills validate --file <p>   # single file (used by auto-validate-hook)
```

From the repo root:
```bash
pnpm install               # install all workspace deps
```

There are no tests.

## Architecture

### Skill System

Skills install to `.agents/skills/` in target projects (or `~/.agents/skills/` for global). An AI agent reads `SKILL.md` as its entry point and loads additional files on demand — never all at once.

**`stackshift`** (renamed from `stackshift-core` in 0.6.0) is the authoritative skill package. It contains:
- `SKILL.md` — router: enforces the 5-step workflow order, lookup table, hard rules. Section 3 contains a CLI:CROSSCUT marker that the CLI rewrites at install with the keyword table for only the cross-cutting protocols actually installed.
- `workflow/1-5.md` — one file per step, loaded only when that step is active. Each file contains a CLI:PROTOCOLS marker that the CLI rewrites at install. The injected body has three sections: the installed-protocol list (no tier hints), `## Actions` (one `### <title>` per protocol that declares an `action`), and `## Done-when` (a flat checklist tagged with the source protocol id). All protocol-specific guidance lives in the marker — the static workflow file is now reduced to step-level structural content (decision tables, directory shapes, code examples, sub-step sequencing) plus a single `## Always validate` / `## Done when` checklist for universal items. `2-section-schema.md` also contains a CLI:SEED marker that the CLI rewrites with the active seeding strategy block (or a hard "do not write `initialValue/`" rule if no seed is installed).
- `protocols/` — convention library; each file is a named protocol with a tier
- `protocols/_registry.json` — the only index the CLI and bootstrap read; adding a protocol requires a new entry here. Each entry may declare optional `action: { title, body }` and `doneWhen: string[]` fields — these are what the CLI injects into the workflow file's CLI:PROTOCOLS marker (only for installed protocols).
- `protocols/_step-map.json` — per-step protocol membership. The CLI intersects this with `.stackshift/installed.json` `protocols[]` to build each step's injected marker block. Editing this file is the only way to add or move a protocol across steps. The materialized copy in the install destination is pruned to the installed subset on every `init` / `repair`.
- `references/` — lookup tables (field factories, GROQ fragments, types, file map, versions); discoverable only via the router table in `SKILL.md` Section 3
- `seeds/` — seed strategies; each strategy is a single canonical `.md` file here, indexed by `_registry.json`. The active strategy id is recorded in `.stackshift/installed.json` `seed`. No per-seed skill folder ships (removed 0.5.1).

Tiers are `required` / `recommended` / `optional`. The pre-0.3.0 tier-bundle skill folders (`stackshift-protocols-*`) are gone — there is only one skill folder. Pre-0.6.0 installs that still have `stackshift-core/` on disk are migrated automatically by `init` / `repair`.

### CLI Architecture

The CLI is a thin orchestrator (`cli/src/`):
- `index.ts` — entry; routes `stackshift init` / `repair` / `validate`
- `install.ts` — runs the install flow using `@clack/prompts`
- `registry.ts` — reads `skills/` directory, `protocols/_registry.json`, `seeds/_registry.json`, and `protocols/_step-map.json` via gray-matter frontmatter and JSON.parse; skill type and tier are inferred from folder name if not in frontmatter
- `prompts.ts` — interactive tier and scope selection
- `writer.ts` — copies skill folders to the target install path, injects CLI:PROTOCOLS / CLI:SEED / CLI:CROSSCUT marker regions into the materialized `SKILL.md` and `workflow/*.md`, runs UI Forge integration, merges PostToolUse hooks for `auto-verify-hook` and `auto-validate-hook`
- `repair.ts` — purges legacy folders (`stackshift-protocols-*`, `stackshift-seed-*`, `stackshift-core`), re-copies the renamed `stackshift/` folder if only the legacy one existed, reconciles materialized protocols, and re-runs marker injection
- `validate.ts` — static linter; per-protocol checks against `schemas/custom/**` and `components/sections/**/index.tsx`. Wired into the CLI as `validate` and into `.claude/settings.json` as the `auto-validate-hook` PostToolUse handler

The CLI reads the `skills/` directory at runtime relative to its own `__dirname` — `registry.ts` resolves `../../skills` from `src/`. After `tsc`, the compiled `dist/` files maintain the same relative path to `skills/`.

### Extending

- **New protocol** → add `.md` to `protocols/`, register in `protocols/_registry.json` (set `id`, `tier`, `title`, `summary`, and the `file` or `dir`; add optional `action: { title, body }` and `doneWhen: string[]` if the protocol contributes step-level guidance the CLI should inject), and add the protocol id to the relevant step in `protocols/_step-map.json` (or to `crossCutting` if it applies cross-step). For multi-file protocols use a directory and set `"dir"` instead of `"file"` in the registry entry. If the protocol has a statically checkable invariant, add a per-protocol check function in `cli/src/validate.ts` and gate it on the protocol id.
- **New seed strategy** → add canonical `.md` to `stackshift/seeds/`, register in `seeds/_registry.json`. No skill-folder stub is needed; the strategy is selected through the CLI prompt (or `--seed <id>`) and identified by id in `.stackshift/installed.json`.
- **New workflow step** → add file to `workflow/` with a `<!-- CLI:PROTOCOLS:BEGIN step=N -->...<!-- CLI:PROTOCOLS:END -->` marker region, add the step key to `protocols/_step-map.json`, add the step file to the `workflowFiles` array in `injectWorkflowProtocols()` in `cli/src/writer.ts`, add a row to the step table in `SKILL.md` Section 1, and update `workflow/checklist.md`.
- **New reference lookup** → add file to `references/`, add matching row to the lookup router in `SKILL.md` Section 3. Files not listed there are unreachable by the workflow.
- **After any structural change** → increment `skill.version` and update `README.md`.

### Bootstrap Flow

Bootstrap is **CLI-only** as of 0.3.0. There is no agent-side bootstrap. The agent's `SKILL.md` Section 0 just checks for `.stackshift/installed.json` and proceeds.

`npx @extragraj/stackshift-skills init` performs the full install end-to-end. The canonical reference is `CLI_BOOTSTRAP.md` at the repo root; the implementation is `runBootstrapMaterialization` in `cli/src/writer.ts`. In short:

- Materializes selected protocols to `.stackshift/protocols/` (user-editable; never overwritten by `init` or `repair`). The injected CLI:PROTOCOLS markers in every workflow file link directly to `.stackshift/protocols/<id>.md`, so the agent reads the project copy. Custom protocols added to `.stackshift/protocols/_registry.json` are discovered via the Protocol Discovery chain in `SKILL.md` Section 3.
- Creates project infrastructure: `_registry.json`, `_template/`, `.stackshift/references/`.
- Seeds `design/standards/stackshift-section-variants.md` (and `brand.md` when the brand protocol is selected).
- Writes / appends `.forgeignore` defaults (Sanity + Next.js + UI Forge entries).
- Detects UI Forge via 7-path lookup + `scripts/detect.sh`, runs `scan.js` if `design/design-arch.json` is missing, captures the scan-fallback banner.
- Bridges `designStandards` and a `_paired` mirror block into `design/design-arch.json`.
- Runs `export-design.js` when the `claude-design-handoff` protocol is selected.
- Merges Claude Code `PostToolUse` hooks into `.claude/settings.json` when `auto-verify-hook` (UI Forge `verify.js`) and/or `auto-validate-hook` (StackShift `validate`) are selected. The two hook entries are independent and idempotent — each is keyed by command substring.
- Writes `.stackshift/installed.json` with `skillVersion`, `installedAt`, `mode`, `protocols[]`, optional `seed`, `a11yRequired`, and `uiForgeIntegration` metadata. The pre-0.3.0 `bootstrapRequired` and `materializationDone` flags are no longer written and are stripped on every install.
- Rewrites the CLI:PROTOCOLS / CLI:SEED / CLI:CROSSCUT marker regions in the materialized `SKILL.md` and every `workflow/*.md` file across all platforms the user installed to. The injected `CLI:PROTOCOLS` body lists the installed protocols for the step and then renders an `## Actions` section + `## Done-when` checklist sourced from each protocol's `action` / `doneWhen` registry fields. The agent never reads `installed.json` to discover what is active and never sees content for uninstalled protocols.
- Prunes the destination `skills/stackshift/protocols/` and `seeds/` folders to the installed subset (required protocols are always present; recommended / optional / custom only if chosen). The destination `_registry.json`, `_step-map.json`, and `seeds/_registry.json` are rewritten to match. The shipped repo `skills/stackshift/` remains the full catalog; the prune only affects install destinations.
- Writes `.stackshift/injection-map.json` — a dynamic per-protocol record of where each installed protocol got injected (workflow file paths + `SKILL.md` for cross-cutting entries). Regenerated on every `init` / `repair`.

### Companion Skill (UI Forge)

StackShift delegates Step 4 variant body generation to the `ui-forge` companion skill. The two skills share state through three files:

- `.stackshift/installed.json` — StackShift writes (`mode`, `protocols`, `seed`, `skillVersion`, `a11yRequired`, `uiForgeIntegration`); UI Forge reads for paired-mode detection.
- `design/design-arch.json` — UI Forge owns most fields; StackShift writes `designStandards.*` pointers and the optional `_paired` mirror block.
- `.claude/settings.json` — receives the StackShift PostToolUse hook entry when `auto-verify-hook` is active.

The full handshake (skill-root resolution, marker fields, flag refusal matrix, modifier composition, contract version dance) lives in `skills/stackshift/protocols/paired-mode-contract.md`. Other paired protocols (`accessibility`, `brand`, `claude-design-handoff`, `auto-verify-hook`) link to that document instead of restating its rules.

When a UI Forge feature ships that StackShift should surface (e.g. new signal, new flag, new script), update:

1. `protocols/paired-mode-contract.md` if it changes the handshake.
2. `workflow/4-variants.md` if it changes Step 4 invocation, ref rules, postconditions, or failure modes.
3. `cli/src/writer.ts` (`runBootstrapMaterialization` + UI Forge helpers) if it changes what the CLI bootstrap writes, and `CLI_BOOTSTRAP.md` to mirror the change.
4. `references/versions.md` compatibility matrix.
5. `references/file-map.md` if it introduces or removes a project-side file.

### Versioning

The canonical version lives in `skill.version` (plain text, semver). Changes that update protocols, workflow, or bootstrap without altering the public CLI surface or breaking compatibility are tracked as **letter-suffixed sub-releases** (e.g. `0.1.9A`, `0.1.9B`) — a new file in `change-logs/` named `<x-y-zL>-short-description.md`, no version-number bump. Bump the numeric version only on breaking changes or when explicitly shipping a new minor/patch release.

### Documentation

`README.md` is the primary public-facing documentation. It must be kept up to date with every change — no exceptions.

**After any change to skills, CLI, or architecture, update README.md to reflect:**

- New or removed features (protocols, seeds, CLI flags, commands)
- Changed behaviour (prompts, flow, defaults, repair logic)
- Structural changes (new folders, renamed files, updated `installed.json` shape)
- Version references (intro line, repository structure, compatibility table)

**Documentation standards:**
- Descriptions in the intro and section headers must be concise and professional — state capabilities without implementation detail (e.g. "supports seed strategies", not "pre-fills `initialValue/` with placeholder content")
- All CLI prompt examples must match the actual output of the current code
- All file structure diagrams must reflect the current `skills/` directory layout
- Table entries for flags, protocols, and seeds must use their correct display names (title-case, no raw IDs)

# StackShift Workflow Skill

> **Version** 0.8.0

A structured agentic skill for building sections and variants inside StackShift, a composable Sanity v3 and Next.js page-builder. Enforces a strict 5-step implementation workflow, governs quality through a tiered protocol system, supports seed strategies, and delegates component rendering to the `ui-forge` companion skill.

---

## Installation

```bash
# Interactive installation (recommended)
npx @extragraj/stackshift-skills init

# Non-interactive with defaults (recommended tier, project scope, agents platform)
npx @extragraj/stackshift-skills init --no-interactive

# Non-interactive with specific options
npx @extragraj/stackshift-skills init --tier full --scope project --platform agents,claude --no-interactive

# Non-interactive with a seed strategy
npx @extragraj/stackshift-skills init --seed initialvalue-seeding --no-interactive
```

The CLI performs the full bootstrap end-to-end — protocol materialization, project infrastructure, `design/standards/` seeding, `.forgeignore`, and UI Forge integration — in a single pass. There is no deferred-to-agent mode; on first AI invocation the agent simply checks that `.stackshift/installed.json` is present and proceeds to the workflow.

### Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--tier` | `required`, `recommended`, `full` | `recommended` | Protocol tier to install |
| `--scope` | `project`, `global` | `project` | Install location |
| `--platform` | `agents`, `claude`, `copilot`, `gemini`, `cursor`, or comma-separated | `agents` | Platform(s) to install to |
| `--seed` | seed id or `none` | `none` | Seeding strategy to activate (e.g. `initialvalue-seeding`) |
| `--no-interactive` | (flag) | `false` | Skip prompts, use flags + defaults |
| `--help` | (flag) | - | Show help text |

**Note:** `custom` tier (interactive checkbox selection) requires interactive mode.

### Repair

If the install drifts (manual edits, partial runs, version upgrades):

```bash
npx @extragraj/stackshift-skills repair
```

Repair runs four passes:
1. **Legacy artifact purge** — removes any pre-0.3.0 `stackshift-protocols-*` folders, pre-0.5.1 `stackshift-seed-*` stub folders, and pre-0.6.0 `stackshift-core/` folders; strips legacy marker flags and lock entries. If `stackshift-core/` was present and `stackshift/` was not, the new folder is re-copied from the shipped skill source.
2. **Seed validation** — checks that the `seed` recorded in `.stackshift/installed.json` matches a known strategy in the seed registry.
3. **Materialized protocol reconciliation** — compares `.stackshift/protocols/` against `installed.json`. Removes orphans; restores missing recorded protocols.
4. **Workflow marker injection** — rewrites the CLI:PROTOCOLS / CLI:SEED / CLI:CROSSCUT regions in the materialized `SKILL.md` and `workflow/*.md` from the current `installed.json`. This is the supported way to re-sync workflow files after hand-editing the marker.

Repair is idempotent.

### Validate

Statically check schemas and section routers for protocol violations:

```bash
# Lint the whole project
npx @extragraj/stackshift-skills validate

# Lint a single file (used by the auto-validate-hook PostToolUse hook)
npx @extragraj/stackshift-skills validate --file components/sections/hero/index.tsx

# Machine-readable output (for CI)
npx @extragraj/stackshift-skills validate --json
```

The validator reads `.stackshift/installed.json` to learn which protocols are active. Each active protocol contributes static checks against `schemas/custom/**/*.ts` and `components/sections/**/index.tsx`. The command exits **1** on any `required`-tier finding (build-breaking patterns) and **0** otherwise — `recommended`-tier findings print as warnings without failing.

Coverage:

| Protocol | Static check |
|---|---|
| `factory-function-pattern` | No `defineField(` / `defineType(` calls inside factory files. |
| `sub-field-visibility` | No duplicate `name: 'foo'` entries within a single section schema. |
| `variant-router` | Exported `<Name>Props`, `?? undefined` extraction, `if (!Variant) return null;`, `{ data }: SectionsProps` signature. |
| `variant-naming-convention` | No two-letter `variant_xy` keys in the `Variants` map while `variant_z` is absent. |
| `preview-conventions` | Every `type: 'array'` / `type: 'object'` block has a `preview` key. |

The `auto-validate-hook` optional protocol wires this command as a Claude Code `PostToolUse` hook so violations are surfaced inline on every Write/Edit.

---

## How the Skill Operates

StackShift sections follow a predictable anatomy: a Sanity schema defining fields, a TypeScript interface describing data shape, React variant components for rendering, and a GROQ query for data fetching. Every section progresses through five implementation steps in strict order:

```
1. Schema fields → 2. Section schema → 3. TypeScript types → 4. Component variant → 5. GROQ query
```

Each step produces output required by the subsequent step. Reordering introduces broken imports, type errors, and mismatched GROQ projections.

### Lookup-Table Architecture

The skill uses a lookup-table structure to keep context focused:
- **Core router** (`SKILL.md`) contains the workflow table, topic-to-file lookup table, and hard rules
- **Workflow steps** are stored in individual files; the router directs the agent to load only the relevant step
- **Protocols** are discovered via merged registries and loaded on demand
- **References** (field factories, GROQ fragments, type catalogs) are accessed through the lookup table

### Protocol System

A tiered protocol system codifies team conventions:

| Tier | Effect if Skipped |
|------|-------------------|
| **Required** | Build errors, runtime errors, or schema load failures; workflow blocks until applied |
| **Recommended** | No errors, but Sanity Studio UX or developer experience degrades noticeably; workflow mentions but does not block |
| **Optional** | Opt-in systems with dedicated architecture; applicable only if project adopts them |

Runtime enforcement is **CLI-injected** as of 0.6.0. At `init` / `repair` time the CLI reads `.stackshift/installed.json`, intersects it with `protocols/_step-map.json`, and rewrites marker regions (`<!-- CLI:PROTOCOLS:BEGIN step=N -->`, `<!-- CLI:SEED:BEGIN -->`, `<!-- CLI:CROSSCUT:BEGIN -->`) in the materialized `SKILL.md` and every `workflow/*.md`. Each injected `CLI:PROTOCOLS` block contains: the installed-protocol list for the step, an `## Actions` section sourced from each protocol's `action` registry field, and a `## Done-when` checklist sourced from each protocol's `doneWhen`. The static workflow files contain only step-level structural content (decision tables, directory shapes, code examples) — protocol-specific guidance lives entirely in the marker. The agent never re-derives this at runtime and never sees content for uninstalled protocols.

If `.stackshift/installed.json` is hand-edited to add or remove a protocol, the workflow files go stale until `repair`. Re-run `npx @extragraj/stackshift-skills repair` to refresh.

Static enforcement is available via the `validate` command (see [Validate](#validate)). When the `auto-validate-hook` optional protocol is installed, the validator fires as a Claude Code `PostToolUse` hook on every Write/Edit — violations surface inline instead of relying on the agent to honor prose instructions.

### Output Files by Step

| Step | Output File(s) |
|------|----------------|
| 1 — Schema fields | `schemas/custom/.../common/fields.ts` |
| 2 — Section schema | `schemas/custom/.../sections/[name]/` |
| 3 — TypeScript types | `types.ts` |
| 4 — Component variant | `components/sections/[name]/` |
| 5 — GROQ query | `pages/api/query.ts` |

---

## Bootstrap

Bootstrap is CLI-only. `npx @extragraj/stackshift-skills init` performs every step in a single run. The agent never executes install logic — its `SKILL.md` Section 0 just checks for the marker file.

For the full reference, see [`CLI_BOOTSTRAP.md`](./CLI_BOOTSTRAP.md). High-level summary:

1. **Skill copy** — `stackshift` (renamed from `stackshift-core` in 0.6.0) is copied to every selected platform's `skills/` directory, then pruned so its `protocols/` and `seeds/` contain only the entries recorded in `.stackshift/installed.json`. Required-tier protocols are part of every install; recommended / optional / custom selections only land in the destination if chosen. The shipped repo `skills/stackshift/` remains the full catalog. Any pre-0.6.0 `stackshift-core/` folder at the install path is removed and replaced.
2. **Protocol materialization** — selected protocols are copied to `.stackshift/protocols/`. Project edits at this location take precedence over skill defaults at every subsequent lookup.
3. **Project infrastructure** — `.stackshift/protocols/_registry.json` (empty project registry), `.stackshift/protocols/_template/`, `.stackshift/references/`.
4. **Design standards** — `design/standards/stackshift-section-variants.md` and (when `brand` is selected) `design/standards/brand.md`.
5. **`.forgeignore`** — Sanity + Next.js + UI Forge defaults. Appends only missing sections to existing files.
6. **UI Forge integration** — detects the UI Forge skill (7-path lookup), runs `scan.js` if `design-arch.json` is missing, bridges `designStandards`, writes the `_paired` mirror block, runs the optional `export-design.js`, installs the optional Claude Code `PostToolUse` hook.
7. **Marker write** — `.stackshift/installed.json` with `skillVersion`, `installedAt`, `mode`, `protocols[]`, optional `seed` / `a11yRequired` / `uiForgeIntegration`.
8. **Workflow injection** — CLI rewrites the CLI:PROTOCOLS / CLI:SEED / CLI:CROSSCUT marker regions in the materialized `SKILL.md` and every `workflow/*.md` so the agent sees only the protocols actually installed.
9. **Injection map** — CLI writes `.stackshift/injection-map.json` listing, for every installed protocol, the workflow file paths and (where applicable) `SKILL.md` it was injected into. Regenerated on every `init` / `repair`.

### Install Modes

| Mode | Materialized Content |
|------|---------------------|
| **Required** | All `tier: required` protocols only. |
| **Recommended** (default) | All `required` + `recommended` protocols. |
| **Full** | All registered protocols including optional. |
| **Custom** | Required (always) + checkbox selection of recommended/optional protocols. Interactive mode only. |

### Project Customization

After bootstrap, the skill is pre-wired to read from your project's `.stackshift/protocols/` copies:

1. **Workflow markers link to `.stackshift/protocols/<id>.md`** — every injected protocol reference in the workflow files points to the materialized project copy, not the bundled skill copy. Agents follow those links directly.
2. **Edits persist across skill updates** — `repair` and `init` never overwrite `.stackshift/protocols/` files; they only update the skill's own `protocols/` directory.
3. **Custom protocols** registered in `.stackshift/protocols/_registry.json` are discovered via the Protocol Discovery chain in `SKILL.md` Section 3 when the agent needs a protocol that is not listed in the injected workflow markers.

---

## Protocols

All registered protocols, organized by tier:

| Protocol | Tier | Applies to | Description |
|----------|------|-----------|-------------|
| Factory Function Pattern | required | Step 1 | Plain-object shape for field factories. Incorrect shape breaks `hideInVariants` at runtime. |
| Sub-Field Visibility | required | Step 1 | Hide sub-fields on the sub-field itself; duplicate field names at section level crash schema load. |
| Variant Router | required | Step 4 | `index.tsx` rules: exported props interface, `null` fallback, `?? undefined` extraction, every `Variants` entry uses `dynamic()` (built-ins via dist path). |
| Variant Naming Convention | required | Steps 2, 4 | Single-letter sequence (`variant_a` … `variant_z`) before two-letter (`variant_aa`, `variant_ab`, …). Same key across `variantsList[].value`, `Variants` map, and filename. |
| One-Time Custom Schema Setup | required | Step 2 | Project-level wiring to enable custom sections in Studio. Execute once per project. |
| Field Reuse First | recommended | Step 1 | Verify existing factories before creating new ones. |
| Hide If Variant | recommended | Step 1 | Exclude variants from unused fields via `hideIfVariantIn()`. Includes inverse pattern for variant-only fields. |
| Preview Conventions | recommended | Step 1 | `preview` block with `prepare()` on array-of-objects and object fields. |
| Array Layout | recommended | Step 1 | `grid` for image arrays, `tags` for string arrays, `collapsible` for nav arrays. |
| Section Directory Layout | recommended | Step 2 | `initialValue/` placeholder content + `images/` thumbnails as the static branch of variant-preview. |
| Variant Reuse First | recommended | Step 4 | Three-step decision tree before scaffolding: reuse as-is → wrap from dist → create new. |
| Dynamic Variants Registry | recommended | Step 2 | Registers custom variants in `components/data/dynamic.ts` for live picker previews when `NEXT_PUBLIC_RENDER_DYNAMIC_COMPONENTS=true`. No-op when the env flag is off. |
| Accessibility | recommended | Step 4 | WCAG 2.1 AA enforcement via UI Forge's `SIGNAL_A11Y`. Writes `a11yRequired: true` to the marker. |
| Paired-Mode Contract | recommended | Cross-cutting | Canonical reference for the StackShift ↔ UI Forge handshake. |
| Brand | optional | Step 4 | Registers a project brand document so UI Forge applies voice, palette, typography, and imagery rules. |
| Claude Design Handoff | optional | Step 4 | Activates UI Forge's `+CLAUDE_DESIGN` modifier and `--handoff <url>` flag. |
| Auto-Verify Hook | optional | Step 4 | Wires UI Forge's `verify.js` as a Claude Code `PostToolUse` hook. Claude Code only. |
| Auto-Validate Hook | optional | Steps 1, 2, 3, 4 | Wires `stackshift-skills validate` as a Claude Code `PostToolUse` hook. Statically enforces factory-function, sub-field-visibility, variant-router, variant-naming-convention, and preview-conventions invariants on every Write/Edit. Claude Code only. |
| Modal & Sheet | optional | Steps 2, 4, 5 | Standalone modal documents linked via `conditionalLink`, opened as a sheet or dialog overlay. |

---

## Customizing Protocols

After bootstrap, protocols can be customized and extended by editing files in `.stackshift/protocols/` and adding custom protocols to the project registry.

### What Can Be Extended

| Area | Location | Customizable? |
|------|----------|---------------|
| **Protocols** | `.stackshift/protocols/` | ✅ Edit materialized protocols; add custom ones via `_registry.json` |
| **References** | `.stackshift/references/` | ✅ Add custom lookup tables for project-specific protocols |
| **Seeds** | `stackshift/seeds/` | ❌ Content cannot be overridden at project level |
| **Workflow** | `stackshift/workflow/` | ❌ 5-step sequence is fixed; CLI rewrites protocol/seed marker regions at install |

### Editing an Installed Protocol

Open the materialized copy at `.stackshift/protocols/<id>.md` and edit freely. Because the injected workflow markers link directly to `.stackshift/protocols/`, the agent reads your edited version on the next run. `repair` and `init` never overwrite these files.

### Adding a Custom Protocol

**Single-file:** Create `.stackshift/protocols/custom-protocol.md`, then register it in `.stackshift/protocols/_registry.json`:
```json
{
  "protocols": [{
    "id": "custom-protocol",
    "tier": "recommended",
    "file": "custom-protocol.md",
    "title": "Custom Protocol",
    "summary": "Description"
  }]
}
```

The agent discovers custom protocols via the Protocol Discovery chain in `SKILL.md` Section 3: when it needs a protocol not listed in the injected workflow markers, it merges the project registry with the skill registry and loads from `.stackshift/protocols/` first.

**Multi-file:** Copy `.stackshift/protocols/_template/` to a new directory, edit files, and register with `"dir": "custom-protocol/"` instead of `"file"`.

### File Structure After Bootstrap (Recommended mode)

```
your-project/
├── .stackshift/
│   ├── installed.json          # Marker: mode, protocols, seed, skillVersion, installedAt, a11yRequired, uiForgeIntegration
│   ├── protocols/
│   │   ├── _registry.json      # Project protocol registry
│   │   ├── _template/          # Template for multi-file protocols
│   │   ├── factory-function-pattern.md
│   │   ├── sub-field-visibility.md
│   │   ├── variant-router.md
│   │   ├── variant-naming-convention.md
│   │   ├── one-time-custom-schema-setup.md
│   │   ├── field-reuse-first.md
│   │   ├── hide-if-variant.md
│   │   ├── preview-conventions.md
│   │   ├── array-layout.md
│   │   ├── section-directory-layout.md
│   │   ├── variant-reuse-first.md
│   │   ├── dynamic-variants-registry.md
│   │   ├── accessibility.md
│   │   └── paired-mode-contract.md
│   └── references/             # Custom reference lookups (empty initially)
│       └── README.md
├── .forgeignore                # Scan exclusions
└── design/
    ├── design-arch.json        # UI Forge-owned (CLI writes designStandards + _paired)
    └── standards/
        └── stackshift-section-variants.md
```

Optional protocols (`brand`, `claude-design-handoff`, `auto-verify-hook`, `modal-sheet`) materialize only when `Full` or `Custom` mode selects them.

---

## Seeding Strategies

A seeding strategy is a reusable instruction set that guides the AI in populating or scaffolding a specific aspect of a StackShift project. The active strategy is recorded in `.stackshift/installed.json` → `seed`. **Only one strategy may be active at a time.**

| Strategy | ID | Applies to | Description |
|----------|----|-----------|-------------|
| **Initial-Value Seeding** | `initialvalue-seeding` | Step 2 — `initialValue/` | Extracts content from an HTML mockup or hardcoded component and maps it to schema fields, writing realistic placeholder copy for Sanity Studio authors. |

**Activate:**
```bash
npx @extragraj/stackshift-skills init --seed initialvalue-seeding --no-interactive
```

**Deactivate:**
```bash
npx @extragraj/stackshift-skills init --seed none --no-interactive
```

---

## Companion Skill

During component variant creation, StackShift delegates to `ui-forge` once schema, types, and section wiring are complete. At handoff, StackShift has created an empty variant file, registered the dynamic import in `index.tsx`, and exported the props interface. `ui-forge` receives the props interface as its contract and generates the complete variant component body.

**Interface Boundary:** StackShift never authors component code. `ui-forge` never modifies schema or wiring. The props interface defines the boundary.

### Shared State

| File | Owner | StackShift writes | UI Forge writes |
|------|-------|-------------------|-----------------|
| `.stackshift/installed.json` | StackShift | `mode`, `protocols`, `seed`, `a11yRequired`, `uiForgeIntegration` | reads only |
| `design/design-arch.json` | UI Forge | `designStandards.*` pointers, optional `_paired` mirror | tokens, patterns, components |
| `.claude/settings.json` | shared | `PostToolUse` hook entry (when `auto-verify-hook` active) | none |

The `paired-mode-contract` protocol (recommended tier) is the single canonical reference for skill-root resolution, marker fields, the flag refusal matrix, modifier composition, and contract version handoff.

---

## Repository Structure

```
stackshift-workflow-skills/
├── skill.version                 # Single source of truth for versioning
├── pnpm-workspace.yaml           # pnpm workspace configuration
├── package.json                  # Root package (@extragraj/stackshift-skills)
├── CLAUDE.md                     # Project instructions for AI coding tools
├── CLI_BOOTSTRAP.md              # Human reference for the CLI install flow (not shipped)
├── bin/
│   └── cli.mjs                   # Published CLI entry point
├── scripts/
│   └── sync-version.mjs          # Syncs skill.version to package.json, cli/package.json, README.md
├── skills/
│   └── stackshift/               # Main skill: SKILL.md, workflow/, protocols/, references/, seeds/ (renamed from stackshift-core in 0.6.0)
├── cli/                          # Interactive installer (TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/                      # index.ts, install.ts, repair.ts, registry.ts, prompts.ts, flags.ts, writer.ts
└── change-logs/                  # Release notes
```

**Architecture Notes:**
- `stackshift` (renamed from `stackshift-core` in 0.6.0) contains all protocols, workflow steps, references, and canonical seed content
- Workflow files contain CLI-managed marker regions (`<!-- CLI:PROTOCOLS:BEGIN step=N -->`, `<!-- CLI:SEED:BEGIN -->`) rewritten by `init` / `repair` from `.stackshift/installed.json` and `protocols/_step-map.json`. The injected CLI:PROTOCOLS body includes the installed-protocol list plus per-protocol `## Actions` and `## Done-when` content sourced from each protocol's registry entry — the agent never sees content for uninstalled protocols and never reads `installed.json` to discover what is active
- `.stackshift/injection-map.json` records, per installed protocol, the workflow files (and `SKILL.md`) the CLI injected it into — regenerated on every `init` / `repair`
- Seed strategies have no separate skill folder; the active id is recorded in `.stackshift/installed.json` `seed` and the canonical content stays in `stackshift/seeds/`
- CLI is a separate workspace package (`cli/`) built with TypeScript
- No `bootstrap/` folder ships with the skill; install behavior lives entirely in `cli/src/writer.ts`

---

## Version Compatibility

| Dependency | Version |
|------------|---------|
| Sanity | v3.17 |
| Next.js | 14, Pages Router |
| TypeScript | strict mode |
| `@webriq-pagebuilder/sanity-plugin-schema-default` | extend, do not replace |
| `@stackshift-ui/*` | component library, referenced in `index.tsx` only |
| `ui-forge` (companion skill) | ≥0.1.9 for `paired-mode-contract`, `claude-design-handoff`, `auto-verify-hook`; ≥0.1.8 baseline |

For complete compatibility matrix including peer dependencies, see `references/versions.md` in the skill.

---

## Development

### Prerequisites

- Node.js 18 or higher
- pnpm 9 or higher (`npm install -g pnpm` or `corepack enable pnpm`)

### Quick Start

```bash
git clone https://github.com/extragraj/stackshift-workflow-skills
cd stackshift-workflow-skills
pnpm install
pnpm build
npx . init
```

### Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| **install** | `pnpm install` | Install dependencies for root and cli workspace |
| **build** | `pnpm build` | Build CLI (`pnpm --filter stackshift-cli build`) |
| **sync-version** | `pnpm sync-version` | Sync `skill.version` to `package.json`, `cli/package.json`, `README.md` |
| **prepack** | `pnpm prepack` | Auto-executes before `pnpm publish` (syncs version + builds CLI) |
| **dev** (CLI) | `cd cli && pnpm dev` | Execute CLI in development mode via `tsx` (no build step) |

### Common Workflows

```bash
# CLI development
pnpm install && pnpm build && npx . init

# Quick iteration (no build)
cd cli && pnpm dev

# Protocol/skill changes (no build needed for Markdown)
vim skills/stackshift/protocols/new-protocol.md

# Version & publish
echo "0.3.1" > skill.version && pnpm sync-version && pnpm publish
```

### Published Package Contents

```
@extragraj/stackshift-skills/
├── bin/cli.mjs           # CLI entry point
├── cli/dist/             # Built JavaScript
├── skills/               # All skill packages
└── skill.version         # Version file
```

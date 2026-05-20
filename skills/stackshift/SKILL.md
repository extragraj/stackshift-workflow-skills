---
name: stackshift
description: >
  Implements sections, variants, fields, and GROQ queries in StackShift
  (composable Sanity + Next.js Pages Router page-builder) projects. Triggers on:
  "add section", "new variant", "add field", "create stackshift section",
  "register section", "add variant to", "extend schema", "sanity section",
  "page-builder section", or any work touching `schemas/custom/**`,
  `components/sections/**`, `pages/api/query.ts`, or `types.ts` in a
  StackShift project. Enforces the strict 5-step implementation order and
  delegates component rendering work to the `ui-forge` skill.
---

# StackShift

Schema → Section → Types → Variant → GROQ. In that order. Never reordered.

Delegates all component rendering to `ui-forge`.

---

## 0. Marker check

Before doing any workflow step, check the project root for `.stackshift/installed.json`.

- **Present** → proceed to the workflow.
- **Missing** → halt and surface this message:

```
⚠️ StackShift is not installed in this project.

Run the installer:
  npx @extragraj/stackshift-skills init

The CLI performs the full bootstrap end-to-end: protocol materialization,
design/standards/ seeding, .forgeignore, and UI Forge integration.
```

Do not author files. Do not run a workflow step. Wait for the user to install.

---

## 1. Workflow at a glance

The implementation order is **strict**. Each step must complete before the next begins.

| # | Step | File to load | Writes to |
|---|------|--------------|-----------|
| 1 | Schema fields | `workflow/1-schema-fields.md` | `schemas/custom/.../common/fields.ts` |
| 2 | Section schema | `workflow/2-section-schema.md` | `schemas/custom/.../sections/[name]/` |
| 3 | TypeScript types | `workflow/3-types.md` | `types.ts` |
| 4 | Component variant | `workflow/4-variants.md` → **invokes `ui-forge`** | `components/sections/[name]/` |
| 5 | GROQ query | `workflow/5-groq.md` | `pages/api/query.ts` |

**Execute only the step you are on.** Step ordering is enforced by instruction — begin with the step that matches current context and do not advance until it is complete.

After Step 5 completes, run `workflow/checklist.md` as a final verification pass (not a 6th workflow step).

**Why this order:** Missing types/files break TypeScript and module resolution. GROQ failures only affect data output — safe to do last. See `workflow/1-schema-fields.md` for the full rationale.

---

## 2. When to invoke `ui-forge`

Step 4 is the only step that calls `ui-forge`. StackShift owns the *schema and wiring*; `ui-forge` owns the *component code*.

```
INVOKE ui-forge
  task: Build variant_[x].tsx for section [sectionName]
  refs: [any reference HTML/TSX/image the user provided]
  context: Props interface is `[SectionName]Props` from "."
```

Before invoking `ui-forge`, the StackShift workflow must have already:
1. Completed steps 1–3 (fields, section schema, types)
2. Created an empty `variant_[x].tsx` file
3. Registered the dynamic import in `components/sections/[name]/index.tsx`
4. Exported the props interface from `index.tsx`

`ui-forge` then fills the variant file body using the props interface as the contract. See `workflow/4-variants.md`.

---

## 3. Lookup router

Use this table to find the right file when the current workflow step or an error mentions a topic. Load a file only when you need it — but step ordering is governed by instruction, not by which files are in context.

| Need | Load |
|------|------|
| "Which file does what?" | `references/file-map.md` |
| Existing field factories to reuse | `references/field-factories.md` |
| Existing TypeScript interfaces to reuse | `references/types-catalog.md` |
| Reusable GROQ fragment constants | `references/groq-fragments.md` |
| Version constraints (Sanity v3.17, Next 14, etc.) | `references/versions.md` |
| Claude Design round-trip workflow | `references/claude-design-roundtrip.md` |
| `ui-forge` invocation: skill-root resolution, `--validate-input`, invocation forms, ref-selection rules | `references/ui-forge-invocation.md` |
| Anti-slop fidelity checklist for HTML/TSX-referenced variants | `references/anti-slop-check.md` |
| Step 4 failure-mode matrix and recovery rule | `references/failure-modes.md` |
| StackShift ↔ UI Forge handshake (markers, flag refusals, contract handoff) | `.stackshift/protocols/paired-mode-contract.md` |
| A protocol (required / recommended / optional convention) | See "Protocol Discovery" below |
| Active seeding strategy | `seeds/<file>` from skill (see `seeds/_registry.json`) — see "Seed Discovery" below |
| A custom reference lookup | `.stackshift/references/<name>.md` (project), else `references/<name>.md` (skill) |

### Protocol Discovery

Protocols are discovered from **merged registries**:

1. **Read project registry** (if exists): `.stackshift/protocols/_registry.json`
2. **Read skill registry**: `protocols/_registry.json`
3. **Merge:** Project protocols take precedence over skill protocols with same ID
4. **Load on-demand:** When protocol is needed, load from:
   - `.stackshift/protocols/<id>.md` or `.stackshift/protocols/<id>/` (project)
   - `protocols/<id>.md` or `protocols/<id>/` (skill fallback)

**Custom protocols** registered in `.stackshift/protocols/_registry.json` are discovered alongside skill protocols.

### Protocol Tiers

Each protocol has a **tier** in its registry entry:

- **required** — Workflow cannot function correctly without it. Violations cause build errors, runtime errors, or schema load failures. Workflow steps enforce these.
- **recommended** — Quality and UX. No errors if omitted, but Sanity Studio or author experience suffers. Workflow steps mention but do not block.
- **optional** — Opt-in systems with their own architecture, dependencies, or directories. Only apply if the project adopts them.

### Protocol File Types

A protocol entry can be:
- **Single file** (`.md`) — Simple convention documents
- **Directory** (multiple files) — Complex protocols with sub-docs, schemas, or templates

Use `_template/` as starting point for directory-based protocols.

### Cross-Cutting Optional Protocols

These protocols apply across multiple steps or may be invoked outside of any single workflow step. When a keyword below appears in the user's current request (case-insensitive, whole-word or whole-phrase match), load the matching protocol and apply it. On match, surface:
`ℹ️ Applying optional protocol "[title]" — matched keyword "[keyword]" in your request.`

Only protocols installed in this project appear in the table below.

<!-- CLI:CROSSCUT:BEGIN -->
> The CLI injects this table at install. Do not edit by hand —
> it will be overwritten by the next `init` or `repair`.
<!-- CLI:CROSSCUT:END -->

### Seed Discovery

1. Read `.stackshift/installed.json` → check for `seed` field.
2. If present, look up the matching entry in `seeds/_registry.json` by `id`.
3. Load `seeds/<file>` from the skill folder.
4. Seeds are step-scoped — load only when the relevant step is active:
   - `initialvalue-seeding` → load at Step 2 before writing any `initialValue/` file.
5. **Only one seed is ever active.** If `installed.json` has no `seed` field, skip seed loading.

### Reference Augmentation

Custom references for project-specific protocols:

1. **Check project:** `.stackshift/references/<name>.md` (custom reference lookups)
2. **Fall back to skill:** `references/<name>.md` (standard references)

Project references augment skill references without modifying them.

---

## 4. Custom Protocols (Project-Level)

Custom protocols are project-specific conventions registered in `.stackshift/protocols/_registry.json`. They extend the standard protocol set without modifying skill files.

**How they work:**
- Custom protocols are discovered automatically via the Protocol Discovery mechanism in Section 3 — no special handling needed.
- The project registry (`.stackshift/protocols/_registry.json`) is read first and merged with the skill registry (`protocols/_registry.json`). Project entries with the same `id` override skill entries.
- Custom protocols follow the same structure as skill protocols: a registry entry with `id`, `tier`, `title`, `summary`, and either `file` or `dir`. Use `_template/` as a starting point for directory-based protocols.

**When to apply:**
- If the current step's protocol discovery includes a matching `id`, load and enforce/apply it as you would any skill protocol.
- Custom references at `.stackshift/references/<name>.md` are also discovered automatically — see "Reference Augmentation" in Section 3.

**Note:** If the user asks you to *create* a custom protocol or reference, follow the standard registry format documented in `protocols/_registry.json` and `_registry.schema.json`. Create the file or directory in `.stackshift/protocols/` and add an entry to `.stackshift/protocols/_registry.json`.

---

## 5. Companion Skill Integration

StackShift delegates component body generation to `ui-forge` at Step 4 (see `workflow/4-variants.md`). The two skills share protocol awareness through the `designStandards` field in `design/design-arch.json`: during bootstrap, StackShift writes pointers to `variant-router` (and any future component-rendering protocols) into this field so that `ui-forge` loads them into its generation context.

The full handshake — skill-root resolution, marker fields (`.stackshift/installed.json` vs `design/design-arch.json`), the optional `_paired` mirror block, the flag refusal matrix, modifier composition, and the contract version handoff — is documented canonically in `protocols/paired-mode-contract.md`. Other paired protocols (`accessibility`, `brand`, `claude-design-handoff`, `auto-verify-hook`) link to that document instead of restating its rules.
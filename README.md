# StackShift Skill

> **Version** 0.1.0 &nbsp;|&nbsp; **Sanity** v3.17 &nbsp;|&nbsp; **Next.js** 14 Pages Router &nbsp;|&nbsp; **TypeScript** strict

A structured agentic skill for building sections and variants inside StackShift — a composable Sanity v3 + Next.js page-builder. Enforces a strict 5-step implementation workflow, governs quality through a tiered protocol system, and hands off component rendering to the `ui-forge` companion skill.

---

## Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Protocols](#protocols)
- [Bootstrap](#bootstrap)
- [Skill Structure](#skill-structure)
- [Extending the Skill](#extending-the-skill)
- [Companion Skill](#companion-skill)
- [Version Compatibility](#version-compatibility)

---

## How It Works

StackShift sections share a single, predictable anatomy: a Sanity schema that defines fields, a TypeScript interface that describes the data shape, one or more React variant components that render it, and a GROQ query that fetches it. Every section — new or extended — goes through the same five implementation steps in the same order.

```
1. Schema fields  →  2. Section schema  →  3. TypeScript types  →  4. Component variant  →  5. GROQ query
```

Each step produces output that the next step depends on. The skill enforces this sequence without exception because reordering introduces broken imports, type errors, and mismatched GROQ projections.

### How the Skill Operates

The skill is built around **on-demand loading**. The core `SKILL.md` acts as a router — it holds a compact table of workflow steps, a lookup table of reference files, and the hard rules. When the AI reaches a step, it loads only that step's workflow file. When a protocol is needed, it loads only that protocol file. Nothing is pre-loaded in full.

This keeps every interaction focused and token-efficient. A session working on Step 1 never loads Step 5 or protocols irrelevant to the current task.

Alongside the workflow, a **protocol system** codifies team conventions and makes them individually loadable. Protocols are tiered by impact so the AI knows how to treat them:

| Tier | Effect if Skipped |
|---|---|
| **Required** | Build errors, runtime errors, or schema load failures |
| **Recommended** | No errors, but Studio UX or author experience degrades noticeably |
| **Optional** | Opt-in systems with their own architecture — only applicable if the project adopts them |

### What Gets Produced

| Step | File written |
|---|---|
| 1 — Schema fields | `schemas/custom/.../common/fields.ts` |
| 2 — Section schema | `schemas/custom/.../sections/[name]/` |
| 3 — TypeScript types | `types.ts` |
| 4 — Component variant | `components/sections/[name]/` |
| 5 — GROQ query | `pages/api/query.ts` |

---

## Installation

Both options install skills to `.agents/skills/`. `stackshift-core` is always required regardless of which path you choose. The key difference is in how much setup each option handles for you.

### Option A — npx skills add

The manual path. You install each skill package individually and the AI handles protocol setup on first use through a one-time [bootstrap](#bootstrap) conversation.

```bash
npx skills add stackshift/stackshift-core
npx skills add stackshift/stackshift-protocols-recommended
```

**Available protocol tiers**

| Skill | Protocols included |
|---|---|
| `stackshift-protocols-required` | 4 required protocols only |
| `stackshift-protocols-recommended` | 4 required + 5 recommended *(suggested starting point)* |
| `stackshift-protocols-full` | All tiers (no optional protocols registered yet) |

On the first AI invocation after installation, bootstrap runs automatically. It asks which protocols to copy into your project's `/docs/protocol/` folder so the team can edit and version them alongside the codebase.

**Best for:** teams that want to inspect or control what gets installed, or that are integrating into an existing agent setup.

### Option B — npx stackshift init

The guided path. An interactive CLI walks through tier selection and install scope in a single command, installs the relevant skills, and pre-writes the bootstrap marker so the AI skips the setup conversation entirely on first use.

```bash
npx stackshift init
```

```
✔ Which protocols would you like to install?
  ● Required + Recommended  (default)
  ○ Required only
  ○ All (including optional)
  ○ Custom

✔ Install to:
  ● Project  (.agents/skills/)  (default)
  ○ Global   (~/.agents/skills/)
```

**Project scope** installs to `.agents/skills/` inside the current working directory. Use this for per-project setups.

**Global scope** installs to `~/.agents/skills/`, making the skill available across all projects on the machine.

**Best for:** new projects, teams that want a zero-friction setup, or anyone who wants the CLI to handle scope and bootstrap automatically.

> `ui-forge` is a separate companion skill and must be installed independently regardless of which option you choose.

---

## Protocols

All 9 registered protocols, organized by tier:

| Protocol | Tier | Applies to | What it governs |
|---|---|---|---|
| Factory Function Pattern | required | Step 1 | Plain-object shape for field factories. Wrong shape breaks `hideInVariants` at runtime. |
| Sub-Field Visibility | required | Step 1 | Hide sub-fields on the sub-field itself — duplicate field names at section level crash schema load. |
| Variant Router | required | Step 4 | `index.tsx` rules: exported props interface, `null` fallback, `?? undefined` extraction. |
| One-Time Custom Schema Setup | required | Step 2 | Project-level wiring to enable custom sections in Studio. Run once per project. |
| Field Reuse First | recommended | Step 1 | Check existing factories before creating new ones. |
| Hide If Variant | recommended | Step 1 | Exclude new variants from fields they do not use via `hideIfVariantIn()`. |
| Preview Conventions | recommended | Step 1 | `preview` block with `prepare()` on every array-of-objects and object field. |
| Array Layout | recommended | Step 1 | `grid` for image arrays, `tags` for string arrays, `collapsible` for nav arrays. |
| Section Directory Layout | recommended | Step 2 | `initialValue/` with placeholder copy and `images/` with variant thumbnails. |

---

## Bootstrap

Bootstrap runs once on the first AI invocation when `.stackshift/installed.json` is absent in the project root. It copies selected protocol files from the skill into `/docs/protocol/` so the team can customize them.

| Mode | What gets copied |
|---|---|
| **None** | Nothing. Skill falls back to bundled copies at every lookup. |
| **Required** | All `tier: required` protocols. |
| **Recommended** *(default)* | All required and recommended protocols. |
| **All** | Every registered protocol, including optional. |
| **Interactive** | Checkbox prompt — required and recommended pre-selected. |

Once bootstrap completes, the skill checks `/docs/protocol/` first at every lookup. Edits there take precedence over the bundled copies and persist across skill updates. Deleting a file from `/docs/protocol/` falls back to the bundled default — no re-bootstrap needed.

When installing via Option B, the CLI pre-writes `.stackshift/installed.json` with the chosen tier so bootstrap never runs interactively.

---

## Skill Structure

```
stackshift-workflow-skills/
│
├── skill.version                              # version string read by bootstrap and CLI
├── README.md
│
├── skills/
│   ├── stackshift-core/                       # core skill — always required
│   │   ├── SKILL.md                           # main router: workflow table, lookup table, hard rules
│   │   │
│   │   ├── workflow/                          # one file per step, loaded on demand
│   │   │   ├── 1-schema-fields.md
│   │   │   ├── 2-section-schema.md
│   │   │   ├── 3-types.md
│   │   │   ├── 4-variants.md
│   │   │   ├── 5-groq.md
│   │   │   └── checklist.md
│   │   │
│   │   ├── protocols/                         # full protocol library and registry
│   │   │   ├── _registry.json                 # authoritative protocol index
│   │   │   ├── _template/                     # authoring template for complex protocols
│   │   │   ├── factory-function-pattern.md    # required
│   │   │   ├── sub-field-visibility.md        # required
│   │   │   ├── variant-router.md              # required
│   │   │   ├── one-time-custom-schema-setup.md # required
│   │   │   ├── field-reuse-first.md           # recommended
│   │   │   ├── hide-if-variant.md             # recommended
│   │   │   ├── preview-conventions.md         # recommended
│   │   │   ├── array-layout.md                # recommended
│   │   │   └── section-directory-layout.md    # recommended
│   │   │
│   │   ├── references/                        # on-demand lookup tables
│   │   │   ├── field-factories.md
│   │   │   ├── file-map.md
│   │   │   ├── groq-fragments.md
│   │   │   ├── types-catalog.md
│   │   │   └── versions.md
│   │   │
│   │   ├── seeds/
│   │   │   └── _registry.json                 # seeding strategies (empty in v0.1.0)
│   │   │
│   │   └── bootstrap/
│   │       ├── install.md                     # 7-step first-run flow
│   │       └── modes.md                       # none / required / recommended / all / interactive
│   │
│   ├── stackshift-protocols-required/
│   │   └── SKILL.md                           # tier index — 4 required protocols
│   ├── stackshift-protocols-recommended/
│   │   └── SKILL.md                           # tier index — required + 5 recommended
│   └── stackshift-protocols-full/
│       └── SKILL.md                           # tier index — all tiers
│
└── cli/                                       # npx stackshift init (Option B)
    ├── package.json
    ├── tsconfig.json
    ├── bin/
    │   └── cli.mjs                            # ESM entry shim
    └── src/
        ├── index.ts                           # command router
        ├── install.ts                         # orchestrates the full init flow
        ├── registry.ts                        # reads skills/*/SKILL.md via gray-matter
        ├── prompts.ts                         # @clack/prompts interactive flow
        └── writer.ts                          # copies skill folders, writes skills-lock.json and .stackshift/installed.json
```

`stackshift-core` holds all structural content. Protocol tier skills contain only a `SKILL.md` index that declares which protocols are in scope and when to load each — no content is duplicated. All protocol files are sourced from `stackshift-core/protocols/` and loaded on demand.

---

## Extending the Skill

**Add a protocol** — place a `.md` file in `stackshift-core/protocols/` and register it in `protocols/_registry.json` with an `id`, `tier`, `file`, `title`, and `summary`. For multi-file protocols, use `dir` instead of `file` and copy `protocols/_template/` as the starting point. Bootstrap picks up new entries on re-bootstrap; existing projects fall back to the skill copy until they re-bootstrap.

**Add a workflow step** — add a file to `workflow/`, add a row to the step table in `SKILL.md` Section 1, and update `workflow/checklist.md` with required and recommended done-when items.

**Add a reference lookup** — add a file to `references/` and add a corresponding row to the lookup router in `SKILL.md` Section 3. Files without a row are not discoverable by the workflow.

After any structural change, increment `skill.version`.

---

## Companion Skill

During the component variant phase, StackShift hands off to `ui-forge` once schema, types, and section wiring are complete. At that point, StackShift has created an empty variant file, registered the dynamic import in `index.tsx`, and exported the props interface. `ui-forge` receives that interface as its contract and generates the full variant component body.

StackShift never authors component code. `ui-forge` never touches schema or wiring. The boundary is the props interface.

---

## Version Compatibility

| Dependency | Version |
|---|---|
| Sanity | v3.17 |
| Next.js | 14, Pages Router |
| TypeScript | strict mode |
| `@webriq-pagebuilder/sanity-plugin-schema-default` | extend, do not replace |
| `@stackshift-ui/*` | component library, referenced in `index.tsx` only |

See `references/versions.md` for the full compatibility matrix including peer dependencies.

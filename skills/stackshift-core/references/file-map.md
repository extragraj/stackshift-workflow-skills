# Reference — File Map

Quick lookup: which file does what in a StackShift project.

| File | Purpose |
|---|---|
| `schemas/custom/sanity-plugin-schema-default/src/schemas/common/fields.ts` | Local field factory overrides — check here first |
| `node_modules/@webriq-pagebuilder/sanity-plugin-schema-default/src/schemas/common/fields.ts` | Base field factories — check here second |
| `schemas/elements/` | Global registered types (e.g. `conditionalLink`) — registered once, referenced by name |
| `schemas/elements/index.ts` | Exports for global registered types |
| `schemas/custom/index.ts` | Custom schema package imports — configured during one-time setup |
| `schemas/schema.ts` | Root schema merge — configured once during one-time setup |
| `schemas/custom/.../sections/index.ts` | Section registry — import and spread each new section here |
| `schemas/custom/.../sections/[name]/[name].ts` | Section entry — wires `rootSchema()`, `variantsList`, field schema |
| `schemas/custom/.../sections/[name]/schema/index.ts` | Field definitions with `hideIfVariantIn()` per variant |
| `schemas/custom/.../sections/[name]/initialValue/` | Placeholder content for every field |
| `schemas/custom/.../sections/[name]/images/` | Variant preview thumbnails — one per variant |
| `pages/api/query.ts` | All GROQ projections — reusable fragment constants and `variants` query |
| `types.ts` | All TypeScript interfaces — check and add here |
| `components/sections/[name]/index.tsx` | Variant router + local props interface + props extraction |
| `components/sections/[name]/variant_[x].tsx` | Custom variant implementation |
| `components/sections/modal/index.tsx` | Modal variant router — `ModalProps` interface and `VariantRegistry` map (modal-sheet protocol) |
| `components/sections/modal/variant_[x].tsx` | Modal variant — owns its `@stackshift-ui/sheet` or `@stackshift-ui/dialog` wrapper; uses `useModal()` for state |
| `components/ui/smart-link.tsx` | Link component that intercepts `linkType: "linkModal"` and calls `openModalByRef()` instead of navigating |
| `context/ModalContext.tsx` | Modal state — `openModalByRef`, `closeModal`, `activeModalData`; wraps `pages/_app.tsx` |
| `studio/badges/ModalPreviewBadge.tsx` | Sanity Studio badge that opens a modal overlay for preview; requires `ModalProvider` in Studio scope |
| `studio/deskStructure/modals.ts` | Desk structure list for modal documents |
| `components/list.tsx` | Section component registry — register new section types here |
| `design/standards/stackshift-ui.md` | StackShift UI conventions for UI Forge's design-standards pipeline (seeded at bootstrap) |
| `design/standards/brand.md` | Project brand document: voice, palette, typography, imagery (seeded at bootstrap when `brand` protocol is active) |
| `design/design-arch.json` | UI Forge's design authority — tokens, components, conventions. May contain a `_paired` mirror block written by StackShift bootstrap |
| `design/.handoff-cache/<hash>/` | Cached Claude Design handoffs (URL-keyed); regeneratable; ignored by `.forgeignore` and should be in `.gitignore` |
| `design/claude-design-bundle/` | Output of `/forge-export-design` — uploadable to Claude Design (README, tokens, conventions, standards); ignored by `.forgeignore` |
| `.forgeignore` | UI Forge scan exclusions — Sanity + Next.js defaults plus Claude Design cache/bundle written at bootstrap |
| `.claude/settings.json` | Claude Code settings — receives the StackShift PostToolUse hook entry when `auto-verify-hook` protocol is active |
| `.stackshift/installed.json` | StackShift install marker — protocols, `a11yRequired`, `uiForgeIntegration`, contract version |
| `.agents/skills/stackshift-core/` | StackShift skill install location for universal agents (project scope) |
| `~/.agents/skills/stackshift-core/` | StackShift skill install location for universal agents (global scope) |

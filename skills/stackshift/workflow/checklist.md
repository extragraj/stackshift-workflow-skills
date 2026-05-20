# End-to-End Checklist

Run after Step 5 completes. The protocol-driven items below are derived from `.stackshift/installed.json` at install / repair time — only installed protocols are listed.

<!-- CLI:CHECKLIST:BEGIN -->
> The CLI injects this block at install. Do not edit by hand —
> it will be overwritten by the next `init` or `repair`.
<!-- CLI:CHECKLIST:END -->

---

## Universal — every project

### Step 1 — Schema Fields
- [ ] `hideIfVariantIn` and `hideInVariants` imports come from `@webriq-pagebuilder/sanity-plugin-schema-default`

### Step 2 — Section Schema
- [ ] All imports resolve (`rootSchema`, field factories)
- [ ] New variant added to `variantsList` after spreading base, with a `description`
- [ ] Section registered in `schemas/custom/.../sections/index.ts`
- [ ] `initialValue` NOT passed into `rootSchema()`

### Step 3 — TypeScript Types
- [ ] Every new field has a corresponding entry in the `Variants` interface
- [ ] No `any` types anywhere

### Step 4 — Component Variant
- [ ] `variant_[x].tsx` existed on disk before its `dynamic()` import was registered (4a → 4b)
- [ ] `dynamic(() => import("./variant_[x]"))` added to the `Variants` map
- [ ] If new section type: registered in `components/list.tsx`
- [ ] All preconditions verified before `ui-forge` invocation
- [ ] `ui-forge` invoked with `--signal CONVERT_VARIANT` and `--mode body-only`
- [ ] All postconditions passed (FORGE NOTES header present, `index.tsx` unchanged, no unexpected files created)
- [ ] No StackShift-managed files were modified by `ui-forge` (only the `variant_[x].tsx` body)

### Step 5 — GROQ Query
- [ ] Only non-scalar fields have explicit projections
- [ ] Scalars left to the `...` spread
- [ ] All projections use the null-check pattern
- [ ] Reusable fragment constants interpolated — no inline rewrites of known shapes

### Quality Gate
- [ ] No TypeScript `any`
- [ ] Optional chaining (`?.`) applied wherever Sanity data could be null/undefined
- [ ] No Sanity v4+ APIs used
- [ ] Imports use the `@/*` path alias
- [ ] `yarn build` or `tsc --noEmit` passes with zero errors

---

## Optional protocols — only if the project adopts the system

Each optional protocol may ship its own checklist. When an optional protocol is installed, its done-when items appear in the **Protocol-driven checks** block above. For multi-file protocols, consult `.stackshift/protocols/<protocol-name>/` for any additional checks the protocol's own documentation specifies.

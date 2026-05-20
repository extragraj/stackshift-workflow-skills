# Step 2 — Section Schema

<!-- CLI:PROTOCOLS:BEGIN step=2 -->
> The CLI injects this block at install. Do not edit by hand —
> it will be overwritten by the next `init` or `repair`.
<!-- CLI:PROTOCOLS:END -->

---

## Required directory structure

```
schemas/custom/sanity-plugin-schema-default/src/schemas/sections/[section_name]/
├── [sectionName].ts        # Main entry — required
└── schema/
    └── index.ts            # Field definitions — required
```

---

## Naming conventions

| Element | Convention | Example |
|---|---|---|
| Directory | `snake_case` | `call_to_action` |
| Main file | `camelCase.ts` | `callToAction.ts` |
| Schema constant | `[sectionName]Schema` | `callToActionSchema` |
| Variants constant | always `variantsList` | `variantsList` |

---

## Main entry file shape

```typescript
import { rootSchema } from "@webriq-pagebuilder/sanity-plugin-schema-default";
import { callToActionVariants as baseVariantsList } from "@webriq-pagebuilder/sanity-plugin-schema-default";
import { callToActionSchema } from "./schema";

export const variantsList = [
  ...baseVariantsList,
  {
    title: "Variant F",
    value: "variant_f",
    description: "Brief description of what this variant does",
  },
];

export default rootSchema({
  name: "callToAction",
  schema: callToActionSchema,
  variants: variantsList,
});
```

**Rules:**
- Import `rootSchema` and base variants from `@webriq-pagebuilder/sanity-plugin-schema-default` — never redefine locally.
- `variantsList` always spreads `baseVariantsList` first.
- Every new variant entry must include a `description`.
- **Do NOT** pass `initialValue` into `rootSchema()`.

---

## Register the section

```typescript
// schemas/custom/sanity-plugin-schema-default/src/schemas/sections/index.ts
import { default as mySection } from "./my_section/mySection";
const schemas = { ..., mySection };
export default schemas;
```

Without registration, the section never loads.

---

## Adding a section not yet present locally

Copy the base structure from:
`node_modules/@webriq-pagebuilder/sanity-plugin-schema-default/src/schemas/sections/[section_name]/`

Then customize inside your local `schemas/custom/` tree.

---

## Seed gate — required before writing any `initialValue/` file

> Skip this gate entirely if the current task does not touch `initialValue/`.

<!-- CLI:SEED:BEGIN -->
> The CLI injects the active seed strategy block here at install time.
<!-- CLI:SEED:END -->

---

## Always validate

- [ ] All imports resolve (`rootSchema`, field factories)
- [ ] New variant added to `variantsList` after spreading base, with `description`
- [ ] Section registered in `sections/index.ts`
- [ ] `initialValue` NOT passed into `rootSchema()`
- [ ] **Validate:** `npx @extragraj/stackshift-skills validate --file <written-path>` exits 0 (fires automatically via PostToolUse when `auto-validate-hook` is installed)

→ Proceed to `workflow/3-types.md`.

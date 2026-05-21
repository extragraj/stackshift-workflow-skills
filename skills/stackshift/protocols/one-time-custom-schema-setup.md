# Protocol — One-Time Custom Schema Setup

**Applies to:** Step 2 (Section Schema) — **run ONCE per project**
**Rule strength:** Required (but only once)

Only follow these steps if custom local variants have not yet been configured in the project. If already configured, skip this protocol forever.

---

## Step 1 — Register the section in the sections index

Every section must appear in `schemas/custom/sanity-plugin-schema-default/src/schemas/sections/index.ts`. Without this entry the section never loads, regardless of any other wiring.

```typescript
// schemas/custom/sanity-plugin-schema-default/src/schemas/sections/index.ts
import { default as header } from "./header/header";
import { default as mySection } from "./my_section/mySection";

const schemas = {
  header,
  mySection,
};

export default schemas;
```

This is a one-line-per-section edit. Re-run it for every new section, but the import structure itself is set up once.

---

## Step 2 — Configure custom schema imports

Edit `schemas/custom/index.ts`:

```typescript
import { default as customSchemaBlog } from "./sanity-plugin-schema-blog/src";
import { default as customSchemaDefault } from "./sanity-plugin-schema-default/src/schemas/sections";
import { default as customSchemaCommerce } from "./sanity-plugin-schema-commerce/src/schemas/sections";

const schemas = {
  ...customSchemaBlog,
  ...customSchemaDefault,
  ...customSchemaCommerce,
};
export default schemas;
```

Add a new schema package here **only** when creating a new section category.

---

## Step 3 — Uncomment schema configuration in the main schema file

Edit `schemas/schema.ts`:

```typescript
// 1. Uncomment:
import customSchema from "./custom";
const updatedSchemaArray = Object.values(customSchema);

const allSchemas = (() => {
  // 2. Comment out:
  // const mergedSchemas = mergeReplaceAndAdd(baseSchemas, commerceSchemaArray);

  // 3. Uncomment:
  const mergedSchemas = mergeReplaceAndAdd(baseSchemas, updatedSchemaArray);
  return mergedSchemas;
})();
```

---

## Studio variant detection — three-way alignment

A variant is visible and renderable in Sanity Studio only when **all three** of these are true:

| # | Condition | File |
|---|---|---|
| 1 | Section key exists in `Components` map | `components/list.tsx` |
| 2 | Schema name matches that key and is in `allSchemas` | merged via `schemas/schema.ts` (Step 3 above) |
| 3 | `variantsList[].value` matches the key in the section's `Variants` map | `schemas/.../sections/<name>/<name>.ts` ↔ `components/sections/<name>/index.tsx` |

If a custom variant does not appear in Studio, walk this list before debugging further. Any mismatch produces silent failure — no build error, just a missing picker entry or a blank render.

---

## Live preview rendering — env-flag note

`NEXT_PUBLIC_RENDER_DYNAMIC_COMPONENTS=true` enables live React previews inside the Studio variant picker. When unset or `"false"`, only the static `images/<variant>.jpg` thumbnails are shown.

- Env on → see `dynamic-variants-registry` for the `components/data/dynamic.ts` registration step.
- Env off → see `section-directory-layout` for the static `images/` requirement.

The `cookies` section is excluded from dynamic rendering regardless of the env flag.

---

## Step 4 — Verify the schema merge

If sections don't appear in Studio, check, in order:

- ✅ Section is registered in `schemas/.../sections/index.ts` (Step 1).
- ✅ Custom schema imports exist in `schemas/custom/index.ts` (Step 2).
- ✅ Import is uncommented in `schemas/schema.ts` (Step 3).
- ✅ `mergeReplaceAndAdd()` uses `updatedSchemaArray`, not `commerceSchemaArray`.
- ✅ Three-way alignment passes for the missing variant (see table above).

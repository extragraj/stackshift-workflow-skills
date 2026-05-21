# Protocol — Dynamic Variants Registry

**Applies to:** Step 2 (Section Schema) — after the section is registered
**Rule strength:** Recommended *(no-op when the project does not enable live previews)*

`components/data/dynamic.ts` is the second variant-preview path in Sanity Studio. When the project sets `NEXT_PUBLIC_RENDER_DYNAMIC_COMPONENTS=true`, the variant picker renders the **actual variant component live** (using `initialValuesMap` content as placeholder data) instead of showing the static `images/<variant>.jpg`. Custom variants must be registered here or Studio falls back to the base-package defaults and the live preview misrenders.

> **Not a seeding strategy.** This file does not seed real documents. `initialValue/` (schema-level) is what fills a new section the moment an author creates one. `initialValuesMap` (this file) only feeds the in-picker live preview.

---

## Decision gate — read first

Before doing anything in this protocol, check the project's runtime env:

| `NEXT_PUBLIC_RENDER_DYNAMIC_COMPONENTS` | Action |
|---|---|
| unset or `"false"` | **No-op.** This protocol does not apply. Make sure `images/<variant>.jpg` exists per `section-directory-layout` — that path is the static fallback. |
| `"true"` | Register every custom variant per Part A; swap in custom `initialValue/` per Part B. The static JPG becomes optional. |

If the project may run in **both** modes (e.g. previews enabled in dev, disabled in CI builds), do both: register here AND keep the JPG.

The `cookies` section is always excluded from dynamic rendering regardless of the env flag — do not add it here.

---

## File location

```
components/data/dynamic.ts
```

This file lives outside `schemas/` and outside `components/sections/` — it is read at Studio render time by `fetchDynamicComponentsData()`.

---

## Part A — register the custom variant in `variantsMap`

For every custom variant added to the section's `variantsList`, add an entry to a `customXxxVariants` array and spread it into the `variantsMap` row:

```ts
// components/data/dynamic.ts

const customNavigationVariants = [
  { value: "variant_i", title: "Main Navigation" },
];

const customFeaturesVariants = [
  { value: "variant_i", title: "Feature Variant I" },
  { value: "variant_j", title: "Feature Variant J" },
];

const variantsMap = {
  navigation: [...navigationVariants, ...customNavigationVariants],
  features: [...featuresVariants, ...customFeaturesVariants],
  // sections with no custom variants stay as-is
};
```

**Rules:**
- The `value` here must exactly match the `value` used in `variantsList[].value` AND the key used in the section's `Variants` map (see `variant-naming-convention`).
- The `title` here should match the `title` in `variantsList[]` so picker labels stay consistent.
- Always spread the base array first (`...navigationVariants`) so the upstream variants remain available.

---

## Part B — swap custom `initialValue/` into `initialValuesMap`

When a section has a project-local `initialValue/index.ts` whose shape differs from the base package's default content, import it and **replace** the base import in `initialValuesMap`:

```ts
// components/data/dynamic.ts

// Before — base package defaults:
import {
  navigationInitialValue,
  featuresInitialValue,
} from "@webriq-pagebuilder/sanity-plugin-schema-default";

// After — project-local defaults, base imports REMOVED for these two:
import customNavigationInitialValue
  from "schemas/custom/sanity-plugin-schema-default/src/schemas/sections/navigation/initialValue";
import customFeaturesInitialValue
  from "schemas/custom/sanity-plugin-schema-default/src/schemas/sections/features/initialValue";

const initialValuesMap = {
  navigation: customNavigationInitialValue,   // overrides base
  features:   customFeaturesInitialValue,
  // sections without a custom initialValue/ keep the base import
};
```

**Rule:** when you switch a section to its custom initial value, remove the corresponding base-package import. Keeping both works in JavaScript (the local import wins by key) but leaves dead code that future readers will mistakenly believe is in use.

---

## Why "Part B is recommended, not optional"

If Part A is done but Part B is skipped:

- Studio renders the live preview with **base-package initial values**.
- Those values often reference fields your custom variant does not consume.
- The preview displays empty / misaligned content — authors lose trust in the picker.

So when you customize `initialValue/` AND have the env flag on, do **both** parts together.

---

## Relationship to other protocols

| Protocol | Connection |
|---|---|
| `section-directory-layout` | Owns the static `images/<variant>.jpg` path. The two protocols cover the same picker surface via two different paths — pick the one matched to the env flag. |
| `variant-naming-convention` | The `value` field used here must match the schema `variantsList[].value` and the router `Variants` map key. |
| `initialValue-seeding` (seed strategy) | Produces the content this file references. Seeding writes `schemas/.../initialValue/index.ts`; this protocol exposes it to the live preview. The two never overwrite each other. |

---

## Done-when

- [ ] Decision gate evaluated: `NEXT_PUBLIC_RENDER_DYNAMIC_COMPONENTS` checked, path selected.
- [ ] (env flag on) Every custom variant has a `customXxxVariants[]` entry spread into `variantsMap`.
- [ ] (env flag on, custom initialValue/) `initialValuesMap` references the project-local `initialValue` and the corresponding base-package import has been removed.
- [ ] `cookies` is not registered here.

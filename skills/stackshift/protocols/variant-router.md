# Protocol — Variant Router (`index.tsx`)

**Applies to:** Step 4 (Component Variant)
**Rule strength:** Required

The section's `index.tsx` has three responsibilities:

1. Map every variant — built-in and local — into a single `Variants` object using `dynamic()` imports.
2. Define and export the **local props interface** (`[SectionName]Props`).
3. Accept `{ data }: SectionsProps`, extract fields from `data?.variants` with `?? undefined`, and spread into the chosen variant.

---

## Canonical pattern

```typescript
import dynamic from "next/dynamic";
import { SectionsProps, LabeledRouteWithKey } from "@/types";

const Variants = {
  // Built-in variants — imported from the package's `dist` path with dynamic()
  variant_a: dynamic(() => import("@stackshift-ui/my-section/dist/my-section_a")),
  variant_b: dynamic(() => import("@stackshift-ui/my-section/dist/my-section_b")),
  variant_c: dynamic(() => import("@stackshift-ui/my-section/dist/my-section_c")),
  // Custom variants — local files, also dynamic()
  variant_d: dynamic(() => import("./variant_d")),
  variant_e: dynamic(() => import("./variant_e")),
};

/** @contract-version 1.0.0 */
export interface MySectionProps {
  title?: string;
  description?: string;
  primaryButton?: LabeledRouteWithKey;
}

export function MySection({ data }: SectionsProps) {
  const Variant = data?.variant
    ? Variants[data.variant as keyof typeof Variants]
    : undefined;

  const props: MySectionProps = {
    title: data?.variants?.title ?? undefined,
    description: data?.variants?.description ?? undefined,
    primaryButton: data?.variants?.primaryButton ?? undefined,
  };

  if (!Variant) return null;

  return <Variant {...props} />;
}

export default MySection;
```

---

## Hard rules

- **Every entry in `Variants` uses `dynamic(() => import(...))`.** No exceptions for built-ins. No star imports. No static named imports for variant components. This applies to the *first* creation of `index.tsx`, not just later edits — do not start with star imports and "fix it later."
- Built-in variants are imported from the package's **dist path**: `@stackshift-ui/<package>/dist/<package>_<letter>` (e.g. `@stackshift-ui/call-to-action/dist/call-to-action_a`).
- Function signature is **`{ data }: SectionsProps`** — not a custom props type.
- Every field uses **`?? undefined`** — never `?? null`, never bare optional chaining without fallback.
- Render **`null`** when `data?.variant` is absent. **Never hardcode a fallback variant.**
- Props interface is **defined and exported here**, then imported from `"."` by variant files.
- Dynamic imports for local variants are added to `Variants` **only after** the variant file exists on disk (Step 4a writes the stub before 4b registers it).

---

## Dist-path examples

| Package | Built-in `dist/` import |
|---|---|
| `@stackshift-ui/call-to-action` | `@stackshift-ui/call-to-action/dist/call-to-action_a` |
| `@stackshift-ui/blog` | `@stackshift-ui/blog/dist/blog_c` |
| `@stackshift-ui/statistics` | `@stackshift-ui/statistics/dist/stats_a` |
| `@stackshift-ui/text-component` | `@stackshift-ui/text-component/dist/text_a` |
| `@stackshift-ui/how-it-works` | `@stackshift-ui/how-it-works/dist/how_it_works_a` |
| `@stackshift-ui/header` | `@stackshift-ui/header/dist/header_a` |

Note: the **file suffix** at the dist path uses the package's internal naming, which may differ from the package id (e.g. `statistics` → `stats_a`, `text-component` → `text_a`). Inspect the package's `dist/` folder if uncertain.

---

## `components/list.tsx` integration

When a section is converted from a direct `@stackshift-ui` import to a local wrapper (because at least one custom variant exists), the `list.tsx` entry has to match the wrapper's **named export**:

```typescript
// Before — direct @stackshift-ui import:
header:     dynamic(() => import("@stackshift-ui/header").then((m) => m.Header), { ssr: false }),
features:   dynamic(() => import("@stackshift-ui/features").then((m) => m.Features)),

// After — local wrapper with named export:
header:     dynamic(() => import("components/sections/header").then((m) => m.Header)),
features:   dynamic(() => import("components/sections/features").then((m) => m.Features)),
navigation: dynamic(() => import("components/sections/navigation").then((m) => m.Navigation)),
```

Two rules apply at this switch:

1. **Use `.then((m) => m.<Name>)`** to match the named export. Local `index.tsx` files export `export function MySection(...)` — not `export default`. Forgetting the `.then` resolver produces the TypeScript error: `Type 'typeof import("...")' is not assignable to type 'ComponentType | ComponentModule'`.
2. **Drop `{ ssr: false }`** when switching to the local wrapper. The flag was a workaround for SSR-unsafe `@stackshift-ui` packages. A local wrapper built on `@stackshift-ui` primitives is SSR-safe — keeping the flag disables SSR unnecessarily and hurts SEO and first paint.

---

## Anti-patterns

❌ Star import / static named import for variants:
```typescript
// WRONG — star import bypasses next/dynamic entirely; variants are not lazy-loaded.
import * as CallToActionVariants from "@stackshift-ui/call-to-action";
const Variants = {
  variant_a: CallToActionVariants.CallToAction_A,
};

// WRONG — package-root named import for a specific variant.
import { CallToAction_A } from "@stackshift-ui/call-to-action";
```

❌ Hardcoding a default variant:
```typescript
const Variant = Variants[data?.variant ?? "variant_a"]; // BAD — surfaces a wrong section silently.
```

❌ Importing props from the component library:
```typescript
import { MySectionProps } from "@stackshift-ui/my-section"; // BAD — use the local interface.
```

❌ Passing `data` directly to the variant:
```typescript
return <Variant data={data} />; // BAD — spread extracted props instead.
```

❌ Keeping `{ ssr: false }` after switching `list.tsx` to a local wrapper:
```typescript
// WRONG — local wrappers are SSR-safe; the flag hurts SEO and first paint.
header: dynamic(() => import("components/sections/header").then((m) => m.Header), { ssr: false }),
```

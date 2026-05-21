# Protocol — Variant Reuse First

**Applies to:** Step 4 (Component Variant) — runs **before** 4a scaffolds the file
**Rule strength:** Recommended

Before scaffolding a new variant file, verify that no existing variant already covers the required fields and layout. Every new variant adds maintenance burden: a `variantsList` entry, a preview image (or `dynamic.ts` registration), `hideIfVariantIn()` updates on every field in the section schema, and a typed slot in the `Variants` interface. Reusing or wrapping an existing variant avoids all of that.

This is the variant-level analogue of `field-reuse-first`.

---

## Decision tree

Run this for the section under work, in order. Stop at the first match:

```
1. Identify the component type
   (header, navigation, features, statistics, call-to-action, footer, etc.)

2. Inspect existing @stackshift-ui variants in the package
   grep -E "variant_[a-z]" node_modules/@stackshift-ui/<package>/src/<package>.tsx

3. Does an existing variant have the SAME fields and SAME layout?
   YES → Use it as-is in Studio. Configure via the className prop or built-in
         props. DO NOT create a new variant. (No 4a scaffold.)

4. Does an existing variant have the SAME fields but a DIFFERENT layout?
   YES → Import that variant from its dist path and wrap it locally:
         `dynamic(() => import("@stackshift-ui/<pkg>/dist/<pkg>_<letter>"))`
         No new variant key needed — keep the existing `value`.

5. Different fields or fundamentally different structure?
   YES → Only now create a new custom variant. Proceed to 4a.
```

---

## Inspection commands

```bash
# List every variant key in a base @stackshift-ui package
grep -E "variant_[a-z]" node_modules/@stackshift-ui/<package>/src/<package>.tsx

# Read the fields a specific variant exposes
cat node_modules/@stackshift-ui/<package>/src/<package>_a.tsx

# List custom local variants already in the project
ls components/sections/<section>/
```

---

## Worked example — `navigation` with logo + links + button

The user asks for a `navigation` section that renders a logo, links, and a CTA button.

| Step | Action | Outcome |
|---|---|---|
| 2 | `grep variant_ node_modules/@stackshift-ui/navigation/src/navigation.tsx` | Finds `variant_a` … `variant_e` |
| 3 | Read `navigation_a.tsx` — fields are logo + links + button | **Match.** Use `variant_a` in Studio with `className` tuning. **No new variant.** |
| 4 | Skipped — matched at step 3. | — |
| 5 | Skipped — matched at step 3. | — |

Result: zero new files, zero `variantsList` edits, zero `hideIfVariantIn` updates.

---

## Worked example — same fields, different layout

The user wants the navigation rendered with the CTA on the **left** instead of the right. Fields are the same.

| Step | Action | Outcome |
|---|---|---|
| 3 | Layout differs → not a step-3 match. | Continue. |
| 4 | Wrap `variant_a` from its dist path: `dynamic(() => import("@stackshift-ui/navigation/dist/navigation_a"))` in a thin local wrapper that overrides the layout via `className`. | Keep `value: "variant_a"`. No `variantsList` change. |

Result: one wrapper file, no schema changes.

---

## When a new variant is justified

Step 5 only triggers when:

- The required fields are not present on any existing variant (e.g. existing `header_a` has no `secondaryButton`, but the new design needs one).
- The structural shape is fundamentally different (e.g. existing variants are single-column, the new design is a split layout with sidebar nav).

When step 5 fires, follow `variant-naming-convention` to pick the next key, then proceed to `workflow/4-variants.md` 4a.

---

## Anti-patterns

❌ Creating a new variant when an existing one fits, "just to keep things explicit." Studio gives no UX benefit for a duplicate variant entry; authors get an extra ambiguous picker tile.

❌ Skipping step 2 ("I already know there's no match") and going straight to 4a. The base package adds variants over time; the assumption goes stale.

❌ Treating step 4 (wrap an existing variant) as "writing a new variant." Wrapping reuses the existing `value` — no new entry in `variantsList`, no schema updates, no `hideIfVariantIn()` walk.

---

## Done-when

- [ ] Base-package variants inspected for the section under work.
- [ ] Local `components/sections/<section>/` inspected for existing custom variants.
- [ ] Decision recorded: reuse as-is (step 3), wrap (step 4), or scaffold new (step 5).
- [ ] If step 5 was chosen, the decision rationale is non-trivial (different fields or different structure — not just preference).

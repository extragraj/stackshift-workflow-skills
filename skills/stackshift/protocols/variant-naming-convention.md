# Protocol — Variant Naming Convention

**Applies to:** Step 2 (Section Schema, `variantsList`) and Step 4 (Variant Router, `Variants` map)
**Rule strength:** Required

The variant key is a three-way contract: the **same string** must appear in `variantsList[].value` (schema), the `Variants` map key (`index.tsx`), and the variant filename suffix (`variant_<x>.tsx`). Picking the wrong next key silently breaks `hideIfVariantIn()` matching, `dynamic.ts` registration, and Studio variant-picker rendering.

---

## The sequence

Single letters before two-letter combinations. **Always.**

```
Built-in (from @stackshift-ui or base package):  variant_a → variant_b → ... → variant_h
Custom (added locally):                          variant_i → variant_j → ... → variant_z
                                                  → variant_aa → variant_ab → ... → variant_az
                                                  → variant_ba → variant_bb → ...
```

**Two-letter suffixes (`aa`, `ab`, ...) begin only after `variant_z` is exhausted.** Skipping straight from `variant_h` to `variant_ac` is wrong — even though `variant_ac` is "free", `variant_i` is the next correct key.

---

## How to pick the next key

Before writing **any** new variant — schema entry, file, or `Variants` map row — do these two reads:

1. **Base package variants** — list what the upstream `@stackshift-ui/<pkg>` (or `@webriq-pagebuilder/sanity-plugin-schema-default`) ships.
   ```bash
   grep -E "variant_[a-z]" node_modules/@stackshift-ui/<package>/src/<package>.tsx
   ```
2. **Local custom variants** — list what already exists in this project.
   ```bash
   ls components/sections/<section>/
   ```

Merge both lists. The next key is the **lowest unused letter** in the sequence above.

---

## Decision table

| Last existing key (across base + local) | Next key (correct) | Wrong |
|---|---|---|
| `variant_h` | `variant_i` | ~~`variant_ac`~~ |
| `variant_i` | `variant_j` | ~~`variant_ad`~~ |
| `variant_y` | `variant_z` | ~~`variant_aa`~~ |
| `variant_z` | `variant_aa` | — |
| `variant_aa` | `variant_ab` | — |
| `variant_az` | `variant_ba` | — |

**Stop-and-check rule:** if you are about to type `variant_ac`, `variant_ad`, `variant_ae`, or any two-letter key while single letters before `variant_z` are still unused, **stop**. The next key is the next single letter.

---

## Three-way key alignment

The same string must appear in all three places. Any mismatch silently disables the variant in Studio without raising a build error.

| Where | What to write | File |
|---|---|---|
| Schema `variantsList[].value` | `"variant_<x>"` | `schemas/custom/.../sections/<name>/<name>.ts` |
| Router `Variants` map key | `variant_<x>: dynamic(...)` | `components/sections/<name>/index.tsx` |
| Variant filename suffix | `variant_<x>.tsx` | `components/sections/<name>/` |

If `dynamic.ts` registration is also used (see `dynamic-variants-registry`), the same string appears a fourth time in `customXxxVariants[].value`.

---

## Anti-patterns

❌ Jumping to two-letter keys before `variant_z`:
```ts
// Last existing is variant_h. WRONG:
variant_ac: dynamic(() => import("./variant_ac")),
// CORRECT:
variant_i: dynamic(() => import("./variant_i")),
```

❌ Diverging keys across the three locations:
```ts
// variantsList[].value === "variant_z"
// but Variants map uses "variant_Z" or "variantZ" — Studio shows the picker entry,
// the renderer can't resolve it, and the variant silently renders nothing.
```

❌ Reusing a base-package key for a custom variant. The next custom key is always strictly **after** the last base-package variant.

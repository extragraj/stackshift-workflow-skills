# Step 1 — Schema Fields

<!-- CLI:PROTOCOLS:BEGIN step=1 -->
> The CLI injects this block at install. Do not edit by hand —
> it will be overwritten by the next `init` or `repair`.
<!-- CLI:PROTOCOLS:END -->

---

## Two constructs exist — know which you need

| | Global Registered Type | Schema Field Factory |
|---|---|---|
| **Example** | `conditionalLink`, `webriqForm` | `mainImage()`, `customText()` |
| **Defined in** | `/schemas/elements/*.ts` | `schemas/custom/.../common/fields.ts` |
| **How to use** | `type: "conditionalLink"` | Call `mainImage()` or spread `...mainImage()` |
| **Registered?** | Yes — in `/elements/index.ts` | No |
| **Spreadable?** | ❌ | ✅ |

Create a new global type only when multiple unrelated sections need the exact same object shape referenced by name. Otherwise use a field factory.

---

## Always validate

- [ ] **Validate:** `npx @extragraj/stackshift-skills validate --file <written-path>` exits 0 (fires automatically via PostToolUse when `auto-validate-hook` is installed; run manually otherwise)

→ Proceed to `workflow/2-section-schema.md`.

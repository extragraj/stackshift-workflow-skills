# Step 4 — Component Variant

<!-- CLI:PROTOCOLS:BEGIN step=4 -->
> The CLI injects this block at install. Do not edit by hand —
> it will be overwritten by the next `init` or `repair`.
<!-- CLI:PROTOCOLS:END -->

> This is the ONLY step that delegates to `ui-forge`.
> StackShift owns the wiring (index.tsx, props interface, dynamic import).
> `ui-forge` owns the variant body (JSX + component library usage).

Strict sub-step order: **4a → 4b → 4c → 4d**. Do not reorder.

**On-demand references for this step** — load only when the linked step needs them:

| Reference | When to load |
|---|---|
| `references/ui-forge-invocation.md` | 4d — once preconditions pass. Skill-root resolution, `--validate-input`, invocation forms, ref-selection rules, StackShift patterns `ui-forge` must honor. |
| `references/anti-slop-check.md` | 4d — only when any `--refs` is an HTML or TSX file. |
| `references/failure-modes.md` | 4d — only when a precondition trips, `ui-forge` returns non-zero, or a postcondition fails. |

---

## Modification vs. Full Generation

Determine the invocation mode before starting 4a.

| Task type | Mode | Required flags |
|-----------|------|----------------|
| New variant (no stub exists) | full (default) | `--task`, `--refs` |
| Fix or rebuild an existing variant | `--mode body-only` | `--task`, `--refs` (HTML ref required) |
| Append content to an existing body | `--mode body-only` | `--task`, `--refs` |

**FORGE NOTES header and all postcondition checks are required in both modes.** Fix/rebuild tasks are not exempt from structural validation or the contract check.

---

## 4a — Create the empty variant file

```bash
# The file must exist on disk before its dynamic() import can be registered.
touch components/sections/[section-name]/variant_[x].tsx
```

Start with a minimal stub so the file resolves:

```typescript
// variant_[x].tsx
import { MySectionProps } from ".";
export default function MySection_X(_props: MySectionProps) { return null; }
export { MySection_X };
```

→ Proceed to 4b.

---

## 4b — Register the dynamic import in `index.tsx`

```typescript
// components/sections/[section-name]/index.tsx
import dynamic from "next/dynamic";
import { SectionsProps } from "@/types";

const Variants = {
  // Built-in variants — dist path with dynamic()
  variant_a: dynamic(() => import("@stackshift-ui/my-section/dist/my-section_a")),
  variant_b: dynamic(() => import("@stackshift-ui/my-section/dist/my-section_b")),
  variant_c: dynamic(() => import("@stackshift-ui/my-section/dist/my-section_c")),
  // Custom variants — local files, also dynamic()
  variant_d: dynamic(() => import("./variant_d")),
  variant_e: dynamic(() => import("./variant_e")),
};
```

**Every entry in `Variants` uses `dynamic()`** — built-ins import from `@stackshift-ui/<pkg>/dist/<pkg>_<letter>`, customs from `./variant_<x>`. No star imports, no static named imports. See `.stackshift/protocols/variant-router.md` for the full rule set.

If this is a **new section type** (not just a new variant) — or you are converting an existing section that previously imported directly from `@stackshift-ui` — register the local wrapper in `components/list.tsx`. Use `.then((m) => m.<Name>)` to match the named export, and **drop `{ ssr: false }`** if it was carried over from the previous direct-import line:

```typescript
mySection: dynamic(
  () => import("components/sections/my-section").then((m) => m.MySection)
),
```

→ Proceed to 4c.

---

## 4c — Write the props interface and extraction in `index.tsx`

```typescript
/** @contract-version 1.0.0 */
export interface MySectionProps {
  title?: string;
  description?: string;
  primaryButton?: LabeledRouteWithKey;
  // ...one entry per field this section's variants can consume
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

  if (!Variant) return null;     // ← no hardcoded fallback variant

  return <Variant {...props} />;
}

export default MySection;
```

→ Proceed to 4d.

---

## 4d — Fill the variant body (INVOKE `ui-forge`)

Steps 4a–4c are complete. The props interface is exported from `"."`. Before invoking `ui-forge`, verify every precondition, execute the invocation, then validate postconditions.

### Preconditions

All of the following must be true before calling `ui-forge`. If any check fails, halt and fix before proceeding.

- [ ] `components/sections/<name>/index.tsx` exists and exports the props interface
- [ ] `components/sections/<name>/<Variant>.tsx` exists as a stub file (scaffolded in 4a)
- [ ] `types.ts` contains the props interface for this variant (completed in Step 3)
- [ ] `design/design-arch.json` exists at project root — **if missing, run `ui-forge`'s `scan.js` first** (see `references/failure-modes.md` → "Missing `design-arch.json`")
- [ ] `design/design-arch.json` `.designStandards` includes the bridged pointers written by the CLI at install time

### Anti-Slop check (conditional)

When any `--refs` argument is an HTML or TSX file, load `references/anti-slop-check.md` and run the checklist before writing the variant body. Report findings in the FORGE NOTES block.

### Invocation

Load `references/ui-forge-invocation.md` for the full procedure:

1. Resolve `${UI_FORGE_SKILL_DIR}` (preferred: `detect.sh`; fallback: 7-path lookup).
2. Run pre-flight `--validate-input` against the contract.
3. Invoke via the slash-command or `node invoke.js` form, with the correct ref selection.

### Structural postconditions

Run these checks **after** `ui-forge` returns. All must pass.

- [ ] Run `node ${UI_FORGE_SKILL_DIR}/scripts/validate-contract.js <output-variant-file> <path-to-types.ts>` — must exit 0. Covers: exports present, contract imported, `?? null` / `?? undefined` usage, no extra files, props interface unchanged.
- [ ] `// FORGE NOTES` header is present:
  - **Full mode (default):** file begins with `// FORGE NOTES`
  - **Body-only mode (`--mode body-only`):** `// FORGE NOTES` appears immediately after the last import statement (UI Forge ≥ 0.2.7B)
- [ ] `// @contract <path-to-types.ts>` directive present on line 3 of FORGE NOTES (UI Forge ≥ 0.1.9 — required by `SIGNAL_VARIANT`)
- [ ] `index.tsx` is bytewise unchanged (diff against git if possible)
- [ ] No new files written outside `components/sections/<name>/`

If any postcondition fails, load `references/failure-modes.md` and follow the matched row's response.

---

## Done when

- [ ] `variant_[x].tsx` created (4a)
- [ ] `dynamic()` import registered in `index.tsx` (4b)
- [ ] If new section: registered in `components/list.tsx`
- [ ] Props interface defined and exported from `index.tsx` (4c)
- [ ] Props extracted with `?? undefined` for every field (4c)
- [ ] No hardcoded fallback variant (4c)
- [ ] All preconditions verified before `ui-forge` invocation (4d)
- [ ] Variant body generated via `ui-forge` with `CONVERT_VARIANT` signal (4d)
- [ ] All structural postconditions passed (4d)
- [ ] No StackShift-managed files modified by `ui-forge` (4d)
- [ ] **Validate:** `npx @extragraj/stackshift-skills validate --file components/sections/<name>/index.tsx` exits 0 (covers variant-router invariants; fires automatically via PostToolUse when `auto-validate-hook` is installed)

→ Proceed to `workflow/5-groq.md`.

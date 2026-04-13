# Step 4 — Component Variant

> **Protocol Discovery for This Step:**
>
> Load protocols from merged registry (project + skill) where `appliesTo` includes Step 4:
> 1. Read `/docs/protocol/_registry.json` (if exists)
> 2. Read `protocols/_registry.json` from skill
> 3. Merge registries (project protocols override skill protocols with same ID)
> 4. Filter protocols: `tier === 'required'`
> 5. Load each protocol from `/docs/protocol/<id>` (project) OR `protocols/<id>` (skill)
>
> **Required protocols** (load and enforce):
> - Variant Router — `index.tsx` rules: exported props interface, `null` fallback, `?? undefined` extraction

> This is the ONLY step that delegates to `ui-forge`.
> StackShift owns the wiring (index.tsx, props interface, dynamic import).
> `ui-forge` owns the variant body (JSX + component library usage).

Strict sub-step order: **4a → 4b → 4c → 4d**. Do not reorder.

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
import { MySectionComponent as BaseMySectionComponent } from "@stackshift-ui/my-section";

const BaseVariants = {
  variant_a: BaseMySectionComponent,
  variant_b: BaseMySectionComponent,
  variant_c: BaseMySectionComponent,
};

const Variants = {
  ...BaseVariants,
  variant_d: dynamic(() => import("./variant_d")),
  variant_e: dynamic(() => import("./variant_e")),
};
```

If this is a **new section type** (not just a new variant), also register it in `components/list.tsx`:

```typescript
mySection: dynamic(
  () => import("components/sections/my-section").then((m) => m.MySection)
),
```

→ Proceed to 4c.

---

## 4c — Write the props interface and extraction in `index.tsx`

```typescript
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

**Hard rules:**
- Function signature is `{ data }: SectionsProps` — not a custom props type.
- Every field uses `?? undefined`.
- Render `null` when `data?.variant` is absent. **Never** hardcode a fallback.

See `protocols/variant-router.md` for the full pattern.

→ Proceed to 4d.

---

## 4d — Fill the variant body (INVOKE `ui-forge`)

Steps 4a–4c are complete. The props interface is exported from `"."`. Before invoking `ui-forge`, verify every precondition, execute the invocation, then validate postconditions.

### Preconditions

All of the following must be true before calling `ui-forge`. If any check fails, halt and fix before proceeding.

- [ ] `components/sections/<name>/index.tsx` exists and exports the props interface
- [ ] `components/sections/<name>/<Variant>.tsx` exists as a stub file (scaffolded in 4a)
- [ ] `types.ts` contains the props interface for this variant (completed in Step 3)
- [ ] `design/design-arch.json` exists at project root — **if missing, run `ui-forge`'s `scan.js` first** (see "Missing `design-arch.json`" in Failure Modes below)
- [ ] `design/design-arch.json` `.designStandards` includes a reference to the materialized `variant-router` protocol (written by bootstrap — see `bootstrap/install.md`)

### `${UI_FORGE_SKILL_DIR}` Resolution

Resolve the `ui-forge` skill directory using this lookup order. Use the **first path that exists**:

1. Environment variable `UI_FORGE_SKILL_DIR` if set
2. `.claude/skills/ui-forge/` (project-scope Claude Code install)
3. `.agents/skills/ui-forge/` (project-scope agents install)
4. `~/.claude/skills/ui-forge/` (global Claude Code install)
5. `~/.agents/skills/ui-forge/` (global agents install)

**If none resolve:** halt Step 4 with a clear error:

```
⚠️ ui-forge skill not found.

Step 4 requires the ui-forge companion skill to generate variant bodies.
StackShift never authors component code directly.

Install ui-forge:
  npx skills add extragraj/ui-forge -a claude-code

Then re-run Step 4.
```

Do **not** attempt to author component bodies without `ui-forge`. This violates the interface boundary.

### Invocation

Execute the following command, substituting placeholders with actual values:

```bash
node ${UI_FORGE_SKILL_DIR}/scripts/invoke.js \
  --task "Generate body for <VariantName> variant of <SectionName> section. \
          Conform to the props interface in <types-path>. Do not modify index.tsx \
          or the props interface. Write variant body only." \
  --refs <path-to-types.ts>,<path-to-initialValue-dir>,<path-to-variant-thumbnail> \
  --output components/sections/<name>/<Variant>.tsx \
  --mode body-only \
  --signal CONVERT_VARIANT
```

**Ref-selection rules:**

| Ref type | Include? | Why |
|----------|----------|-----|
| `.ts`/`.tsx` file containing the exported props interface | **Required** | Contract that `ui-forge` must conform to |
| `initialValue/` directory contents | **Recommended** | Gives `ui-forge` realistic placeholder copy |
| `images/<variant>.png` thumbnail | **Recommended** | Vision-based layout hints if present |
| Section schema file | **Never** | StackShift territory — confuses signal detection |
| GROQ query file (`pages/api/query.ts`) | **Never** | StackShift territory — confuses signal detection |
| `index.tsx` | **Never** | StackShift territory — `ui-forge` must not modify wiring |

**`ui-forge` must honor these StackShift-specific rules** (include them in the invocation context if not obvious from design-arch):

```typescript
// variant_[x].tsx
import { MySectionProps } from ".";                  // ← always from "."

export default function MySection_X({
  title,
  description,
  optionalProp = "default",                           // ← defaults in destructure
}: MySectionProps) {
  return (
    <Section>
      {title ? <Heading title={title} /> : null}     {/* ← ternary, not && */}
    </Section>
  );
}

export { MySection_X };                               // ← named export after default

function Heading({ title }: { title: string }) {     // ← helpers below all exports
  return <h2>{title}</h2>;
}
```

### Postconditions

Run these checks **after** `ui-forge` returns. All must pass.

- [ ] `components/sections/<name>/<Variant>.tsx` begins with `// FORGE NOTES` header
- [ ] Variant component renders `null` when required props are absent (Variant Router protocol)
- [ ] Props interface in `index.tsx` is unchanged (bytewise diff if possible)
- [ ] No new files written outside `components/sections/<name>/` (no `design/forge-page-plan.json`, no `index.tsx` overwrite)

If any postcondition fails, follow the Failure Modes protocol below.

---

## Failure Modes

If `ui-forge` fails or produces non-compliant output, follow the deterministic response for each case. **No failure mode results in silent corruption of StackShift-managed files.**

| Failure | Detection | Response |
|---|---|---|
| `ui-forge` exits non-zero | Process exit code ≠ 0 | Capture stderr, present to user verbatim, halt Step 4. Do not retry automatically. |
| Missing `design-arch.json` | Stderr matches `design-arch.json not found` or file absent at precondition check | Run `node ${UI_FORGE_SKILL_DIR}/scripts/scan.js`, then retry invocation **once**. If it fails again, halt. |
| Output missing `FORGE NOTES` header | Postcondition check: file does not begin with `// FORGE NOTES` | Re-invoke with explicit `--task` addendum: "Output MUST begin with `// FORGE NOTES` block." **Max 1 retry.** If second attempt also fails, present output to user and halt. |
| Variant Router violation (no `null` fallback or modified props interface) | Postcondition check fails | Do **not** auto-fix. Present diff to user, halt Step 4. Log which protocol was violated. |
| `index.tsx` modified | Bytewise diff shows change | Restore from git (`git checkout -- components/sections/<name>/index.tsx`) if available, otherwise present diff and halt. |
| Unexpected file written (e.g. `design/forge-page-plan.json`) | Post-run file listing of `components/sections/<name>/` and `design/` | Delete the unexpected file, halt, instruct user that signal detection misfired and `ui-forge` was invoked with an incorrect signal. |

**Recovery rule:** After any halt, the user must explicitly confirm before Step 4 re-runs. Do not auto-retry beyond the limits specified above.

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
- [ ] All postconditions passed (4d)
- [ ] No StackShift-managed files modified by `ui-forge` (4d)

→ Proceed to `workflow/5-groq.md`.

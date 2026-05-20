# Reference — UI Forge Invocation

Loaded by Step 4 (`workflow/4-variants.md`) when invoking `ui-forge`. Covers skill-root resolution, the pre-flight validator, both invocation forms, and ref-selection rules.

---

## `${UI_FORGE_SKILL_DIR}` Resolution

**Preferred path (UI Forge ≥ 0.1.9):** invoke `sh <candidate>/scripts/detect.sh` against the candidate paths below. The first that succeeds prints the absolute skill root to stdout — capture it as `UI_FORGE_SKILL_DIR`. UI Forge's `detect.sh` is the upstream source of truth for the search order; delegating to it keeps StackShift in sync with future install-location changes.

```bash
# Try detect.sh first
for candidate in \
  ".claude/skills/ui-forge" \
  ".agents/skills/ui-forge" \
  ".codex/skills/ui-forge" \
  "$HOME/.claude/skills/ui-forge" \
  "$HOME/.agents/skills/ui-forge" \
  "$HOME/.codex/skills/ui-forge"; do
  if [ -x "$candidate/scripts/detect.sh" ]; then
    UI_FORGE_SKILL_DIR="$(sh "$candidate/scripts/detect.sh")" && break
  fi
done
```

**Fallback (UI Forge < 0.1.9 or `detect.sh` missing):** use the **first path that exists** from this list:

1. Environment variable `UI_FORGE_SKILL_DIR` if set
2. `.claude/skills/ui-forge/` (project-scope Claude Code install)
3. `.agents/skills/ui-forge/` (project-scope agents install)
4. `.codex/skills/ui-forge/` (legacy — pre-0.1.9A Codex CLI install)
5. `~/.claude/skills/ui-forge/` (global Claude Code install)
6. `~/.agents/skills/ui-forge/` (global agents install)
7. `~/.codex/skills/ui-forge/` (legacy — pre-0.1.9A global Codex CLI install)

The fallback list is the same one referenced in `protocols/paired-mode-contract.md`.

**If none resolve:** halt Step 4 with a clear error:

```
⚠️ ui-forge skill not found.

Step 4 requires the ui-forge companion skill to generate variant bodies.
StackShift never authors component code directly.

Install ui-forge:
  Claude Code:      npx skills add extragraj/ui-forge -a claude-code
  Universal agents: npx skills add extragraj/ui-forge -a agents

Then re-run Step 4.
```

Do **not** attempt to author component bodies without `ui-forge`. This violates the interface boundary.

---

## Pre-flight — 4d.1 (`--validate-input`)

Before the main invocation, run the input validator:

```bash
node ${UI_FORGE_SKILL_DIR}/scripts/invoke.js \
  --validate-input \
  --signal CONVERT_VARIANT \
  --refs <path-to-types.ts>
```

**On success:** UI Forge prints `ui-forge: input validation passed — interface: <Name> (<path>)`. Log it and continue to the main invocation.

**On failure (exit ≠ 0):** Present stderr verbatim. Halt Step 4. Do not proceed to the main invocation — the contract file itself needs fixing before generation can succeed.

This check confirms the props interface is well-formed and its name can be extracted before spending a full generation on a malformed handoff.

---

## Invocation

Two invocation paths are supported. Choose based on runtime.

**Slash Commands / Agentic CLI (preferred — Claude Code, AntiGravity, or any agentic platform with `.claude/` directory):**

```
/forge --task "Generate body for <VariantName> variant of <SectionName> section. \
               Conform to the props interface in <types-path>. Do not modify index.tsx \
               or the props interface. Write variant body only." \
       --refs <path-to-types.ts>,<path-to-initialValue-dir>,<path-to-variant-thumbnail> \
       --output components/sections/<name>/<Variant>.tsx \
       --mode body-only \
       --signal CONVERT_VARIANT
```

The slash command routes through `$CLAUDE_PLUGIN_ROOT` and is equivalent to the bash form below. Requires UI Forge ≥ 0.1.9.

**Universal agent invocation (all platforms, or UI Forge < 0.1.9):**

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

**Claude Design handoff variant** — when the `claude-design-handoff` protocol is active, the layout source can be a Claude Design URL instead of an HTML/TSX file. `--task` may be omitted (UI Forge derives it from the handoff README heading):

```
/forge --handoff <claude-design-url> \
       --refs <path-to-types.ts> \
       --output components/sections/<name>/<Variant>.tsx \
       --mode body-only \
       --signal CONVERT_VARIANT
```

See `protocols/claude-design-handoff.md` and `references/claude-design-roundtrip.md`.

---

## Ref-Selection Rules

| Ref type | Include? | Why |
|----------|----------|-----|
| `.ts`/`.tsx` file containing the exported props interface | **Required** | Contract that `ui-forge` must conform to |
| `initialValue/` directory contents | **Recommended** | Gives `ui-forge` realistic placeholder copy |
| `images/<variant>.png` thumbnail | **Recommended** | Vision-based layout hints if present — must be passed as `--refs path/to/image.png`; do not rely on AI vision context alone. The `+IMAGE` modifier only fires when an image file appears in `--refs`. |
| Claude Design handoff URL via `--handoff <url>` | **Permitted** when `claude-design-handoff` protocol is active | Layout authority — handoff wins for visual spec; `design-arch.json` wins for tokens. Mutually exclusive with HTML/TSX layout refs. |
| Section schema file | **Never** | StackShift territory — confuses signal detection |
| GROQ query file (`pages/api/query.ts`) | **Never** | StackShift territory — confuses signal detection |
| `index.tsx` | **Never** | StackShift territory — `ui-forge` must not modify wiring |

---

## StackShift-Specific Patterns `ui-forge` Must Honor

Include these in the invocation context if not obvious from `design-arch.json`:

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

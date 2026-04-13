# Bootstrap — First-Run Install Flow

> **Who reads this:** the AI, on first invocation of the StackShift skill in a new project.
> **Trigger:** `.stackshift/installed.json` does not exist in the project root.

The goal of bootstrap is to materialize selected protocols, create project infrastructure (_registry.json, _template/, references/), and drop a marker file recording what was installed.

---

## Step 1 — Detect install state

Check for `.stackshift/installed.json` in the project root.

- **Exists** → skill is already bootstrapped. Skip the rest of this file and return to the workflow.
- **Does not exist** → continue.

---

## Step 2 — Read the protocol registry

Load the protocol manifest from the skill folder:

- `protocols/_registry.json`

Each entry carries a `tier` (`required` / `recommended` / `optional`), a `title`, a `summary`, and either a `file` (single markdown) or a `dir` (directory to copy recursively).

**Do not load the actual protocol content yet.** The registry is intentionally small so this step stays cheap.

**Note:** `seeds/_registry.json` exists in the skill but seeds are not materialized to projects.

---

## Step 3 — Prompt the user for install mode

Present the five modes using the `ask_user_input_v0` tool if available, otherwise in plain conversation. See `bootstrap/modes.md` for the authoritative definitions.

> **Quick-reference summary to show the user:**
>
> | Mode | What it does |
> |---|---|
> | **None** | Install nothing. `/docs/` stays empty. Skill falls back to bundled defaults at lookup time. |
> | **Required** | Install only protocols with `tier: required`. Minimal customizable surface. |
> | **Recommended** *(default)* | Install all `tier: required` + `tier: recommended`. The sensible baseline. |
> | **All** | Install everything in both registries, including `tier: optional`. |
> | **Interactive** | Checkbox list — required items pre-checked, recommended items pre-checked, optional items unchecked. |

Default recommendation: **Recommended**.

---

## Step 4 — Resolve the selection

Based on the chosen mode, build the `selectedProtocols` list:

| Mode | Protocols selected |
|---|---|
| None | `[]` |
| Required | `tier === "required"` |
| Recommended | `tier === "required" OR tier === "recommended"` |
| All | every entry |
| Interactive | user's checked items from prompt |

For **Interactive**, show a protocol selection prompt. Each item renders as `[tier] title — summary`. Required items are pre-checked AND the user is warned (but not blocked) if they uncheck one: "This is a required protocol — unchecking means the workflow will fall back to the skill-bundled copy instead of a project copy you can customize. Continue?".

---

## Step 5 — Materialize protocols and project infrastructure

### A. Materialize Selected Protocols

For each selected protocol:

```
if entry.file is set:
  source:      <skill>/protocols/<entry.file>
  destination: <project>/docs/protocol/<entry.file>
  action:      copy as single file

if entry.dir is set:
  source:      <skill>/protocols/<entry.dir>/
  destination: <project>/docs/protocol/<entry.dir>/
  action:      copy directory recursively
```

**Copy verbatim.** Do not rewrite, summarize, or reformat. The project copies are meant to be customized by the team — preserving the original as the starting point is important.

**Conflict rule:** If a destination already exists (file or directory), do NOT overwrite silently. Ask per-entry: *skip*, *overwrite*, or *write alongside as `<n>.new.md` / `<dir>.new/`*.

### B. Create Project Protocol Registry

Create `<project>/docs/protocol/_registry.json`:

```json
{
  "protocols": [],
  "note": "Add custom project protocols here. They will be discovered alongside skill protocols."
}
```

This empty registry allows teams to add custom protocols that are discovered alongside skill protocols.

### C. Copy Protocol Template

Copy `<skill>/protocols/_template/` → `<project>/docs/protocol/_template/` recursively.

This provides a starting point for creating complex multi-file protocols.

### D. Create References Directory

Create `<project>/docs/references/` directory (empty initially).

Add a README file: `<project>/docs/references/README.md`:

```markdown
# Custom References

Add custom reference lookups here for project-specific protocols.

These augment the skill's standard references without modifying them.

## Example

Create files like:
- `custom-lookups.md` - Custom data tables
- `project-types.md` - Project-specific type definitions
- `field-patterns.md` - Project field patterns
```

### E. Do NOT Materialize Seeds

Seeds follow standard strategies and load from skill when needed.

### F. Directory Structure

After materialization, the project should have:

```
/docs/
├── protocol/
│   ├── _registry.json          # Project protocol registry (empty)
│   ├── _template/              # Complex protocol template
│   └── [materialized protocols] # Selected from bootstrap
│
└── references/                 # Custom reference lookups (empty)
    └── README.md
```

Note: No `/docs/seed/` directory is created.

---

## Step 6 — Bridge `designStandards` for `ui-forge`

After protocols are materialized, bridge the `variant-router` protocol (and any component-rendering protocols) into the `designStandards` field that `ui-forge` reads from `design/design-arch.json`.

### 6a — Build the `designStandards` payload

Scan the materialized protocols for component-rendering relevance. At minimum, include the `variant-router` protocol:

```json
{
  "designStandards": {
    "stackshiftVariantRouter": "./docs/protocol/variant-router.md"
  }
}
```

If additional component-rendering protocols exist in `/docs/protocol/_registry.json` (project) or `protocols/_registry.json` (skill), add them:

```json
{
  "designStandards": {
    "stackshiftVariantRouter": "./docs/protocol/variant-router.md",
    "stackshiftComponentStandard": "./docs/protocol/<any-component-rendering-protocol>.md"
  }
}
```

### 6b — Apply the payload

Check for `design/design-arch.json` at the project root:

- **If it exists:** Read the file, merge the `designStandards` object into it (preserve all existing keys), and write it back.
- **If it does not exist:** Record the intended `designStandards` payload in `.stackshift/installed.json` under a `pendingDesignArchBridge` key. This payload will be applied when `ui-forge`'s `scan.js` creates the file (see Step 6c).

```json
{
  "pendingDesignArchBridge": {
    "designStandards": {
      "stackshiftVariantRouter": "./docs/protocol/variant-router.md"
    }
  }
}
```

### 6c — Detect and integrate `ui-forge`

Resolve the `ui-forge` skill directory using this lookup order (first match wins):

1. Environment variable `UI_FORGE_SKILL_DIR` if set
2. `.claude/skills/ui-forge/` (project-scope Claude Code install)
3. `.agents/skills/ui-forge/` (project-scope agents install)
4. `~/.claude/skills/ui-forge/` (global Claude Code install)
5. `~/.agents/skills/ui-forge/` (global agents install)

**If `ui-forge` is installed and `design/design-arch.json` is absent:**

Prompt the user:

```
? ui-forge is installed but design/design-arch.json is missing.
  Run ui-forge scan now? (Y/n)
```

On confirmation:

1. Execute `node ${UI_FORGE_SKILL_DIR}/scripts/scan.js`
2. Apply the `pendingDesignArchBridge` payload from Step 6b to the newly-created `design/design-arch.json`
3. Remove the `pendingDesignArchBridge` key from `.stackshift/installed.json`

On decline or if `ui-forge` is not installed:

- Record the integration state in `.stackshift/installed.json` (see Step 6d)
- The `pendingDesignArchBridge` payload remains for future application

### 6d — Record `ui-forge` integration state

Add to `.stackshift/installed.json`:

**If `ui-forge` was found and scan completed:**

```json
{
  "uiForgeIntegration": {
    "installed": true,
    "scanCompleted": true,
    "scanTimestamp": "2026-04-14T12:34:56Z",
    "uiForgeVersion": "<read from ui-forge skill.version>",
    "skillDir": "<resolved path>"
  }
}
```

**If `ui-forge` was found but scan was declined:**

```json
{
  "uiForgeIntegration": {
    "installed": true,
    "scanCompleted": false
  }
}
```

**If `ui-forge` was not found:**

```json
{
  "uiForgeIntegration": {
    "installed": false
  }
}
```

This lets later StackShift invocations detect stale scans (e.g. after `ui-forge` is upgraded) and re-run.

### 6e — Version compatibility check

After detecting `ui-forge`, read its `skill.version` file and compare against the declared compatibility range in `references/versions.md`.

**If mismatched:** Emit a non-fatal warning:

```
⚠️ ui-forge version mismatch

  Installed: 0.2.1
  Compatible range: ≥0.1.1, <0.2.0

  See references/versions.md for the compatibility table.
  Step 4 handoff may produce unexpected results.
```

**If compatible or not installed:** No action needed.

---

## Step 7 — Write the install marker

Create `<project>/.stackshift/installed.json`:

```json
{
  "skillVersion": "<read from skill.version>",
  "installedAt": "<ISO timestamp>",
  "mode": "recommended",
  "protocols": [
    { "id": "factory-function-pattern", "tier": "required", "file": "factory-function-pattern.md" },
    { "id": "sub-field-visibility", "tier": "required", "file": "sub-field-visibility.md" },
    { "id": "field-reuse-first", "tier": "recommended", "file": "field-reuse-first.md" }
  ]
}
```

**Note:** Seeds field is not included because seeds are not materialized to projects.

This file is the source of truth for what has been installed. Future invocations read it to:

- Skip bootstrap entirely (it exists → we're done).
- Detect registry additions that could be offered to the user with a non-blocking "new protocols available" notice (optional future feature).

---

## Step 8 — Report and return

Print a summary:

```
Bootstrapped StackShift skill (mode: recommended)
  /docs/protocol/           ← 9 protocols (4 required, 5 recommended)
  /docs/protocol/_registry.json  ← Project protocol registry (empty)
  /docs/protocol/_template/ ← Complex protocol template
  /docs/references/         ← Custom reference lookups (empty)
  .stackshift/installed.json written

ui-forge integration: [detected / not found]
  design/design-arch.json:  [bridged / pending / N/A]

Edit protocols under /docs/protocol/ freely. Your edits take precedence over
the skill's defaults at lookup time.

Add custom protocols to /docs/protocol/_registry.json for discovery.
```

Return to the workflow step the user originally invoked. Do not treat bootstrap as the answer to their actual request.

---

## Idempotency and bootstrap behavior

- Running bootstrap when `.stackshift/installed.json` exists is a no-op.
- Bootstrap only runs once per project.
- New protocols can be added directly to `/docs/protocol/_registry.json` for discovery.
- If project infrastructure files (_registry.json, _template/, references/) are missing, they can be re-created manually by copying from skill or running bootstrap again after deleting the marker file.

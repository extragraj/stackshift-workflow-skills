# Reference — Claude Design Round-Trip

The full workflow for designing StackShift sections in Claude Design (`claude.ai/design`) and generating Step 4 variants from the resulting handoff URL.

Activation: install the `claude-design-handoff` protocol. See `protocols/claude-design-handoff.md` for the activation rules and ref-selection extension.

---

## The six steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. /forge-scan                                                      │
│    Reads tailwind config, components, globals.css.                  │
│    Writes design/design-arch.json with project tokens.              │
├─────────────────────────────────────────────────────────────────────┤
│ 2. /forge-export-design                                             │
│    Reads design-arch.json.                                          │
│    Writes design/claude-design-bundle/ — README.md, tokens.json,    │
│    components.md, conventions.md, globals.css, standards/*.md.      │
├─────────────────────────────────────────────────────────────────────┤
│ 3. Upload bundle to Claude Design                                   │
│    Drag-drop the folder, or paste README.md into the design-system  │
│    onboarding step. Claude Design now uses YOUR tokens.             │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Design the section in Claude Design                              │
│    Iterate on layout, copy, composition. All tokens are real.       │
├─────────────────────────────────────────────────────────────────────┤
│ 5. Export the handoff URL                                           │
│    Claude Design produces a stable URL identifying the design.      │
├─────────────────────────────────────────────────────────────────────┤
│ 6. /forge --handoff <url> --refs <types.ts> --output <variant.tsx>  │
│       --signal CONVERT_VARIANT --mode body-only                     │
│    UI Forge fetches handoff, materializes refs into                 │
│    design/.handoff-cache/, generates variant remapped to project    │
│    tokens. FORGE NOTES gets a CLAUDE_DESIGN sub-block.              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## When to use it

Use the round-trip when:

- Your design team works in Claude Design and you want their output to feed Step 4 directly.
- A section requires multiple iterations of visual exploration before settling on a final layout.
- You want layout authority to live outside the repo (in Claude Design) but tokens to stay in the repo (in `design-arch.json`).

Skip it when:

- Layouts are authored as HTML/TSX/images directly in the repo — the standard Step 4 path is faster.
- The section is a small variant of an existing design that's already in `components/`.
- You only need a single shot at the layout — `/forge --refs <html>` is one fewer step.

---

## Authority split

| Concern | Authority | Why |
|---|---|---|
| Layout, composition, hierarchy | Claude Design handoff | The handoff is the visual spec |
| Color tokens, spacing, typography | `design/design-arch.json` | Project's real tokens, never the handoff's generated classes |
| Tokens absent from `design-arch.json` | Handoff `tokens.json` (fallback) | Only fills genuine gaps |
| Component library swaps | `design/design-arch.json` `componentLib` + `usedComponents` | Project's existing components win over handoff defaults |

UI Forge's `+CLAUDE_DESIGN` modifier enforces this split. The handoff never overrides project tokens, even if Claude Design generated CSS classes that look similar.

---

## Caching

`design/.handoff-cache/<sha256-12-chars>/` contains:

- `manifest.json` — handoff metadata (when content-type is JSON)
- `design.html` — rendered handoff
- `README.md` — `--task` derivation source
- `tokens.json` — handoff-side tokens (used only as fallback)

The cache is keyed by URL hash. Re-running `/forge --handoff <same-url>` reuses the cache. To force a fresh fetch, delete the cache directory.

The cache is added to `.forgeignore` by bootstrap (when the `claude-design-handoff` protocol is selected) and should be added to `.gitignore` if not already covered.

---

## Composition with other modifiers

The `+CLAUDE_DESIGN` modifier composes cleanly with `+A11Y` and `+BRAND`:

```
/forge --handoff <url> --refs ./types.ts,./BRAND.md --a11y --output ./Variant.tsx --signal CONVERT_VARIANT
# → +CLAUDE_DESIGN +A11Y +BRAND active
# → FORGE NOTES contains CLAUDE_DESIGN, A11Y, and BRAND sub-blocks
```

It does **not** compose with `+CREATIVE` or `+DIFF`, which are refused under paired mode for unrelated reasons. See `protocols/paired-mode-contract.md` for the full refusal matrix.

---

## Postcondition checks

After Step 6 completes, verify:

- [ ] `// FORGE NOTES` contains a `CLAUDE_DESIGN` sub-block listing source URL and token remappings.
- [ ] No tokens from the handoff appear inline in the generated TSX (every color/spacing value should resolve to a `design-arch.json` token name).
- [ ] `design/.handoff-cache/<hash>/` exists and contains the materialized refs.
- [ ] `validate-contract.js` exits 0 (standard Step 4 postcondition).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `+CLAUDE_DESIGN` not in detected signals | URL not passed via `--handoff`, ref path not under `.handoff-cache/` | Use `--handoff <url>` explicitly |
| Handoff fetch fails with 401/403 | Handoff URL invalid or capability token missing | Re-export from Claude Design; URL contains the token in path |
| Generated TSX has handoff's color classes inline | `design-arch.json` `colorTokens` empty or stale | Re-run `/forge-scan` then re-invoke |
| `tokens.json` missing in cache | Handoff returned HTML-only (branch B) | Expected — UI Forge falls back to `design-arch.json` tokens |

---

## See also

- `protocols/claude-design-handoff.md` — activation, ref-selection rules
- `protocols/paired-mode-contract.md` — modifier composition, flag refusals
- UI Forge `references/claude-design-handoff-format.md` — URL/manifest shape discovery
- UI Forge `commands/forge.md` — `/forge --handoff` slash command
- UI Forge `commands/forge-export-design.md` — `/forge-export-design` slash command

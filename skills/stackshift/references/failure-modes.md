# Reference — Step 4 Failure Modes

Loaded by Step 4 (`workflow/4-variants.md`) when `ui-forge` fails, returns non-compliant output, or postcondition checks trip. **No failure mode results in silent corruption of StackShift-managed files.**

The `Checker` column identifies whether detection and response are owned by UI Forge's tooling or by StackShift's boundary checks.

---

## Failure Matrix

| Failure | Checker | Detection | Response |
|---|---|---|---|
| Malformed props interface | UI Forge (`--validate-input`) | Pre-flight exit ≠ 0 | Present stderr verbatim. Halt. Fix the contract file before retrying. Do not proceed to main invocation. |
| Contract violation | UI Forge (`validate-contract.js` or auto-verify hook) | Post-gen exit ≠ 0 | Present stderr verbatim. Halt Step 4. Present the full violation list. Do not auto-fix. |
| Missing `design-arch.json` | UI Forge (stderr) | Stderr matches `design-arch.json not found` or file absent at precondition check | Run `node ${UI_FORGE_SKILL_DIR}/scripts/scan.js`, then retry invocation **once**. If it fails again, halt. |
| Missing `FORGE NOTES` header | StackShift | File does not begin with `// FORGE NOTES` | Re-invoke with explicit `--task` addendum: "Output MUST begin with `// FORGE NOTES` block." **Max 1 retry.** If second attempt also fails, present output to user and halt. |
| Missing `// @contract` directive | StackShift | Auto-verify hook stderr note "no @contract directive" (when `auto-verify-hook` protocol active) | Re-invoke with `--task` addendum: "FORGE NOTES MUST include `// @contract <path>` on line 3." Max 1 retry. |
| Claude Design handoff fetch failed | UI Forge (`fetch-handoff.js` stderr) | Non-zero exit from fetch sub-process; stderr shows 401/403/timeout | Present stderr verbatim. Halt. Re-export the handoff URL from Claude Design and retry. Do not retry automatically. |
| Missing `CLAUDE_DESIGN` sub-block | StackShift | `--handoff` used but FORGE NOTES lacks `CLAUDE_DESIGN` block (when `claude-design-handoff` protocol active) | Likely classification miss — confirm `--handoff` reached `invoke.js`. Re-invoke with explicit ref under `design/.handoff-cache/`. Max 1 retry. |
| `index.tsx` modified | StackShift | Bytewise diff shows change | Restore from git (`git checkout -- components/sections/<name>/index.tsx`) if available, otherwise present diff and halt. |
| Unexpected file written | StackShift | Post-run file listing of `components/sections/<name>/` and `design/` (excluding `design/.handoff-cache/` when handoff is active) | Delete the unexpected file, halt, instruct user that signal detection misfired and `ui-forge` was invoked with an incorrect signal. |
| `ui-forge` non-zero exit | UI Forge | Process exit code ≠ 0 | Capture stderr, present to user verbatim, halt Step 4. Do not retry automatically. |

---

## Recovery Rule

After any halt, the user must explicitly confirm before Step 4 re-runs. Do not auto-retry beyond the limits specified above.

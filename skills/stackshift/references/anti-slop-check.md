# Reference — Anti-Slop Fidelity Check

Loaded by Step 4 (`workflow/4-variants.md`) when any `--refs` argument is an HTML or TSX file. The goal is to keep `ui-forge` honest against the visual source instead of approximating from memory.

---

## When to Run

Run this check **before writing the variant body** whenever the invocation's `--refs` contains:
- An HTML mockup
- A TSX reference component
- An image whose layout the variant must reproduce

Skip when refs are limited to the props interface, `initialValue/`, or a Claude Design handoff URL (the handoff has its own fidelity contract).

---

## Checklist

For each point, verify against the reference file and report findings in the FORGE NOTES block before writing TSX:

- [ ] **Padding / margin** — map to exact Tailwind equivalents; do not approximate
- [ ] **Background** — dark (`bg-foreground`) vs. light (`bg-background`); verify which applies
- [ ] **Decorative elements** — patterns, overlays, watermarks — confirm present or absent in reference
- [ ] **Icon container** — size, background colour, border-radius match reference exactly
- [ ] **Button / CTA style** — underline, filled, or outlined; match reference exactly

---

## Reporting

Each finding lands in the variant's `// FORGE NOTES` block (or its body-only equivalent) so reviewers can audit the comparison without re-reading the reference. Example:

```
// FORGE NOTES
// ANTI_SLOP:
//   padding=py-24,px-6 (matches reference)
//   background=bg-foreground (dark, matches)
//   decorative=none (reference has no watermark)
//   icon_container=size-12,bg-primary,rounded-lg
//   cta=outlined (reference uses outline button)
```

If any item cannot be resolved from the reference, mark it `UNKNOWN` and ask the user before guessing.

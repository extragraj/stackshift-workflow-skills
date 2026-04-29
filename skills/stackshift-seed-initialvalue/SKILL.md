---
name: stackshift-seed-initialvalue
description: >
  Seeding strategy for initialValue/index.ts — extracts copy from HTML mockups and
  hardcoded components into realistic Sanity Studio placeholder values. Triggers when
  writing or updating initialValue/ files in a StackShift section. Requires stackshift-core.
tags: [stackshift, seed, initialvalue]
recommended: false
type: seed
tier: optional
requires: stackshift-core
---

# StackShift Seed — initialValue

> **Only one seeding strategy should be active at a time.**
> If you have multiple `stackshift-seed-*` skills installed, run:
> `npx @extragraj/stackshift-skills repair`

This skill is a reference stub. The strategy content lives in:

```
stackshift-core/seeds/initialValue-seeding.md
```

Load that file when working on Step 2 (`initialValue/`) and `.stackshift/installed.json`
confirms `"seed": "initialvalue-seeding"`.

To activate this seed, run `npx @extragraj/stackshift-skills init` and select
**Initial-Value Seeding** from the seeding strategy prompt.

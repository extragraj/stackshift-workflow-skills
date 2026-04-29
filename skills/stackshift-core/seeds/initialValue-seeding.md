# Seed Strategy — Initial-Value (UI-Level Pre-fill)

**Applies to:** Step 2 (Section Schema), `initialValue/` only
**Automation level:** Semi-automated — agent extracts text; editors upload images manually

> **Only one seeding strategy should be active at a time.**
> Check `.stackshift/installed.json` → `seed` field to confirm this is the active strategy.
> Run `npx @extragraj/stackshift-skills repair` to resolve conflicts.

---

## When to use

Load this strategy when:
- Writing or updating `initialValue/index.ts` or per-variant `initialValue/variant_x.ts`
- The user provides an HTML mockup, a hardcoded component, or a hardcoded data object to convert

---

## Scope rule — existing variant conversion

> When the user requests converting a hardcoded HTML component or hardcoded data into an
> **existing variant**, ONLY modify `initialValue/index.ts`.
> Do NOT run the full Section Variant & Field Creation Workflow.
> No schema field changes, no GROQ updates, no TypeScript type changes, no new variant
> registration — unless the variant itself is new.

---

## How to execute

1. **Extract ALL text** from the HTML or hardcoded component: headings, body copy, button
   labels, link text, list items, form labels, etc.
2. **Map each piece** to its corresponding field name in `schema/index.ts`.
3. **Write `initialValue/index.ts`** (or per-variant files) with the extracted values.
4. **Verify** every field in `schema/index.ts` has a corresponding entry.

---

## Handling complex data

### Rich Text (Portable Text)

Convert HTML `<p>` and `<ul>` tags into the strict Portable Text JSON array format:

```typescript
import { defaultBlockContent } from "@webriq-pagebuilder/sanity-plugin-schema-default";

description: defaultBlockContent([
  {
    _type: "block",
    style: "normal",
    children: [{ _type: "span", text: "Extracted paragraph text here." }],
  },
]),
```

### Images and references

The agent CANNOT pre-fill local image assets or document references without a known
`asset._ref` or `_ref`. **Omit image fields entirely** — editors upload manually.

### Arrays

Include 2–3 realistic items so authors see the repeating pattern.

### conditionalLink placeholders

Use `linkType: "linkExternal"` with `linkExternal: "#"` as the safe default.

---

## Text conventions

- Use the extracted content verbatim — do not invent or substitute "Lorem ipsum"
- Button labels: use the exact label from the source HTML/component
- Array items: make each one distinct and realistic, not "Item 1 / Item 2"

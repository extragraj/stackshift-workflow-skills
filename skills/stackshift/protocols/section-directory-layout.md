# Protocol — Section Directory Layout

**Applies to:** Step 2 (Section Schema)
**Tier:** Recommended
**Rule strength:** Quality — authors can still use Studio without this, but placeholders and variant previews make the experience significantly better.

Covers the `initialValue/` and `images/` directories that every section should ship with.

---

## Full directory layout (reference)

```
schemas/custom/sanity-plugin-schema-default/src/schemas/sections/[section_name]/
├── [sectionName].ts        # Main entry — required
├── schema/
│   └── index.ts            # Field definitions — required
├── images/                 # Variant preview thumbnails — RECOMMENDED
│   ├── variant_a.jpg
│   └── variant_b.jpg
└── initialValue/           # Placeholder content — RECOMMENDED
    └── index.ts
```

The **required** parts are `[sectionName].ts` and `schema/index.ts`. Without them, the section doesn't load. The **recommended** parts are `images/` and `initialValue/` — they affect author UX only.

---

## `initialValue/` — placeholder content

For every field defined in `schema/index.ts`, add a corresponding entry in `initialValue/`. Authors see this when they first create a document; empty forms are a poor experience.

> **Do NOT pass `initialValue` into `rootSchema()`.** It is a separate directory, wired by the base package.

### Option A — single file (simple sections)

```
initialValue/
└── index.ts
```

```typescript
// initialValue/index.ts
export const initialValue = {
  variant_a: {
    title: "Your headline here",
    subtitle: "Short supporting copy",
    primaryButton: {
      label: "Get started",
      linkType: "linkExternal",
      linkExternal: "#",
    },
  },
  variant_b: { /* ... */ },
};
```

### Option B — per-variant files (complex sections)

```
initialValue/
├── index.ts            # re-exports variant files
├── variant_a.ts
├── variant_b.ts
└── ...
```

```typescript
// initialValue/index.ts
export { default as variant_a } from "./variant_a";
export { default as variant_b } from "./variant_b";
```

Pick Option B when variant shapes diverge significantly.

### Conventions

- Every variant in `variantsList` has an entry.
- Every field the variant uses has a placeholder value.
- Text placeholders are **specific and contextual** — not "Lorem ipsum". Write copy that conveys the variant's intent.
- Array placeholders include 2–3 items so authors see the repeating pattern.
- `conditionalLink` placeholders use `linkType: "linkExternal"` with `linkExternal: "#"` as a safe default.

---

## `images/` — variant preview thumbnails (static branch of variant-preview)

The variant picker in Sanity Studio renders previews from one of two sources. Pick **one** based on the project's runtime env:

| `NEXT_PUBLIC_RENDER_DYNAMIC_COMPONENTS` | Preferred path | Action |
|---|---|---|
| unset or `"false"` | Static JPG (this protocol) | Create `images/<variant>.jpg` per the rules below. |
| `"true"` | Live React render | Register the variant in `components/data/dynamic.ts` per `dynamic-variants-registry`. The static JPG becomes an optional fallback for env-off environments. |

If you commit to the dynamic path, skipping the screenshot here is fine — the live render replaces it. Doing both is only useful when the same codebase runs under both env settings (e.g. dev with previews on, CI without).

The `cookies` section is excluded from dynamic rendering regardless of the env flag — it always relies on the static JPG.

### Naming

One image per entry in `variantsList`, named to match the variant's `value` exactly.

```
images/
├── variant_a.jpg
├── variant_b.jpg
└── variant_hero_split.jpg
```

| `variantsList` entry | Image filename |
|---|---|
| `{ value: "variant_a" }` | `variant_a.jpg` |
| `{ value: "variant_hero_split" }` | `variant_hero_split.jpg` |

Extensions: `.jpg`, `.jpeg`, `.png`, `.webp`. JPG is preferred for file size.

### Image guidelines

- **Aspect ratio + resolution:** 800×600 (4:3) is the project default. Other ratios work, but stay close in pixel count so the picker grid stays consistent.
- **Content:** show the variant's actual rendered layout — do not use generic stock images.
- **File size:** keep under ~200 KB per image; these are bundled into the Studio build.

### Workflow for creating thumbnails

1. Build the variant component (Step 4d).
2. Screenshot the rendered variant in-browser at the expected viewport.
3. Crop to 800×600 (or as close as the layout allows).
4. Save as `images/[variant_value].jpg`.
5. Verify it appears in Studio's variant picker.

---

## Never copy from the base package

Both `initialValue/` and `images/` must be created fresh for each new section. Copying from `node_modules` is wrong because:
- Base package images reflect the base variants, not your custom ones.
- Base package placeholders often reference fields your variant doesn't use.

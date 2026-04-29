# Modal & Sheet — Checklist

---

## Section A — One-Time Setup

Run once. If all items are checked, setup is complete — load `variant-template.md` for new variants.

- [ ] `@stackshift-ui/sheet` and `@stackshift-ui/dialog` confirmed installed
- [ ] `linkModal` option added to `conditionalLink` `options.list`
- [ ] `linkModal` reference field added to `conditionalLink` `fields` array
- [ ] `linkTarget` `hidden` function updated to return `true` when `linkType === "linkModal"`
- [ ] `preview.select` updated with `modalLink` key
- [ ] `preview.prepare` updated with modal case
- [ ] Custom schemas load before base schemas in schema entry point
- [ ] Modal document schema files created: `modal.ts`, `schema/index.ts`, `initialValue/index.ts`
- [ ] Modal section registered in `schemas/custom/.../sections/index.ts`
- [ ] `studio/deskStructure/modals.ts` created and registered in desk structure index
- [ ] `context/ModalContext.tsx` created (`openModalByRef`, `closeModal`, `activeModalData`)
- [ ] `ModalProvider` wraps root in `pages/_app.tsx`
- [ ] `components/ui/smart-link.tsx` has `isModal` branch calling `openModalByRef`
- [ ] `conditionalLink` GROQ fragment with `modalRef` projection added to `pages/api/query.ts`
- [ ] `ConditionalLink`, `ModalData`, `LabeledRoute` types added to `types.ts`
- [ ] `studio/badges/ModalPreviewBadge.tsx` created and registered in studio config

---

## Section B — Per Variant

Repeat for every new modal variant. All items must pass before the variant is considered done.

- [ ] Overlay type decided: Sheet or Dialog (one, not both)
- [ ] `components/sections/modal/variant_x.tsx` shell created — compiles and renders empty overlay
- [ ] Shell imports from `@stackshift-ui/sheet` or `@stackshift-ui/dialog`
- [ ] Shell uses `useModal()` for `open`/`onOpenChange` — no local `useState`
- [ ] Registered in `VariantRegistry` in `components/sections/modal/index.tsx`
- [ ] Eager or lazy import decided: lazy only if variant has forms, heavy media, or complex state
- [ ] New `ModalProps` fields added to interface in `index.tsx` before UI Forge invocation
- [ ] UI Forge invoked with: overlay type, `@stackshift-ui/sheet`/`@stackshift-ui/dialog` as source, ModalContext shape (`openModalByRef`, `closeModal`, `activeModalData`), and no-external-wrapper constraint
- [ ] UI Forge result uses `closeModal()` for all dismiss/CTA actions
- [ ] UI Forge result uses `activeModalData` for conditional rendering (not local data state)
- [ ] New schema fields added to `modal/schema/index.ts` with `hideIfVariantIn()`
- [ ] Variant added to `variantsList` in `modal.ts`
- [ ] New field defaults added to `modal/initialValue/index.ts`
- [ ] `pages/api/query.ts` `variants { ... }` block updated for new fields
- [ ] Studio: modal document can be created with the new variant selected
- [ ] Studio: preview badge opens the modal overlay
- [ ] Browser: modal opens when a `linkModal` button is clicked
- [ ] Browser: modal closes via the close/dismiss action

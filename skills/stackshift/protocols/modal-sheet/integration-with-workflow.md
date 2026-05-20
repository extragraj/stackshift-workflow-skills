# Integration with the Base Workflow

A new modal variant follows Steps 1–5 of the base workflow. Only the divergences are documented here.

---

## Step 2 — Section Schema

- `modal.ts` uses `rootSchema("modal", ...)` — identical to any section schema entry
- `variantsList` is declared inline in `modal.ts`; export it only if referenced externally
- `schema/index.ts` imports from `../../../common/fields` — field reuse applies normally

---

## Step 4 — Component Variant

**4a — Create the variant file**
File goes in `components/sections/modal/variant_x.tsx`, not `components/sections/<section>/variant_x.tsx`. Load `variant-template.md` for the shell scaffold.

**4b — Register the variant**
Register in the `VariantRegistry` in `components/sections/modal/index.tsx`, not in the global section component list (`components/list.tsx`). Modal variants are internal to the modal router.

**4c — Props interface**
`ModalProps` is the shared interface defined in `components/sections/modal/index.tsx`. Extend it rather than creating a per-variant interface. Extend before invoking UI Forge.

**4d — Implement via UI Forge**
Delegate the visual body to UI Forge with these constraints — all are required:
- Overlay wrapper (`@stackshift-ui/sheet` or `@stackshift-ui/dialog`) is already in the shell; UI Forge must not add another wrapper
- `open`/`onOpenChange` state must use `useModal()` — no local `useState` for visibility
- `ModalProps` are the props contract — variant receives destructured props, not a raw `data` object
- ModalContext shape to pass as named context:
  - `openModalByRef(modalData)` — for nested modal triggers in the body
  - `closeModal()` — for all close/dismiss buttons and CTA actions
  - `activeModalData` — for conditional rendering on resolved GROQ data

---

## Step 5 — GROQ Query

The `conditionalLink` GROQ fragment lives in `pages/api/query.ts`. Do not inline `modalRef` projections in section-level queries — compose from the canonical fragment. Add new variant fields inside the `variants { ... }` block of that fragment only.

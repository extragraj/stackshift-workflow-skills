<!-- Replace variant_x / VariantX with the actual variant slug and component name throughout -->

# Modal Variant Template

Use this template when the modal system is already set up (`context/ModalContext.tsx` exists) and a new variant is needed. If setup has not been run, load `setup.md` first.

---

## Step 1 — Create the Variant File Shell

Create `components/sections/modal/variant_x.tsx`.

Choose the overlay type based on the design brief — Sheet or Dialog, not both in one variant.

**Option A — Sheet (slides in from a side)**

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@stackshift-ui/sheet";
import { useModal } from "@/context/ModalContext";
import type { ModalProps } from ".";

export default function VariantX({ title }: ModalProps) {
  const { closeModal, activeModalData } = useModal();

  return (
    <Sheet open={!!activeModalData} onOpenChange={() => closeModal()}>
      <SheetContent side="bottom" className="overflow-y-auto max-h-[90vh]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {/* UI Forge fills this body */}
      </SheetContent>
    </Sheet>
  );
}
```

**Option B — Dialog (centered overlay)**

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@stackshift-ui/dialog";
import { useModal } from "@/context/ModalContext";
import type { ModalProps } from ".";

export default function VariantX({ title }: ModalProps) {
  const { closeModal, activeModalData } = useModal();

  return (
    <Dialog open={!!activeModalData} onOpenChange={() => closeModal()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* UI Forge fills this body */}
      </DialogContent>
    </Dialog>
  );
}
```

The shell must compile and render an empty overlay. Verify it does before proceeding.

---

## Step 2 — Extend ModalProps (if needed)

Open `components/sections/modal/index.tsx`. If the new variant needs fields not already in `ModalProps`, add them now — before invoking UI Forge.

```typescript
export interface ModalProps {
  // existing fields...
  subtitle?: string;
  title?: string;
  // add new fields here:
  newField?: string;
}
```

---

## Step 3 — Register in VariantRegistry

In `components/sections/modal/index.tsx`, add an entry for the new variant.

**Eager — for lightweight variants:**

```typescript
import VariantX from "./variant_x";

const VariantRegistry: Record<string, React.ComponentType<ModalProps>> = {
  // existing entries...
  variant_x: VariantX,
};
```

**Lazy — for variants with forms, heavy media, or complex state:**

```typescript
const VariantRegistry: Record<string, React.ComponentType<ModalProps>> = {
  // existing entries...
  variant_x: dynamic(() => import("./variant_x"), {
    loading: () => <LoadingSkeleton />,
  }),
};
```

---

## Step 4 — Delegate to UI Forge

Hand off the variant body to UI Forge. Pass these constraints explicitly:

```
Overlay type:      Sheet (side="bottom" or side="right") — already in shell, do not re-wrap
                   OR Dialog (centered) — already in shell, do not re-wrap
Import source:     @stackshift-ui/sheet or @stackshift-ui/dialog — never shadcn
Props contract:    ModalProps (destructured props, not a raw data object)
No local state:    open/close/data must come exclusively from useModal()

ModalContext shape (pass as named context):
  openModalByRef(modalData: ModalData)  — open another modal from within the body
  closeModal()                           — close this modal (all CTAs, dismiss actions)
  activeModalData: ModalData | null      — resolved GROQ data for the active modal
```

UI Forge must use `closeModal()` for every close/dismiss action and `activeModalData` for conditional rendering. No local `useState` for visibility.

---

## Step 5 — Schema Field Additions

For each new field added to `ModalProps`, add a matching schema field:

**`schemas/custom/sanity-plugin-schema-default/src/schemas/sections/modal/schema/index.ts`**

```typescript
{ name: "newField", title: "New Field", type: "string", hidden: hideIfVariantIn(["variant_a", "variant_b"]) },
```

Also add the variant to `variantsList` in `modal.ts`:

```typescript
{ title: "Variant X", value: "variant_x", description: "Brief description" },
```

---

## Step 6 — initialValue Additions

**`schemas/custom/sanity-plugin-schema-default/src/schemas/sections/modal/initialValue/index.ts`**

Add defaults for any new fields:

```typescript
export default {
  // existing...
  newField: "Default value",
};
```

---

## Step 7 — GROQ Projection

If the new variant uses fields not already projected inside `variants { ... }` in `pages/api/query.ts`, add them:

```typescript
export const conditionalLink = `
  ...
  linkModal != null => {
    "modalRef": linkModal->{
      _id,
      _type,
      variant,
      label,
      variants {
        ...,
        newField,  // ← add new fields here only
      }
    }
  }
`;
```

---

When all steps are complete, run through Section B of `checklist.md`.

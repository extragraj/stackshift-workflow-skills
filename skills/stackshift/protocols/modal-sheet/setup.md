# Modal & Sheet — One-Time Setup

> **Run:** Once per project. If `context/ModalContext.tsx` already exists and a `modal` document schema is present, this setup is complete — load `variant-template.md` instead.

**Prerequisites:** Confirm these packages are installed before proceeding:

```bash
pnpm add @stackshift-ui/sheet @stackshift-ui/dialog
```

---

## Setup 1 — conditionalLink Schema

**File:** `schemas/custom/sanity-plugin-schema-default/src/schemas/elements/conditionalLink.ts`

Add the `linkModal` option to the existing `linkType` options list:

```typescript
// In options.list array, add:
{
  title: "Modal, opens a modal overlay",
  value: "linkModal",
}
```

Add the `linkModal` reference field to the `fields` array:

```typescript
defineField({
  title: "Modal Reference",
  name: "linkModal",
  type: "reference",
  to: [{ type: "modal" }],
  hidden: ({ parent }) => parent?.linkType !== "linkModal",
}),
```

Update the `linkTarget` field's `hidden` function — add the first line:

```typescript
hidden: ({ parent }) => {
  if (parent?.linkType === "linkModal") return true;  // ← add this line
  if (parent?.linkType === "linkInternal" && !parent?.linkInternal?._ref) return true;
  if (parent?.linkType === "linkExternal" && !parent?.linkExternal) return true;
  if (!parent?.linkType) return true;
  return false;
}
```

Update `preview.select` — add the `modalLink` key:

```typescript
select: {
  label: "label",
  type: "linkType",
  internalLink: "linkInternal",
  externalLink: "linkExternal",
  modalLink: "linkModal",  // ← add this line
}
```

Update `preview.prepare` — add the modal case to the ternary chain:

```typescript
: type === "linkModal"
  ? modalLink ? "Opens: Modal" : "Modal Not Set"
```

---

## Setup 2 — Schema Load Order

**File:** `schemas/custom/index.ts`

The custom `conditionalLink` must import before any base package schemas. Verify:

```typescript
import { default as customSchemaElements } from "./sanity-plugin-schema-default/src/schemas/elements";

const schemas = {
  ...customSchemaElements,  // ← must spread first
};
```

**File:** `studio/schemaTypes/index.ts` (or equivalent schema entry point)

```typescript
import customSchemas from "@/schemas/custom";

export const schemaTypes = [
  ...customSchemas,  // ← custom schemas loaded FIRST — overrides base conditionalLink
  // ... base schemas follow
];
```

---

## Setup 3 — Modal Document Schema

Create three files:

**`schemas/custom/sanity-plugin-schema-default/src/schemas/sections/modal/modal.ts`**

```typescript
import { rootSchema } from "@webriq-pagebuilder/sanity-plugin-schema-default";
import { MdOutlineWebAsset } from "react-icons/md";
import { modalSchema } from "./schema";
import initialValue from "./initialValue";

export const variantsList = [
  { title: "Variant A", value: "variant_a", description: "Inquiry form modal" },
  { title: "Variant B", value: "variant_b", description: "Contact info modal" },
  { title: "Variant C", value: "variant_c", description: "Contact info modal" },
];

export default rootSchema("modal", "Modal", MdOutlineWebAsset, variantsList, modalSchema, initialValue);
```

> Add to `variantsList` as new modal variants are registered.

**`schemas/custom/sanity-plugin-schema-default/src/schemas/sections/modal/schema/index.ts`**

```typescript
import { title, customWebriqForms } from "../../../common/fields";
import { hideIfVariantIn } from "@webriq-pagebuilder/sanity-plugin-schema-default";

export const modalSchema = [
  title(hideIfVariantIn(["variant_a", "variant_b", "variant_c"])),
  customWebriqForms(hideIfVariantIn(["variant_b"])),
  // Add per-variant fields here using hideIfVariantIn()
];
```

**`schemas/custom/sanity-plugin-schema-default/src/schemas/sections/modal/initialValue/index.ts`**

```typescript
import { defaultButton, defaultImage } from "@webriq-pagebuilder/sanity-plugin-schema-default";

export default {
  title: "Get in Touch",
  subtitle: "We'd Love to Hear from You",
  mainImage: defaultImage("image-1d0655534230a5cb4e08d8b7bd14b271c5317d82-634x951-jpg"),
  primaryButton: defaultButton("Send Message"),
};
```

Register the modal section in the section index:

**`schemas/custom/sanity-plugin-schema-default/src/schemas/sections/index.ts`**

```typescript
import modal from "./modal/modal";

export default {
  modal,
  // ... other sections
};
```

---

## Setup 4 — Desk Structure

**`studio/deskStructure/modals.ts`** (create new file)

```typescript
import { StructureBuilder } from "sanity/desk";
import { MdOutlineWebAsset } from "react-icons/md";
import { EditIcon } from "@sanity/icons";

export const Modal = (S: StructureBuilder) => {
  return S.listItem()
    .title("Modals")
    .icon(MdOutlineWebAsset)
    .schemaType("modal")
    .child(
      S.documentTypeList("modal")
        .title("Modals")
        .child((documentId) =>
          S.document()
            .documentId(documentId)
            .schemaType("modal")
            .views([S.view.form().icon(EditIcon)]),
        ),
    );
};
```

**`studio/deskStructure/index.ts`** — add to the structure items:

```typescript
import { Modal } from "./modals";

// Inside S.list().items([...]):
Modal(S),
```

---

## Setup 5 — ModalContext

**`context/ModalContext.tsx`** (create new file)

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { ModalData } from "@/types";
import ModalVariants from "@/components/sections/modal";

interface ModalContextValue {
  openModalByRef: (modalData: ModalData) => void;
  closeModal: () => void;
  activeModalData: ModalData | null;
}

const ModalContext = createContext<ModalContextValue>({
  openModalByRef: () => {},
  closeModal: () => {},
  activeModalData: null,
});

export function useModal() {
  return useContext(ModalContext);
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [activeModalData, setActiveModalData] = useState<ModalData | null>(null);

  const openModalByRef = useCallback((modalData: ModalData) => {
    setActiveModalData(modalData);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModalData(null);
  }, []);

  return (
    <ModalContext.Provider value={{ openModalByRef, closeModal, activeModalData }}>
      {children}
      {activeModalData && <ModalVariants data={activeModalData} />}
    </ModalContext.Provider>
  );
}
```

**`pages/_app.tsx`** — wrap the root component with `ModalProvider`:

```typescript
import { ModalProvider } from "@/context/ModalContext";

// Wrap your root:
<ModalProvider>
  <Component {...pageProps} />
</ModalProvider>
```

> **Important:** `ModalProvider` must also wrap the Sanity Studio embed if `ModalPreviewBadge` (Setup 9) is used — the badge calls `useModal()` across the Studio boundary and requires the same context instance.

---

## Setup 6 — SmartLink

**`components/ui/smart-link.tsx`** — check if this file exists:
- **If it exists** — add the `isModal` branch to the existing component
- **If it does not exist** — create the full file below

```typescript
import { Button } from "@stackshift-ui/button";
import { useModal } from "@/context/ModalContext";
import type { LabeledRoute, LabeledRouteWithKey } from "types";
import type { ReactNode } from "react";

interface SmartLinkProps {
  link: LabeledRoute | LabeledRouteWithKey;
  children?: ReactNode;
  variant?: "default" | "link" | "secondary" | "destructive" | "outline" | "ghost" | "unstyled" | null;
  className?: string;
  "aria-label"?: string;
  ariaLabel?: string;
}

export function SmartLink({
  link,
  children,
  variant,
  className,
  ...rest
}: SmartLinkProps) {
  const { openModalByRef } = useModal();

  const isModal = (link?.type === "linkModal" || link?.linkType === "linkModal") && link?.modalRef;

  if (isModal) {
    return (
      <button
        type="button"
        className={className}
        aria-label={rest["aria-label"] || rest.ariaLabel || link?.label || "Open modal"}
        onClick={() => openModalByRef(link.modalRef!)}
      >
        {children}
      </button>
    );
  }

  return (
    <Button
      as="link"
      link={link}
      variant={variant}
      className={className}
      aria-label={rest["aria-label"] || rest.ariaLabel || link?.label || undefined}
    >
      {children}
    </Button>
  );
}
```

> If SmartLink is owned and maintained by UI Forge in this project, confirm with UI Forge before editing.

---

## Setup 7 — GROQ Fragment

**File:** `pages/api/query.ts` — add the `conditionalLink` fragment. Create the file if it does not exist.

```typescript
export const conditionalLink = `
  "type": linkType,
  "internalLink": linkInternal->slug.current,
  "externalLink": linkExternal,
  linkModal != null => {
    "modalRef": linkModal->{
      _id,
      _type,
      variant,
      label,
      variants {
        ...,
      }
    }
  }
`;
```

Use this fragment wherever a section query includes buttons, menus, or any `conditionalLink` field:

```typescript
import { conditionalLink } from "@/pages/api/query";

// Example: inside a button projection
const buttonQuery = `{ ${conditionalLink} }`;
```

Do not inline `modalRef` projections in individual section queries — always compose from this fragment.

---

## Setup 8 — TypeScript Types

**File:** `types.ts` — add these interfaces:

```typescript
export interface ConditionalLink {
  type?: string;
  internalLink?: string | null;
  externalLink?: string | null;
  modalRef?: ModalData | null;
}

export interface ModalData {
  _id: string;
  _type: string;
  variant: string;
  label?: string;
  variants?: {
    title?: string;
    subtitle?: string;
    description?: string;
    mainImage?: { image?: string; alt?: string };
    primaryButton?: any;
    form?: any;
    brochureForm?: any;
    contactEmail?: string;
    routes?: any[];
    copyright?: string;
  };
}

export interface LabeledRoute extends ConditionalLink {
  label?: string;
  linkTarget?: string;
}
```

---

## Setup 9 — Preview Badge

**`studio/badges/ModalPreviewBadge.tsx`** (create new file)

```typescript
import React from "react";
import { DocumentBadgeDescription, DocumentBadgeProps } from "sanity";
import { useModal } from "@/context/ModalContext";
import type { ModalData } from "@/types";

export function ModalPreviewBadge(
  props: DocumentBadgeProps
): DocumentBadgeDescription | null {
  const { type, draft, published } = props;

  if (type !== "modal") return null;

  const isPublished = !!published && !draft;
  const modalData = (published ?? draft) as ModalData;

  return {
    label: <PreviewButton isPublished={isPublished} modalData={modalData} />,
    title: isPublished ? "Preview modal overlay" : "Publish modal first to preview",
    color: isPublished ? "success" : "warning",
  };
}

function PreviewButton({
  isPublished,
  modalData,
}: {
  isPublished: boolean;
  modalData: ModalData;
}) {
  const { openModalByRef } = useModal();

  return (
    <button
      onClick={() => isPublished && openModalByRef(modalData)}
      disabled={!isPublished}
      style={{
        padding: "2px 10px",
        color: isPublished ? "#31975e" : "#958228",
        cursor: isPublished ? "pointer" : "default",
        borderRadius: "4px",
        border: "none",
        fontWeight: 600,
        fontSize: "1.5em",
      }}
    >
      Preview: ({modalData?.label ?? "Modal"})
    </button>
  );
}
```

Register in studio config (`studio/config.ts`):

```typescript
import { ModalPreviewBadge } from "@/studio/badges/ModalPreviewBadge";

export const config = {
  document: {
    badges: [ModalPreviewBadge],
  },
};
```

---

## Verify Setup Complete

Run through Section A of `checklist.md` before creating any modal variants. When all items are checked, load `variant-template.md` for the first variant.

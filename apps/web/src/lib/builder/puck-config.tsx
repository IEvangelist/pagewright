"use client";

import type { ComponentProps, ReactNode } from "react";
import type { Config, CustomField } from "@measured/puck";
import { Cta, Features, Footer, Gallery, Hero, Navbar, Prose } from "@pagewright/blocks";
import { ImageField } from "@/components/image-field";

/**
 * Puck editor configuration for Pagewright blocks. Each component's `render` delegates to the shared
 * `@pagewright/blocks` React component — the very same component the generated Astro site renders —
 * so the editor preview is pixel-identical to production. The block components read only their named
 * props and ignore Puck's injected `id`/`puck`/`editMode`, so spreading the raw props is safe.
 *
 * The config is deliberately typed as the loose `Config`; Puck's deep field generics fight explicit
 * per-component prop types and add no safety here (the repo page is validated by Zod on save).
 */

const linkField = (label: string) =>
  ({
    type: "object",
    label,
    objectFields: {
      label: { type: "text", label: "Label" },
      href: { type: "text", label: "URL" },
    },
  }) as const;

/**
 * A drag-and-drop image field. Renders the {@link ImageField} custom control which uploads dropped
 * files to the site repo's media folder (via the editor's MediaUploadProvider) and stores the
 * resulting site-relative URL as a plain string, so the saved page stays a simple JSON string prop.
 */
const imageField = (label: string): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange }) => (
    <ImageField value={value ?? ""} onChange={onChange} label={label} />
  ),
});

const linkArrayField = (label: string) =>
  ({
    type: "array",
    label,
    getItemSummary: (item: { label?: string }) => item?.label || "Link",
    defaultItemProps: { label: "New link", href: "#" },
    arrayFields: {
      label: { type: "text", label: "Label" },
      href: { type: "text", label: "URL" },
    },
  }) as const;

export const puckConfig: Config = {
  root: {
    fields: {
      title: { type: "text", label: "Page title" },
      description: { type: "textarea", label: "Page description" },
    },
    // Wrap the whole preview in `.pw-root` — the same wrapper the generated Astro site uses — so the
    // canvas gets the themed background + text colour and the WYSIWYG preview matches production in
    // both light and dark mode (without it, blocks render transparent on Puck's light canvas).
    render: ({ children }: { children?: ReactNode }) => (
      <div className="pw-root pw-editor-canvas-root">{children}</div>
    ),
  },
  components: {
    Navbar: {
      fields: {
        brand: { type: "text", label: "Brand" },
        logo: imageField("Logo (optional)"),
        links: linkArrayField("Nav links"),
        cta: linkField("Call-to-action button"),
      },
      defaultProps: {
        brand: "My site",
        links: [{ label: "Home", href: "/" }],
        cta: { label: "Get started", href: "#" },
      },
      render: (props) => <Navbar {...(props as unknown as ComponentProps<typeof Navbar>)} />,
    },
    Hero: {
      fields: {
        eyebrow: { type: "text", label: "Eyebrow (optional)" },
        heading: { type: "text", label: "Heading" },
        subheading: { type: "textarea", label: "Subheading" },
        primaryCta: linkField("Primary button"),
        secondaryCta: linkField("Secondary button"),
        image: imageField("Image (optional)"),
        align: {
          type: "radio",
          label: "Alignment",
          options: [
            { label: "Center", value: "center" },
            { label: "Left", value: "left" },
          ],
        },
      },
      defaultProps: {
        heading: "A headline that sells your idea",
        subheading: "Say a little more about what you offer and why it matters.",
        primaryCta: { label: "Get started", href: "#" },
        align: "center",
      },
      render: (props) => <Hero {...(props as unknown as ComponentProps<typeof Hero>)} />,
    },
    Features: {
      fields: {
        heading: { type: "text", label: "Heading (optional)" },
        subheading: { type: "textarea", label: "Subheading (optional)" },
        columns: {
          type: "select",
          label: "Columns",
          options: [
            { label: "2 columns", value: 2 },
            { label: "3 columns", value: 3 },
            { label: "4 columns", value: 4 },
          ],
        },
        items: {
          type: "array",
          label: "Features",
          getItemSummary: (item: { title?: string }) => item?.title || "Feature",
          defaultItemProps: { icon: "rocket", title: "New feature", body: "Describe it here." },
          arrayFields: {
            icon: { type: "text", label: "Icon name" },
            title: { type: "text", label: "Title" },
            body: { type: "textarea", label: "Body" },
          },
        },
      },
      defaultProps: { columns: 3, items: [] },
      render: (props) => <Features {...(props as unknown as ComponentProps<typeof Features>)} />,
    },
    Gallery: {
      fields: {
        heading: { type: "text", label: "Heading (optional)" },
        subheading: { type: "textarea", label: "Subheading (optional)" },
        columns: {
          type: "select",
          label: "Columns",
          options: [
            { label: "2 columns", value: 2 },
            { label: "3 columns", value: 3 },
          ],
        },
        items: {
          type: "array",
          label: "Items",
          getItemSummary: (item: { title?: string }) => item?.title || "Item",
          defaultItemProps: { title: "New item", description: "", image: "", href: "" },
          arrayFields: {
            title: { type: "text", label: "Title" },
            description: { type: "textarea", label: "Description" },
            image: imageField("Image"),
            href: { type: "text", label: "Link URL" },
          },
        },
      },
      defaultProps: { columns: 3, items: [] },
      render: (props) => <Gallery {...(props as unknown as ComponentProps<typeof Gallery>)} />,
    },
    "Call to action": {
      fields: {
        heading: { type: "text", label: "Heading" },
        body: { type: "textarea", label: "Body (optional)" },
        primaryCta: linkField("Primary button"),
        secondaryCta: linkField("Secondary button"),
      },
      defaultProps: {
        heading: "Ready to get started?",
        primaryCta: { label: "Get started", href: "#" },
      },
      render: (props) => <Cta {...(props as unknown as ComponentProps<typeof Cta>)} />,
    },
    Prose: {
      fields: {
        html: { type: "textarea", label: "Content (HTML)" },
      },
      defaultProps: { html: "<p>Write something here.</p>" },
      render: (props) => <Prose {...(props as unknown as ComponentProps<typeof Prose>)} />,
    },
    Footer: {
      fields: {
        brand: { type: "text", label: "Brand (optional)" },
        tagline: { type: "text", label: "Tagline (optional)" },
        links: linkArrayField("Footer links"),
        copyright: { type: "text", label: "Copyright (optional)" },
      },
      defaultProps: { links: [] },
      render: (props) => <Footer {...(props as unknown as ComponentProps<typeof Footer>)} />,
    },
  },
};

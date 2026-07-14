"use client";

import type { ComponentProps, ReactNode } from "react";
import type { Config, CustomField } from "@measured/puck";
import {
  blockIconNames,
  Cta,
  Features,
  Footer,
  Gallery,
  GitHubDiscussions,
  Hero,
  Navbar,
  Prose,
} from "@pagewright/blocks";
import { ImageField } from "@/components/image-field";
import { resolveMediaPreviewUrl } from "@/lib/builder/media-context";

/**
 * Puck editor configuration for Pagewright blocks. Each component's `render` delegates to the shared
 * `@pagewright/blocks` React component, the same component the generated Astro site renders,
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
      label: { type: "text", label: "Button text" },
      href: { type: "text", label: "Link" },
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
      href: { type: "text", label: "Link" },
    },
  }) as const;

interface EditorMetadata {
  mediaPreviewEndpoint?: string;
}

type EditorRenderProps<Props> = Props & {
  puck?: { metadata?: EditorMetadata };
};

function previewMediaUrl(value: string | undefined, metadata?: EditorMetadata): string | undefined {
  return resolveMediaPreviewUrl(value, metadata?.mediaPreviewEndpoint);
}

const iconOptions = [
  { label: "No icon", value: "" },
  ...blockIconNames.map((name) => ({
    label: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
    value: name,
  })),
];

export const puckConfig: Config = {
  root: {
    fields: {
      title: { type: "text", label: "Page title", placeholder: "Name this page" },
      description: {
        type: "textarea",
        label: "Page description",
        placeholder: "A short summary for search and sharing",
      },
    },
    // Wrap the preview in the same themed root used by the generated Astro site so colors stay exact.
    // canvas gets the themed background + text colour and the WYSIWYG preview matches production in
    // both light and dark mode (without it, blocks render transparent on Puck's light canvas).
    render: ({ children }: { children?: ReactNode }) => (
      <div className="pw-root pw-editor-canvas-root">{children}</div>
    ),
  },
  components: {
    Navbar: {
      label: "Navigation",
      fields: {
        brand: { type: "text", label: "Brand" },
        logo: imageField("Logo (optional)"),
        links: linkArrayField("Nav links"),
        cta: linkField("Navigation button"),
      },
      defaultProps: {
        brand: "My site",
        links: [{ label: "Home", href: "/" }],
        cta: { label: "Get started", href: "#" },
      },
      render: (rawProps) => {
        const { puck, ...props } = rawProps as unknown as EditorRenderProps<
          ComponentProps<typeof Navbar>
        >;
        return <Navbar {...props} logo={previewMediaUrl(props.logo, puck?.metadata)} />;
      },
    },
    Hero: {
      fields: {
        eyebrow: { type: "text", label: "Small label (optional)" },
        heading: { type: "text", label: "Heading" },
        subheading: { type: "textarea", label: "Supporting text" },
        primaryCta: linkField("Primary action"),
        secondaryCta: linkField("Secondary action"),
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
      render: (rawProps) => {
        const { puck, ...props } = rawProps as unknown as EditorRenderProps<
          ComponentProps<typeof Hero>
        >;
        return <Hero {...props} image={previewMediaUrl(props.image, puck?.metadata)} />;
      },
    },
    Features: {
      fields: {
        heading: { type: "text", label: "Heading (optional)" },
        subheading: { type: "textarea", label: "Supporting text (optional)" },
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
            icon: { type: "select", label: "Icon", options: iconOptions },
            title: { type: "text", label: "Title" },
            body: { type: "textarea", label: "Description" },
          },
        },
      },
      defaultProps: { columns: 3, items: [] },
      render: (props) => <Features {...(props as unknown as ComponentProps<typeof Features>)} />,
    },
    Gallery: {
      fields: {
        heading: { type: "text", label: "Heading (optional)" },
        subheading: { type: "textarea", label: "Supporting text (optional)" },
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
          label: "Gallery items",
          getItemSummary: (item: { title?: string }) => item?.title || "Item",
          defaultItemProps: {
            title: "New item",
            description: "",
            image: "",
            href: "",
            tags: [],
          },
          arrayFields: {
            title: { type: "text", label: "Title" },
            description: { type: "textarea", label: "Description" },
            image: imageField("Image"),
            href: { type: "text", label: "Link URL" },
          },
        },
      },
      defaultProps: { columns: 3, items: [] },
      render: (rawProps) => {
        const { puck, ...props } = rawProps as unknown as EditorRenderProps<
          ComponentProps<typeof Gallery>
        >;
        return (
          <Gallery
            {...props}
            items={props.items.map((item) => ({
              ...item,
              image:
                resolveMediaPreviewUrl(item.image, puck?.metadata?.mediaPreviewEndpoint) ?? "",
            }))}
          />
        );
      },
    },
    "Call to action": {
      fields: {
        heading: { type: "text", label: "Heading" },
        body: { type: "textarea", label: "Supporting text (optional)" },
        primaryCta: linkField("Primary action"),
        secondaryCta: linkField("Secondary action"),
      },
      defaultProps: {
        heading: "Ready to get started?",
        primaryCta: { label: "Get started", href: "#" },
      },
      render: (props) => <Cta {...(props as unknown as ComponentProps<typeof Cta>)} />,
    },
    Prose: {
      label: "Rich text",
      fields: {
        html: { type: "textarea", label: "Content" },
      },
      defaultProps: { html: "<p>Write something here.</p>" },
      render: (props) => <Prose {...(props as unknown as ComponentProps<typeof Prose>)} />,
    },
    "GitHub Discussions": {
      fields: {
        repo: { type: "text", label: "Repository (owner/name)" },
        repoId: { type: "text", label: "Repository ID" },
        category: { type: "text", label: "Category" },
        categoryId: { type: "text", label: "Category ID" },
        mapping: {
          type: "select",
          label: "Mapping",
          options: [
            { label: "Pathname", value: "pathname" },
            { label: "URL", value: "url" },
            { label: "Title", value: "title" },
            { label: "Specific term", value: "specific" },
          ],
        },
        term: { type: "text", label: "Specific term (when selected)" },
        strict: {
          type: "radio",
          label: "Strict matching",
          options: [
            { label: "On", value: true },
            { label: "Off", value: false },
          ],
        },
        reactionsEnabled: {
          type: "radio",
          label: "Reactions",
          options: [
            { label: "On", value: true },
            { label: "Off", value: false },
          ],
        },
        inputPosition: {
          type: "radio",
          label: "Comment box",
          options: [
            { label: "Top", value: "top" },
            { label: "Bottom", value: "bottom" },
          ],
        },
        theme: {
          type: "select",
          label: "Theme",
          options: [
            { label: "Match system", value: "preferred_color_scheme" },
            { label: "Light", value: "light" },
            { label: "Dark", value: "dark" },
          ],
        },
        lang: { type: "text", label: "Language code" },
      },
      defaultProps: {
        repo: "",
        repoId: "",
        category: "",
        categoryId: "",
        mapping: "pathname",
        strict: true,
        reactionsEnabled: true,
        inputPosition: "top",
        theme: "preferred_color_scheme",
        lang: "en",
      },
      render: (props) => (
        <GitHubDiscussions
          {...(props as unknown as ComponentProps<typeof GitHubDiscussions>)}
        />
      ),
    },
    Footer: {
      fields: {
        brand: { type: "text", label: "Brand (optional)" },
        tagline: { type: "text", label: "Supporting text (optional)" },
        links: linkArrayField("Footer links"),
        copyright: { type: "text", label: "Copyright (optional)" },
      },
      defaultProps: { links: [] },
      render: (props) => <Footer {...(props as unknown as ComponentProps<typeof Footer>)} />,
    },
  },
};

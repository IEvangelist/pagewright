"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Config, CustomField } from "@measured/puck";
import {
  Cta,
  Features,
  Footer,
  Gallery,
  GitHubDiscussions,
  Hero,
  Navbar,
  Prose,
  resolveBindings,
  resolveHtmlBindingString,
} from "@pagewright/blocks";
import { BindingField } from "@/components/binding-field";
import { ImageField } from "@/components/image-field";
import { IconPicker } from "@/components/icon-picker";
import { resolveMediaPreviewUrl } from "@/lib/builder/media-context";
import { LEGACY_BLOCK_ICON_NAMES } from "@/lib/site-runtime";
import { useSiteBindings } from "./site-bindings-context";

/**
 * Puck editor configuration for Pagewright blocks. Each component's `render` delegates to the shared
 * `@pagewright/blocks` React component, the same component the generated Astro site renders,
 * so the editor preview is pixel-identical to production. The block components read only their named
 * props and ignore Puck's injected `id`/`puck`/`editMode`, so spreading the raw props is safe.
 *
 * The config is deliberately typed as the loose `Config`; Puck's deep field generics fight explicit
 * per-component prop types and add no safety here (the repo page is validated by Zod on save).
 */

type PreviewComponent = ComponentType<Record<string, unknown>>;

function BoundPreview({
  component: Component,
  props,
  html = false,
}: {
  component: PreviewComponent;
  props: Record<string, unknown>;
  html?: boolean;
}) {
  const { site, bindings, supportsGlobalFeatures } = useSiteBindings();
  const resolvedProps = supportsGlobalFeatures
    ? resolveBindings(props, bindings)
    : stripUnsupportedIcons(props);
  if (supportsGlobalFeatures && html && typeof props.html === "string") {
    resolvedProps.html = resolveHtmlBindingString(props.html, bindings);
  }
  return <Component {...resolvedProps} site={supportsGlobalFeatures ? site : undefined} />;
}

const legacyBlockIcons = new Set<string>(LEGACY_BLOCK_ICON_NAMES);

function stripUnsupportedIcons(props: Record<string, unknown>): Record<string, unknown> {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(record).map(([key, item]) => [key, visit(item)]));
    if (typeof record.label === "string" && typeof record.href === "string") {
      delete next.icon;
    }
    if (
      typeof record.title === "string" &&
      typeof record.body === "string" &&
      typeof record.icon === "string" &&
      !legacyBlockIcons.has(record.icon)
    ) {
      delete next.icon;
    }
    return next;
  }

  return visit(props) as Record<string, unknown>;
}

const previewComponents = {
  Navbar: Navbar as unknown as PreviewComponent,
  Hero: Hero as unknown as PreviewComponent,
  Features: Features as unknown as PreviewComponent,
  Gallery: Gallery as unknown as PreviewComponent,
  Cta: Cta as unknown as PreviewComponent,
  Prose: Prose as unknown as PreviewComponent,
  Footer: Footer as unknown as PreviewComponent,
};

const bindingField = (
  label: string,
  { multiline = false, placeholder }: { multiline?: boolean; placeholder?: string } = {},
): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange }) => (
    <BindingField
      label={label}
      value={value ?? ""}
      onChange={onChange}
      multiline={multiline}
      placeholder={placeholder}
    />
  ),
});

function FeatureIconField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { supportsGlobalFeatures } = useSiteBindings();
  return (
    <IconPicker
      label={label}
      value={value}
      onChange={onChange}
      icons={supportsGlobalFeatures ? undefined : LEGACY_BLOCK_ICON_NAMES}
    />
  );
}

const iconField = (label: string): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange }) => (
    <FeatureIconField label={label} value={value ?? ""} onChange={onChange} />
  ),
});

function LinkIconField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { supportsGlobalFeatures } = useSiteBindings();
  if (!supportsGlobalFeatures) {
    return <span className="pw-field__hint">Available after a site runtime update.</span>;
  }
  return <IconPicker label={label} value={value} onChange={onChange} />;
}

const linkIconField = (label: string): CustomField<string> => ({
  type: "custom",
  label,
  render: ({ value, onChange }) => (
    <LinkIconField label={label} value={value ?? ""} onChange={onChange} />
  ),
});

const linkField = (label: string) =>
  ({
    type: "object",
    label,
    objectFields: {
      label: bindingField("Label"),
      href: bindingField("URL"),
      icon: linkIconField("Icon (optional)"),
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
      label: bindingField("Label"),
      href: bindingField("URL"),
      icon: linkIconField("Icon (optional)"),
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

export const puckConfig: Config = {
  root: {
    fields: {
      title: bindingField("Page title", { placeholder: "Name this page" }),
      description: bindingField("Page description", {
        multiline: true,
        placeholder: "A short summary for search and sharing",
      }),
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
        brand: bindingField("Brand"),
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
        return (
          <BoundPreview
            component={previewComponents.Navbar}
            props={{ ...props, logo: previewMediaUrl(props.logo, puck?.metadata) }}
          />
        );
      },
    },
    Hero: {
      fields: {
        eyebrow: bindingField("Small label (optional)"),
        heading: bindingField("Heading"),
        subheading: bindingField("Supporting text", { multiline: true }),
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
        return (
          <BoundPreview
            component={previewComponents.Hero}
            props={{ ...props, image: previewMediaUrl(props.image, puck?.metadata) }}
          />
        );
      },
    },
    Features: {
      fields: {
        heading: bindingField("Heading (optional)"),
        subheading: bindingField("Supporting text (optional)", { multiline: true }),
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
            icon: iconField("Icon"),
            title: bindingField("Title"),
            body: bindingField("Description", { multiline: true }),
          },
        },
      },
      defaultProps: { columns: 3, items: [] },
      render: (props) => <BoundPreview component={previewComponents.Features} props={props} />,
    },
    Gallery: {
      fields: {
        heading: bindingField("Heading (optional)"),
        subheading: bindingField("Supporting text (optional)", { multiline: true }),
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
            title: bindingField("Title"),
            description: bindingField("Description", { multiline: true }),
            image: imageField("Image"),
            href: bindingField("Link URL"),
          },
        },
      },
      defaultProps: { columns: 3, items: [] },
      render: (rawProps) => {
        const { puck, ...props } = rawProps as unknown as EditorRenderProps<
          ComponentProps<typeof Gallery>
        >;
        return (
          <BoundPreview
            component={previewComponents.Gallery}
            props={{
              ...props,
              items: props.items.map((item) => ({
                ...item,
                image:
                  resolveMediaPreviewUrl(item.image, puck?.metadata?.mediaPreviewEndpoint) ?? "",
              })),
            }}
          />
        );
      },
    },
    "Call to action": {
      fields: {
        heading: bindingField("Heading"),
        body: bindingField("Supporting text (optional)", { multiline: true }),
        primaryCta: linkField("Primary action"),
        secondaryCta: linkField("Secondary action"),
      },
      defaultProps: {
        heading: "Ready to get started?",
        primaryCta: { label: "Get started", href: "#" },
      },
      render: (props) => <BoundPreview component={previewComponents.Cta} props={props} />,
    },
    Prose: {
      label: "Rich text",
      fields: {
        html: bindingField("Content", { multiline: true }),
      },
      defaultProps: { html: "<p>Write something here.</p>" },
      render: (props) => <BoundPreview component={previewComponents.Prose} props={props} html />,
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
        brand: bindingField("Brand (optional)"),
        tagline: bindingField("Supporting text (optional)"),
        links: linkArrayField("Footer links"),
        copyright: bindingField("Copyright (optional)"),
      },
      defaultProps: { links: [] },
      render: (props) => <BoundPreview component={previewComponents.Footer} props={props} />,
    },
  },
};

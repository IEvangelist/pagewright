import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Block, SiteConfig } from "@pagewright/blocks";
import type { TemplateMeta } from "@/lib/templates";
import { templateDemoHref } from "@/lib/landing-content";
import { TemplatePreview } from "@/components/template-preview";

export function TemplateCard({
  template,
  blocks,
  site,
}: {
  template: TemplateMeta;
  blocks?: Block[];
  site?: SiteConfig;
}) {
  return (
    <article className="pw-tplcard">
      <TemplatePreview
        blocks={blocks}
        site={site}
        name={template.name}
        gradient={`linear-gradient(135deg, ${template.preview.from}, ${template.preview.to})`}
      />
      <div className="pw-tplcard__body">
        <div className="pw-tplcard__top">
          <h3 className="pw-tplcard__name">{template.name}</h3>
          <span className="pw-chip">{template.category}</span>
        </div>
        <p className="pw-tplcard__tagline">{template.tagline}</p>
        <div className="pw-tplcard__highlights" aria-label="Included features">
          {template.highlights.map((highlight) => (
            <span key={highlight} className="pw-tplcard__pill">
              {highlight}
            </span>
          ))}
        </div>
      </div>
      <Link
        href={templateDemoHref(template.id)}
        className="pw-tplcard__cta"
        aria-label={`Preview the ${template.name} template`}
      >
        <span>Preview template</span>
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </article>
  );
}

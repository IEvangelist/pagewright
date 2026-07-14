"use client";

import { useEffect, useRef, useState } from "react";
import { PageRenderer, type Block } from "@pagewright/blocks";

const PREVIEW_PAGE_WIDTH = 1280;

/**
 * Renders the real starter blocks at desktop width, then scales them to a stable preview frame.
 * This is shared by the wizard, landing, and public gallery to prevent preview drift.
 */
export function TemplatePreview({
  blocks,
  name,
  gradient,
  className = "",
}: {
  blocks?: Block[];
  name: string;
  gradient: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const measure = () => setScale(element.clientWidth / PREVIEW_PAGE_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      className={`pw-tplcard__preview${className ? ` ${className}` : ""}`}
      ref={frameRef}
      role="img"
      aria-label={`${name} starter preview`}
    >
      {blocks?.length ? (
        <span className="pw-tplcard__frame" aria-hidden="true" inert>
          <span
            className="pw-tplcard__page pw-root"
            style={{ transform: `scale(${scale})` }}
          >
            <PageRenderer blocks={blocks} />
          </span>
        </span>
      ) : (
        <span className="pw-tplcard__gradient" style={{ background: gradient }}>
          <span className="pw-tplcard__previewname">{name}</span>
          <span className="pw-tplcard__previewstate">Preview unavailable</span>
        </span>
      )}
    </span>
  );
}

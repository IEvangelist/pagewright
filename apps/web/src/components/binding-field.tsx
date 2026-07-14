"use client";

import { useRef } from "react";
import { Braces } from "lucide-react";
import { siteBindingDefinitions } from "@pagewright/blocks";
import { useSiteBindings } from "@/lib/builder/site-bindings-context";

export function BindingField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const { supportsGlobalFeatures } = useSiteBindings();

  function insertBinding(token: string) {
    if (!token) return;
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    queueMicrotask(() => {
      const cursor = start + token.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  const inputProps = {
    value,
    placeholder,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.currentTarget.value),
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      inputRef.current = node;
    },
  };

  return (
    <label className="pw-bindingfield">
      <span className="pw-bindingfield__label">{label}</span>
      {multiline ? (
        <textarea {...inputProps} className="pw-bindingfield__input pw-bindingfield__textarea" />
      ) : (
        <input {...inputProps} className="pw-bindingfield__input" />
      )}
      {supportsGlobalFeatures ? (
        <span className="pw-bindingfield__insert">
          <Braces size={14} aria-hidden="true" />
          <select
            value=""
            onChange={(event) => insertBinding(event.currentTarget.value)}
            aria-label={`Insert a global value into ${label}`}
          >
            <option value="">Insert global value…</option>
            {siteBindingDefinitions.map((binding) => (
              <option key={binding.key} value={binding.token}>
                {binding.label} — {binding.token}
              </option>
            ))}
          </select>
        </span>
      ) : null}
    </label>
  );
}

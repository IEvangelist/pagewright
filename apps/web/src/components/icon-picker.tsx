"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  BlockIcon,
  blockIconNames,
  type BlockIconName,
} from "@pagewright/blocks";

function iconLabel(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function IconPicker({
  label,
  value,
  onChange,
  icons = blockIconNames,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  icons?: readonly BlockIconName[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleIcons = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return icons;
    return icons.filter((name) =>
      `${name} ${iconLabel(name)}`.toLowerCase().includes(normalized),
    );
  }, [icons, query]);

  function choose(name: BlockIconName | "") {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="pw-iconpicker">
      <span className="pw-iconpicker__label">{label}</span>
      <button
        type="button"
        className="pw-iconpicker__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="pw-iconpicker__selection">
          {value ? <BlockIcon name={value} size={18} /> : <span className="pw-iconpicker__none">—</span>}
          <span>{value ? iconLabel(value) : "No icon"}</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {open ? (
        <div className="pw-iconpicker__panel">
          <label className="pw-iconpicker__search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search icons…"
              autoFocus
            />
          </label>
          <div className="pw-iconpicker__grid" role="listbox" aria-label="Available icons">
            <button
              type="button"
              className={`pw-iconpicker__option${!value ? " is-selected" : ""}`}
              onClick={() => choose("")}
              role="option"
              aria-selected={!value}
              title="No icon"
            >
              <span className="pw-iconpicker__none">—</span>
              <span>None</span>
              {!value ? <Check className="pw-iconpicker__check" size={12} /> : null}
            </button>
            {visibleIcons.map((name) => (
              <button
                type="button"
                className={`pw-iconpicker__option${value === name ? " is-selected" : ""}`}
                key={name}
                onClick={() => choose(name)}
                role="option"
                aria-selected={value === name}
                title={iconLabel(name)}
              >
                <BlockIcon name={name} size={20} />
                <span>{iconLabel(name)}</span>
                {value === name ? <Check className="pw-iconpicker__check" size={12} /> : null}
              </button>
            ))}
          </div>
          {visibleIcons.length === 0 ? (
            <p className="pw-iconpicker__empty">No icons match “{query}”.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

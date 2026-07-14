"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RotateCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  BlockIcon,
  createSiteBindings,
  resolveBindingString,
  siteBindingDefinitions,
  type SiteConfig,
  type SiteLink,
} from "@pagewright/blocks";
import { IconPicker } from "@/components/icon-picker";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

function linkDestination(href: string): string {
  try {
    const url = new URL(href);
    if (url.protocol === "mailto:" || url.protocol === "tel:") return href;
    return url.host;
  } catch {
    return href || "URL not set";
  }
}

export function SiteSettingsForm({
  owner,
  repo,
  initialSettings,
  initialHeadSha,
}: {
  owner: string;
  repo: string;
  initialSettings: SiteConfig;
  initialHeadSha: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const settingsRef = useRef(settings);
  const headShaRef = useRef(initialHeadSha);
  const revisionRef = useRef(0);
  const bindings = useMemo(() => createSiteBindings(settings), [settings]);

  function commit(next: SiteConfig) {
    revisionRef.current += 1;
    settingsRef.current = next;
    setSettings(next);
    setDirty(true);
    setSaveState((state) => (state === "conflict" || state === "saving" ? state : "idle"));
    setMessage(null);
  }

  function updateLink(index: number, patch: Partial<SiteLink>) {
    commit({
      ...settingsRef.current,
      links: settingsRef.current.links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    });
  }

  function removeLink(index: number) {
    commit({
      ...settingsRef.current,
      links: settingsRef.current.links.filter((_, linkIndex) => linkIndex !== index),
    });
  }

  function addLink() {
    commit({
      ...settingsRef.current,
      links: [
        ...settingsRef.current.links,
        { label: "New link", href: "", icon: "link" },
      ],
    });
  }

  async function save({ force = false }: { force?: boolean } = {}) {
    const settingsToSave = settingsRef.current;
    const savedRevision = revisionRef.current;
    setSaveState("saving");
    setMessage(null);
    try {
      const response = await fetch(`/api/sites/${owner}/${repo}/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: settingsToSave,
          expectedHeadSha: force ? undefined : headShaRef.current,
          force,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; code?: string; headSha?: string }
        | null;
      if (response.status === 409 || body?.code === "conflict") {
        setSaveState("conflict");
        setMessage(body?.error ?? "This site changed somewhere else.");
        return;
      }
      if (!response.ok) {
        setSaveState("error");
        setMessage(body?.error ?? "Couldn’t save site settings.");
        return;
      }
      if (body?.headSha) headShaRef.current = body.headSha;
      if (revisionRef.current !== savedRevision) {
        setDirty(true);
        setSaveState("idle");
        setMessage(null);
        return;
      }
      setDirty(false);
      setSaveState("saved");
      setMessage("Settings saved — your site is deploying.");
    } catch {
      setSaveState("error");
      setMessage("Network error while saving site settings.");
    }
  }

  return (
    <div className="pw-settings">
      {saveState === "conflict" ? (
        <div className="pw-editor__conflict pw-settings__conflict" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="pw-editor__conflicttext">{message}</span>
          <button
            type="button"
            className="pw-btn pw-btn--ghost"
            onClick={() => window.location.reload()}
          >
            <RotateCw size={14} aria-hidden="true" /> Reload latest
          </button>
          <button type="button" className="pw-btn pw-btn--primary" onClick={() => save({ force: true })}>
            Overwrite with mine
          </button>
        </div>
      ) : null}

      <div className="pw-settings__layout">
        <form
          className="pw-settings__main"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <section className="pw-settings__card">
            <div className="pw-settings__cardhead">
              <div>
                <h2>Site details</h2>
                <p>Reusable details for metadata and global value bindings.</p>
              </div>
            </div>
            <div className="pw-settings__fields">
              <label className="pw-field">
                <span className="pw-field__label">Site name</span>
                <input
                  className="pw-input"
                  value={settings.name}
                  onChange={(event) => commit({ ...settingsRef.current, name: event.currentTarget.value })}
                  required
                />
              </label>
              <label className="pw-field pw-field--wide">
                <span className="pw-field__label">Description</span>
                <textarea
                  className="pw-input pw-textarea"
                  value={settings.description ?? ""}
                  onChange={(event) =>
                    commit({ ...settingsRef.current, description: event.currentTarget.value })
                  }
                  rows={3}
                />
              </label>
              <label className="pw-field">
                <span className="pw-field__label">Canonical URL</span>
                <input
                  className="pw-input"
                  type="url"
                  value={settings.url ?? ""}
                  onChange={(event) => commit({ ...settingsRef.current, url: event.currentTarget.value })}
                  placeholder="https://example.com"
                />
              </label>
              <label className="pw-field">
                <span className="pw-field__label">Default theme</span>
                <select
                  className="pw-input"
                  value={settings.defaultTheme}
                  onChange={(event) =>
                    commit({
                      ...settingsRef.current,
                      defaultTheme: event.currentTarget.value as SiteConfig["defaultTheme"],
                    })
                  }
                >
                  <option value="system">Follow the visitor’s system</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          </section>

          <section className="pw-settings__card">
            <div className="pw-settings__cardhead">
              <div>
                <h2>External links</h2>
                <p>Global links are appended to every footer and can carry an icon.</p>
              </div>
              <button type="button" className="pw-btn pw-btn--ghost pw-btn--sm" onClick={addLink}>
                <Plus size={15} aria-hidden="true" /> Add link
              </button>
            </div>

            {settings.links.length === 0 ? (
              <div className="pw-settings__emptylinks">
                <Link2 size={22} aria-hidden="true" />
                <p>No global links yet.</p>
                <button type="button" className="pw-btn pw-btn--ghost pw-btn--sm" onClick={addLink}>
                  Add your first link
                </button>
              </div>
            ) : (
              <div className="pw-settings__links">
                {settings.links.map((link, index) => (
                  <article className="pw-settings__link" key={index}>
                    <div className="pw-settings__linkpreview">
                      <span className="pw-settings__linkicon">
                        <BlockIcon name={link.icon} size={20} />
                      </span>
                      <span>
                        <strong>{link.label || "Untitled link"}</strong>
                        <small>{linkDestination(link.href)}</small>
                      </span>
                      <ExternalLink size={14} aria-hidden="true" />
                    </div>
                    <div className="pw-settings__linkfields">
                      <label className="pw-field">
                        <span className="pw-field__label">Label</span>
                        <input
                          className="pw-input"
                          value={link.label}
                          onChange={(event) => updateLink(index, { label: event.currentTarget.value })}
                          required
                        />
                      </label>
                      <label className="pw-field">
                        <span className="pw-field__label">External URL</span>
                        <input
                          className="pw-input"
                          value={link.href}
                          onChange={(event) => updateLink(index, { href: event.currentTarget.value })}
                          placeholder="https://…"
                          required
                        />
                      </label>
                      <IconPicker
                        label="Icon"
                        value={link.icon}
                        onChange={(icon) => updateLink(index, { icon: icon || undefined })}
                      />
                    </div>
                    <button
                      type="button"
                      className="pw-settings__remove"
                      onClick={() => removeLink(index)}
                      aria-label={`Remove ${link.label || "link"}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="pw-settings__actions">
            <button
              type="submit"
              className="pw-btn pw-btn--primary"
              disabled={saveState === "saving" || !dirty}
            >
              {saveState === "saving" ? (
                <Loader2 size={16} className="pw-spin" aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              {saveState === "saving" ? "Saving…" : "Save settings"}
            </button>
            {saveState === "saved" ? (
              <span className="pw-settings__message pw-settings__message--success">
                <Check size={15} aria-hidden="true" /> {message}
              </span>
            ) : saveState === "error" ? (
              <span className="pw-settings__message pw-settings__message--error">
                <AlertCircle size={15} aria-hidden="true" /> {message}
              </span>
            ) : null}
          </div>
        </form>

        <aside className="pw-settings__bindings">
          <div className="pw-settings__bindingscard">
            <span className="pw-settings__kicker">Global values</span>
            <h2>Bind once, reuse anywhere</h2>
            <p>Insert these tokens into any text or URL field in the visual editor.</p>
            <ul>
              {siteBindingDefinitions.map((binding) => (
                <li key={binding.key}>
                  <code>{binding.token}</code>
                  <span>
                    <strong>{binding.label}</strong>
                    <small>{resolveBindingString(binding.token, bindings) || "Not set"}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

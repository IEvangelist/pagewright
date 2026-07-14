export * from "@pagewright/blocks/schema";

/** Version of the kit a generated site is pinned to. Drives the self-update PR flow. */
export const KIT_VERSION = "0.1.1";

/**
 * Render-blocking inline script that applies the persisted or system theme before first
 * paint (prevents a flash of the wrong theme). Sets both a `.dark` class (matches next-themes)
 * and `data-theme` so block CSS resolves identically in the builder and on the live site.
 */
export function createThemeInitScript(
  defaultTheme: "light" | "dark" | "system" = "system",
): string {
  return `(function(){try{var e=localStorage.getItem("pw-theme");var f=${JSON.stringify(defaultTheme)};var t=e==="light"||e==="dark"||e==="system"?e:f;var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var d=t==="dark"||(t==="system"&&m);var r=document.documentElement;r.classList.toggle("dark",!!d);r.setAttribute("data-theme",d?"dark":"light");}catch(_){}})();`;
}

export const themeInitScript = createThemeInitScript();

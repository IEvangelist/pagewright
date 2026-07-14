"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  createSiteBindings,
  type BindingValues,
  type SiteConfig,
} from "@pagewright/blocks";

interface SiteBindingsContextValue {
  site: SiteConfig;
  bindings: BindingValues;
  supportsGlobalFeatures: boolean;
}

const SiteBindingsContext = createContext<SiteBindingsContextValue | null>(null);

export function SiteBindingsProvider({
  site,
  supportsGlobalFeatures,
  children,
}: {
  site: SiteConfig;
  supportsGlobalFeatures: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      site,
      bindings: supportsGlobalFeatures ? createSiteBindings(site) : {},
      supportsGlobalFeatures,
    }),
    [site, supportsGlobalFeatures],
  );
  return <SiteBindingsContext.Provider value={value}>{children}</SiteBindingsContext.Provider>;
}

export function useSiteBindings(): SiteBindingsContextValue {
  const context = useContext(SiteBindingsContext);
  if (!context) {
    throw new Error("useSiteBindings must be used inside SiteBindingsProvider.");
  }
  return context;
}

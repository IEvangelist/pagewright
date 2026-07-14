import type { Metadata } from "next";
import "./globals.css";
import "@pagewright/blocks/blocks.css";
import { ThemeProvider } from "@/components/theme-provider";
import { NavProgress } from "@/components/nav-progress";

export const metadata: Metadata = {
  title: "Pagewright",
  description: "Build and publish beautiful GitHub Pages sites — no code required.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
          storageKey="pw-theme"
        >
          <NavProgress />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

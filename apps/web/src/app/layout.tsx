import type { Metadata } from "next";
import "./globals.css";
import "@pagewright/blocks/blocks.css";
import { ThemeProvider } from "@/components/theme-provider";

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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="pw-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

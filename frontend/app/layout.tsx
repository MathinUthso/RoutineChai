import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { AmbientLedger } from "@/components/ambient-ledger";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "routineChai · UIU Fall 2026 routine planner",
  applicationName: "routineChai",
  description:
    "routineChai builds clash-free Fall 2026 timetables for UIU students: pick your courses, live-tune gaps, campus days, and class hours, then keep a backup plan for every section.",
};

export const viewport: Viewport = {
  themeColor: "#f3ecdf",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-paper text-ink antialiased">
        <AmbientLedger />
        <a
          href="#main"
          className="press sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-ink focus:bg-paper focus:px-3 focus:py-2 focus:text-[0.875rem] focus:text-ink"
        >
          Skip to content
        </a>
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}

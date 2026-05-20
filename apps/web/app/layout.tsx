import type { Metadata } from "next";
import { Inter_Tight, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { FironTopBar } from "./components/FironTopBar";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const SITE_TITLE = "Free AI Readiness Audit: How AI Agents See Your Site";
const SITE_DESCRIPTION = "Enter your URL and get a full diagnostic in 60 seconds. See exactly how ChatGPT, Claude, and Perplexity read and evaluate your brand.";

export const metadata: Metadata = {
  metadataBase: new URL("https://audit.fironmarketing.com"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "https://audit.fironmarketing.com/",
    siteName: "Firon AI Readiness Audit",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${interTight.variable} ${instrumentSerif.variable}`} suppressHydrationWarning>
      <body className={interTight.className} suppressHydrationWarning>
        <FironTopBar />
        {children}
      </body>
    </html>
  );
}

// deploy 1774622407
// deploy 1776363036

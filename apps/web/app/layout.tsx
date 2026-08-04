import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FironTopBar } from "./components/FironTopBar";
import { ContactBar } from "./components/ContactBar";
import { ThemeProvider } from "./components/ThemeProvider";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
  verification: {
    google: "ymhPNohIXn4PxJfq6gGkiiYjsUjHTozO9A1SsN2tm-U",
  },
};

// Google Tag Manager. Loads as high in <head> as possible per GTM install
// guide; the injected tag itself is async so it does not block render.
const GTM_ID = 'GTM-W47FHZN6';
const GTM_HEAD_SCRIPT = `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');
`;

// Runs BEFORE hydration so dark-mode users never see a light flash.
// Reads localStorage.firon:theme, then prefers-color-scheme (dark override
// only, since light is the default), then falls back to light.
const THEME_INIT_SCRIPT = `
(function(){try{
  var s = localStorage.getItem('firon:theme');
  var t = (s === 'light' || s === 'dark') ? s :
          (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: GTM_HEAD_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <ThemeProvider>
          <FironTopBar />
          {children}
          <ContactBar />
        </ThemeProvider>
      </body>
    </html>
  );
}

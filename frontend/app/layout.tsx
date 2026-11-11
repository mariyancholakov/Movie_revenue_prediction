import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Libre_Franklin, Courier_Prime } from "next/font/google";
import { Footer } from "@/components/Footer";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Display — trade-paper Didone. Masthead + headlines.
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

// Text / UI — Franklin Gothic lineage, the American newspaper workhorse.
const franklin = Libre_Franklin({
  variable: "--font-franklin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Figures — screenplay + accounting ledger. All money and data, tabular.
const courier = Courier_Prime({
  variable: "--font-courier",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Google Search Console's HTML-tag ownership check (the tag's content value).
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  title: {
    default: "MOVIEGROSS — The Box-Office Ledger",
    template: "%s · MOVIEGROSS",
  },
  description:
    "The predicted worldwide box-office run of every film now playing, typeset like the weekend grosses — from a model trained on 5,000+ theatrical releases.",
  // the home-screen app: its own name, no browser bar
  appleWebApp: { capable: true, title: "MOVIEGROSS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // lets the page run under a notch; globals.css pads the edges back in
  viewportFit: "cover",
  themeColor: "#EDE7DA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${franklin.variable} ${bodoni.variable} ${courier.variable} h-full antialiased`}
    >
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add
          attributes to <body> before React hydrates; this ignores those on
          this one element only, not its children. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Chrome can offer installing before the page has hydrated; keep the
            offer for InstallPrompt to pick up. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installEvent=e;});",
          }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:bg-ink focus:text-paper
                     focus:px-4 focus:py-3 focus:font-sans focus:text-small focus:font-semibold focus:no-underline"
        >
          Skip to content
        </a>
        <ServiceWorker />
        {children}
        <Footer />
        <InstallPrompt />
      </body>
    </html>
  );
}

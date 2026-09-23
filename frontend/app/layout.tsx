import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Libre_Franklin, Courier_Prime } from "next/font/google";
import { Footer } from "@/components/Footer";
import "./globals.css";

// Display — trade-paper Didone. Masthead + headlines.
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

// Text / UI — Franklin Gothic lineage, the American newspaper workhorse.
const franklin = Libre_Franklin({
  variable: "--font-franklin",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Figures — screenplay + accounting ledger. All money and data, tabular.
const courier = Courier_Prime({
  variable: "--font-courier",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "MOVIEGROSS — The Box-Office Ledger",
  description:
    "The predicted worldwide box-office run of every film now playing, typeset like the weekend grosses — from a model trained on 5,000+ theatrical releases.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
      </body>
    </html>
  );
}

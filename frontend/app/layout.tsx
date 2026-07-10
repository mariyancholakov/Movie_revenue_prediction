import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Space_Mono } from "next/font/google";
import { BackgroundThreads } from "@/components/BackgroundThreads";
import "./globals.css";

// Body — clean, warm humanist grotesque
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Display — glamorous editorial serif, cinematic marquee feel
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  style: ["normal", "italic"],
});

// Data — box-office ticker / ledger numerals
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "MOVIEGROSS — Box Office Predictor",
  description: "Predict the total box-office run of any film now playing",
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
      className={`${dmSans.variable} ${fraunces.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BackgroundThreads />
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Playfair_Display } from "next/font/google";
import { BackgroundThreads } from "@/components/BackgroundThreads";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "MOVIEGROSS — Box Office Predictor",
  description: "Predict box office revenue for currently playing films",
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
      className={`${spaceGrotesk.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BackgroundThreads />
        {children}
      </body>
    </html>
  );
}

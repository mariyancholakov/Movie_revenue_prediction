import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default function config(phase: string): NextConfig {
  // NEXT_PUBLIC_API_URL is baked into the bundle at build time. Without it a
  // production build would silently point every visitor at localhost, so fail
  // the build instead.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_API_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Set it to the deployed API origin before building."
    );
  }
  return nextConfig;
}

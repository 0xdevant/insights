import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons/**",
      },
    ],
  },
  experimental: {
    // Tree-shake barrel imports (smaller client bundles for these packages)
    optimizePackageImports: ["@clerk/nextjs", "@clerk/themes", "@marsidev/react-turnstile"],
  },
};

export default nextConfig;

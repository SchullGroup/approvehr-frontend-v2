import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The legacy Vite frontend still sits in the parent directory with its own
     lockfiles. Pin the workspace root here so Turbopack does not walk up and
     adopt it. Remove once the old app is deleted. */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

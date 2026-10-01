import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
        if (request === "node:sqlite") {
          return callback(null, "commonjs node:sqlite");
        }
        callback();
      });
    }
    return config;
  },
};

export default nextConfig;

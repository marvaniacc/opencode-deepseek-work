/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@wishubest/ui"],
  async rewrites() {
    // Proxy client-side /api/* calls to the Fastify backend in dev.
    // In production Caddy handles /api/* directly, so this never matches.
    return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:8080"}/:path*` }];
  },
};

module.exports = nextConfig;
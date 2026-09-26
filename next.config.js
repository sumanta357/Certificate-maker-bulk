/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "@prisma/client", "bullmq", "ioredis"],
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;

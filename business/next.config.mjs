/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@easner/server"],
  async redirects() {
    return [{ source: "/verification", destination: "/settings?tab=business", permanent: false }]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default nextConfig
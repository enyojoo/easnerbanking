/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@easner/server"],
  async redirects() {
    return [
      { source: "/verification", destination: "/settings?tab=business", permanent: false },
      { source: "/autopayout", destination: "/qr-pay", permanent: true },
      { source: "/autopayout/:path*", destination: "/qr-pay/:path*", permanent: true },
    ]
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
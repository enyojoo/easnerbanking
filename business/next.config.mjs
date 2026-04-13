/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@easner/server"],
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "api.easner.com" }],
        destination: "https://business.easner.com/",
        permanent: false,
      },
      { source: "/verification", destination: "/settings?tab=business", permanent: false },
      { source: "/autopayout", destination: "/qr-pay", permanent: true },
      { source: "/autopayout/:path*", destination: "/qr-pay/:path*", permanent: true },
    ]
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
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Mitigate ChunkLoadError timeouts on `next dev` (slow disk / AV scanning `_next/static/chunks`).
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.output = {
        ...config.output,
        chunkLoadTimeout: 300_000,
      }
    }
    if (dev) {
      // On Windows this avoids transient filesystem cache corruption under heavy restarts.
      config.cache = false
    }
    return config
  },
}

export default nextConfig

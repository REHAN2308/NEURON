/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@neuron/ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;

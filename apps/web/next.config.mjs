/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace TS package directly (no prebuild needed for the web app).
  transpilePackages: ['@mvs/shared'],
  // The app is embedded in monday.com via iframe — allow it to be framed there.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.monday.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundle the reviewed SQL migrations in Vercel's Node.js function.
  // They are read server-side only and never served as public static files.
  outputFileTracingIncludes: {
    "/api/admin/platform-control/migrations": ["./supabase/migrations/*.sql"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;

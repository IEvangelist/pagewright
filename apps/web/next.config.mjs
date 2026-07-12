/** @type {import('next').NextConfig} */
const nextConfig = {
  // Block/site-kit packages ship TypeScript source; let Next transpile them.
  transpilePackages: ["@pagewright/blocks", "@pagewright/site-kit", "@pagewright/github", "@pagewright/registry"],
};

export default nextConfig;

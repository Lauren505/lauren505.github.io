/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 75 for the papers' pictures, 85 for the portrait — see HomeBody.
    qualities: [75, 85],
  },
  turbopack: {
    rules: {
      // The bakery's recipes are markdown, read as text — see content/recipes.ts.
      "*.md": { loaders: ["./markdown-loader.cjs"], as: "*.js" },
    },
  },
};

export default nextConfig;

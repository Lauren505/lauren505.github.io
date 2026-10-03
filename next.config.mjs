/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      // The bakery's recipes are markdown, read as text — see content/recipes.ts.
      "*.md": { loaders: ["./markdown-loader.cjs"], as: "*.js" },
    },
  },
};

export default nextConfig;

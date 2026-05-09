import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/ghl": {
        target: "https://services.leadconnectorhq.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ghl/, ""),
        headers: {
          Authorization: `Bearer ${process.env.VITE_GHL_API_KEY}`,
          Version: "2021-07-28",
        },
      },
    },
  },
});

import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  /* Relative asset URLs: the built site runs from a domain root or from any
     sub-folder of a static host without a rebuild. */
  base: "./",
  plugins: [preact()],
  server: {
    /* node_modules is linked to the source checkout, which sits one level up. */
    fs: { allow: [".."] },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});

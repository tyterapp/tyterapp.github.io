import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localFilesPlugin } from "./local-files-plugin.js";
import { webProPlugin } from "./web-pro-plugin.js";
export default defineConfig({
  plugins: [react(), webProPlugin(), localFilesPlugin()],
  server: {
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/codes-for-pro.txt",
        "**/.web-pro-sessions*",
      ],
    },
  },
  optimizeDeps: {
    include: ["docx", "jspdf", "pdfjs-dist", "fflate", "nspell"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/core"],
        },
      },
    },
  },
});

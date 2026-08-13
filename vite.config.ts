import gsenderPlugin from "@sienci/gsender-plugin-sdk/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), gsenderPlugin(), tailwindcss()],
	// Relative base: gSender serves the built plugin from /plugins/<id>/ui/.
	base: "./",
	build: {
		outDir: "ui",
		emptyOutDir: true,
	},
	optimizeDeps: {
		// clipper-lib ships UMD/CJS only; pre-bundle it so ESM imports resolve.
		include: ["clipper-lib"],
	},
});

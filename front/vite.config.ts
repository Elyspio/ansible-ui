import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The .NET API serves the SPA in production; in dev, /api and /hubs are proxied to the local API.
const API_TARGET = process.env.VITE_API_TARGET ?? "https://localhost:7193";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: [
			{ find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
			// monaco-yaml's worker manager imports "monaco-editor/esm/vs/…", a path the
			// monaco-editor 0.57 exports map no longer exposes; point it at the files directly.
			{
				find: /^monaco-editor\/esm\/vs\/(.*)$/,
				replacement: `${fileURLToPath(new URL("./node_modules/monaco-editor/esm/vs/", import.meta.url))}$1`,
			},
			{
				find: /^.*\/languages\/features\/(typescript|css|html)\/register\.js$/,
				replacement: fileURLToPath(
					new URL("./src/view/editor/monaco-unused-language.ts", import.meta.url),
				),
			},
		],
	},
	server: {
		port: 5173,
		// Stable OIDC origin: fail rather than fall back to another port.
		strictPort: true,
		proxy: {
			"/api": { target: API_TARGET, changeOrigin: true, secure: false },
			"/hubs": { target: API_TARGET, changeOrigin: true, secure: false, ws: true },
		},
	},
	build: {
		outDir: "dist",
		sourcemap: true,
	},
	fmt: {
		useTabs: true,
		tabWidth: 4,
	},
	lint: {
		ignorePatterns: ["dist/**"],
		// Type-aware rules + full type check: `vp check` replaces a separate `tsc` step.
		options: { typeAware: true, typeCheck: true },
	},
});

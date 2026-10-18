import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { configureMonacoYaml } from "monaco-yaml";
import EditorWorker from "./workers.editor.ts?worker";
import JsonWorker from "./workers.json.ts?worker";
import YamlWorker from "./workers.yaml.ts?worker";
import { terminal } from "@/config/theme";

// Bundled Monaco instead of @monaco-editor/react's CDN default: no third-party script at runtime.
self.MonacoEnvironment = {
	getWorker(_, label) {
		if (label === "yaml") return new YamlWorker();
		if (label === "json") return new JsonWorker();
		return new EditorWorker();
	},
};
loader.config({ monaco });

// Ansible schemas come from ansible-lint (GPL-3.0), fetched by the browser at a pinned commit
// rather than vendored. Offline, YAML keeps syntax checks without Ansible completion.
const schemaBase =
	"https://raw.githubusercontent.com/ansible/ansible-lint/e7f397ad6dfa20d274afa17cd7bbedd84ed136f5/src/ansiblelint/schemas";

configureMonacoYaml(monaco, {
	enableSchemaRequest: true,
	schemas: [
		{
			uri: `${schemaBase}/playbook.json`,
			fileMatch: ["**/playbooks/**/*.yml", "**/playbooks/**/*.yaml", "**/site.yml"],
		},
		{
			uri: `${schemaBase}/tasks.json`,
			fileMatch: ["**/tasks/**/*.yml", "**/tasks/**/*.yaml", "**/handlers/**/*.yml"],
		},
		{
			uri: `${schemaBase}/vars.json`,
			fileMatch: [
				"**/vars/**/*.yml",
				"**/defaults/**/*.yml",
				"**/group_vars/**/*.yml",
				"**/host_vars/**/*.yml",
			],
		},
		{ uri: `${schemaBase}/inventory.json`, fileMatch: ["**/inventory/*.yml"] },
	],
});

/** Same surface as the Run terminal: code being edited reads like the output it produces. */
export const editorTheme = "ansible-ui";

monaco.editor.defineTheme(editorTheme, {
	base: "vs-dark",
	inherit: true,
	rules: [
		{ token: "type", foreground: "34d399" },
		{ token: "type.yaml", foreground: "34d399" },
		{ token: "string", foreground: "b7c5c0" },
		{ token: "string.yaml", foreground: "b7c5c0" },
		{ token: "number", foreground: "fbbf24" },
		{ token: "keyword", foreground: "e8944a" },
		{ token: "comment", foreground: "6b7570", fontStyle: "italic" },
	],
	colors: {
		"editor.background": terminal.background,
		"editor.foreground": terminal.text,
		"editorGutter.background": terminal.background,
		"editorLineNumber.foreground": "#4a524e",
		"editorLineNumber.activeForeground": "#9aa59f",
		"editor.lineHighlightBackground": "#121815",
		"editor.lineHighlightBorder": "#00000000",
		"editor.selectionBackground": "#2fbf8740",
		"editorCursor.foreground": "#2fbf87",
		"editorIndentGuide.background1": "#1f2422",
		"editorWidget.background": "#141816",
		"editorWidget.border": terminal.border,
		"diffEditor.insertedTextBackground": "#34d39926",
		"diffEditor.removedTextBackground": "#f8717126",
		"diffEditor.insertedLineBackground": "#34d39914",
		"diffEditor.removedLineBackground": "#f8717114",
		"scrollbarSlider.background": "#ffffff14",
	},
});

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
		{ token: "type", foreground: "f3c37e" },
		{ token: "type.yaml", foreground: "f3c37e" },
		{ token: "string", foreground: "d9cbb6" },
		{ token: "string.yaml", foreground: "d9cbb6" },
		{ token: "number", foreground: "9fc7e0" },
		{ token: "keyword", foreground: "e58a7a" },
		{ token: "comment", foreground: "786b5b", fontStyle: "italic" },
	],
	colors: {
		"editor.background": terminal.background,
		"editor.foreground": terminal.text,
		"editorGutter.background": terminal.background,
		"editorLineNumber.foreground": "#4f463b",
		"editorLineNumber.activeForeground": "#a89a88",
		"editor.lineHighlightBackground": "#1a1611",
		"editor.lineHighlightBorder": "#00000000",
		"editor.selectionBackground": "#f0a43c40",
		"editorCursor.foreground": "#f0a43c",
		"editorIndentGuide.background1": "#2a241d",
		"editorWidget.background": "#1d1915",
		"editorWidget.border": terminal.border,
		"editorSuggestWidget.selectedBackground": "#2e271f",
		"diffEditor.insertedTextBackground": "#7fc58f26",
		"diffEditor.removedTextBackground": "#e58a7a26",
		"diffEditor.insertedLineBackground": "#7fc58f14",
		"diffEditor.removedLineBackground": "#e58a7a14",
		"scrollbarSlider.background": "#ffffff14",
	},
});

// Monaco measures glyphs once; the bundled variable font may land after the first editor.
void document.fonts.ready.then(() => monaco.editor.remeasureFonts());

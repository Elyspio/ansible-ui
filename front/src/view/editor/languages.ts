/** Monaco language for a repository path; Jinja templates use the language of the file they render. */
export function languageFor(path: string): string {
	const name = path.split("/").pop() ?? path;
	const rendered = name.endsWith(".j2") ? name.slice(0, -3) : name;
	if (rendered === "Dockerfile") return "dockerfile";
	const extension = rendered.includes(".") ? rendered.split(".").pop()!.toLowerCase() : "";
	switch (extension) {
		case "yml":
		case "yaml":
			return "yaml";
		case "json":
			return "json";
		case "sh":
		case "bash":
			return "shell";
		case "py":
			return "python";
		case "ini":
		case "cfg":
		case "conf":
			return "ini";
		case "md":
			return "markdown";
		case "xml":
			return "xml";
		case "ps1":
			return "powershell";
		default:
			return "plaintext";
	}
}

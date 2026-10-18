import { describe, expect, it } from "vite-plus/test";
import { languageFor } from "./languages";

describe("languageFor", () => {
	it("maps Ansible files to YAML", () => {
		expect(languageFor("playbooks/site.yml")).toBe("yaml");
		expect(languageFor("inventory/hosts.yaml")).toBe("yaml");
	});

	it("uses the rendered language of Jinja templates", () => {
		expect(languageFor("roles/web/templates/nginx.conf.j2")).toBe("ini");
		expect(languageFor("roles/web/templates/values.yml.j2")).toBe("yaml");
	});

	it("falls back to plain text", () => {
		expect(languageFor("files/README")).toBe("plaintext");
		expect(languageFor("roles/web/templates/motd.j2")).toBe("plaintext");
	});
});

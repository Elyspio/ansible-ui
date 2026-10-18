import { describe, expect, it } from "vite-plus/test";
import { addHost, hasHost, hostsByGroup, listGroups } from "./hostsFile";
import { yamlPathAt } from "@/view/editor/yamlPath";

const inventory = `all:
  children:
    db:
      hosts:
        db-1.lan:
        db-2.lan:
    hypervisors:
      # Bare-metal hosts: real temperature sensors live here.
      hosts:
        px-1.lan:
    others:
      hosts:
        proxy.lan:
#        monitoring-2.lan:
        zigbee.lan:
    runners:
      hosts:
        runner-1.lan:
          ansible_host: 10.0.10.61

docker:
  hosts:
    db-1.lan:
    registry.lan:
`;

describe("hosts file", () => {
	it("lists groups from all.children and the top level", () => {
		expect(listGroups(inventory)).toEqual(["db", "docker", "hypervisors", "others", "runners"]);
		expect(hasHost(inventory, "zigbee.lan")).toBe(true);
		expect(hasHost(inventory, "monitoring-2.lan")).toBe(false);
	});

	it("appends a host after the last one, keeping comments and spacing", () => {
		const next = addHost(inventory, {
			host: "backup.lan",
			groups: ["others"],
			ansibleHost: "10.0.10.74",
		});
		expect(next).toBe(
			inventory.replace(
				"        zigbee.lan:\n",
				"        zigbee.lan:\n        backup.lan:\n          ansible_host: 10.0.10.74\n",
			),
		);
	});

	it("appends after a host that carries vars", () => {
		const next = addHost(inventory, { host: "runner-2.lan", groups: ["runners"] });
		expect(next).toContain(
			"          ansible_host: 10.0.10.61\n        runner-2.lan:\n\ndocker:",
		);
	});

	it("writes connection vars once across several groups", () => {
		const next = addHost(inventory, {
			host: "db-3.lan",
			groups: ["db", "docker"],
			ansibleHost: "10.0.0.3",
		});
		expect(next.match(/ansible_host: 10\.0\.0\.3/g)).toHaveLength(1);
		expect(next.endsWith("    registry.lan:\n    db-3.lan:\n")).toBe(true);
		expect(hostsByGroup(next).get("docker")).toContain("db-3.lan");
	});

	it("creates a group at the end of all.children", () => {
		const next = addHost(inventory, { host: "pbs.lan", groups: [], newGroup: "backup" });
		expect(next).toContain(
			"          ansible_host: 10.0.10.61\n    backup:\n      hosts:\n        pbs.lan:\n\ndocker:",
		);
		expect(hostsByGroup(next).get("backup")).toEqual(["pbs.lan"]);
	});

	it("fills a group that has no hosts yet", () => {
		const next = addHost("all:\n  children:\n    web:\n      vars:\n        port: 80\n", {
			host: "web-1.lan",
			groups: ["web"],
		});
		expect(hostsByGroup(next).get("web")).toEqual(["web-1.lan"]);
		expect(next).toContain("    web:\n      hosts:\n        web-1.lan:\n      vars:");
	});

	it("refuses duplicates, unsafe names and flow style", () => {
		expect(() => addHost(inventory, { host: "db-1.lan", groups: ["others"] })).toThrow(
			/already/,
		);
		expect(() => addHost(inventory, { host: "bad host", groups: ["db"] })).toThrow(/letters/);
		expect(() => addHost(inventory, { host: "x.lan", groups: [], newGroup: "db" })).toThrow(
			/exists/,
		);
		expect(() =>
			addHost("all:\n  children:\n    web: {hosts: {a: null}}\n", {
				host: "b",
				groups: ["web"],
			}),
		).toThrow(/flow style/);
	});

	it("names the YAML keys around the cursor", () => {
		const offset = inventory.indexOf("zigbee.lan") + 3;
		expect(yamlPathAt(inventory, offset)).toEqual([
			"all",
			"children",
			"others",
			"hosts",
			"zigbee.lan",
		]);
		expect(yamlPathAt(inventory, inventory.indexOf("10.0.10.61"))).toEqual([
			"all",
			"children",
			"runners",
			"hosts",
			"runner-1.lan",
			"ansible_host",
		]);
	});

	it("creates all.children when the inventory has no all group", () => {
		const next = addHost("web:\n  hosts:\n    web-1.lan:\n", {
			host: "backup.lan",
			groups: [],
			newGroup: "backup",
		});
		expect(next).toContain(
			"all:\n  children:\n    backup:\n      hosts:\n        backup.lan:\n",
		);
	});

	it("refuses empty flow maps rather than inserting outside them", () => {
		expect(() =>
			addHost("web:\n  hosts: {}\n", { host: "web-2.lan", groups: ["web"] }),
		).toThrow(/flow style/);
		expect(() =>
			addHost("all:\n  children: {}\n", { host: "web-2.lan", groups: [], newGroup: "web" }),
		).toThrow(/flow style/);
	});
});

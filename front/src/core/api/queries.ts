import { useQuery } from "@tanstack/react-query";
import { http } from "./client";
import type { Inventory, Playbook, Run } from "./types";

export const qk = {
	playbooks: ["playbooks"] as const,
	runs: ["runs"] as const,
	run: (id: string) => ["runs", id] as const,
	inventory: ["inventory"] as const,
	hostVars: (host: string) => ["inventory", "hosts", host, "vars"] as const,
};

export function usePlaybooks() {
	return useQuery({
		queryKey: qk.playbooks,
		queryFn: async () => (await http.get<Playbook[]>("/api/playbooks")).data,
		// Listing does a git pull on the control node; keep it for a while.
		staleTime: 60_000,
	});
}

export function useRuns() {
	return useQuery({
		queryKey: qk.runs,
		queryFn: async () => (await http.get<Run[]>("/api/runs", { params: { take: 50 } })).data,
	});
}

export function useRun(id: string | undefined) {
	return useQuery({
		queryKey: qk.run(id ?? ""),
		queryFn: async () => (await http.get<Run>(`/api/runs/${id}`)).data,
		enabled: !!id,
	});
}

export function useInventory() {
	return useQuery({
		queryKey: qk.inventory,
		queryFn: async () => (await http.get<Inventory>("/api/inventory")).data,
		staleTime: 60_000,
	});
}

export function useHostVars(host: string | null) {
	return useQuery({
		queryKey: qk.hostVars(host ?? ""),
		queryFn: async () => (await http.get<string>(`/api/inventory/hosts/${host}/vars`)).data,
		enabled: !!host,
		retry: false,
	});
}

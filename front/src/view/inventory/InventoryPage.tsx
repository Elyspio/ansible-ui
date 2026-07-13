import { useMemo, useState } from "react";
import {
	Alert,
	Box,
	CircularProgress,
	InputBase,
	Skeleton,
	Typography,
	useTheme,
} from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import { useInventory, useRepositoryStatus } from "@/core/api/queries";
import type { InventoryHost, InventoryHostStatus } from "@/core/api/types";
import { fontMono, fontSans } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";

const groupColors: Record<string, string> = {
	DB: "#f59e0b",
	DOCKER: "#3b82f6",
	FORGEJO_RUNNERS: "#8b5cf6",
	KUBE: "#10b981",
	OTHERS: "#94a3b8",
	PROXMOX: "#ec4899",
};

const fallbackGroupColors = ["#64748b", "#0ea5e9", "#14b8a6", "#a855f7"];
const explorerHeaderHeight = 110;

function statusColor(status: InventoryHostStatus) {
	return status === "reachable" ? "#34d399" : status === "unreachable" ? "#f87171" : "#94a3b8";
}

function groupColor(group: string) {
	const normalized = group.toUpperCase();
	if (groupColors[normalized]) return groupColors[normalized];
	const hash = [...normalized].reduce((value, character) => value + character.charCodeAt(0), 0);
	return fallbackGroupColors[hash % fallbackGroupColors.length];
}

function statusLabel(status: InventoryHostStatus) {
	return status === "reachable"
		? "reachable"
		: status === "unreachable"
			? "unreachable"
			: "unknown";
}

function relativeTime(value: string | null) {
	if (!value) return "—";
	const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
	if (seconds < 60) return `${Math.floor(seconds)}s ago`;
	if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
	return `${Math.floor(seconds / 86_400)}d ago`;
}

function uptime(value: string | null) {
	if (!value) return "—";
	const match = /(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(value);
	if (!match) return value;
	const days = Number(match[1] ?? 0);
	const hours = Number(match[2]);
	return days > 0 ? `${days} day${days === 1 ? "" : "s"}` : `${hours}h`;
}

function StatusDot({ status }: { status: InventoryHostStatus }) {
	return (
		<Box
			component="span"
			sx={{
				width: 10,
				height: 10,
				borderRadius: "50%",
				bgcolor: statusColor(status),
				flexShrink: 0,
			}}
		/>
	);
}

export function InventoryPage() {
	const theme = useTheme();
	const inventory = useInventory();
	const repository = useRepositoryStatus();
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	const hostsByName = useMemo(
		() => new Map((inventory.data?.hosts ?? []).map((host) => [host.name, host])),
		[inventory.data?.hosts],
	);
	const selected = selectedName ? (hostsByName.get(selectedName) ?? null) : null;
	const groups = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase();
		return (inventory.data?.groups ?? [])
			.map((group) => ({
				...group,
				hosts: group.hosts.filter((name) => name.toLocaleLowerCase().includes(needle)),
			}))
			.filter((group) => group.hosts.length > 0)
			.sort((left, right) => left.name.localeCompare(right.name));
	}, [inventory.data?.groups, query]);
	const summary = useMemo(() => {
		const counts: Record<InventoryHostStatus, number> = {
			reachable: 0,
			unreachable: 0,
			unknown: 0,
		};
		for (const host of inventory.data?.hosts ?? []) counts[host.status]++;
		return counts;
	}, [inventory.data?.hosts]);
	const tokens = {
		"--bg": theme.palette.background.default,
		"--panel": theme.palette.background.paper,
		"--border": theme.palette.divider,
		"--text": theme.palette.text.primary,
		"--dim": theme.palette.text.secondary,
		"--chip-bg": theme.palette.mode === "dark" ? "#121815" : "#f5f7f6",
		"--accent": "#34d399",
	} as React.CSSProperties;

	return (
		<Box
			sx={{
				...tokens,
				bgcolor: "var(--bg)",
				height: "100dvh",
				minHeight: 0,
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
				px: { xs: 2, md: 5 },
				py: { xs: 3, md: 4 },
			}}
		>
			<Box
				sx={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "start",
					gap: 2,
					mb: 3,
					flexShrink: 0,
				}}
			>
				<Box>
					<Typography
						variant="h1"
						sx={{
							fontFamily: fontSans,
							fontSize: { xs: 30, md: 38 },
							color: "var(--text)",
						}}
					>
						Inventory
					</Typography>
					<Typography
						color="text.secondary"
						sx={{
							fontFamily: fontMono,
							mt: 0.75,
							fontSize: { xs: 12, md: 14 },
						}}
					>
						Read-only view of control node inventory. Vault-encrypted values never leave
						it.
					</Typography>
				</Box>
				{repository.data?.revision && (
					<Box
						sx={{
							px: 1.5,
							py: 1,
							border: "1px solid rgba(52, 211, 153, 0.3)",
							borderRadius: 1.5,
							color: "var(--accent)",
							bgcolor: "var(--chip-bg)",
							fontFamily: fontMono,
							fontSize: 12.5,
							flexShrink: 0,
						}}
					>
						HEAD {repository.data.revision.slice(0, 8)}
					</Box>
				)}
			</Box>

			{inventory.error && (
				<Alert severity="error" sx={{ mb: 2 }}>
					Could not load inventory: {inventory.error.message}
				</Alert>
			)}

			<Box
				sx={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					bgcolor: "var(--panel)",
					border: "1px solid var(--border)",
					borderRadius: 3,
				}}
			>
				<Box
					sx={{
						minHeight: 72,
						px: { xs: 2, md: 4 },
						display: "flex",
						alignItems: "center",
						gap: { xs: 1, md: 3 },
						flexWrap: "wrap",
						borderBottom: "1px solid var(--border)",
						fontFamily: fontMono,
					}}
				>
					<Typography
						sx={{
							fontFamily: fontMono,
							fontWeight: 700,
							fontSize: 18,
							mr: { md: 1 },
						}}
					>
						inventory
					</Typography>
					{(["reachable", "unreachable", "unknown"] as const).map((status) => (
						<Box
							key={status}
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1,
								px: 1.5,
								py: 0.85,
								border: "1px solid var(--border)",
								borderRadius: 1.5,
								bgcolor: "var(--chip-bg)",
								fontSize: 12.5,
							}}
						>
							<StatusDot status={status} /> {summary[status]} {statusLabel(status)}
						</Box>
					))}
					<Typography
						sx={{
							ml: { md: "auto" },
							color: "var(--dim)",
							fontFamily: fontMono,
							fontSize: 12.5,
						}}
					>
						{inventory.data?.hosts.length ?? 0} hosts
					</Typography>
				</Box>

				<Box
					sx={{
						flex: 1,
						minHeight: 0,
						display: "grid",
						gridTemplateColumns: { xs: "1fr", md: "300px minmax(0, 1fr)" },
						gridTemplateRows: {
							xs: "minmax(280px, 42%) minmax(280px, 1fr)",
							md: "1fr",
						},
						overflow: "hidden",
					}}
				>
					<Box
						sx={{
							minHeight: 0,
							overflow: "auto",
							borderRight: { md: "1px solid var(--border)" },
							borderBottom: { xs: "1px solid var(--border)", md: 0 },
							pb: 2,
						}}
					>
						<Box
							sx={{
								position: "sticky",
								top: 0,
								zIndex: 2,
								height: explorerHeaderHeight,
								px: 2.5,
								py: 1.5,
								bgcolor: "var(--panel)",
								borderBottom: "1px solid var(--border)",
							}}
						>
							<Box
								sx={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									mb: 1,
								}}
							>
								<Typography variant="overline" color="text.secondary">
									Explorer
								</Typography>
								<Typography variant="overline" color="text.secondary">
									{groups.length} groups
								</Typography>
							</Box>
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 1,
									px: 1.25,
									height: 40,
									border: "1px solid var(--border)",
									borderRadius: 1.5,
									bgcolor: "var(--chip-bg)",
								}}
							>
								<SearchRoundedIcon sx={{ color: "var(--dim)", fontSize: 18 }} />
								<InputBase
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Filter hosts..."
									inputProps={{ "aria-label": "Filter hosts" }}
									sx={{ fontFamily: fontMono, fontSize: 13, flex: 1 }}
								/>
							</Box>
						</Box>

						{inventory.isPending &&
							Array.from({ length: 7 }, (_, index) => (
								<Skeleton
									key={index}
									height={34}
									sx={{ mx: 2, transform: "none" }}
								/>
							))}
						{inventory.data && inventory.data.hosts.length === 0 && (
							<EmptyState
								icon={<DnsRoundedIcon />}
								title="Empty inventory"
								hint="ansible-inventory returned no hosts on control node."
							/>
						)}
						{inventory.data &&
							inventory.data.hosts.length > 0 &&
							groups.length === 0 && (
								<Typography
									sx={{
										p: 3,
										fontFamily: fontMono,
										color: "var(--dim)",
										fontSize: 12.5,
									}}
								>
									No hosts match “{query}”.
								</Typography>
							)}
						{groups.map((group) => {
							const isCollapsed = collapsed[group.name] ?? false;
							return (
								<Box key={group.name}>
									<Box
										component="button"
										type="button"
										onClick={() =>
											setCollapsed((current) => ({
												...current,
												[group.name]: !isCollapsed,
											}))
										}
										sx={{
											position: "sticky",
											top: explorerHeaderHeight,
											zIndex: 1,
											width: "100%",
											minHeight: 36,
											display: "flex",
											alignItems: "center",
											border: 0,
											borderBottom: "1px solid var(--border)",
											bgcolor: "var(--panel)",
											color: "var(--text)",
											px: 2.25,
											cursor: "pointer",
											fontFamily: fontMono,
											fontSize: 12.5,
											textAlign: "left",
										}}
									>
										{isCollapsed ? (
											<KeyboardArrowRightRoundedIcon fontSize="small" />
										) : (
											<KeyboardArrowDownRoundedIcon fontSize="small" />
										)}
										<Box
											component="span"
											sx={{
												width: 12,
												height: 12,
												borderRadius: "3px",
												bgcolor: groupColor(group.name),
												mx: 1.1,
											}}
										/>
										{group.name}
										<Box
											component="span"
											sx={{ ml: "auto", color: "var(--dim)" }}
										>
											{group.hosts.length}
										</Box>
									</Box>
									{!isCollapsed &&
										group.hosts.map((name) => {
											const host = hostsByName.get(name);
											if (!host) return null;
											const active = selected?.name === host.name;
											return (
												<Box
													key={name}
													component="button"
													type="button"
													onClick={() => setSelectedName(host.name)}
													sx={{
														appearance: "none",
														border: 0,
														borderLeft: active
															? "3px solid var(--accent)"
															: "3px solid transparent",
														width: "100%",
														minHeight: 39,
														display: "flex",
														alignItems: "center",
														gap: 1.25,
														pl: 5.75,
														pr: 2,
														textAlign: "left",
														cursor: "pointer",
														font: "inherit",
														fontFamily: fontMono,
														fontSize: 12.5,
														color: "var(--text)",
														bgcolor: active
															? theme.palette.mode === "dark"
																? "rgba(52, 211, 153, 0.10)"
																: "rgba(52, 211, 153, 0.13)"
															: "transparent",
														"&:hover": {
															bgcolor: active
																? undefined
																: "action.hover",
														},
													}}
												>
													<StatusDot status={host.status} />
													<Box
														component="span"
														sx={{
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															fontWeight: active ? 650 : 400,
														}}
													>
														{host.name}
													</Box>
												</Box>
											);
										})}
								</Box>
							);
						})}
					</Box>

					<Box sx={{ overflow: "hidden", p: { xs: 3, md: 6 } }}>
						{inventory.isPending && (
							<Box sx={{ display: "grid", placeItems: "center", minHeight: 180 }}>
								<CircularProgress size={24} />
							</Box>
						)}
						{!inventory.isPending &&
							!selected &&
							inventory.data?.hosts.length !== 0 && (
								<EmptyState
									icon={<DnsRoundedIcon />}
									title="Select a host"
									hint="Choose a host from explorer to inspect its safe Ansible facts."
								/>
							)}
						{selected && <HostDetail host={selected} />}
					</Box>
				</Box>
			</Box>
		</Box>
	);
}

function HostDetail({ host }: { host: InventoryHost }) {
	return (
		<>
			<Box
				sx={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "start",
					gap: 2,
				}}
			>
				<Box sx={{ minWidth: 0 }}>
					<Typography
						color="text.secondary"
						sx={{ fontFamily: fontMono, fontSize: 12.5 }}
					>
						{host.ip ?? "no IPv4 address"}
					</Typography>
					<Typography
						variant="h2"
						sx={{
							mt: 1,
							fontFamily: fontSans,
							fontSize: { xs: 27, md: 36 },
							overflowWrap: "anywhere",
						}}
					>
						{host.name}
					</Typography>
				</Box>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						px: 1.5,
						py: 0.9,
						border: "1px solid var(--border)",
						borderRadius: 1.5,
						bgcolor: "var(--chip-bg)",
						fontFamily: fontMono,
						fontSize: 12.5,
						flexShrink: 0,
					}}
				>
					<StatusDot status={host.status} /> {statusLabel(host.status)}
				</Box>
			</Box>
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, mt: 4 }}>
				{host.groups.map((group) => (
					<Box
						key={group}
						sx={{
							px: 1.5,
							py: 0.85,
							border: `1px solid ${groupColor(group)}`,
							borderRadius: 1.5,
							color: groupColor(group),
							bgcolor: "var(--chip-bg)",
							fontFamily: fontMono,
							fontSize: 12.5,
							fontWeight: 650,
						}}
					>
						{group}
					</Box>
				))}
			</Box>
			<Box sx={{ my: 4, borderTop: "1px solid var(--border)" }} />
			<Typography variant="overline" color="text.secondary">
				Facts
			</Typography>
			<Box
				component="dl"
				sx={{
					m: 0,
					mt: 1.5,
					p: { xs: 2, md: 3 },
					border: "1px solid var(--border)",
					borderRadius: 2,
					bgcolor: "var(--chip-bg)",
					fontFamily: fontMono,
					fontSize: { xs: 12, md: 13 },
					lineHeight: 1.9,
				}}
			>
				{[
					["ansible_os_family", host.osFamily ?? "—"],
					["ansible_distribution", host.os ?? "—"],
					["ansible_default_ipv4.address", host.ip ?? "—"],
					["uptime", uptime(host.uptime)],
					["last_checked", relativeTime(host.lastChecked)],
					...(host.status === "unknown" && host.error
						? [["probe_error", host.error]]
						: []),
				].map(([name, value]) => (
					<Box
						key={name}
						sx={{
							display: "grid",
							gridTemplateColumns: { xs: "1fr", sm: "minmax(210px, auto) 1fr" },
							gap: { xs: 0, sm: 2 },
						}}
					>
						<Typography
							component="dt"
							sx={{ fontFamily: "inherit", color: "var(--text)" }}
						>
							{name}:
						</Typography>
						<Typography
							component="dd"
							sx={{ m: 0, fontFamily: "inherit", color: "var(--dim)" }}
						>
							{value}
						</Typography>
					</Box>
				))}
			</Box>
		</>
	);
}

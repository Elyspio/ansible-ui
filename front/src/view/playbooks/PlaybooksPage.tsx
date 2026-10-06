import { useMemo, useState } from "react";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Divider,
	IconButton,
	Skeleton,
	Tooltip,
	Typography,
	useTheme,
} from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FolderOffRoundedIcon from "@mui/icons-material/FolderOffRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { useNavigate } from "react-router";
import { usePlaybooks, useRepositoryStatus, useRuns } from "@/core/api/queries";
import type { Playbook, Run } from "@/core/api/types";
import { fontMono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { LaunchDialog } from "./LaunchDialog";

type PlaybookState = "ok" | "failed" | "never";

const groupColors = ["#34d399", "#f59e0b", "#8b5cf6", "#3b82f6"];
const explorerHeaderHeight = 52;

function stateFor(runs: Run[]): PlaybookState {
	if (runs.length === 0) return "never";
	return runs[0].status === "Failed" || runs[0].status === "Interrupted" ? "failed" : "ok";
}

function dotColor(state: PlaybookState) {
	return state === "ok" ? "var(--accent)" : state === "failed" ? "var(--danger)" : "var(--never)";
}

function ago(value: string) {
	const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
	if (seconds < 60) return "just now";
	if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
	return `${Math.floor(seconds / 86_400)}d ago`;
}

function duration(run: Run) {
	if (!run.startedAt || !run.finishedAt) return run.status === "Running" ? "running" : "—";
	const seconds = Math.max(
		0,
		(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
	);
	return `${Math.floor(seconds / 60)}m${Math.floor(seconds % 60)
		.toString()
		.padStart(2, "0")}s`;
}

function roleFor(playbook: Playbook) {
	return playbook.name.replace(/^(setup|configure|update|add)_/, "").replaceAll("_", " ");
}

function runSummary(run: Run) {
	const recap = run.recap.reduce(
		(total, host) => ({
			ok: total.ok + host.ok,
			changed: total.changed + host.changed,
			failed: total.failed + host.failed,
		}),
		{ ok: 0, changed: 0, failed: 0 },
	);
	if (recap.failed > 0) return `failed=${recap.failed} ok=${recap.ok}`;
	return `ok=${recap.ok} changed=${recap.changed}`;
}

export function PlaybooksPage() {
	const theme = useTheme();
	const navigate = useNavigate();
	const { data, isPending, error, refetch, isFetching } = usePlaybooks();
	const runs = useRuns();
	const repository = useRepositoryStatus();
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [launching, setLaunching] = useState<Playbook | null>(null);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	const byCategory = useMemo(() => {
		const groups = new Map<string, Playbook[]>();
		for (const playbook of data ?? []) {
			const list = groups.get(playbook.category) ?? [];
			list.push(playbook);
			groups.set(playbook.category, list);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [data]);

	const selected = useMemo(() => {
		if (!data?.length) return null;
		return (
			data.find((playbook) => playbook.path === selectedPath) ??
			data.find((playbook) => playbook.name === "setup_mongodb_cluster") ??
			data[0]
		);
	}, [data, selectedPath]);

	const playbookRuns = useMemo(() => {
		if (!selected) return [];
		return (runs.data ?? [])
			.filter((run) => run.playbook === selected.path)
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
	}, [runs.data, selected]);

	const tokens = {
		"--bg": theme.palette.background.default,
		"--panel": theme.palette.background.paper,
		"--border": theme.palette.divider,
		"--text": theme.palette.text.primary,
		"--dim": theme.palette.text.secondary,
		"--chip-bg": theme.palette.mode === "dark" ? "#121815" : "#f5f7f6",
		"--accent": "#34d399",
		"--danger": "#f87171",
		"--never": theme.palette.mode === "dark" ? "#9ca3af" : "#94a3b8",
		"--yaml-key": "#34d399",
		"--yaml-value": theme.palette.mode === "dark" ? "#b7c5c0" : "#5b6b66",
	} as React.CSSProperties;

	return (
		<Box
			sx={{
				...tokens,
				bgcolor: "var(--bg)",
				minHeight: "100%",
				px: { xs: 2, md: 5 },
				py: { xs: 3, md: 5 },
			}}
		>
			<Box sx={{ width: "100%" }}>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						gap: 2,
						alignItems: "start",
						mb: 3,
					}}
				>
					<Box>
						<Typography
							variant="h1"
							sx={{ fontSize: { xs: 30, md: 38 }, color: "var(--text)" }}
						>
							Playbooks
						</Typography>
						<Typography
							sx={{
								color: "text.secondary",
								fontFamily: fontMono,
								mt: 0.75,
								fontSize: { xs: 12, md: 14 },
							}}
						>
							Discovered on the control node — refreshed with git pull.
						</Typography>
					</Box>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
								}}
							>
								HEAD {repository.data.revision.slice(0, 8)}
							</Box>
						)}
						<Tooltip title="Refresh playbooks">
							<IconButton
								onClick={() => void refetch()}
								disabled={isFetching}
								sx={{ border: "1px solid var(--border)", borderRadius: 2 }}
							>
								{isFetching ? (
									<CircularProgress size={18} />
								) : (
									<RefreshRoundedIcon fontSize="small" />
								)}
							</IconButton>
						</Tooltip>
					</Box>
				</Box>

				{error && (
					<Alert severity="error" sx={{ mb: 2 }}>
						Could not reach control node: {error.message}
					</Alert>
				)}

				<Box
					sx={{
						height: { md: "calc(100dvh - 176px)" },
						// minHeight: { xs: 500, md: 640 },
						display: "grid",
						gridTemplateColumns: { xs: "1fr", md: "320px minmax(0, 1fr)" },
						overflow: "hidden",
						bgcolor: "var(--panel)",
						border: "1px solid var(--border)",
						borderRadius: 3,
					}}
				>
					<Box
						sx={{
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
								display: "flex",
								justifyContent: "space-between",
								px: 2.5,
								minHeight: explorerHeaderHeight,
								alignItems: "center",
								bgcolor: "var(--panel)",
								borderBottom: "1px solid var(--border)",
							}}
						>
							<Typography
								variant="overline"
								sx={{
									color: "text.secondary",
								}}
							>
								Explorer
							</Typography>
							<Typography
								variant="overline"
								sx={{
									color: "text.secondary",
								}}
							>
								{data?.length ?? 0} files
							</Typography>
						</Box>
						{isPending &&
							Array.from({ length: 7 }, (_, index) => (
								<Skeleton
									key={index}
									height={32}
									sx={{ mx: 2, transform: "none" }}
								/>
							))}
						{data && data.length === 0 && (
							<EmptyState
								icon={<FolderOffRoundedIcon />}
								title="No playbooks found"
								hint="The configured repository has no playbooks."
							/>
						)}
						{byCategory.map(([category, playbooks], groupIndex) => {
							const isCollapsed = collapsed[category] ?? false;
							const groupColor = groupColors[groupIndex % groupColors.length];
							return (
								<Box key={category}>
									<Button
										fullWidth
										onClick={() =>
											setCollapsed((current) => ({
												...current,
												[category]: !isCollapsed,
											}))
										}
										sx={{
											position: "sticky",
											top: explorerHeaderHeight,
											zIndex: 1,
											bgcolor: "var(--panel)",
											borderBottom: "1px solid var(--border)",
											justifyContent: "start",
											px: 2.25,
											minHeight: 34,
											color: "var(--text)",
											fontFamily: fontMono,
											fontWeight: 500,
										}}
									>
										{isCollapsed ? (
											<KeyboardArrowRightRoundedIcon fontSize="small" />
										) : (
											<KeyboardArrowDownRoundedIcon fontSize="small" />
										)}
										<Box
											sx={{
												width: 12,
												height: 12,
												bgcolor: groupColor,
												borderRadius: "3px",
												mx: 1.1,
											}}
										/>
										{category}/
										<Box
											component="span"
											sx={{ ml: "auto", color: "var(--dim)", fontSize: 12 }}
										>
											{playbooks.length}
										</Box>
									</Button>
									{!isCollapsed &&
										playbooks.map((playbook) => {
											const state = stateFor(
												(runs.data ?? []).filter(
													(run) => run.playbook === playbook.path,
												),
											);
											const active = selected?.path === playbook.path;
											return (
												<Box
													key={playbook.path}
													component="button"
													type="button"
													onClick={() => setSelectedPath(playbook.path)}
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
													<Box
														component="span"
														sx={{
															flexShrink: 0,
															width: 9,
															height: 9,
															borderRadius: "50%",
															bgcolor: dotColor(state),
														}}
													/>
													<Box
														component="span"
														sx={{
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															fontWeight: active ? 650 : 400,
														}}
													>
														{playbook.name}.yaml
													</Box>
												</Box>
											);
										})}
								</Box>
							);
						})}
					</Box>

					<Box sx={{ overflow: "auto", p: { xs: 3, md: 6 } }}>
						{selected && (
							<>
								<Box
									sx={{
										display: "flex",
										justifyContent: "space-between",
										gap: 2,
										alignItems: "start",
									}}
								>
									<Box sx={{ minWidth: 0 }}>
										<Typography
											noWrap
											sx={{
												color: "text.secondary",
												fontFamily: fontMono,
												fontSize: 12.5,
											}}
										>
											{selected.path}
										</Typography>
										<Typography
											variant="h2"
											sx={{
												mt: 1,
												fontSize: { xs: 26, md: 34 },
												overflowWrap: "anywhere",
											}}
										>
											{selected.name}
										</Typography>
									</Box>
									<Button
										variant="contained"
										startIcon={<PlayArrowRoundedIcon />}
										onClick={() => setLaunching(selected)}
										sx={{
											flexShrink: 0,
											bgcolor: "var(--accent)",
											color: "#062e24",
											px: 2.25,
											"&:hover": { bgcolor: "#22c995" },
										}}
									>
										Run playbook
									</Button>
								</Box>
								<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, mt: 4 }}>
									{[
										[
											stateFor(playbookRuns),
											stateFor(playbookRuns) === "never"
												? "never run"
												: stateFor(playbookRuns) === "ok"
													? "succeeded"
													: "failed",
										],
										[
											"last",
											playbookRuns[0] ? ago(playbookRuns[0].createdAt) : "—",
										],
										["hosts", "inventory"],
										["role", roleFor(selected)],
									].map(([label, value]) => (
										<Box
											key={label}
											sx={{
												display: "flex",
												alignItems: "center",
												gap: 1,
												px: 1.5,
												py: 0.95,
												border: "1px solid var(--border)",
												borderRadius: 1.5,
												bgcolor: "var(--chip-bg)",
												fontFamily: fontMono,
												fontSize: 12.5,
												color: "var(--dim)",
											}}
										>
											{label === "ok" ||
											label === "failed" ||
											label === "never" ? (
												<Box
													sx={{
														width: 10,
														height: 10,
														borderRadius: "50%",
														bgcolor: dotColor(label as PlaybookState),
													}}
												/>
											) : null}
											{label === "last"
												? "last"
												: label === "hosts"
													? "hosts:"
													: label === "role"
														? "role:"
														: ""}{" "}
											{value}
										</Box>
									))}
								</Box>
								<Divider sx={{ my: 4 }} />
								<Typography
									variant="overline"
									sx={{
										color: "text.secondary",
									}}
								>
									Preview
								</Typography>
								<Box
									component="pre"
									sx={{
										m: 0,
										mt: 1.5,
										p: 3,
										overflow: "auto",
										border: "1px solid var(--border)",
										borderRadius: 2,
										bgcolor: "var(--chip-bg)",
										color: "var(--yaml-value)",
										fontFamily: fontMono,
										fontSize: 13,
										lineHeight: 1.9,
									}}
								>
									<Box component="span" sx={{ color: "var(--dim)" }}>
										---
									</Box>
									{"\n"}
									<Box component="span" sx={{ color: "var(--accent)" }}>
										- name:
									</Box>{" "}
									{selected.name}
									{"\n"}{" "}
									<Box component="span" sx={{ color: "var(--yaml-key)" }}>
										hosts:
									</Box>{" "}
									{selected.category}
									{"\n"}{" "}
									<Box component="span" sx={{ color: "var(--yaml-key)" }}>
										become:
									</Box>{" "}
									true{"\n"}{" "}
									<Box component="span" sx={{ color: "var(--yaml-key)" }}>
										roles:
									</Box>
									{"\n"}{" "}
									<Box component="span" sx={{ color: "#f59e0b" }}>
										- {roleFor(selected)}
									</Box>
								</Box>
								<Divider sx={{ my: 4 }} />
								<Typography
									variant="overline"
									sx={{
										color: "text.secondary",
									}}
								>
									Recent runs
								</Typography>
								{playbookRuns.length === 0 ? (
									<Typography
										sx={{
											color: "text.secondary",
											fontFamily: fontMono,
											fontSize: 12.5,
											mt: 1.5,
										}}
									>
										No runs recorded for this playbook.
									</Typography>
								) : (
									<Box sx={{ mt: 1.5 }}>
										{playbookRuns.slice(0, 5).map((run) => (
											<Box
												key={run.id}
												component="button"
												type="button"
												onClick={() => void navigate(`/runs/${run.id}`)}
												sx={{
													width: "100%",
													appearance: "none",
													background: "transparent",
													color: "inherit",
													border: 0,
													cursor: "pointer",
													textAlign: "left",
													display: "grid",
													gridTemplateColumns:
														"14px 120px minmax(120px, 1fr) auto",
													gap: 1.25,
													alignItems: "center",
													py: 1.25,
													borderBottom: "1px solid var(--border)",
													fontFamily: fontMono,
													fontSize: 12.5,
													"&:hover": { bgcolor: "action.hover" },
												}}
											>
												<Box
													sx={{
														width: 10,
														height: 10,
														borderRadius: "50%",
														bgcolor:
															run.status === "Failed"
																? "var(--danger)"
																: "var(--accent)",
													}}
												/>
												<Box
													sx={{
														color: "text.secondary",
													}}
												>
													{ago(run.createdAt)}
												</Box>
												<Box>{runSummary(run)}</Box>
												<Box
													sx={{
														color: "text.secondary",
													}}
												>
													{duration(run)}
												</Box>
											</Box>
										))}
									</Box>
								)}
							</>
						)}
					</Box>
				</Box>
			</Box>
			<LaunchDialog playbook={launching} onClose={() => setLaunching(null)} />
		</Box>
	);
}

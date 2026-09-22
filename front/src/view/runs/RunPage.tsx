import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
	Alert,
	Box,
	Button,
	Chip,
	IconButton,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Tooltip,
	Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { useRun } from "@/core/api/queries";
import { useCancelRun } from "@/core/api/mutations";
import { useRunStream } from "@/core/signalr/useRunStream";
import { formatDateTime, formatDuration } from "@/core/format";
import { fontMono } from "@/config/theme";
import { StatusChip } from "@/view/components/StatusChip";
import { Terminal } from "./Terminal";

export function RunPage() {
	const { id } = useParams<{ id: string }>();
	const { data: run, isPending, error } = useRun(id);
	const cancel = useCancelRun();

	// Streamed chunks accumulate on top of the first REST snapshot; once the run is
	// terminal, the refetched document (authoritative full log) replaces both.
	const [chunks, setChunks] = useState<string[]>([]);
	const snapshotRef = useRef<string | null>(null);
	useEffect(() => {
		snapshotRef.current = null;
		setChunks([]);
	}, [id]);
	if (run && snapshotRef.current === null) snapshotRef.current = (run.output ?? []).join("");

	const onChunk = useCallback((chunk: string) => setChunks((prev) => [...prev, chunk]), []);
	const active = run?.status === "Queued" || run?.status === "Running";
	useRunStream(active ? id : undefined, onChunk);

	// Live duration while running.
	const [, forceTick] = useState(0);
	useEffect(() => {
		if (run?.status !== "Running") return;
		const timer = setInterval(() => forceTick((t) => t + 1), 1000);
		return () => clearInterval(timer);
	}, [run?.status]);

	const text = useMemo(() => {
		if (run && !active) return (run.output ?? []).join("");
		return (snapshotRef.current ?? "") + chunks.join("");
	}, [run, active, chunks]);

	if (error)
		return (
			<Box sx={{ px: { xs: 2, md: 5 }, py: 4 }}>
				<Alert severity="error">Run not found: {error.message}</Alert>
			</Box>
		);

	return (
		<Box
			sx={{
				px: { xs: 2, md: 5 },
				py: 3,
				display: "flex",
				flexDirection: "column",
				gap: 2,
				height: "100dvh",
			}}
		>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
				<Tooltip title="Back to history">
					<IconButton component={RouterLink} to="/runs" size="small">
						<ArrowBackRoundedIcon fontSize="small" />
					</IconButton>
				</Tooltip>
				{isPending ? (
					<Skeleton width={340} height={30} sx={{ transform: "none" }} />
				) : (
					run && (
						<>
							<Typography variant="h4" sx={{ fontFamily: fontMono }}>
								{run.playbook}
							</Typography>
							<StatusChip status={run.status} />
							{active && (
								<Button
									size="small"
									color="error"
									variant="outlined"
									startIcon={<StopCircleRoundedIcon />}
									loading={cancel.isPending}
									onClick={() => id && cancel.mutate(id)}
								>
									Cancel
								</Button>
							)}
						</>
					)
				)}
			</Box>

			{run && (
				<Box
					sx={{
						display: "flex",
						gap: 1,
						flexWrap: "wrap",
						alignItems: "center",
						rowGap: 1.25,
					}}
				>
					{run.options.limit && (
						<Chip
							size="small"
							variant="outlined"
							label={`--limit ${run.options.limit}`}
						/>
					)}
					{run.options.check && <Chip size="small" variant="outlined" label="--check" />}
					{run.options.diff && <Chip size="small" variant="outlined" label="--diff" />}
					<Typography
						variant="body2"
						sx={{
							color: "text.secondary",
						}}
					>
						by {run.requestedBy} · {formatDateTime(run.createdAt)}
						{run.startedAt && ` · ${formatDuration(run.startedAt, run.finishedAt)}`}
						{run.exitCode !== null && run.exitCode !== 0 && ` · exit ${run.exitCode}`}
					</Typography>
				</Box>
			)}

			{run?.status === "Queued" && (
				<Alert severity="info" variant="outlined">
					Waiting for its turn — a single run executes at a time on the control node.
				</Alert>
			)}
			{run?.status === "Interrupted" && (
				<Alert severity="warning" variant="outlined">
					The backend restarted while this run was in progress; its real outcome is
					unknown.
				</Alert>
			)}

			<Terminal text={text || (run?.status === "Queued" ? "" : "")} follow={active} />

			{run && run.recap.length > 0 && (
				<Box sx={{ pb: 1 }}>
					<Typography
						variant="overline"
						sx={{
							color: "text.secondary",
						}}
					>
						Play recap
					</Typography>
					<Table
						size="small"
						sx={{ maxWidth: 720, "& td, & th": { fontFamily: fontMono } }}
					>
						<TableHead>
							<TableRow>
								<TableCell>host</TableCell>
								<TableCell align="right">ok</TableCell>
								<TableCell align="right">changed</TableCell>
								<TableCell align="right">unreachable</TableCell>
								<TableCell align="right">failed</TableCell>
								<TableCell align="right">skipped</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{run.recap.map((host) => (
								<TableRow key={host.host}>
									<TableCell>{host.host}</TableCell>
									<TableCell align="right">{host.ok}</TableCell>
									<TableCell
										align="right"
										sx={{ color: host.changed ? "warning.main" : undefined }}
									>
										{host.changed}
									</TableCell>
									<TableCell
										align="right"
										sx={{ color: host.unreachable ? "error.main" : undefined }}
									>
										{host.unreachable}
									</TableCell>
									<TableCell
										align="right"
										sx={{ color: host.failed ? "error.main" : undefined }}
									>
										{host.failed}
									</TableCell>
									<TableCell align="right">{host.skipped}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Box>
			)}
		</Box>
	);
}

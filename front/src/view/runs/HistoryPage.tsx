import { useNavigate } from "react-router-dom";
import { Alert, Box, Divider, List, ListItemButton, Skeleton, Typography } from "@mui/material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { useRuns } from "@/core/api/queries";
import { formatDuration, formatRelative } from "@/core/format";
import { fontMono } from "@/config/theme";
import { StatusChip } from "@/view/components/StatusChip";
import { RecapBadges } from "@/view/components/RecapBadges";
import { EmptyState } from "@/view/components/EmptyState";

export function HistoryPage() {
	const navigate = useNavigate();
	const { data, isPending, error } = useRuns();

	return (
		<Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 980 }}>
			<Typography variant="h1">History</Typography>
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
					mt: 0.5,
					mb: 3,
				}}
			>
				Every run, newest first — output and recap are kept forever.
			</Typography>

			{error && <Alert severity="error">Could not load runs: {error.message}</Alert>}

			{isPending &&
				Array.from({ length: 8 }, (_, i) => (
					<Skeleton key={i} height={64} sx={{ transform: "none", mb: 1 }} />
				))}

			{data && data.length === 0 && (
				<EmptyState
					icon={<HistoryRoundedIcon />}
					title="No runs yet"
					hint="Launch a playbook from the Playbooks page; every execution lands here with its full log."
				/>
			)}

			<List disablePadding>
				{data?.map((run, index) => (
					<Box key={run.id}>
						{index > 0 && <Divider component="li" />}
						<ListItemButton
							onClick={() => void navigate(`/runs/${run.id}`)}
							sx={{ px: 1.5, py: 1.5, borderRadius: 2, gap: 2, alignItems: "center" }}
						>
							<Box sx={{ width: 118, flexShrink: 0 }}>
								<StatusChip status={run.status} />
							</Box>
							<Box sx={{ minWidth: 0, flex: 1 }}>
								<Typography
									noWrap
									sx={{ fontFamily: fontMono, fontSize: 13, fontWeight: 600 }}
								>
									{run.playbook}
								</Typography>
								<Typography
									variant="body2"
									noWrap
									sx={{
										color: "text.secondary",
									}}
								>
									{run.options.limit
										? `--limit ${run.options.limit}`
										: "whole inventory"}
									{run.options.check && " · --check"}
									{run.options.diff && " · --diff"}
									{" · "}
									{run.requestedBy}
								</Typography>
							</Box>
							<Box sx={{ flexShrink: 0, display: { xs: "none", sm: "block" } }}>
								<RecapBadges recap={run.recap} />
							</Box>
							<Box sx={{ width: 130, flexShrink: 0, textAlign: "right" }}>
								<Typography
									variant="body2"
									sx={{
										color: "text.secondary",
									}}
								>
									{formatRelative(run.createdAt)}
								</Typography>
								{run.startedAt && run.finishedAt && (
									<Typography
										sx={{
											color: "text.secondary",
											fontFamily: fontMono,
											fontSize: 11,
										}}
									>
										{formatDuration(run.startedAt, run.finishedAt)}
									</Typography>
								)}
							</Box>
						</ListItemButton>
					</Box>
				))}
			</List>
		</Box>
	);
}

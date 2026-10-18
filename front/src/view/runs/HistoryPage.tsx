import { Link as RouterLink } from "react-router";
import { Alert, Box, List, ListItem, ListItemButton, Skeleton, Typography } from "@mui/material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { useRuns } from "@/core/api/queries";
import { formatDuration, formatRelative } from "@/core/format";
import { mono } from "@/config/theme";
import { StatusChip } from "@/view/components/StatusChip";
import { RecapBadges } from "@/view/components/RecapBadges";
import { EmptyState } from "@/view/components/EmptyState";
import { DraftRunChip } from "@/view/drafts/DraftRunChip";
import { RunAgainButton } from "./RunAgainButton";

export function HistoryPage() {
	const { data, isPending, error } = useRuns();

	return (
		<Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 1180 }}>
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
					<ListItem
						key={run.id}
						disablePadding
						sx={{
							display: "grid",
							gridTemplateColumns: {
								xs: "minmax(0, 1fr)",
								sm: "minmax(0, 1fr) auto",
							},
							borderTop: index > 0 ? 1 : 0,
							borderColor: "divider",
						}}
					>
						<ListItemButton
							component={RouterLink}
							to={`/runs/${run.id}`}
							sx={{
								px: 1.5,
								py: 1.5,
								borderRadius: 2,
								gap: 2,
								alignItems: "center",
								display: "grid",
								gridTemplateColumns: {
									xs: "auto minmax(0, 1fr)",
									md: "118px minmax(0, 1fr) auto 130px",
								},
							}}
						>
							<Box sx={{ width: 118, flexShrink: 0 }}>
								<StatusChip status={run.status} />
							</Box>
							<Box sx={{ minWidth: 0, flex: 1 }}>
								<Typography noWrap sx={{ ...mono, fontSize: 13, fontWeight: 600 }}>
									{run.playbook}
								</Typography>
								{run.draft && <DraftRunChip draft={run.draft} link={false} />}
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
							<Box sx={{ flexShrink: 0, display: { xs: "none", md: "block" } }}>
								<RecapBadges recap={run.recap} />
							</Box>
							<Box
								sx={{
									gridColumn: { xs: 2, md: "auto" },
									flexShrink: 0,
									textAlign: { xs: "left", md: "right" },
								}}
							>
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
											...mono,
											fontSize: 11,
										}}
									>
										{formatDuration(run.startedAt, run.finishedAt)}
									</Typography>
								)}
							</Box>
						</ListItemButton>
						<Box sx={{ px: 1.5, pb: { xs: 1.5, sm: 0 }, justifySelf: "end" }}>
							<RunAgainButton run={run} />
						</Box>
					</ListItem>
				))}
			</List>
		</Box>
	);
}

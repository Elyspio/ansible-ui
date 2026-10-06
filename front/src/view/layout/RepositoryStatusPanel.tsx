import { Alert, Box, Button, Chip, CircularProgress, Tooltip, Typography } from "@mui/material";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { useSynchronizeRepository } from "@/core/api/mutations";
import { useRepositoryStatus } from "@/core/api/queries";
import { fontMono } from "@/config/theme";

function formatDate(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "Jamais";
}

export function RepositoryStatusPanel() {
	const { data } = useRepositoryStatus();
	const synchronize = useSynchronizeRepository();
	if (!data) return null;

	return (
		<Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
			{data.isDegraded && (
				<Alert severity="warning" sx={{ mb: 1.25, py: 0 }}>
					<Tooltip title={data.error ?? "Synchronisation du Dépôt Ansible impossible"}>
						<Typography noWrap sx={{ maxWidth: 160, fontSize: 11.5 }}>
							Dépôt Ansible indisponible : {data.error}
						</Typography>
					</Tooltip>
				</Alert>
			)}
			<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
				<Tooltip
					title={`Dernière sonde : ${formatDate(data.lastCheckedAt)} · Dernière synchronisation : ${formatDate(data.lastSynchronizedAt)}`}
				>
					<Chip
						size="small"
						color={data.isDegraded ? "warning" : "success"}
						variant="outlined"
						label={data.revision ? data.revision.slice(0, 8) : "Aucune révision"}
						sx={{ fontFamily: fontMono, fontSize: 10.5, maxWidth: 120 }}
					/>
				</Tooltip>
				<Button
					size="small"
					startIcon={
						data.isSynchronizing || synchronize.isPending ? (
							<CircularProgress size={13} />
						) : (
							<SyncRoundedIcon />
						)
					}
					disabled={data.isSynchronizing || synchronize.isPending}
					onClick={() => synchronize.mutate()}
					sx={{ minWidth: 0, fontSize: 11 }}
				>
					Synchroniser
				</Button>
			</Box>
			<Typography
				sx={{
					color: "text.secondary",
					mt: 0.75,
					fontFamily: fontMono,
					fontSize: 10,
				}}
			>
				Révision distante {data.remoteRevision?.slice(0, 8) ?? "inconnue"}
				{data.isRunningPlaybook ? " · Run actif" : ""}
			</Typography>
		</Box>
	);
}

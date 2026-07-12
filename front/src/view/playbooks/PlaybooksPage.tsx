import { useMemo, useState } from "react";
import {
	Alert,
	Box,
	Button,
	Divider,
	List,
	ListItem,
	ListItemText,
	Skeleton,
	Typography,
} from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FolderOffRoundedIcon from "@mui/icons-material/FolderOffRounded";
import { usePlaybooks } from "@/core/api/queries";
import type { Playbook } from "@/core/api/types";
import { fontMono } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";
import { LaunchDialog } from "./LaunchDialog";

export function PlaybooksPage() {
	const { data, isPending, error, refetch } = usePlaybooks();
	const [selected, setSelected] = useState<Playbook | null>(null);

	const byCategory = useMemo(() => {
		const groups = new Map<string, Playbook[]>();
		for (const playbook of data ?? []) {
			const list = groups.get(playbook.category) ?? [];
			list.push(playbook);
			groups.set(playbook.category, list);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [data]);

	return (
		<Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 860 }}>
			<Typography variant="h1">Playbooks</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
				Discovered on the control node — refreshed with git pull.
			</Typography>

			{error && (
				<Alert
					severity="error"
					action={
						<Button color="inherit" size="small" onClick={() => void refetch()}>
							Retry
						</Button>
					}
				>
					Could not reach the control node: {error.message}
				</Alert>
			)}

			{isPending &&
				Array.from({ length: 6 }, (_, i) => (
					<Skeleton key={i} height={52} sx={{ transform: "none", mb: 1 }} />
				))}

			{data && data.length === 0 && (
				<EmptyState
					icon={<FolderOffRoundedIcon />}
					title="No playbooks found"
					hint="The playbooks/ directory of the configured repository is empty on the control node."
				/>
			)}

			{byCategory.map(([category, playbooks]) => (
				<Box key={category} sx={{ mb: 3.5 }}>
					<Typography variant="overline" color="text.secondary">
						{category}
					</Typography>
					<List disablePadding sx={{ mt: 0.5 }}>
						{playbooks.map((playbook, index) => (
							<Box key={playbook.path}>
								{index > 0 && <Divider component="li" />}
								<ListItem
									disablePadding
									sx={{ py: 1.25, gap: 2, display: "flex", alignItems: "center" }}
									secondaryAction={
										<Button
											size="small"
											variant="outlined"
											startIcon={<PlayArrowRoundedIcon />}
											onClick={() => setSelected(playbook)}
										>
											Run
										</Button>
									}
								>
									<ListItemText
										primary={playbook.name}
										secondary={playbook.path}
										slotProps={{
											primary: { sx: { fontWeight: 600, fontSize: 14 } },
											secondary: {
												sx: { fontFamily: fontMono, fontSize: 11.5 },
											},
										}}
									/>
								</ListItem>
							</Box>
						))}
					</List>
				</Box>
			))}

			<LaunchDialog playbook={selected} onClose={() => setSelected(null)} />
		</Box>
	);
}

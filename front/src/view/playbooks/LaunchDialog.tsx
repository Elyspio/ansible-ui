import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	FormHelperText,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useInventory, useRuns } from "@/core/api/queries";
import { useSubmitRun } from "@/core/api/mutations";
import type { Playbook } from "@/core/api/types";
import { fontMono } from "@/config/theme";

/** Launch options — the only knobs of v1: --limit, --check, --diff. */
export function LaunchDialog({
	playbook,
	onClose,
}: {
	playbook: Playbook | null;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const inventory = useInventory();
	const runs = useRuns();
	const submit = useSubmitRun();

	const [limit, setLimit] = useState<string[]>([]);
	const [check, setCheck] = useState(false);
	const [diff, setDiff] = useState(false);

	const targets = useMemo(() => {
		if (!inventory.data) return [];
		const groups = inventory.data.groups.map((g) => g.name);
		return [...groups, ...inventory.data.hosts];
	}, [inventory.data]);

	const busy = runs.data?.some((r) => r.status === "Running" || r.status === "Queued") ?? false;

	const close = () => {
		setLimit([]);
		setCheck(false);
		setDiff(false);
		onClose();
	};

	const launch = () => {
		if (!playbook) return;
		submit.mutate(
			{
				playbook: playbook.path,
				limit: limit.length > 0 ? limit.join(",") : null,
				check,
				diff,
			},
			{
				onSuccess: (run) => {
					close();
					void navigate(`/runs/${run.id}`);
				},
				onError: (error) =>
					enqueueSnackbar(`Failed to submit the run: ${error.message}`, {
						variant: "error",
					}),
			},
		);
	};

	return (
		<Dialog open={playbook !== null} onClose={close} fullWidth maxWidth="sm">
			<DialogTitle>
				Run playbook
				<Typography
					sx={{
						color: "text.secondary",
						fontFamily: fontMono,
						fontSize: 12.5,
					}}
				>
					{playbook?.path}
				</Typography>
			</DialogTitle>
			<DialogContent sx={{ display: "grid", gap: 2.5, pt: "8px !important" }}>
				{busy && (
					<Alert severity="info" variant="outlined">
						A run is already active — this one will wait in the queue.
					</Alert>
				)}

				<Box>
					<Autocomplete
						multiple
						freeSolo
						options={targets}
						value={limit}
						onChange={(_, value) => setLimit(value)}
						loading={inventory.isPending}
						renderInput={(params) => (
							<TextField {...params} label="Limit" placeholder="whole inventory" />
						)}
					/>
					<FormHelperText>
						--limit — groups or hosts from the inventory; empty targets everything the
						playbook declares.
					</FormHelperText>
				</Box>

				<Box sx={{ display: "grid", gap: 0.5 }}>
					<FormControlLabel
						control={<Switch checked={check} onChange={(_, v) => setCheck(v)} />}
						label={
							<Box>
								<Typography sx={{ fontSize: 14, fontWeight: 600 }}>
									Check mode
								</Typography>
								<Typography
									variant="body2"
									sx={{
										color: "text.secondary",
									}}
								>
									--check — dry run, nothing is applied on the hosts.
								</Typography>
							</Box>
						}
					/>
					<FormControlLabel
						control={<Switch checked={diff} onChange={(_, v) => setDiff(v)} />}
						label={
							<Box>
								<Typography sx={{ fontSize: 14, fontWeight: 600 }}>
									Show diff
								</Typography>
								<Typography
									variant="body2"
									sx={{
										color: "text.secondary",
									}}
								>
									--diff — show what changes on files and templates.
								</Typography>
							</Box>
						}
					/>
				</Box>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" onClick={close}>
					Cancel
				</Button>
				<Button variant="contained" onClick={launch} loading={submit.isPending}>
					{busy ? "Queue run" : "Launch"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

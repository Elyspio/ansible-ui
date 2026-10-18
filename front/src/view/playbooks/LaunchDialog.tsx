import { useState } from "react";
import { useNavigate } from "react-router";
import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useRuns } from "@/core/api/queries";
import { useSubmitRun } from "@/core/api/mutations";
import type { Playbook } from "@/core/api/types";
import { mono } from "@/config/theme";
import { defaultRunOptions, RunOptionsFields, toRunRequest } from "./RunOptionsFields";

export function LaunchDialog({
	playbook,
	onClose,
}: {
	playbook: Playbook | null;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const runs = useRuns();
	const submit = useSubmitRun();
	const [options, setOptions] = useState(defaultRunOptions);

	const busy = runs.data?.some((r) => r.status === "Running" || r.status === "Queued") ?? false;

	const close = () => {
		setOptions(defaultRunOptions);
		onClose();
	};

	const launch = () => {
		if (!playbook) return;
		submit.mutate(toRunRequest(playbook.path, options), {
			onSuccess: (run) => {
				close();
				void navigate(`/runs/${run.id}`);
			},
			onError: (error) =>
				enqueueSnackbar(`Failed to submit the run: ${error.message}`, {
					variant: "error",
				}),
		});
	};

	return (
		<Dialog open={playbook !== null} onClose={close} fullWidth maxWidth="sm">
			<DialogTitle>
				Run playbook
				<Typography
					sx={{
						color: "text.secondary",
						...mono,
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
				<RunOptionsFields value={options} onChange={setOptions} />
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

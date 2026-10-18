import { useState } from "react";
import { useNavigate } from "react-router";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useDraftPlaybooks, useRuns } from "@/core/api/queries";
import { errorMessage, useSubmitDraftRun } from "@/core/api/mutations";
import type { Draft, Playbook } from "@/core/api/types";
import { mono } from "@/config/theme";
import {
	defaultRunOptions,
	RunOptionsFields,
	toRunRequest,
} from "@/view/playbooks/RunOptionsFields";

/** Run de brouillon: any playbook of the pushed Brouillon commit, through the shared Run queue. */
export function DraftLaunchDialog({
	draft,
	revision,
	open,
	initialPlaybook,
	onClose,
}: {
	draft: Draft;
	revision: string;
	open: boolean;
	initialPlaybook: string | null;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const playbooks = useDraftPlaybooks(draft.id, open);
	const runs = useRuns();
	const submit = useSubmitDraftRun(draft.id);
	const [playbook, setPlaybook] = useState<Playbook | null>(null);
	const [options, setOptions] = useState(defaultRunOptions);

	const busy = runs.data?.some((r) => r.status === "Running" || r.status === "Queued") ?? false;

	// The file open in the workspace preselects its playbook until another one is picked.
	const selected =
		playbook ?? playbooks.data?.find((candidate) => candidate.path === initialPlaybook) ?? null;

	const launch = () => {
		if (!selected) return;
		submit.mutate(toRunRequest(selected.path, options), {
			onSuccess: (run) => {
				onClose();
				void navigate(`/runs/${run.id}`);
			},
			onError: (error) =>
				enqueueSnackbar(`Could not start the run: ${errorMessage(error)}`, {
					variant: "error",
				}),
		});
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="sm"
			slotProps={{
				transition: {
					onEnter: () => {
						setOptions(defaultRunOptions);
						setPlaybook(null);
					},
				},
			}}
		>
			<DialogTitle>Run this draft</DialogTitle>
			<DialogContent sx={{ display: "grid", gap: 2.5, pt: "8px !important" }}>
				<Alert severity="warning" variant="outlined">
					Runs unmerged code from{" "}
					<Box component="span" sx={{ ...mono }}>
						{draft.branch}
					</Box>{" "}
					at{" "}
					<Box component="span" sx={{ ...mono }}>
						{revision.slice(0, 8)}
					</Box>{" "}
					on your managed hosts. Nobody has reviewed it yet.
				</Alert>
				{busy && (
					<Alert severity="info" variant="outlined">
						A run is already active — this one will wait in the queue.
					</Alert>
				)}
				<Autocomplete
					options={playbooks.data ?? []}
					loading={playbooks.isPending}
					value={selected}
					onChange={(_, value) => setPlaybook(value)}
					getOptionLabel={(option) => option.path}
					isOptionEqualToValue={(a, b) => a.path === b.path}
					renderInput={(params) => <TextField {...params} label="Playbook" />}
				/>
				<RunOptionsFields value={options} onChange={setOptions} />
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="contained"
					color="secondary"
					disabled={!selected}
					onClick={launch}
					loading={submit.isPending}
				>
					{busy ? "Queue run" : "Run draft"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

import { useState } from "react";
import { useNavigate } from "react-router";
import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
	Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { errorMessage, useCreateDraft } from "@/core/api/mutations";

/** Starts a Brouillon from the Révision distante and opens it, optionally on one file. */
export function CreateDraftDialog({
	open,
	initialTitle = "",
	openPath,
	onClose,
}: {
	open: boolean;
	initialTitle?: string;
	/** File to open once the draft exists. */
	openPath?: string | null;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const create = useCreateDraft();
	const [title, setTitle] = useState(initialTitle);

	const submit = () => {
		create.mutate(title, {
			onSuccess: (draft) => {
				onClose();
				void navigate(
					`/drafts/${draft.id}${openPath ? `?path=${encodeURIComponent(openPath)}` : ""}`,
				);
			},
			onError: (error) =>
				enqueueSnackbar(`Could not create the draft: ${errorMessage(error)}`, {
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
			slotProps={{ transition: { onEnter: () => setTitle(initialTitle) } }}
		>
			<DialogTitle>New draft</DialogTitle>
			<DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
				<Typography variant="body2" sx={{ color: "text.secondary" }}>
					A draft is a copy of the Dépôt Ansible on its own branch. Your edits save as you
					type; pushing opens a pull request.
				</Typography>
				<TextField
					autoFocus
					label="Title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && title.trim()) submit();
					}}
					slotProps={{ htmlInput: { maxLength: 120 } }}
					helperText="Names the branch and the pull request."
				/>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="contained"
					disabled={!title.trim()}
					loading={create.isPending}
					onClick={submit}
				>
					Create draft
				</Button>
			</DialogActions>
		</Dialog>
	);
}

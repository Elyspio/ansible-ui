import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { createDraft, readDraftFile, writeDraftFile } from "@/core/api/draftFiles";
import { errorMessage } from "@/core/api/mutations";
import { qk } from "@/core/api/queries";
import {
	DraftTargetField,
	draftTitle,
	targetReady,
	type DraftTarget,
} from "@/view/drafts/DraftTargetField";
import { hostVarsPath } from "./hostsFile";

/** Opens a host's vars.yml in a Brouillon, creating the file empty when the host has none yet. */
export function EditHostVarsDialog({
	host,
	onClose,
}: {
	host: string | null;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const [target, setTarget] = useState<DraftTarget>({ kind: "new", title: "" });
	const [busy, setBusy] = useState(false);
	const suggestion = host ? `Update vars of ${host}` : "";

	const open = async () => {
		if (!host) return;
		setBusy(true);
		let id: string | null = null;
		try {
			id =
				target.kind === "draft"
					? target.id
					: (await createDraft(draftTitle(target, suggestion))).id;
			const path = hostVarsPath(host);
			if (!(await readDraftFile(id, path))) await writeDraftFile(id, path, "", null);
			void qc.invalidateQueries({ queryKey: qk.drafts, exact: true });
			void qc.invalidateQueries({ queryKey: qk.draftFiles(id) });
			void qc.invalidateQueries({ queryKey: qk.draft(id), exact: true });
			onClose();
			void navigate(`/drafts/${id}?path=${encodeURIComponent(path)}`);
		} catch (error) {
			enqueueSnackbar(`Could not open the vars of ${host}: ${errorMessage(error)}`, {
				variant: "error",
			});
			if (id && target.kind === "new") {
				void qc.invalidateQueries({ queryKey: qk.drafts, exact: true });
				onClose();
				void navigate(`/drafts/${id}`);
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open={host !== null}
			onClose={busy ? undefined : onClose}
			fullWidth
			maxWidth="sm"
			slotProps={{ transition: { onExited: () => setTarget({ kind: "new", title: "" }) } }}
		>
			<DialogTitle>Edit vars of {host}</DialogTitle>
			<DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
				<Typography variant="body2" sx={{ color: "text.secondary" }}>
					Opens <Box component="code">{host && hostVarsPath(host)}</Box> in a draft. Vault
					blocks stay encrypted.
				</Typography>
				<DraftTargetField value={target} onChange={setTarget} suggestedTitle={suggestion} />
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				<Button color="inherit" disabled={busy} onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="contained"
					loading={busy}
					disabled={!targetReady(target, suggestion)}
					onClick={() => void open()}
				>
					Open in draft
				</Button>
			</DialogActions>
		</Dialog>
	);
}

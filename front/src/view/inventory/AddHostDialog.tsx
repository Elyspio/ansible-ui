import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Alert,
	Autocomplete,
	Box,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
	Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { parseDocument } from "yaml";
import {
	createDraft,
	readDraftFile,
	readPublishedFile,
	validateDraftInventory,
	writeDraftFile,
} from "@/core/api/draftFiles";
import { errorMessage } from "@/core/api/mutations";
import { qk, usePublishedFiles } from "@/core/api/queries";
import type { InventoryValidation } from "@/core/api/types";
import { mono } from "@/config/theme";
import {
	DraftTargetField,
	draftTitle,
	targetReady,
	type DraftTarget,
} from "@/view/drafts/DraftTargetField";
import { LazyCodeEditor } from "@/view/editor/LazyCodeEditor";
import {
	addHost,
	hostsFilePath,
	hostVarsPath,
	listGroups,
	safeHostName,
	type NewHost,
} from "./hostsFile";

/** Router state handed to the Brouillon workspace so it shows the check that just ran. */
export interface InventoryCheckState {
	validation: InventoryValidation;
	/** Host just added, highlighted in the check. */
	host?: string;
}

const empty: NewHost = { host: "", groups: [], newGroup: "", ansibleHost: "" };

/**
 * Adds a host to inventory/hosts.yml in a Brouillon. The change is computed in the browser from
 * the file text and previewed as a diff, then written like any edit, and Ansible parses the result.
 */
export function AddHostDialog({
	open,
	draftId,
	beforeWrite,
	onClose,
}: {
	open: boolean;
	/** Fixed target (from a Brouillon workspace); otherwise the user picks or creates one. */
	draftId?: string;
	/** Flushes pending edits so the write starts from what the editor shows. */
	beforeWrite?: () => Promise<void>;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const { enqueueSnackbar } = useSnackbar();
	const published = usePublishedFiles();
	const [request, setRequest] = useState<NewHost>(empty);
	const [vars, setVars] = useState("");
	const [target, setTarget] = useState<DraftTarget>({ kind: "new", title: "" });
	const [step, setStep] = useState<"form" | "preview">("form");
	const [busy, setBusy] = useState(false);

	const sourceDraft = draftId ?? (target.kind === "draft" ? target.id : null);
	const revision = published.data?.revision;
	// Groups and preview come from the file the change will land on.
	const source = useQuery({
		queryKey: qk.addHostSource(sourceDraft, revision),
		queryFn: async () =>
			sourceDraft
				? ((await readDraftFile(sourceDraft, hostsFilePath))?.content ?? null)
				: (await readPublishedFile(revision!, hostsFilePath)).content,
		enabled: open && (!!sourceDraft || !!revision),
		staleTime: 0,
	});

	const groups = useMemo(() => {
		try {
			return source.data ? listGroups(source.data) : [];
		} catch {
			return [];
		}
	}, [source.data]);

	const host = request.host.trim();
	const suggestion = host ? `Add host ${host}` : "";
	const varsError = useMemo(() => {
		if (!vars.trim()) return null;
		const doc = parseDocument(vars);
		return doc.errors[0]?.message ?? null;
	}, [vars]);
	const preview = useMemo(() => {
		if (!source.data) return { text: null, error: null };
		try {
			return { text: addHost(source.data, request), error: null };
		} catch (error) {
			return { text: null, error: errorMessage(error) };
		}
	}, [source.data, request]);

	const nameError =
		host && !safeHostName.test(host) ? "Letters, digits, dot, dash and underscore" : null;
	const ready =
		!!host &&
		!nameError &&
		!varsError &&
		(request.groups.length > 0 || !!request.newGroup?.trim()) &&
		(draftId !== undefined || targetReady(target, suggestion));

	const reset = () => {
		setRequest(empty);
		setVars("");
		setTarget({ kind: "new", title: "" });
		setStep("form");
	};

	const apply = async () => {
		setBusy(true);
		let id = sourceDraft;
		try {
			await beforeWrite?.();
			if (!id) id = (await createDraft(draftTitle(target, suggestion))).id;
			const file = await readDraftFile(id, hostsFilePath);
			if (file?.content == null)
				throw new Error(`${hostsFilePath} is missing from the draft`);
			if (file.content !== source.data) {
				await source.refetch();
				setStep("form");
				throw new Error(
					`${hostsFilePath} changed. Review the updated diff before adding the host`,
				);
			}
			if (vars.trim() && (await readDraftFile(id, hostVarsPath(host))))
				throw new Error(`${hostVarsPath(host)} already exists: edit it in the draft`);
			await writeDraftFile(id, hostsFilePath, addHost(file.content, request), file.hash);
			if (vars.trim())
				await writeDraftFile(
					id,
					hostVarsPath(host),
					vars.endsWith("\n") ? vars : `${vars}\n`,
					null,
				);
			const parsed = await validateDraftInventory(id);
			const requiredGroups = [
				...request.groups,
				...(request.newGroup?.trim() ? [request.newGroup.trim()] : []),
			];
			const missing = requiredGroups.filter(
				(name) =>
					!parsed.groups.some(
						(group) => group.name === name && group.hosts.includes(host),
					),
			);
			const validation =
				parsed.valid && (!parsed.hosts.includes(host) || missing.length > 0)
					? {
							...parsed,
							valid: false,
							error: `Ansible did not find ${host} in every selected group. Review the draft inventory before pushing.`,
						}
					: parsed;
			onClose();
			void navigate(`/drafts/${id}?path=${encodeURIComponent(hostsFilePath)}&view=diff`, {
				state: { validation, host } satisfies InventoryCheckState,
			});
		} catch (error) {
			enqueueSnackbar(`Could not add ${host}: ${errorMessage(error)}`, { variant: "error" });
			// A draft created before the failure is real: open it rather than leave it orphaned.
			if (id && id !== sourceDraft) {
				onClose();
				void navigate(`/drafts/${id}`);
			}
		} finally {
			setBusy(false);
			if (id) {
				void qc.invalidateQueries({ queryKey: qk.drafts, exact: true });
				void qc.invalidateQueries({ queryKey: qk.draft(id), exact: true });
				void qc.invalidateQueries({ queryKey: qk.draftFiles(id) });
				void qc.invalidateQueries({ queryKey: qk.draftFile(id, hostsFilePath) });
			}
		}
	};

	const set = (patch: Partial<NewHost>) => setRequest((current) => ({ ...current, ...patch }));

	return (
		<Dialog
			open={open}
			onClose={busy ? undefined : onClose}
			fullWidth
			maxWidth={step === "preview" ? "lg" : "sm"}
			slotProps={{ transition: { onExited: reset } }}
		>
			<DialogTitle>{step === "form" ? "Add host" : `Review ${hostsFilePath}`}</DialogTitle>
			{step === "form" ? (
				<DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
					<TextField
						autoFocus
						label="Host name"
						placeholder="backup-pbs.elylan"
						value={request.host}
						onChange={(event) => set({ host: event.target.value })}
						error={!!nameError}
						helperText={nameError ?? "As Ansible will know it, usually the FQDN"}
						slotProps={{ htmlInput: { spellCheck: false, sx: { ...mono } } }}
					/>
					<Autocomplete
						multiple
						options={groups}
						value={request.groups}
						loading={source.isPending}
						onChange={(_, value) => set({ groups: value })}
						renderValue={(value, getItemProps) =>
							value.map((option, index) => {
								const { key, ...props } = getItemProps({ index });
								return <Chip key={key} size="small" label={option} {...props} />;
							})
						}
						renderInput={(params) => <TextField {...params} label="Groups" />}
					/>
					<Box sx={{ display: "grid", gridTemplateColumns: { sm: "1fr 1fr" }, gap: 2 }}>
						<TextField
							label="New group"
							placeholder="optional"
							value={request.newGroup}
							onChange={(event) => set({ newGroup: event.target.value })}
							helperText="Created under all.children"
							slotProps={{
								inputLabel: { shrink: true },
								htmlInput: { spellCheck: false, sx: { ...mono } },
							}}
						/>
						<TextField
							label="ansible_host"
							placeholder="optional, e.g. 10.0.10.74"
							value={request.ansibleHost}
							onChange={(event) => set({ ansibleHost: event.target.value })}
							helperText="Address Ansible connects to"
							slotProps={{
								inputLabel: { shrink: true },
								htmlInput: { spellCheck: false, sx: { ...mono } },
							}}
						/>
					</Box>
					<TextField
						label="Host vars"
						placeholder={"optional YAML, e.g.\nbackup_target: unifi"}
						multiline
						minRows={3}
						value={vars}
						onChange={(event) => setVars(event.target.value)}
						error={!!varsError}
						helperText={
							varsError ??
							(host ? `Creates ${hostVarsPath(host)}` : "Creates the host's vars.yml")
						}
						slotProps={{
							inputLabel: { shrink: true },
							htmlInput: { spellCheck: false, sx: { ...mono, fontSize: 13 } },
						}}
					/>
					{draftId === undefined && (
						<Box sx={{ display: "grid", gap: 1 }}>
							<Typography variant="body2" sx={{ color: "text.secondary" }}>
								Write the change to
							</Typography>
							<DraftTargetField
								value={target}
								onChange={setTarget}
								suggestedTitle={suggestion}
							/>
						</Box>
					)}
					{source.error && (
						<Alert severity="error">
							Could not read {hostsFilePath}: {errorMessage(source.error)}
						</Alert>
					)}
					{host && !nameError && preview.error && (
						<Alert severity="warning">{preview.error}</Alert>
					)}
				</DialogContent>
			) : (
				<DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
					<Typography variant="body2" sx={{ color: "text.secondary" }}>
						Only the new lines change; comments and order stay as they are. Ansible
						parses the result right after the write.
					</Typography>
					<Box
						sx={{
							height: 420,
							borderRadius: 1,
							overflow: "hidden",
							border: 1,
							borderColor: "divider",
						}}
					>
						<LazyCodeEditor
							modelPath="file:///preview/add-host/inventory/hosts.yml"
							filePath={hostsFilePath}
							value={preview.text ?? ""}
							original={source.data ?? ""}
						/>
					</Box>
					{vars.trim() && (
						<Typography variant="body2" sx={{ color: "text.secondary" }}>
							Also creates <Box component="code">{hostVarsPath(host)}</Box>.
						</Typography>
					)}
				</DialogContent>
			)}
			<DialogActions sx={{ px: 3, pb: 2.5 }}>
				{step === "form" ? (
					<>
						<Button color="inherit" onClick={onClose}>
							Cancel
						</Button>
						<Button
							variant="contained"
							disabled={!ready || !preview.text}
							onClick={() => setStep("preview")}
						>
							Review change
						</Button>
					</>
				) : (
					<>
						<Button color="inherit" disabled={busy} onClick={() => setStep("form")}>
							Back
						</Button>
						<Button variant="contained" loading={busy} onClick={() => void apply()}>
							Add host
						</Button>
					</>
				)}
			</DialogActions>
		</Dialog>
	);
}

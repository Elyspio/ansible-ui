import { Alert } from "@mui/material";
import type { RepositoryFile } from "@/core/api/types";

/** Why a file cannot be edited here, and where to edit it instead. */
export function FileNotice({ file }: { file: RepositoryFile }) {
	if (file.isVault)
		return (
			<Alert severity="info" variant="outlined" sx={{ borderRadius: 0, border: 0 }}>
				Ansible Vault file: shown encrypted and read-only. Edit it with ansible-vault on the
				Rebond.
			</Alert>
		);
	if (file.isBinary)
		return (
			<Alert severity="info" variant="outlined" sx={{ borderRadius: 0, border: 0 }}>
				Binary file: its content is not shown.
			</Alert>
		);
	if (file.isTooLarge)
		return (
			<Alert severity="info" variant="outlined" sx={{ borderRadius: 0, border: 0 }}>
				Larger than 1 MiB: its content is not shown.
			</Alert>
		);
	return null;
}

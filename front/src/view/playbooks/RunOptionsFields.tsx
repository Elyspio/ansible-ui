import { useMemo } from "react";
import {
	Autocomplete,
	Box,
	FormControlLabel,
	FormHelperText,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { useInventory } from "@/core/api/queries";

export interface RunOptionsValue {
	limit: string[];
	check: boolean;
	diff: boolean;
}

export const defaultRunOptions: RunOptionsValue = { limit: [], check: false, diff: false };

/** Launch options — the only knobs of v1: --limit, --check, --diff. */
export function RunOptionsFields({
	value,
	onChange,
}: {
	value: RunOptionsValue;
	onChange: (value: RunOptionsValue) => void;
}) {
	const inventory = useInventory();
	const targets = useMemo(() => {
		if (!inventory.data) return [];
		const groups = inventory.data.groups.map((g) => g.name);
		return [...groups, ...inventory.data.hosts.map((h) => h.name)];
	}, [inventory.data]);

	return (
		<>
			<Box>
				<Autocomplete
					multiple
					freeSolo
					options={targets}
					value={value.limit}
					onChange={(_, limit) => onChange({ ...value, limit })}
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
					control={
						<Switch
							checked={value.check}
							onChange={(_, check) => onChange({ ...value, check })}
						/>
					}
					label={
						<Box>
							<Typography sx={{ fontSize: 14, fontWeight: 600 }}>
								Check mode
							</Typography>
							<Typography variant="body2" sx={{ color: "text.secondary" }}>
								--check — dry run, nothing is applied on the hosts.
							</Typography>
						</Box>
					}
				/>
				<FormControlLabel
					control={
						<Switch
							checked={value.diff}
							onChange={(_, diff) => onChange({ ...value, diff })}
						/>
					}
					label={
						<Box>
							<Typography sx={{ fontSize: 14, fontWeight: 600 }}>
								Show diff
							</Typography>
							<Typography variant="body2" sx={{ color: "text.secondary" }}>
								--diff — show what changes on files and templates.
							</Typography>
						</Box>
					}
				/>
			</Box>
		</>
	);
}

export function toRunRequest(playbook: string, options: RunOptionsValue) {
	return {
		playbook,
		limit: options.limit.length > 0 ? options.limit.join(",") : null,
		check: options.check,
		diff: options.diff,
	};
}

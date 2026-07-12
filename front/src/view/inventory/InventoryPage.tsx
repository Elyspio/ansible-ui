import { useState } from "react";
import {
	Alert,
	Box,
	Chip,
	CircularProgress,
	Drawer,
	IconButton,
	Skeleton,
	Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import { useHostVars, useInventory } from "@/core/api/queries";
import { fontMono, terminal } from "@/config/theme";
import { EmptyState } from "@/view/components/EmptyState";

export function InventoryPage() {
	const { data, isPending, error } = useInventory();
	const [selectedHost, setSelectedHost] = useState<string | null>(null);
	const vars = useHostVars(selectedHost);

	return (
		<Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 980 }}>
			<Typography variant="h1">Inventory</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
				Read-only view of the control node inventory. Vault-encrypted values never leave it.
			</Typography>

			{error && <Alert severity="error">Could not load the inventory: {error.message}</Alert>}

			{isPending &&
				Array.from({ length: 4 }, (_, i) => (
					<Skeleton key={i} height={72} sx={{ transform: "none", mb: 1.5 }} />
				))}

			{data && data.groups.length === 0 && (
				<EmptyState
					icon={<DnsRoundedIcon />}
					title="Empty inventory"
					hint="ansible-inventory returned no group on the control node."
				/>
			)}

			<Box sx={{ display: "grid", gap: 3 }}>
				{data?.groups.map((group) => (
					<Box key={group.name}>
						<Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
							<Typography variant="overline" color="text.secondary">
								{group.name}
							</Typography>
							<Typography
								sx={{ fontFamily: fontMono, fontSize: 11 }}
								color="text.secondary"
							>
								{group.hosts.length > 0 && `${group.hosts.length} hosts`}
								{group.children.length > 0 && ` → ${group.children.join(", ")}`}
							</Typography>
						</Box>
						<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
							{group.hosts.map((host) => (
								<Chip
									key={host}
									label={host}
									variant="outlined"
									onClick={() => setSelectedHost(host)}
									sx={{ fontFamily: fontMono, fontSize: 12 }}
								/>
							))}
						</Box>
					</Box>
				))}
			</Box>

			<Drawer
				anchor="right"
				open={selectedHost !== null}
				onClose={() => setSelectedHost(null)}
				slotProps={{ paper: { sx: { width: { xs: "100%", sm: 520 } } } }}
			>
				<Box sx={{ display: "flex", alignItems: "center", px: 2.5, py: 2, gap: 1 }}>
					<Typography variant="h5" sx={{ fontFamily: fontMono, flex: 1 }} noWrap>
						{selectedHost}
					</Typography>
					<IconButton size="small" onClick={() => setSelectedHost(null)}>
						<CloseRoundedIcon fontSize="small" />
					</IconButton>
				</Box>
				<Box sx={{ px: 2.5, pb: 2.5, flex: 1, display: "flex", flexDirection: "column" }}>
					<Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
						host_vars / vars.yml
					</Typography>
					{vars.isPending && selectedHost && (
						<Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
							<CircularProgress size={20} />
						</Box>
					)}
					{vars.isError && (
						<Alert severity="info" variant="outlined">
							No vars.yml for this host (or it could not be read).
						</Alert>
					)}
					{vars.data && (
						<Box
							component="pre"
							sx={{
								m: 0,
								flex: 1,
								overflow: "auto",
								bgcolor: terminal.background,
								color: terminal.text,
								border: `1px solid ${terminal.border}`,
								borderRadius: 2,
								px: 2,
								py: 1.5,
								fontFamily: terminal.fontFamily,
								fontSize: 12.5,
								lineHeight: 1.6,
								colorScheme: "dark",
							}}
						>
							{vars.data}
						</Box>
					)}
				</Box>
			</Drawer>
		</Box>
	);
}

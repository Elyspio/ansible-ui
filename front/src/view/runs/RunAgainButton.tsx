import { useNavigate } from "react-router";
import { Button, Tooltip } from "@mui/material";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { useSnackbar } from "notistack";
import { useMe } from "@/core/api/queries";
import { errorMessage, useRepeatRun } from "@/core/api/mutations";
import type { Run } from "@/core/api/types";

/** Reuses persisted settings; the API enforces editor access for a Run de brouillon. */
export function RunAgainButton({ run }: { run: Run }) {
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const me = useMe();
	const repeat = useRepeatRun();
	const permitted = !run.draft || me.data?.canEdit === true;
	const title = !permitted
		? "The editor role is required to repeat a draft run"
		: run.draft
			? `Same settings and draft commit ${run.draft.revision.slice(0, 8)}`
			: "Same settings, using the current Révision distante";
	return (
		<Tooltip title={title}>
			<span>
				<Button
					size="small"
					variant="outlined"
					startIcon={<ReplayRoundedIcon />}
					disabled={!permitted || repeat.isPending}
					loading={repeat.isPending}
					onClick={() => {
						if (repeat.isPending) return;
						repeat.mutate(run.id, {
							onSuccess: (created) => void navigate(`/runs/${created.id}`),
							onError: (error) =>
								enqueueSnackbar(`Could not run again: ${errorMessage(error)}`, {
									variant: "error",
								}),
						});
					}}
				>
					Run again
				</Button>
			</span>
		</Tooltip>
	);
}

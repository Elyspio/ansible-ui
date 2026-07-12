/** "2m 34s" style duration between two ISO dates (end defaults to now). */
export function formatDuration(start: string | null, end: string | null): string {
	if (!start) return "—";
	const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
	if (ms < 0) return "—";
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60);
		return `${hours}h ${minutes % 60}m`;
	}
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** Local date+time, compact. */
export function formatDateTime(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** "3 min ago" style relative time. */
export function formatRelative(iso: string | null): string {
	if (!iso) return "—";
	const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return formatDateTime(iso);
}

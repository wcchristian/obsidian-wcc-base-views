/** Calendar arithmetic preserves local dates across 23/25-hour DST days. */
export function calendarDay(date: Date): number {
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}
export function shiftDays(date: Date, days: number): Date {
	const shifted = new Date(date);
	shifted.setDate(shifted.getDate() + days);
	return shifted;
}

export const ZONES = { texas: "America/Chicago", barcelona: "Europe/Madrid" } as const;

export function displayTime(instant: string, zone: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid instant");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(date);
}

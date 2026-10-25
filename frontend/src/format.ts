const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
export const formatNumber = (value: number | null | undefined) =>
  value == null ? "—" : number.format(value);
export const formatSigned = (value: number | null) =>
  value == null
    ? "—"
    : `${value > 0 ? "+" : value < 0 ? "−" : ""}${number.format(Math.abs(value))}`;
export function formatDate(value: string, short = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
export const clock = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(value));
export function publication(value: string | null) {
  if (!value) return "Unavailable";
  return `${formatDate(value.slice(0, 10), true)}, ${clock(value)}`;
}

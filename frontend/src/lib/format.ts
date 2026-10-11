export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function relative(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return shortDate(iso);
}

export function daysLabel(days: number) {
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 60) return `In ${days} days`;
  if (days < 730) return `In ${Math.round(days / 30)} months`;
  return `In ${Math.floor(days / 365)} years`;
}

// Each shelf owns one pastel from the palette.
export const SHELF_STYLE: Record<string, { bg: string; ink: string }> = {
  Finance: { bg: "bg-mint", ink: "text-mint-ink" },
  Health: { bg: "bg-rose", ink: "text-rose-ink" },
  Identity: { bg: "bg-lav", ink: "text-lav-ink" },
  Home: { bg: "bg-cream", ink: "text-cream-ink" },
  Work: { bg: "bg-blue", ink: "text-blue-ink" },
  Legal: { bg: "bg-peach", ink: "text-peach-ink" },
  Education: { bg: "bg-sky-deep", ink: "text-blue-ink" },
  Other: { bg: "bg-mist", ink: "text-muted" },
};

export const SHELVES = Object.keys(SHELF_STYLE);

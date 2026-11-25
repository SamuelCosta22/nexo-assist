const TZ = "America/Sao_Paulo";

const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export const formatTime = (iso: string) => time.format(new Date(iso));

/** "16 out" (pt-BR would otherwise print "16 de out."). */
export function formatDayMonth(iso: string): string {
  const parts = dayMonth.formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")} ${pick("month").replace(".", "")}`;
}

export const formatDayMonthTime = (iso: string) => `${formatDayMonth(iso)}, ${formatTime(iso)}`;

const isSameDay = (a: Date, b: Date) => dayKey.format(a) === dayKey.format(b);

/** Label for a divider between days of messages: "Hoje", "Ontem" or "16 out". */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isSameDay(date, now)) return "Hoje";
  if (isSameDay(date, new Date(now.getTime() - 86_400_000))) return "Ontem";
  return formatDayMonth(iso);
}

/** "agora", "há 25 min", "há 3 h", "há 5 dias". */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** "13:43" when due today, otherwise "25 nov, 13:43". */
export function formatDeadline(iso: string, now: Date = new Date()): string {
  return isSameDay(new Date(iso), now) ? formatTime(iso) : formatDayMonthTime(iso);
}

/** List timestamp: time today, otherwise "ontem" or the short date. */
export function formatListTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isSameDay(date, now)) return formatTime(iso);
  if (isSameDay(date, new Date(now.getTime() - 86_400_000))) return "ontem";
  return formatDayMonth(iso);
}

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

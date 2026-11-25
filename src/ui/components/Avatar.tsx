import { initials } from "../lib/format";

const TONES = [
  "bg-primary-soft text-primary-text",
  "bg-violet-soft text-violet-text",
  "bg-success-soft text-success-text",
  "bg-warning-soft text-warning-text",
  "bg-danger-soft text-danger-text",
];

/** Stable color per person, derived from the name. */
function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? TONES[0]!;
}

export function Avatar({
  name,
  size = 32,
  online,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${toneFor(name)}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
      aria-hidden="true"
    >
      {initials(name)}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-success" />
      )}
    </span>
  );
}

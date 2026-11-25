/** A light-colour family for a name, the same every time: departments, periods, people. */
/* Their own hues, apart from the indigo chart ramp, so neighbouring
   departments and people are told apart at a glance. */
const TONES = [
  "#2b3990", // indigo
  "#0e8f7e", // teal
  "#c2410c", // orange
  "#7c3aed", // violet
  "#be185d", // pink
  "#2563eb", // blue
  "#4d7c0f", // green
  "#b91c1c", // red
] as const;

/** The same colour for the same name, every time. */
export function nameTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

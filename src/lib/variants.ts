/** Cartesian product of option axes: { color: [a, b], size: [s] } → [{ color: a, size: s }, { color: b, size: s }]. */
export function expandOptions(options: Record<string, string[]> = {}): Record<string, string>[] {
  return Object.entries(options).reduce<Record<string, string>[]>(
    (combos, [axis, values]) => combos.flatMap((c) => values.map((v) => ({ ...c, [axis]: v }))),
    [{}],
  );
}

export function cyclomatic(source: string): number {
  return source.split("if").length;
}

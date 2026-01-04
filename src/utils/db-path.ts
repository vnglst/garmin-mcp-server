import path from "path";

export function resolveDbPath(dbPath: string, importMetaUrl: string): string {
  const scriptDir = path.dirname(new URL(importMetaUrl).pathname);
  return path.resolve(scriptDir, "../..", dbPath);
}

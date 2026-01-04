import path from "path";

export function resolveDbPath(dbPath: string, importMetaUrl: string): string {
  const scriptDir = path.dirname(new URL(importMetaUrl).pathname);
  const projectRoot = path.resolve(scriptDir, "../..");
  const resolved = path.resolve(projectRoot, dbPath);

  const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
  if (!(resolved === projectRoot || resolved.startsWith(rootWithSep))) {
    throw new Error("Database path must resolve within the project directory.");
  }

  return resolved;
}

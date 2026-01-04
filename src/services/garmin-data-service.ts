import Database from "better-sqlite3";
import fs from "fs";
import { resolveDbPath } from "../utils/db-path.js";

export interface TableSchema {
  name: string;
  sql: string;
}

export class GarminDataService {
  private dbPath: string;

  constructor(dbPath: string = "data/garmin-data.db") {
    this.dbPath = resolveDbPath(dbPath, import.meta.url);

    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Database file not found at ${this.dbPath}. Please run the download script first.`);
    }
  }

  private getDatabase(): Database.Database {
    return new Database(this.dbPath, { readonly: true });
  }

  getSchema(): TableSchema[] {
    const db = this.getDatabase();
    try {
      const sql = `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`;
      return db.prepare(sql).all() as TableSchema[];
    } finally {
      db.close();
    }
  }

  runQuery(query: string): Record<string, unknown>[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new Error("Query cannot be empty.");
    }

    // Avoid pathological memory usage from extremely large requests.
    const maxChars = Math.max(1, parseInt(process.env.MAX_QUERY_CHARS || "50000", 10) || 50000);
    if (trimmed.length > maxChars) {
      throw new Error(`Query too large (max ${maxChars} characters).`);
    }

    // Allow a single statement only. Trailing semicolons are fine.
    const withoutTrailingSemicolons = trimmed.replace(/;+\s*$/, "");
    if (withoutTrailingSemicolons.includes(";")) {
      throw new Error("Only a single SELECT statement is allowed.");
    }

    // Require SELECT (or WITH ... SELECT). We also block common write/pragma keywords to
    // prevent bypasses like `WITH ... UPDATE ... RETURNING ...`.
    if (!/^(select|with)\b/i.test(withoutTrailingSemicolons)) {
      throw new Error("Only SELECT queries are allowed.");
    }

    const scrubbed = withoutTrailingSemicolons
      .replace(/'(?:''|[^'])*'/g, "''")
      .replace(/"(?:""|[^"])*"/g, '""')
      .replace(/`(?:``|[^`])*`/g, "``");

    if (/\b(insert|update|delete|drop|alter|create|attach|detach|pragma|reindex|vacuum|replace)\b/i.test(scrubbed)) {
      throw new Error("Only SELECT queries are allowed.");
    }

    const db = this.getDatabase();
    try {
      const stmt = db.prepare(withoutTrailingSemicolons);
      if (!stmt.reader) {
        throw new Error("Only SELECT queries are allowed.");
      }
      return stmt.all() as Record<string, unknown>[];
    } finally {
      db.close();
    }
  }
}

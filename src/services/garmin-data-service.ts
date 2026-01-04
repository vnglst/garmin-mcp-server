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
    if (!query.trim().toLowerCase().startsWith("select")) {
      throw new Error("Only SELECT queries are allowed.");
    }

    const db = this.getDatabase();
    try {
      return db.prepare(query).all() as Record<string, unknown>[];
    } finally {
      db.close();
    }
  }
}

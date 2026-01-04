import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export class GarminDataService {
  private dbPath: string;

  constructor(dbPath: string = "data/garmin-data.db") {
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    this.dbPath = path.resolve(scriptDir, "../..", dbPath);

    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Database file not found at ${this.dbPath}. Please run the download script first.`);
    }
  }

  private getDatabase(): Database.Database {
    return new Database(this.dbPath, { readonly: true });
  }

  getSchema(): any[] {
    const db = this.getDatabase();
    try {
      const sql = `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`;
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }

  runQuery(query: string): any[] {
    if (!query.trim().toLowerCase().startsWith("select")) {
      throw new Error("Only SELECT queries are allowed.");
    }

    const db = this.getDatabase();
    try {
      return db.prepare(query).all();
    } finally {
      db.close();
    }
  }
}

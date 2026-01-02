import sqlite3 from "sqlite3";
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

  private async getDatabase(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error(`Failed to open database: ${err.message}`));
          return;
        }
        resolve(db);
      });
    });
  }

  private async closeDatabase(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve) => {
      db.close(() => resolve());
    });
  }

  async getSchema(): Promise<any[]> {
    const db = await this.getDatabase();
    try {
      return new Promise((resolve, reject) => {
        const sql = `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`;
        db.all(sql, [], (err, rows) => {
          if (err) {
            reject(new Error(`Database query error: ${err.message}`));
            return;
          }
          resolve(rows || []);
        });
      });
    } finally {
      await this.closeDatabase(db);
    }
  }

  async runQuery(query: string): Promise<any[]> {
    if (!query.trim().toLowerCase().startsWith("select")) {
      throw new Error("Only SELECT queries are allowed.");
    }

    const db = await this.getDatabase();
    try {
      return new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
          if (err) {
            reject(new Error(`Database query error: ${err.message}`));
            return;
          }
          resolve(rows || []);
        });
      });
    } finally {
      await this.closeDatabase(db);
    }
  }
}

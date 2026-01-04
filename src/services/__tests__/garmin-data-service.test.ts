import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GarminDataService } from "../garmin-data-service.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.resolve(__dirname, "../../../data/test-garmin-data.db");

describe("GarminDataService", () => {
  beforeAll(() => {
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        activity_id INTEGER PRIMARY KEY,
        activity_name TEXT,
        distance REAL,
        duration INTEGER,
        start_time_local TEXT
      )
    `);

    const stmt = db.prepare(
      "INSERT INTO activities (activity_id, activity_name, distance, duration, start_time_local) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run(1, "Morning Run", 5000, 1800, "2024-01-15T08:00:00");
    stmt.run(2, "Evening Run", 10000, 3600, "2024-01-16T18:00:00");
    stmt.run(3, "Long Run", 21000, 7200, "2024-01-20T09:00:00");

    db.close();
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("constructor", () => {
    it("should throw error if database file does not exist", () => {
      expect(() => new GarminDataService("data/nonexistent.db")).toThrow(
        /Database file not found/
      );
    });

    it("should create service instance with valid database path", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      expect(service).toBeInstanceOf(GarminDataService);
    });
  });

  describe("getSchema", () => {
    it("should return database schema", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const schema = service.getSchema();

      expect(schema).toBeInstanceOf(Array);
      expect(schema.length).toBeGreaterThan(0);
      expect(schema[0]).toHaveProperty("name");
      expect(schema[0]).toHaveProperty("sql");
      expect(schema[0].name).toBe("activities");
    });
  });

  describe("runQuery", () => {
    it("should execute SELECT query and return results", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const results = service.runQuery("SELECT * FROM activities");

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(3);
      expect(results[0]).toHaveProperty("activity_id");
      expect(results[0]).toHaveProperty("activity_name");
    });

    it("should execute SELECT query with WHERE clause", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const results = service.runQuery(
        "SELECT * FROM activities WHERE activity_id = 2"
      );

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
      expect(results[0].activity_name).toBe("Evening Run");
    });

    it("should execute SELECT query with COUNT", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const results = service.runQuery("SELECT COUNT(*) as count FROM activities");

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
      expect(results[0].count).toBe(3);
    });

    it("should throw error for non-SELECT queries", () => {
      const service = new GarminDataService("data/test-garmin-data.db");

      expect(() =>
        service.runQuery("DELETE FROM activities WHERE activity_id = 1")
      ).toThrow("Only SELECT queries are allowed");

      expect(() =>
        service.runQuery("UPDATE activities SET activity_name = 'Test'")
      ).toThrow("Only SELECT queries are allowed");

      expect(() =>
        service.runQuery("INSERT INTO activities VALUES (4, 'Test', 0, 0, '')")
      ).toThrow("Only SELECT queries are allowed");
    });

    it("should handle queries with leading whitespace", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const results = service.runQuery("  SELECT * FROM activities LIMIT 1");

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
    });

    it("should handle case-insensitive SELECT", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const results = service.runQuery("select * from activities limit 1");

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
    });

    it("should return empty array for query with no matches", () => {
      const service = new GarminDataService("data/test-garmin-data.db");
      const results = service.runQuery(
        "SELECT * FROM activities WHERE activity_id = 999"
      );

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });
  });
});

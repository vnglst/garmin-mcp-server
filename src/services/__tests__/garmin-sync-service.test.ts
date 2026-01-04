import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GarminSyncService } from "../garmin-sync-service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.resolve(__dirname, "../../../data/test-sync-garmin-data.db");

describe("GarminSyncService", () => {
  let service: GarminSyncService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    service = new GarminSyncService("data/test-sync-garmin-data.db");
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    process.env = { ...originalEnv };
  });

  describe("syncActivities", () => {
    it("should return error when GARMIN_USERNAME is missing", async () => {
      delete process.env.GARMIN_USERNAME;
      delete process.env.GARMIN_PASSWORD;

      const result = await service.syncActivities();

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Missing GARMIN_USERNAME or GARMIN_PASSWORD");
      expect(result.newActivitiesCount).toBe(0);
      expect(result.totalActivities).toBe(0);
    });

    it("should return error when GARMIN_PASSWORD is missing", async () => {
      process.env.GARMIN_USERNAME = "test@example.com";
      delete process.env.GARMIN_PASSWORD;

      const result = await service.syncActivities();

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Missing GARMIN_USERNAME or GARMIN_PASSWORD");
      expect(result.newActivitiesCount).toBe(0);
      expect(result.totalActivities).toBe(0);
    });

    it("should initialize database with activities table", async () => {
      process.env.GARMIN_USERNAME = "invalid@example.com";
      process.env.GARMIN_PASSWORD = "invalid";

      await service.syncActivities();

      expect(fs.existsSync(testDbPath)).toBe(true);

      const db = new Database(testDbPath, { readonly: true });
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'")
        .all();
      db.close();

      expect(tables.length).toBe(1);
      expect(tables[0]).toHaveProperty("name", "activities");
    });

    it("should create database with correct schema", async () => {
      process.env.GARMIN_USERNAME = "invalid@example.com";
      process.env.GARMIN_PASSWORD = "invalid";

      await service.syncActivities();

      const db = new Database(testDbPath, { readonly: true });
      const schema = db.prepare("PRAGMA table_info(activities)").all();
      db.close();

      expect(schema.length).toBeGreaterThan(0);

      const columnNames = schema.map((col: any) => col.name);
      expect(columnNames).toContain("activity_id");
      expect(columnNames).toContain("activity_name");
      expect(columnNames).toContain("distance");
      expect(columnNames).toContain("duration");
      expect(columnNames).toContain("start_time_local");
    });

    it("should handle authentication errors gracefully", async () => {
      process.env.GARMIN_USERNAME = "invalid@example.com";
      process.env.GARMIN_PASSWORD = "wrongpassword";

      const result = await service.syncActivities();

      expect(result.error).toBeDefined();
      expect(result.newActivitiesCount).toBe(0);
      expect(result.totalActivities).toBe(0);
    });
  });
});

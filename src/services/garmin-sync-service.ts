import GarminConnectPkg from "garmin-connect";
const { GarminConnect } = GarminConnectPkg;
import sqlite3Pkg from "sqlite3";
const sqlite3 = sqlite3Pkg;
import path from "path";

interface SchemaColumn {
  dbKey: string;
  dbType: string;
  garminKey: string;
}

const activitySchema: SchemaColumn[] = [
  { dbKey: "activity_id", dbType: "INTEGER PRIMARY KEY", garminKey: "activityId" },
  { dbKey: "activity_name", dbType: "TEXT", garminKey: "activityName" },
  { dbKey: "description", dbType: "TEXT", garminKey: "description" },
  { dbKey: "start_time_local", dbType: "TEXT", garminKey: "startTimeLocal" },
  { dbKey: "start_time_gmt", dbType: "TEXT", garminKey: "startTimeGMT" },
  { dbKey: "end_time_gmt", dbType: "TEXT", garminKey: "endTimeGMT" },
  { dbKey: "begin_timestamp", dbType: "INTEGER", garminKey: "beginTimestamp" },
  { dbKey: "activity_type_key", dbType: "TEXT", garminKey: "activityType.typeKey" },
  { dbKey: "location_name", dbType: "TEXT", garminKey: "locationName" },
  { dbKey: "distance", dbType: "REAL", garminKey: "distance" },
  { dbKey: "duration", dbType: "INTEGER", garminKey: "duration" },
  { dbKey: "elapsed_duration", dbType: "INTEGER", garminKey: "elapsedDuration" },
  { dbKey: "moving_duration", dbType: "INTEGER", garminKey: "movingDuration" },
  { dbKey: "calories", dbType: "INTEGER", garminKey: "calories" },
  { dbKey: "average_hr", dbType: "INTEGER", garminKey: "averageHR" },
  { dbKey: "max_hr", dbType: "INTEGER", garminKey: "maxHR" },
  { dbKey: "lactate_threshold_bpm", dbType: "INTEGER", garminKey: "lactateThresholdBpm" },
  { dbKey: "lactate_threshold_speed", dbType: "REAL", garminKey: "lactateThresholdSpeed" },
  { dbKey: "vo2_max", dbType: "REAL", garminKey: "vO2MaxValue" },
  { dbKey: "avg_stride_length", dbType: "REAL", garminKey: "avgStrideLength" },
  { dbKey: "max_stride_length", dbType: "REAL", garminKey: "maxStrideLength" },
  { dbKey: "training_effect", dbType: "REAL", garminKey: "trainingEffect" },
  { dbKey: "anaerobic_training_effect", dbType: "REAL", garminKey: "anaerobicTrainingEffect" },
  { dbKey: "aerobic_training_effect", dbType: "REAL", garminKey: "aerobicTrainingEffect" },
  { dbKey: "avg_vertical_oscillation", dbType: "REAL", garminKey: "avgVerticalOscillation" },
  { dbKey: "avg_ground_contact_time", dbType: "INTEGER", garminKey: "avgGroundContactTime" },
  { dbKey: "vertical_ratio", dbType: "REAL", garminKey: "verticalRatio" },
  { dbKey: "avg_fractional_cadence", dbType: "REAL", garminKey: "avgFractionalCadence" },
  { dbKey: "max_fractional_cadence", dbType: "REAL", garminKey: "maxFractionalCadence" },
  { dbKey: "avg_power", dbType: "INTEGER", garminKey: "avgPower" },
  { dbKey: "max_power", dbType: "INTEGER", garminKey: "maxPower" },
  { dbKey: "grit", dbType: "REAL", garminKey: "grit" },
  { dbKey: "flow", dbType: "REAL", garminKey: "flow" },
  { dbKey: "avg_running_cadence_spm", dbType: "INTEGER", garminKey: "averageRunningCadenceInStepsPerMinute" },
  { dbKey: "max_running_cadence_spm", dbType: "INTEGER", garminKey: "maxRunningCadenceInStepsPerMinute" },
  { dbKey: "max_double_cadence", dbType: "REAL", garminKey: "maxDoubleCadence" },
  { dbKey: "max_vertical_speed", dbType: "REAL", garminKey: "maxVerticalSpeed" },
  { dbKey: "min_activity_lap_duration", dbType: "INTEGER", garminKey: "minActivityLapDuration" },
  { dbKey: "activity_training_load", dbType: "REAL", garminKey: "activityTrainingLoad" },
  { dbKey: "vigorous_intensity_minutes", dbType: "INTEGER", garminKey: "vigorousIntensityMinutes" },
  { dbKey: "moderate_intensity_minutes", dbType: "INTEGER", garminKey: "moderateIntensityMinutes" },
  { dbKey: "hr_time_in_zone_1", dbType: "INTEGER", garminKey: "hrTimeInZone_1" },
  { dbKey: "hr_time_in_zone_2", dbType: "INTEGER", garminKey: "hrTimeInZone_2" },
  { dbKey: "hr_time_in_zone_3", dbType: "INTEGER", garminKey: "hrTimeInZone_3" },
  { dbKey: "hr_time_in_zone_4", dbType: "INTEGER", garminKey: "hrTimeInZone_4" },
  { dbKey: "hr_time_in_zone_5", dbType: "INTEGER", garminKey: "hrTimeInZone_5" },
  { dbKey: "average_speed", dbType: "REAL", garminKey: "averageSpeed" },
  { dbKey: "max_speed", dbType: "REAL", garminKey: "maxSpeed" },
  { dbKey: "fastest_split_1000", dbType: "REAL", garminKey: "fastestSplit_1000" },
  { dbKey: "fastest_split_5000", dbType: "REAL", garminKey: "fastestSplit_5000" },
  { dbKey: "fastest_split_10000", dbType: "REAL", garminKey: "fastestSplit_10000" },
  { dbKey: "fastest_split_1609", dbType: "REAL", garminKey: "fastestSplit_1609" },
  { dbKey: "elevation_gain", dbType: "REAL", garminKey: "elevationGain" },
  { dbKey: "elevation_loss", dbType: "REAL", garminKey: "elevationLoss" },
  { dbKey: "max_elevation", dbType: "REAL", garminKey: "maxElevation" },
  { dbKey: "min_elevation", dbType: "REAL", garminKey: "minElevation" },
  { dbKey: "steps", dbType: "INTEGER", garminKey: "steps" },
  { dbKey: "lap_count", dbType: "INTEGER", garminKey: "lapCount" },
];

const getNested = (obj: any, path: string): any => {
  if (!path) return obj;
  const keys = path.split(".");
  return keys.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
};

export interface SyncResult {
  newActivitiesCount: number;
  totalActivities: number;
  latestActivityDate: Date | null;
  error?: string;
}

export class GarminSyncService {
  private dbPath: string;

  constructor(dbPath: string = "data/garmin-data.db") {
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    this.dbPath = path.resolve(scriptDir, "../..", dbPath);
  }

  private initializeDatabase(): Promise<sqlite3Pkg.Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          return reject(new Error(`Error opening database: ${err.message}`));
        }

        db.serialize(() => {
          const columns = activitySchema.map((col) => `${col.dbKey} ${col.dbType}`).join(",\n          ");
          const createTableSql = `
            CREATE TABLE IF NOT EXISTS activities (
              ${columns}
            )
          `;

          db.run(createTableSql, (runErr) => {
            if (runErr) {
              reject(new Error(`Error creating activities table: ${runErr.message}`));
            } else {
              resolve(db);
            }
          });
        });
      });
    });
  }

  private getLatestActivityDate(db: sqlite3Pkg.Database): Promise<Date | null> {
    return new Promise((resolve) => {
      db.get("SELECT MAX(start_time_local) as latest_date FROM activities", (err, row: any) => {
        if (err || !row?.latest_date) {
          resolve(null);
        } else {
          resolve(new Date(row.latest_date));
        }
      });
    });
  }

  private getActivitiesCount(db: sqlite3Pkg.Database): Promise<number> {
    return new Promise((resolve) => {
      db.get("SELECT COUNT(*) as count FROM activities", (err, row: any) => {
        if (err || !row) {
          resolve(0);
        } else {
          resolve(row.count || 0);
        }
      });
    });
  }

  private saveActivities(db: sqlite3Pkg.Database, activities: any[]): Promise<number> {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION", (err) => {
          if (err) {
            return reject(new Error("Failed to begin transaction", { cause: err }));
          }

          const dbKeys = activitySchema.map((col) => col.dbKey).join(", ");
          const placeholders = activitySchema.map(() => "?").join(", ");
          const insertSql = `INSERT OR REPLACE INTO activities (${dbKeys}) VALUES (${placeholders})`;
          const stmt = db.prepare(insertSql);

          let saved = 0;
          let errors = 0;

          activities.forEach((activity) => {
            const params = activitySchema.map((col) => getNested(activity, col.garminKey));

            stmt.run(params, (err) => {
              if (err) {
                errors++;
              } else {
                saved++;
              }
            });
          });

          stmt.finalize((err) => {
            if (err) {
              return db.run("ROLLBACK", () => {
                reject(new Error("Failed to finalize statement", { cause: err }));
              });
            }

            if (errors > 0) {
              return db.run("ROLLBACK", () => {
                reject(new Error(`${errors} activities failed to save.`));
              });
            }

            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                return db.run("ROLLBACK", () => {
                  reject(new Error("Failed to commit transaction", { cause: commitErr }));
                });
              }
              resolve(saved);
            });
          });
        });
      });
    });
  }

  private closeDatabase(db: sqlite3Pkg.Database): Promise<void> {
    return new Promise((resolve) => {
      db.close(() => resolve());
    });
  }

  async syncActivities(): Promise<SyncResult> {
    let db: sqlite3Pkg.Database | null = null;

    try {
      if (!process.env.GARMIN_USERNAME || !process.env.GARMIN_PASSWORD) {
        throw new Error("Missing GARMIN_USERNAME or GARMIN_PASSWORD in environment variables");
      }

      db = await this.initializeDatabase();

      const gc = new GarminConnect({
        username: process.env.GARMIN_USERNAME,
        password: process.env.GARMIN_PASSWORD,
      });

      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      console.log = () => {};
      console.error = () => {};

      try {
        await gc.login();
      } catch (loginError) {
        const errorMessage = loginError instanceof Error ? loginError.message : String(loginError);
        if (errorMessage.includes("not valid JSON") || errorMessage.includes("login page")) {
          throw new Error("Garmin authentication failed. Please verify your GARMIN_USERNAME and GARMIN_PASSWORD in .env file are correct. You may also need to log in to Garmin Connect via a web browser first.");
        }
        throw loginError;
      } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
      }

      let newActivities: any[] = [];
      let start = 0;
      const limit = 100;
      let keepGoing = true;

      while (keepGoing) {
        const activities = await gc.getActivities(start, limit);

        if (activities && activities.length > 0) {
          const latestActivityDate = await this.getLatestActivityDate(db);
          let stopNextTime = false;

          for (const activity of activities) {
            if (latestActivityDate && new Date(activity.startTimeLocal) <= latestActivityDate) {
              stopNextTime = true;
              break;
            }
            newActivities.push(activity);
          }

          if (stopNextTime) {
            keepGoing = false;
          } else {
            start += limit;
          }
        } else {
          keepGoing = false;
        }
      }

      if (newActivities.length > 0) {
        await this.saveActivities(db, newActivities);
      }

      const totalActivities = await this.getActivitiesCount(db);
      const latestActivityDate = await this.getLatestActivityDate(db);

      return {
        newActivitiesCount: newActivities.length,
        totalActivities,
        latestActivityDate,
      };
    } catch (error) {
      return {
        newActivitiesCount: 0,
        totalActivities: 0,
        latestActivityDate: null,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (db) {
        await this.closeDatabase(db);
      }
    }
  }
}

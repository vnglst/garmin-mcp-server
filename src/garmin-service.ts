import pkg from "garmin-connect";
const { GarminConnect } = pkg;
import fs from "fs";
import path from "path";

// Manually load environment variables to avoid dotenv output
try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf8");
    const envVars = envFile.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
    envVars.forEach((line) => {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=").trim();
        process.env[key.trim()] = value;
      }
    });
  }
} catch (error) {
  // Silent fallback if .env reading fails
}

export interface RunWorkout {
  id: string;
  date: string;
  distance: number; // in kilometers
  duration: string; // formatted as HH:MM:SS
  pace: string; // formatted as MM:SS per km
  calories: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  notes?: string;
}

export interface DetailedRunWorkout extends RunWorkout {
  elevationGain?: number; // in meters
  temperature?: number; // in Celsius
  startLocation?: string;
  route?: boolean;
  heartRateZones?: string;
  splits?: Split[];
}

export interface Split {
  distance: number; // in km
  time: string; // formatted as MM:SS
  pace: string; // formatted as MM:SS per km
}

export interface RunningStats {
  periodStart: string;
  periodEnd: string;
  totalRuns: number;
  totalDistance: number; // in km
  totalTime: string;
  avgDistance: number; // in km
  avgPace: string; // formatted as MM:SS per km
  bestPace: string; // formatted as MM:SS per km
  totalCalories: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  longestRun: number; // in km
  fastestPace: string; // formatted as MM:SS per km
}

const RUNNING_ACTIVITY_TYPES = ["running", "track_running", "treadmill_running", "trail_running"];

export class GarminService {
  private garminConnect: any;
  private isAuthenticated = false;
  private lastAuthTime = 0;
  private readonly authTimeout = 30 * 60 * 1000; // 30 minutes

  constructor() {
    const username = process.env.GARMIN_USERNAME;
    const password = process.env.GARMIN_PASSWORD;

    if (!username || !password) {
      throw new Error("GARMIN_USERNAME and GARMIN_PASSWORD must be set in environment variables");
    }

    this.garminConnect = new GarminConnect({ username, password });
  }

  // Helper method to suppress console output during external library calls
  // This prevents garmin-connect library from polluting stdout and breaking MCP JSON-RPC protocol
  private async silentCall<T>(fn: () => Promise<T>): Promise<T> {
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;

    try {
      // Temporarily silence stdout/info output (keep stderr for our own logging)
      console.log = () => {};
      console.warn = () => {};
      console.info = () => {};

      const result = await fn();

      // Restore console methods
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.info = originalConsoleInfo;

      return result;
    } catch (error) {
      // Restore console methods in case of error
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.info = originalConsoleInfo;

      throw error;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    const now = Date.now();

    if (this.isAuthenticated && now - this.lastAuthTime < this.authTimeout) {
      return;
    }

    try {
      console.error("Authenticating with Garmin Connect...");
      await this.silentCall(async () => {
        await this.garminConnect.login();
      });

      this.isAuthenticated = true;
      this.lastAuthTime = now;
      console.error("Successfully authenticated with Garmin Connect");
    } catch (error) {
      this.isAuthenticated = false;
      console.error(`Failed to authenticate with Garmin Connect: ${error}`);
      throw new Error(`Failed to authenticate with Garmin Connect: ${error}`);
    }
  }

  private isRunningActivity(activity: any): boolean {
    return RUNNING_ACTIVITY_TYPES.includes(activity.activityType?.typeKey);
  }

  async getRecentActivities(limit: number = 10): Promise<any[]> {
    await this.ensureAuthenticated();

    try {
      console.error(`Fetching ${limit} recent activities from Garmin Connect...`);
      const activities = await this.silentCall(async () => {
        return await this.garminConnect.getActivities(0, limit);
      });
      console.error(`Successfully fetched ${activities.length} activities`);
      return activities;
    } catch (error) {
      console.error(`Failed to fetch activities: ${error}`);
      throw new Error(`Failed to fetch activities: ${error}`);
    }
  }

  async getRunDetails(runId: string): Promise<DetailedRunWorkout | null> {
    await this.ensureAuthenticated();

    try {
      console.error(`Fetching details for run ID: ${runId}`);
      const activityDetails = await this.garminConnect.getActivity({ activityId: parseInt(runId) });

      if (!activityDetails) {
        console.error(`No activity found for run ID: ${runId}`);
        return null;
      }

      const runWorkout = this.mapToRunWorkout(activityDetails);

      const detailedRun: DetailedRunWorkout = {
        ...runWorkout,
        elevationGain: typeof activityDetails.elevationGain === "number" ? activityDetails.elevationGain : undefined,
        temperature: typeof activityDetails.maxTemperature === "number" ? activityDetails.maxTemperature : undefined,
        startLocation: this.formatLocation(activityDetails),
        route: !!activityDetails.hasPolyline,
        heartRateZones: this.formatHeartRateZones(activityDetails),
        splits: this.extractSplits(activityDetails),
      };

      console.error(`Successfully fetched details for run on ${detailedRun.date}`);
      return detailedRun;
    } catch (error) {
      console.error(`Error fetching run details for ${runId}:`, error);
      return null;
    }
  }

  async getRunningStats(period: "week" | "month" | "quarter" | "year", date?: string): Promise<RunningStats> {
    await this.ensureAuthenticated();

    try {
      const endDate = date ? new Date(date) : new Date();
      const startDate = this.calculatePeriodStart(period, endDate);

      console.error(
        `Calculating running stats for ${period} period: ${startDate.toISOString().split("T")[0]} to ${
          endDate.toISOString().split("T")[0]
        }`
      );

      const activities = await this.garminConnect.getActivities(0, 200);

      const runningActivities = activities.filter((activity: any) => {
        const activityDate = new Date(activity.startTimeLocal);
        return this.isRunningActivity(activity) && activityDate >= startDate && activityDate <= endDate;
      });

      console.error(`Found ${runningActivities.length} running activities in the specified period`);

      const stats = this.calculateRunningStats(runningActivities, startDate, endDate, period);

      return stats;
    } catch (error) {
      console.error("Error fetching running stats:", error);
      throw new Error("Failed to fetch running statistics from Garmin Connect");
    }
  }

  // Helper method to map Garmin activity to our RunWorkout format
  private mapToRunWorkout(activity: any): RunWorkout {
    const distanceKm = (activity.distance || 0) / 1000; // Convert meters to km
    const durationSeconds = activity.duration || activity.movingDuration || 0;
    const duration = this.formatTime(durationSeconds);
    const pace = distanceKm > 0 ? this.calculatePace(distanceKm, durationSeconds) : "0:00";

    return {
      id: activity.activityId?.toString() || Math.random().toString(),
      date: activity.startTimeLocal ? activity.startTimeLocal.split("T")[0] : new Date().toISOString().split("T")[0],
      distance: Math.round(distanceKm * 100) / 100, // Round to 2 decimal places
      duration,
      pace,
      calories: activity.calories || 0,
      avgHeartRate: activity.avgHR || undefined,
      maxHeartRate: activity.maxHR || undefined,
      notes: activity.description || undefined,
    };
  }

  // Helper method to format location
  private formatLocation(activity: any): string | undefined {
    if (activity.locationName) {
      return activity.locationName;
    }
    if (activity.startLatitude && activity.startLongitude) {
      return `${activity.startLatitude.toFixed(4)}, ${activity.startLongitude.toFixed(4)}`;
    }
    return undefined;
  }

  // Helper method to format heart rate zones
  private formatHeartRateZones(activity: any): string | undefined {
    if (!activity.timeInHRZone) {
      return undefined;
    }

    const zones = activity.timeInHRZone;
    const zoneLabels = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"];

    return zones
      .map((time: number, index: number) => {
        if (time > 0) {
          const minutes = Math.floor(time / 60);
          const seconds = time % 60;
          return `${zoneLabels[index]}: ${minutes}:${seconds.toString().padStart(2, "0")}`;
        }
        return null;
      })
      .filter(Boolean)
      .join(", ");
  }

  // Helper method to extract splits
  private extractSplits(activity: any): Split[] | undefined {
    if (!activity.splits || !Array.isArray(activity.splits)) {
      return undefined;
    }

    return activity.splits.map((split: any, index: number) => {
      const distanceKm = (split.distance || (index + 1) * 1000) / 1000; // Default to 1km splits
      const timeSeconds = split.movingTime || split.elapsedTime || 0;
      const time = this.formatTime(timeSeconds);
      const pace = this.calculatePace(1, timeSeconds); // Pace per km

      return {
        distance: distanceKm,
        time,
        pace,
      };
    });
  }

  // Helper method to calculate period start date
  private calculatePeriodStart(period: string, endDate: Date): Date {
    const startDate = new Date(endDate);

    switch (period) {
      case "week":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case "quarter":
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }

    return startDate;
  }

  // Helper method to calculate running statistics
  private calculateRunningStats(activities: any[], startDate: Date, endDate: Date, period: string): RunningStats {
    const totalRuns = activities.length;
    const totalDistanceMeters = activities.reduce((sum, activity) => sum + (activity.distance || 0), 0);
    const totalDistance = totalDistanceMeters / 1000; // Convert to km
    const totalDurationSeconds = activities.reduce(
      (sum, activity) => sum + (activity.duration || activity.movingDuration || 0),
      0
    );
    const totalCalories = activities.reduce((sum, activity) => sum + (activity.calories || 0), 0);

    const avgDistance = totalRuns > 0 ? totalDistance / totalRuns : 0;
    const avgPace = totalDistance > 0 ? this.calculatePace(totalDistance, totalDurationSeconds) : "0:00";

    // Find best/fastest pace
    const paces = activities
      .filter((activity) => activity.distance > 0 && activity.duration > 0)
      .map((activity) => {
        const distanceKm = activity.distance / 1000;
        const durationSeconds = activity.duration || activity.movingDuration;
        return durationSeconds / distanceKm; // seconds per km
      });

    const bestPaceSeconds = paces.length > 0 ? Math.min(...paces) : 0;
    const bestPace = bestPaceSeconds > 0 ? this.formatPace(bestPaceSeconds) : "0:00";

    // Find longest run
    const longestRunMeters = activities.reduce((max, activity) => Math.max(max, activity.distance || 0), 0);
    const longestRun = longestRunMeters / 1000;

    // Heart rate stats
    const heartRates = activities.filter((activity) => activity.avgHR).map((activity) => activity.avgHR);
    const avgHeartRate =
      heartRates.length > 0 ? Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length) : undefined;
    const maxHeartRate = activities.reduce((max, activity) => Math.max(max, activity.maxHR || 0), 0) || undefined;

    return {
      periodStart: startDate.toISOString().split("T")[0],
      periodEnd: endDate.toISOString().split("T")[0],
      totalRuns,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalTime: this.formatTime(totalDurationSeconds),
      avgDistance: Math.round(avgDistance * 100) / 100,
      avgPace,
      bestPace,
      totalCalories,
      avgHeartRate,
      maxHeartRate,
      longestRun: Math.round(longestRun * 100) / 100,
      fastestPace: bestPace,
    };
  }

  // Helper method to format pace from seconds per km
  private formatPace(secondsPerKm: number): string {
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  // Helper method to format time in seconds to HH:MM:SS or MM:SS
  private formatTime(totalSeconds: number): string {
    // Ensure we have a valid number
    const seconds = Math.round(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
  }

  // Helper method to calculate pace from distance and time
  private calculatePace(distanceKm: number, timeSeconds: number): string {
    if (distanceKm === 0 || timeSeconds === 0) return "0:00";

    const paceSeconds = Math.round(timeSeconds / distanceKm);
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = paceSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}

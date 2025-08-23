import pkg from "garmin-connect";
const { GarminConnect } = pkg;
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

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
  weather?: string;
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
  comparison?: string;
  longestRun: number; // in km
  fastestPace: string; // formatted as MM:SS per km
}

export class GarminService {
  private garminConnect: any;
  private isAuthenticated: boolean = false;
  private lastAuthTime: number = 0;
  private readonly authTimeout = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.garminConnect = new GarminConnect({
      username: process.env.GARMIN_USERNAME || "",
      password: process.env.GARMIN_PASSWORD || "",
    });
  }

  private async ensureAuthenticated(): Promise<void> {
    const now = Date.now();

    // Re-authenticate if not authenticated or session expired
    if (!this.isAuthenticated || now - this.lastAuthTime > this.authTimeout) {
      try {
        console.log("Authenticating with Garmin Connect...");
        await this.garminConnect.login();
        this.isAuthenticated = true;
        this.lastAuthTime = now;
        console.log("Successfully authenticated with Garmin Connect");
      } catch (error) {
        console.error("Failed to authenticate with Garmin Connect:", error);
        throw new Error("Unable to authenticate with Garmin Connect. Please check your credentials.");
      }
    }
  }

  async getRecentRuns(limit: number = 10): Promise<RunWorkout[]> {
    await this.ensureAuthenticated();

    try {
      console.log(`Fetching ${limit} recent runs from Garmin Connect...`);

      // Get activities from Garmin Connect
      const activities = await this.garminConnect.getActivities(0, limit);

      // Filter for running activities and map to our format
      const runningActivities = activities
        .filter(
          (activity: any) =>
            activity.activityType?.typeKey === "running" ||
            activity.activityType?.typeKey === "track_running" ||
            activity.activityType?.typeKey === "treadmill_running" ||
            activity.activityType?.typeKey === "trail_running"
        )
        .slice(0, limit)
        .map((activity: any) => this.mapToRunWorkout(activity));

      console.log(`Found ${runningActivities.length} running activities`);
      return runningActivities;
    } catch (error) {
      console.error("Error fetching recent runs:", error);
      throw new Error("Failed to fetch recent runs from Garmin Connect");
    }
  }

  async getRunDetails(runId: string): Promise<DetailedRunWorkout | null> {
    await this.ensureAuthenticated();

    try {
      console.log(`Fetching details for run ${runId}...`);

      // Get activity details from Garmin Connect
      const activityDetails = await this.garminConnect.getActivity({ activityId: parseInt(runId) });

      if (!activityDetails) {
        return null;
      }

      // Map to our detailed format
      const runWorkout = this.mapToRunWorkout(activityDetails);

      // Get additional details like splits if available
      const detailedRun: DetailedRunWorkout = {
        ...runWorkout,
        elevationGain: typeof activityDetails.elevationGain === "number" ? activityDetails.elevationGain : undefined,
        temperature: typeof activityDetails.maxTemperature === "number" ? activityDetails.maxTemperature : undefined,
        weather: undefined, // Weather data not available in Garmin Connect API
        startLocation: this.formatLocation(activityDetails),
        route: !!activityDetails.hasPolyline,
        heartRateZones: this.formatHeartRateZones(activityDetails),
        splits: this.extractSplits(activityDetails),
      };

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

      console.log(
        `Fetching running stats for ${period} from ${startDate.toISOString().split("T")[0]} to ${
          endDate.toISOString().split("T")[0]
        }...`
      );

      // Get activities for the period (fetch more to ensure we get all running activities)
      const activities = await this.garminConnect.getActivities(0, 200);

      // Filter for running activities within the date range
      const runningActivities = activities.filter((activity: any) => {
        const activityDate = new Date(activity.startTimeLocal);
        return (
          (activity.activityType?.typeKey === "running" ||
            activity.activityType?.typeKey === "track_running" ||
            activity.activityType?.typeKey === "treadmill_running" ||
            activity.activityType?.typeKey === "trail_running") &&
          activityDate >= startDate &&
          activityDate <= endDate
        );
      });

      // Calculate statistics
      const stats = this.calculateRunningStats(runningActivities, startDate, endDate, period);

      console.log(`Found ${runningActivities.length} running activities for statistics`);
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
      comparison: `${period} data from Garmin Connect`,
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
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
  }

  // Helper method to calculate pace from distance and time
  private calculatePace(distanceKm: number, timeSeconds: number): string {
    const paceSeconds = timeSeconds / distanceKm;
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = Math.round(paceSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}

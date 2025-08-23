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

export interface FitnessMetrics {
  vo2Max?: number;
  fitnessAge?: number;
  lactateThreshold?: {
    heartRate?: number;
    pace?: string; // formatted as MM:SS per km
  };
  functionalThresholdPower?: number; // FTP in watts
  restingHeartRate?: number;
  maxHeartRate?: number;
  lastMeasuredDate?: string;
}

export interface HistoricRunsQuery {
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  activityType?: "all" | "running" | "trail_running" | "treadmill_running" | "track_running";
  minDistance?: number; // in km
  maxDistance?: number; // in km
  minDuration?: number; // in seconds
  maxDuration?: number; // in seconds
  limit?: number; // max number of results
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

  async getRecentActivities(limit: number = 10): Promise<RunWorkout[]> {
    await this.ensureAuthenticated();

    try {
      console.error(`Fetching ${limit} recent activities from Garmin Connect...`);
      const activities = await this.silentCall(async () => {
        return await this.garminConnect.getActivities(0, limit);
      });
      console.error(`Successfully fetched ${activities.length} activities`);

      // Filter for running activities and map to RunWorkout format
      const runningActivities = activities
        .filter((activity: any) => this.isRunningActivity(activity))
        .slice(0, limit)
        .map((activity: any) => this.mapToRunWorkout(activity));

      console.error(`Found ${runningActivities.length} running activities`);
      return runningActivities;
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

      // Use the same pagination approach as getHistoricRuns
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const estimatedActivities = Math.max(200, Math.min(daysDiff * 2, 1000));

      let allActivities: any[] = [];
      let offset = 0;
      const batchSize = 200;
      let consecutiveEmptyBatches = 0;

      while (allActivities.length < estimatedActivities && consecutiveEmptyBatches < 3) {
        const batchActivities = await this.silentCall(async () => {
          return await this.garminConnect.getActivities(offset, batchSize);
        });

        if (!batchActivities || batchActivities.length === 0) {
          consecutiveEmptyBatches++;
          break;
        }

        consecutiveEmptyBatches = 0;
        allActivities.push(...batchActivities);

        // Check if we've gone past our start date
        const oldestActivityInBatch = batchActivities[batchActivities.length - 1];
        if (oldestActivityInBatch && new Date(oldestActivityInBatch.startTimeLocal) < startDate) {
          break;
        }

        offset += batchSize;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const runningActivities = allActivities.filter((activity: any) => {
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

  async getFitnessMetrics(): Promise<FitnessMetrics> {
    await this.ensureAuthenticated();

    try {
      console.error("Fetching fitness metrics from Garmin Connect...");

      // Get user profile which contains some fitness metrics
      const userProfile = await this.silentCall(async () => {
        return await this.garminConnect.getUserProfile();
      });

      // Get user settings which may contain additional data
      const userSettings = await this.silentCall(async () => {
        return await this.garminConnect.getUserSettings();
      });

      console.error("User profile data:", JSON.stringify(userProfile, null, 2));
      console.error("User settings data:", JSON.stringify(userSettings, null, 2));

      // Try to get heart rate data which includes resting HR
      let heartRateData = null;
      try {
        heartRateData = await this.silentCall(async () => {
          return await this.garminConnect.getHeartRate();
        });
        console.error("Heart rate data:", JSON.stringify(heartRateData, null, 2));
      } catch (error) {
        console.error("Could not fetch heart rate data:", error);
      }

      // Look for VO2 Max in recent activities (some devices report it there)
      let recentActivities = [];
      try {
        recentActivities = await this.silentCall(async () => {
          return await this.garminConnect.getActivities(0, 10);
        });
        console.error("Recent activities sample for VO2 Max data:");
        recentActivities.forEach((activity: any, index: number) => {
          if (activity.vO2MaxValue) {
            console.error(`Activity ${index}: VO2 Max = ${activity.vO2MaxValue}`);
          }
        });
      } catch (error) {
        console.error("Could not fetch recent activities:", error);
      }

      // Extract metrics from available data
      const metrics: FitnessMetrics = {
        vo2Max:
          userSettings?.userData?.vo2MaxRunning ||
          recentActivities.find((a: any) => a.vO2MaxValue)?.vO2MaxValue ||
          undefined,
        fitnessAge: undefined, // Not available in current API
        restingHeartRate:
          heartRateData?.restingHeartRate || heartRateData?.lastSevenDaysAvgRestingHeartRate || undefined,
        maxHeartRate: undefined, // Would need to be calculated from activities or user settings
        lactateThreshold: {
          heartRate: userSettings?.userData?.lactateThresholdHeartRate || undefined,
          pace: userSettings?.userData?.lactateThresholdSpeed
            ? this.formatPace(userSettings.userData.lactateThresholdSpeed)
            : undefined,
        },
        functionalThresholdPower: undefined, // Not available in current API structure
        lastMeasuredDate: new Date().toISOString().split("T")[0],
      };

      console.error("Extracted fitness metrics:", JSON.stringify(metrics, null, 2));

      // Clean up lactate threshold if no data
      if (!metrics.lactateThreshold?.heartRate && !metrics.lactateThreshold?.pace) {
        delete metrics.lactateThreshold;
      }

      console.error("Successfully fetched fitness metrics");
      return metrics;
    } catch (error) {
      console.error("Error fetching fitness metrics:", error);
      throw new Error(`Failed to fetch fitness metrics: ${error}`);
    }
  }

  async getHistoricRuns(query: HistoricRunsQuery): Promise<RunWorkout[]> {
    await this.ensureAuthenticated();

    try {
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      const limit = query.limit || 100;

      console.error(`Fetching historic runs from ${query.startDate} to ${query.endDate} with limit ${limit}`);

      // First, get the total count of activities to understand how much data we have
      let totalActivities = 0;
      try {
        const activityCount = await this.silentCall(async () => {
          return await this.garminConnect.countActivities();
        });
        totalActivities = activityCount.countOfActivities;
        console.error(`Total activities in account: ${totalActivities}`);
      } catch (error) {
        console.error("Could not get activity count, proceeding with estimation");
        totalActivities = 10000; // Conservative estimate
      }

      // Calculate intelligent batch strategy
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      console.error(`Date range spans ${daysDiff} days`);

      // For very old data, we may need to fetch a large portion of the total activities
      // Use a more aggressive strategy for historical data
      const maxBatchesToFetch = Math.min(Math.ceil(totalActivities / 200), 50); // Max 50 batches (10,000 activities)
      console.error(`Will fetch up to ${maxBatchesToFetch} batches if needed to reach ${query.startDate}`);

      let allActivities: any[] = [];
      let start = 0;
      const batchSize = 200;
      let consecutiveEmptyBatches = 0;
      let foundActivitiesInRange = 0;
      let reachedTargetDate = false;

      for (let batchNum = 1; batchNum <= maxBatchesToFetch && !reachedTargetDate; batchNum++) {
        console.error(`Fetching batch ${batchNum}/${maxBatchesToFetch}, start: ${start}, batch size: ${batchSize}`);

        const batchActivities = await this.silentCall(async () => {
          return await this.garminConnect.getActivities(start, batchSize);
        });

        if (!batchActivities || batchActivities.length === 0) {
          consecutiveEmptyBatches++;
          console.error(`Empty batch received (${consecutiveEmptyBatches}/3)`);
          if (consecutiveEmptyBatches >= 3) {
            console.error("Multiple empty batches, stopping pagination");
            break;
          }
          start += batchSize;
          continue;
        }

        consecutiveEmptyBatches = 0;
        console.error(`Received ${batchActivities.length} activities in batch ${batchNum}`);

        // Check the date range of this batch
        const newestActivity = batchActivities[0];
        const oldestActivity = batchActivities[batchActivities.length - 1];
        const newestDate = new Date(newestActivity.startTimeLocal);
        const oldestDate = new Date(oldestActivity.startTimeLocal);

        console.error(
          `Batch ${batchNum} date range: ${oldestDate.toISOString().split("T")[0]} to ${
            newestDate.toISOString().split("T")[0]
          }`
        );

        // Check if any activities in this batch are within our target date range
        const activitiesInRange = batchActivities.filter((activity: any) => {
          const activityDate = new Date(activity.startTimeLocal);
          return activityDate >= startDate && activityDate <= endDate;
        });

        foundActivitiesInRange += activitiesInRange.length;
        allActivities.push(...batchActivities);

        console.error(
          `Found ${activitiesInRange.length} activities in target date range in this batch (total so far: ${foundActivitiesInRange})`
        );

        // Check if we've reached activities older than our start date
        if (oldestDate < startDate) {
          console.error(`Reached activities older than ${query.startDate}, we have gone far enough back`);
          reachedTargetDate = true;
          break;
        }

        // If we have enough activities in our target range, we can be more selective
        if (foundActivitiesInRange >= limit && activitiesInRange.length === 0) {
          console.error(
            `Have enough activities (${foundActivitiesInRange}) and current batch has no target activities, stopping`
          );
          break;
        }

        start += batchSize;

        // Progressive delay - longer delays for larger batches to be respectful to API
        const delay = Math.min(100 + batchNum * 50, 500); // 100ms to 500ms
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      console.error(
        `Completed pagination: fetched ${allActivities.length} total activities across ${Math.ceil(
          start / batchSize
        )} batches`
      );
      console.error(`Found ${foundActivitiesInRange} activities in target date range`);

      // Filter activities based on the query parameters
      const filteredActivities = allActivities.filter((activity: any) => {
        const activityDate = new Date(activity.startTimeLocal);

        // Date range filter
        if (activityDate < startDate || activityDate > endDate) {
          return false;
        }

        // Activity type filter
        if (query.activityType && query.activityType !== "all") {
          if (query.activityType === "running") {
            if (!this.isRunningActivity(activity)) return false;
          } else {
            if (activity.activityType?.typeKey !== query.activityType) return false;
          }
        } else {
          // Default to running activities only if no specific type requested
          if (!this.isRunningActivity(activity)) return false;
        }

        const distanceKm = (activity.distance || 0) / 1000;
        const durationSeconds = activity.duration || activity.movingDuration || 0;

        // Distance filters
        if (query.minDistance && distanceKm < query.minDistance) return false;
        if (query.maxDistance && distanceKm > query.maxDistance) return false;

        // Duration filters
        if (query.minDuration && durationSeconds < query.minDuration) return false;
        if (query.maxDuration && durationSeconds > query.maxDuration) return false;

        return true;
      });

      // Sort by date (newest first) and limit results
      const sortedActivities = filteredActivities
        .sort((a: any, b: any) => new Date(b.startTimeLocal).getTime() - new Date(a.startTimeLocal).getTime())
        .slice(0, limit);

      const runWorkouts = sortedActivities.map((activity: any) => this.mapToRunWorkout(activity));

      console.error(`Final result: ${runWorkouts.length} historic runs matching all criteria`);
      if (runWorkouts.length > 0) {
        const oldestRun = runWorkouts[runWorkouts.length - 1];
        const newestRun = runWorkouts[0];
        console.error(`Date range of results: ${oldestRun.date} to ${newestRun.date}`);
      }

      return runWorkouts;
    } catch (error) {
      console.error("Error fetching historic runs:", error);
      throw new Error(`Failed to fetch historic runs: ${error}`);
    }
  }

  async getRunsByDateRange(startDate: string, endDate: string, limit: number = 50): Promise<RunWorkout[]> {
    return this.getHistoricRuns({
      startDate,
      endDate,
      activityType: "running",
      limit,
    });
  }

  async getAllHistoricalRuns(startYear: number = 2020, limit: number = 1000): Promise<RunWorkout[]> {
    await this.ensureAuthenticated();

    try {
      const endDate = new Date();
      const startDate = new Date(startYear, 0, 1); // January 1st of startYear

      console.error(`Fetching ALL historical runs from ${startYear} to ${endDate.getFullYear()}, limit: ${limit}`);
      console.error(`This may take a while as we scan years of data...`);

      // For historical data spanning multiple years, we need to be very aggressive
      const yearsDiff = endDate.getFullYear() - startYear;
      console.error(`Scanning ${yearsDiff} years of data`);

      // Calculate a reasonable maximum based on years - assume more activities for older ranges
      let maxActivitiesToScan: number;
      if (yearsDiff >= 3) {
        maxActivitiesToScan = 15000; // Scan up to 15k activities for 3+ years
      } else if (yearsDiff >= 2) {
        maxActivitiesToScan = 10000; // 10k for 2+ years
      } else {
        maxActivitiesToScan = 5000; // 5k for recent years
      }

      console.error(`Will scan up to ${maxActivitiesToScan} activities to find historical data from ${startYear}`);

      let allActivities: any[] = [];
      let start = 0;
      const batchSize = 200;
      let consecutiveEmptyBatches = 0;
      let totalBatches = 0;
      let reachedTargetYear = false;

      const maxBatches = Math.ceil(maxActivitiesToScan / batchSize);

      while (start < maxActivitiesToScan && consecutiveEmptyBatches < 5 && !reachedTargetYear) {
        totalBatches++;
        console.error(`Fetching batch ${totalBatches}/${maxBatches}, start: ${start}...`);

        const batchActivities = await this.silentCall(async () => {
          return await this.garminConnect.getActivities(start, batchSize);
        });

        if (!batchActivities || batchActivities.length === 0) {
          consecutiveEmptyBatches++;
          console.error(`Empty batch received (${consecutiveEmptyBatches}/5)`);
          if (consecutiveEmptyBatches >= 5) {
            console.error("Too many empty batches, stopping");
            break;
          }
          start += batchSize;
          continue;
        }

        consecutiveEmptyBatches = 0;
        allActivities.push(...batchActivities);

        // Check the oldest activity in this batch
        const oldestActivityInBatch = batchActivities[batchActivities.length - 1];
        const oldestDate = new Date(oldestActivityInBatch.startTimeLocal);

        console.error(
          `Batch ${totalBatches}: ${batchActivities.length} activities, oldest: ${
            oldestDate.toISOString().split("T")[0]
          }`
        );

        // If we've reached activities older than our start year, we can stop
        if (oldestDate.getFullYear() < startYear) {
          console.error(
            `Reached activities from ${oldestDate.getFullYear()}, stopping as we've gone past ${startYear}`
          );
          reachedTargetYear = true;
          break;
        }

        start += batchSize;

        // Progressive delay based on how much data we're fetching
        const delayMs = Math.min(200 + totalBatches * 25, 1000); // 200ms to 1000ms
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Progress update every 10 batches for long-running scans
        if (totalBatches % 10 === 0) {
          console.error(`Progress: scanned ${allActivities.length} activities across ${totalBatches} batches`);
        }
      }

      console.error(
        `Completed historical scan: fetched ${allActivities.length} total activities from ${totalBatches} batches`
      );

      // Filter for running activities within date range
      const runningActivities = allActivities.filter((activity: any) => {
        const activityDate = new Date(activity.startTimeLocal);
        return this.isRunningActivity(activity) && activityDate >= startDate && activityDate <= endDate;
      });

      console.error(`Found ${runningActivities.length} running activities in the ${startYear} onwards period`);

      // Sort by date (newest first) and limit results
      const sortedActivities = runningActivities
        .sort((a: any, b: any) => new Date(b.startTimeLocal).getTime() - new Date(a.startTimeLocal).getTime())
        .slice(0, limit);

      const runWorkouts = sortedActivities.map((activity: any) => this.mapToRunWorkout(activity));

      console.error(`Final result: ${runWorkouts.length} historical runs from ${startYear} onwards`);

      if (runWorkouts.length > 0) {
        const oldestRun = runWorkouts[runWorkouts.length - 1];
        const newestRun = runWorkouts[0];
        console.error(`Date range of results: ${oldestRun.date} to ${newestRun.date}`);

        // Group by year to show distribution
        const yearCounts: { [year: string]: number } = {};
        runWorkouts.forEach((run) => {
          const year = run.date.split("-")[0];
          yearCounts[year] = (yearCounts[year] || 0) + 1;
        });
        console.error(`Distribution by year: ${JSON.stringify(yearCounts)}`);

        // Debug: Show sample of older runs to see if we have 2022 data
        const olderRuns = runWorkouts.filter((run) => parseInt(run.date.split("-")[0]) <= 2022);
        if (olderRuns.length > 0) {
          console.error(`✅ Found ${olderRuns.length} runs from 2022 or earlier!`);
          console.error(
            `Sample 2022 runs: ${olderRuns
              .slice(0, 3)
              .map((r) => `${r.date} ${r.distance}km`)
              .join(", ")}`
          );
        } else {
          console.error(`❌ No runs found from 2022 or earlier in final results`);
          // Debug the sorting - let's check what the oldest runs actually are
          const oldestFew = runWorkouts.slice(-5);
          console.error(`Oldest 5 runs in results: ${oldestFew.map((r) => `${r.date} ${r.distance}km`).join(", ")}`);
        }
      } else {
        console.error(`❌ No historical runs found from ${startYear}. This could mean:`);
        console.error(`  • No running data exists in your account from ${startYear}`);
        console.error(`  • Data is beyond the ${maxActivitiesToScan} activities we scanned`);
        console.error(`  • Try increasing the scan range or checking Garmin Connect directly`);
      }

      return runWorkouts;
    } catch (error) {
      console.error("Error fetching all historical runs:", error);
      throw new Error(`Failed to fetch historical runs: ${error}`);
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

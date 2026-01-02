import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function loadEnvFile() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, "../..");
    const envPath = path.join(projectRoot, ".env");

    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, "utf8");
      const lines = envFile.split("\n");

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith("#")) {
          const [key, ...valueParts] = trimmedLine.split("=");
          if (key && valueParts.length > 0) {
            const value = valueParts.join("=").replace(/^["']|["']$/g, "");
            process.env[key.trim()] = value;
          }
        }
      }
    }
  } catch (error) {
    // Silently continue if .env file cannot be loaded
  }
}

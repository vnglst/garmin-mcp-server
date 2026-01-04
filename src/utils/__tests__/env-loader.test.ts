import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadEnvFile } from "../env-loader.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.resolve(__dirname, "../../../.env.test");

describe("loadEnvFile", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
  });

  it("should load environment variables from .env file", () => {
    const envContent = `TEST_VAR1=value1
TEST_VAR2=value2
TEST_VAR3=value with spaces`;

    const projectRoot = path.resolve(__dirname, "../../..");
    const envPath = path.join(projectRoot, ".env");
    const originalContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

    try {
      fs.writeFileSync(envPath, envContent, "utf8");
      loadEnvFile();

      expect(process.env.TEST_VAR1).toBe("value1");
      expect(process.env.TEST_VAR2).toBe("value2");
      expect(process.env.TEST_VAR3).toBe("value with spaces");
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(envPath, originalContent, "utf8");
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });

  it("should handle variables with quotes", () => {
    const envContent = `TEST_QUOTED="quoted value"
TEST_SINGLE='single quoted'`;

    const projectRoot = path.resolve(__dirname, "../../..");
    const envPath = path.join(projectRoot, ".env");
    const originalContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

    try {
      fs.writeFileSync(envPath, envContent, "utf8");
      loadEnvFile();

      expect(process.env.TEST_QUOTED).toBe("quoted value");
      expect(process.env.TEST_SINGLE).toBe("single quoted");
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(envPath, originalContent, "utf8");
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });

  it("should skip comments and empty lines", () => {
    const envContent = `# This is a comment
TEST_VAR=test_value

# Another comment
`;

    const projectRoot = path.resolve(__dirname, "../../..");
    const envPath = path.join(projectRoot, ".env");
    const originalContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

    try {
      fs.writeFileSync(envPath, envContent, "utf8");
      loadEnvFile();

      expect(process.env.TEST_VAR).toBe("test_value");
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(envPath, originalContent, "utf8");
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });

  it("should handle values with equals signs", () => {
    const envContent = `TEST_URL=https://example.com?param=value&other=test`;

    const projectRoot = path.resolve(__dirname, "../../..");
    const envPath = path.join(projectRoot, ".env");
    const originalContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

    try {
      fs.writeFileSync(envPath, envContent, "utf8");
      loadEnvFile();

      expect(process.env.TEST_URL).toBe("https://example.com?param=value&other=test");
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(envPath, originalContent, "utf8");
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });

  it("should handle missing .env file gracefully", () => {
    const projectRoot = path.resolve(__dirname, "../../..");
    const envPath = path.join(projectRoot, ".env");
    const originalContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

    try {
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }

      expect(() => loadEnvFile()).not.toThrow();
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(envPath, originalContent, "utf8");
      }
    }
  });

  it("should not override existing environment variables", () => {
    const envContent = `TEST_EXISTING=from_dotenv`;

    const projectRoot = path.resolve(__dirname, "../../..");
    const envPath = path.join(projectRoot, ".env");
    const originalContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

    try {
      process.env.TEST_EXISTING = "from_process";
      fs.writeFileSync(envPath, envContent, "utf8");
      loadEnvFile();

      expect(process.env.TEST_EXISTING).toBe("from_process");
    } finally {
      if (originalContent !== null) {
        fs.writeFileSync(envPath, originalContent, "utf8");
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });
});

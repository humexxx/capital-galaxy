import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env
const { parsed } = dotenv.config({ path: ".env" });

// Prioritize the value from the file if available, to avoid stale process.env issues
const databaseUrl = parsed?.DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from .env");
}

console.log("--- Drizzle Config ---");
console.log("Using Database URL:", databaseUrl.replace(/:([^:@]+)@/, ":****@")); // Log masked URL
console.log("----------------------");

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});

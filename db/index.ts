import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres"; // 
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const url = connectionString.includes('?') ? `${connectionString}&sslmode=require` : `${connectionString}?sslmode=require`;

console.log("🔌 Connecting to DB at:", url.replace(/:[^:@]+@/, ":****@"));

// Disable prefetch as it is not supported for "Transaction" pool mode 
export const client = postgres(url, { prepare: false });
export const db = drizzle(client, { schema });

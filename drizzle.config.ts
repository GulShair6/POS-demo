import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL || "postgres://atlas:atlas@localhost:5432/atlas_pos" },
  strict: true,
  verbose: true
});

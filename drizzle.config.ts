import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads .env.local automatically at runtime; drizzle-kit does not, so load it here.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

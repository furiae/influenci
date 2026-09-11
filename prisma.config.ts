import { config as loadEnv } from "dotenv";
// Local dev keeps secrets in .env.local (vercel env pull); CI/Vercel inject real env.
loadEnv({ path: ".env.local" });
loadEnv();
import { defineConfig } from "prisma/config";

// Migrations need a direct (non-pooled) connection. Neon's Vercel integration
// exposes the unpooled URL under a few names depending on the install date.
const directUrl =
  process.env["DIRECT_URL"] ||
  process.env["DATABASE_URL_UNPOOLED"] ||
  process.env["POSTGRES_URL_NON_POOLING"] ||
  process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: directUrl,
  },
});

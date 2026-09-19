import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL!;

// Neon HTTP driver for Lakebase Postgres (serverless, works from edge);
// plain TCP pool for self-hosted Postgres (e.g. local Docker).
// The drizzle query-builder API is identical either way.
export const db = url.includes("neon.tech")
  ? drizzleNeon(neon(url), { schema })
  : drizzlePg(new Pool({ connectionString: url }), { schema });

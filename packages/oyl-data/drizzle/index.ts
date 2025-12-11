import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION,
});

export const db = drizzle({ client: pool });
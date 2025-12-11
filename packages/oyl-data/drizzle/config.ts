import path from 'path'
// import { config as dotenvConfig } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// dotenvConfig({ path: path.resolve(__dirname, "../../../.env") })

export default defineConfig({
  out: './generated',
  schema: path.join(__dirname, 'schema', '*'),
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgres://postgres:postgres@localhost:5441/oyl',
  },
});
import { integer, date, pgTable, varchar } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  birthdate: date().notNull(),
  createdAt: date().notNull().defaultNow(),
  updatedAt: date().notNull().defaultNow(),
  email: varchar({ length: 255 }).notNull().unique(),
  privateKey: varchar({ length: 255 }).notNull(),
  signHash: varchar({ length: 255 }).notNull(),
}).enableRLS()
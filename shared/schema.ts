import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobName: text("job_name").notNull(),
  jobNumber: text("job_number").notNull(),
  engineer: text("engineer"),
  location: text("location"),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const panels = pgTable("panels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  thickness: integer("thickness").notNull(),
  weight: integer("weight"),
  perimeter: jsonb("perimeter").notNull().$type<Array<{ id: string; x: number; y: number; radius?: number }>>(),
  openings: jsonb("openings").notNull().$type<Array<{ id: string; x: number; y: number; width: number; height: number; type: string }>>(),
  sketchLines: jsonb("sketch_lines").notNull().$type<Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>>(),
  connections: jsonb("connections").notNull().$type<Array<any>>(),
});

export const capacities = pgTable("capacities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text("type").notNull(),
  capacityX: integer("capacity_x").notNull(),
  capacityY: integer("capacity_y").notNull(),
  capacityZ: integer("capacity_z").notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPanelSchema = createInsertSchema(panels).omit({ id: true });
export const insertCapacitySchema = createInsertSchema(capacities).omit({ id: true });

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertPanel = z.infer<typeof insertPanelSchema>;
export type InsertCapacity = z.infer<typeof insertCapacitySchema>;

export type Project = typeof projects.$inferSelect;
export type Panel = typeof panels.$inferSelect;
export type Capacity = typeof capacities.$inferSelect;

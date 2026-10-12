import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), description: text("description").notNull().default(""),
  startDate: date("start_date").notNull(), archived: boolean("archived").notNull().default(false), calendar: jsonb("calendar").notNull().default({ workingDays: [1,2,3,4,5], holidays: [] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"), name: text("name").notNull(), duration: integer("duration").notNull().default(1), type: text("type").notNull().default("task"),
  percentComplete: integer("percent_complete").notNull().default(0), sortOrder: integer("sort_order").notNull().default(0), startConstraint: date("start_constraint"), startDate: date("start_date"), finishDate: date("finish_date"),
  notes: text("notes").notNull().default(""), expanded: boolean("expanded").notNull().default(true),
});
export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  predecessorId: uuid("predecessor_id").notNull().references(() => tasks.id, { onDelete: "cascade" }), successorId: uuid("successor_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("FS"), lag: integer("lag").notNull().default(0),
});
export const calendarExceptions = pgTable("calendar_exceptions", { id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), date: date("date").notNull(), working: boolean("working").notNull().default(false), name: text("name").notNull().default("") });
export const projectBaselines = pgTable("project_baselines", { id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), name: text("name").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const taskBaselines = pgTable("task_baselines", { id: uuid("id").defaultRandom().primaryKey(), baselineId: uuid("baseline_id").notNull().references(() => projectBaselines.id, { onDelete: "cascade" }), taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }), start: date("start"), finish: date("finish"), duration: integer("duration").notNull() });

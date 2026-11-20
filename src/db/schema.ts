import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export interface RouteWaypoint {
  lat: number;
  lng: number;
  label?: string;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  hostUserId: integer('host_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  city: text('city').notNull(),
  countryCode: text('country_code').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  distanceKm: doublePrecision('distance_km').notNull(),
  paceSecPerKm: integer('pace_sec_per_km').notNull(),
  paceGroup: text('pace_group').notNull(), // 'social' | 'tempo' | 'threshold' | 'long'
  surfaceType: text('surface_type').notNull(), // 'road' | 'park' | 'trail' | 'waterfront'
  meetingPoint: text('meeting_point').notNull(),
  description: text('description').notNull(),
  startLat: doublePrecision('start_lat').notNull(),
  startLng: doublePrecision('start_lng').notNull(),
  waypoints: jsonb('waypoints').$type<RouteWaypoint[]>().notNull().default([]),
  maxRunners: integer('max_runners').notNull().default(40),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const runRsvps = pgTable(
  'run_rsvps',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .references(() => runs.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('run_rsvps_run_user_idx').on(table.runId, table.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  hostedRuns: many(runs),
  rsvps: many(runRsvps),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  host: one(users, {
    fields: [runs.hostUserId],
    references: [users.id],
  }),
  rsvps: many(runRsvps),
}));

export const runRsvpsRelations = relations(runRsvps, ({ one }) => ({
  run: one(runs, {
    fields: [runRsvps.runId],
    references: [runs.id],
  }),
  user: one(users, {
    fields: [runRsvps.userId],
    references: [users.id],
  }),
}));

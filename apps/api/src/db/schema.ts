import { pgTable, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import type { MapSpec, Inspection } from '@vibe/shared';

// users — keyed by Clerk user id (text). Created on first authenticated request.
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user id
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('projects_user_idx').on(t.userId)],
);

// sources — an uploaded dataset. Raw file + converted GeoJSON live in object
// storage; we keep the keys + the inspection summary here.
export const sources = pgTable(
  'sources',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    format: text('format', { enum: ['geojson', 'shapefile', 'kml', 'gpx'] }).notNull(),
    status: text('status', { enum: ['inspecting', 'ready', 'failed'] })
      .notNull()
      .default('inspecting'),
    rawKey: text('raw_key').notNull(), // object key of the original upload
    geojsonKey: text('geojson_key'), // object key of the converted GeoJSON
    tilesKey: text('tiles_key'), // object key prefix of generated vector tiles
    sizeBytes: integer('size_bytes').notNull().default(0),
    inspection: jsonb('inspection').$type<Inspection>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sources_project_idx').on(t.projectId)],
);

export const maps = pgTable(
  'maps',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    spec: jsonb('spec').$type<MapSpec>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('maps_project_idx').on(t.projectId)],
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: text('id').primaryKey(),
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('share_links_map_idx').on(t.mapId)],
);

export type SourceRow = typeof sources.$inferSelect;
export type MapRow = typeof maps.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;

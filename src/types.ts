import type { FilterQuery, SortOrder } from 'mongoose';

/** Query option to include soft-deleted documents when soft delete is enabled. */
export interface AdvancedQueryOptions {
  /** When true, read queries do not filter out documents with `deletedAt` set. */
  includeDeleted?: boolean;
}

export interface SoftDeleteOptions {
  /** Field used for soft delete; default `deletedAt`. */
  field?: string;
  /** When true (default), register query middleware to exclude soft-deleted docs. */
  filterQueries?: boolean;
}

export interface PaginationOptions {
  /** Max page size allowed in `paginate`; default 100. */
  maxLimit?: number;
  /** Default page size when `limit` is omitted; default 10. */
  defaultLimit?: number;
}

export interface TimestampsUserOptions {
  /** When true, add `createdBy` / `updatedBy` ObjectId refs. */
  userTracking?: boolean;
  /** `ref` path for both fields; default `'User'`. */
  userRef?: string;
}

/** Embedded audit trail (array on the document). */
export interface AuditLogOptions {
  /** Top-level fields to track; omit to diff all comparable paths (excluding internal paths). */
  fields?: string[];
  /** Array field name; default `auditTrail`. */
  path?: string;
  /** Max audit entries kept (oldest dropped); default 200. */
  maxEntries?: number;
  /** `ref` for `actorId`; defaults to `timestamps.userRef` or `'User'`. */
  actorRef?: string;
}

export interface VersioningOptions {
  /**
   * When true (default), keep Mongoose optimistic concurrency via `versionKey` (see Mongoose docs).
   * Set `versionKey` to customize the key name.
   */
  optimistic?: boolean;
  /** Defaults to Mongoose’s `__v` unless the schema already defines one. */
  versionKey?: string;
  /** Append a snapshot after each successful save (uses a separate `updateOne` so hooks don’t recurse). */
  history?: boolean;
  /** Array path for snapshots; default `versionHistory`. */
  historyPath?: string;
  /** Keep only the last N snapshots; default 50. */
  maxSnapshots?: number;
  /** If set, only these top-level fields are stored in each snapshot. */
  snapshotFields?: string[];
  /** `ref` for `savedBy`; default `'User'`. */
  actorRef?: string;
}

export interface AdvancedPluginOptions {
  softDelete?: boolean | SoftDeleteOptions;
  pagination?: boolean | PaginationOptions;
  /**
   * Must be used together with Mongoose `timestamps: true` on the schema (recommended).
   * Adds `createdBy` / `updatedBy` when `userTracking` is true.
   */
  timestamps?: TimestampsUserOptions;
  /** Append embedded audit entries on create/update and soft-delete/restore when soft delete is enabled. */
  auditLog?: boolean | AuditLogOptions;
  /** Optimistic concurrency (`__v` / custom key) and optional version history snapshots. */
  versioning?: boolean | VersioningOptions;
}

export interface PaginateParams<TDoc> {
  /** 1-based page index; default 1. */
  page?: number;
  limit?: number;
  /** Extra filter merged into the query (soft-delete filter still applies unless overridden). */
  filter?: FilterQuery<TDoc>;
  sort?: Record<string, SortOrder> | string;
  /**
   * Case-insensitive regex match across `searchFields`.
   * Ignored if `searchFields` is empty or `search` is blank.
   */
  search?: string;
  /** Top-level string fields to match against `search`. */
  searchFields?: string[];
}

export interface PaginateResult<TDoc> {
  docs: TDoc[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

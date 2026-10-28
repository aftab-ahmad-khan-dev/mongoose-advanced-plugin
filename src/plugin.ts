import type { Schema } from 'mongoose';
import { applyAuditLog } from './audit-log';
import type { AuditContext } from './audit-log';
import { applyPagination } from './pagination';
import { applySoftDelete } from './soft-delete';
import type { AdvancedPluginOptions } from './types';
import { applyUserTracking } from './user-tracking';
import { applyVersioning } from './versioning';

function softDeleteFieldFrom(options?: AdvancedPluginOptions): string | undefined {
  const s = options?.softDelete;
  if (!s || s === true) return 'deletedAt';
  if (typeof s === 'object' && s.field) return s.field;
  return 'deletedAt';
}

/** Resolved embedded audit array path when `auditLog` is enabled (for versioning snapshot cleanup). */
function auditTrailPathFrom(options?: AdvancedPluginOptions): string | undefined {
  if (!options?.auditLog) return undefined;
  if (options.auditLog === true) return 'auditTrail';
  return options.auditLog.path ?? 'auditTrail';
}

/**
 * Mongoose plugin: soft delete, pagination, optional createdBy/updatedBy, audit trail, versioning.
 *
 * @example
 * ```ts
 * const schema = new Schema({ name: String }, { timestamps: true });
 * schema.plugin(advancedPlugin, {
 *   softDelete: true,
 *   pagination: true,
 *   timestamps: { userTracking: true },
 *   auditLog: { fields: ['name', 'status'] },
 *   versioning: { history: true, maxSnapshots: 20 },
 * });
 * ```
 */
export function advancedPlugin(schema: Schema, options?: AdvancedPluginOptions): void {
  applySoftDelete(schema, options?.softDelete);
  applyPagination(schema, options?.pagination);
  applyUserTracking(schema, options?.timestamps);

  const auditCtx: AuditContext = {
    userRef: options?.timestamps?.userRef,
  };
  if (options?.softDelete) {
    auditCtx.softDeleteField = softDeleteFieldFrom(options);
  }

  applyAuditLog(schema, options?.auditLog, auditCtx);
  applyVersioning(schema, options?.versioning, {
    auditTrailPath: auditTrailPathFrom(options),
  });
}

import { Schema } from 'mongoose';
import type { Types } from 'mongoose';
import type { AuditLogOptions } from './types';

type Lean = Record<string, unknown>;

function normalizeAuditOpts(
  input: boolean | AuditLogOptions | undefined
): AuditLogOptions | null {
  if (input === undefined || input === false) return null;
  if (input === true) return {};
  return input;
}

function pickPaths(obj: Lean, paths?: string[]): Lean {
  if (!paths?.length) return { ...obj };
  const out: Lean = {};
  for (const p of paths) {
    if (Object.prototype.hasOwnProperty.call(obj, p)) {
      out[p] = obj[p];
    }
  }
  return out;
}

function uniqueKeys(a: Lean, b: Lean): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(sortKeys(a as Lean)) === JSON.stringify(sortKeys(b as Lean));
    } catch {
      return false;
    }
  }
  return false;
}

function sortKeys(o: Lean): unknown {
  if (o === null || typeof o !== 'object' || o instanceof Date) return o;
  if (Array.isArray(o)) return o.map((x) => (typeof x === 'object' && x !== null ? sortKeys(x as Lean) : x));
  const sorted: Lean = {};
  for (const k of Object.keys(o).sort()) {
    const v = o[k];
    sorted[k] =
      v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
        ? sortKeys(v as Lean)
        : v;
  }
  return sorted;
}

function diffSnapshots(
  before: Lean,
  after: Lean,
  paths?: string[]
): Record<string, { from: unknown; to: unknown }> {
  const keys = paths?.length ? paths : uniqueKeys(before, after);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    if (k.startsWith('__')) continue;
    const a = after[k];
    const b = before[k];
    if (!deepEqual(a, b)) {
      changes[k] = { from: b, to: a };
    }
  }
  return changes;
}

export type AuditContext = {
  userRef?: string;
  /** Soft-delete field name when soft delete is enabled (default `deletedAt`). */
  softDeleteField?: string;
};

export function applyAuditLog(
  schema: Schema,
  raw: boolean | AuditLogOptions | undefined,
  ctx: AuditContext
): void {
  const opts = normalizeAuditOpts(raw);
  if (!opts) return;

  const trailPath = opts.path ?? 'auditTrail';
  const maxEntries = opts.maxEntries ?? 200;
  const fields = opts.fields;
  const actorRef = opts.actorRef ?? ctx.userRef ?? 'User';
  const delField = ctx.softDeleteField ?? 'deletedAt';

  const entrySchema = new Schema(
    {
      at: { type: Date, default: Date.now },
      action: {
        type: String,
        enum: ['create', 'update', 'soft_delete', 'restore'],
        required: true,
      },
      actorId: { type: Schema.Types.ObjectId, ref: actorRef },
      changes: { type: Schema.Types.Mixed },
      snapshot: { type: Schema.Types.Mixed },
    },
    { _id: true }
  );

  if (!schema.path(trailPath)) {
    schema.add({
      [trailPath]: { type: [entrySchema], default: [] },
    });
  }

  function stripTrail(o: Lean): Lean {
    const copy = { ...o };
    delete copy[trailPath];
    delete copy.__v;
    return copy;
  }

  function baselineLean(doc: { toObject: (o?: Record<string, unknown>) => Lean }, fp?: string[]): Lean {
    const o = stripTrail(doc.toObject({ depopulate: true, virtuals: false }) as Lean);
    return pickPaths(o, fp?.length ? fp : undefined);
  }

  schema.post('init', function postInitAudit(doc) {
    const d = doc as typeof doc & { $locals: Record<string, unknown> };
    d.$locals.__auditBaseline = baselineLean(doc, fields);
  });

  schema.pre('save', function preAuditSave(next) {
    const doc = this as typeof this & {
      isNew: boolean;
      $locals: Record<string, unknown>;
      get: (p: string) => unknown;
      modifiedPaths: (opts?: { includeChildren?: boolean }) => string[];
      _actorUserId?: Types.ObjectId;
      updatedBy?: Types.ObjectId;
    };

    const trail = doc.get(trailPath) as Array<Record<string, unknown>>;

    if (doc.isNew) {
      trail.push({
        at: new Date(),
        action: 'create',
        actorId: actorFrom(doc),
        snapshot: baselineLean(doc, fields),
      });
      trimTrail(trail, maxEntries);
      next();
      return;
    }

    const baseline = (doc.$locals.__auditBaseline ?? {}) as Lean;
    const current = baselineLean(doc, fields);
    const changes = diffSnapshots(baseline, current, fields);

    const meta = new Set([
      trailPath,
      '__v',
      'updatedAt',
      'createdAt',
      'documentVersion',
      'versionHistory',
    ]);

    const delChange = changes[delField];
    let action: 'soft_delete' | 'restore' | null = null;
    if (delChange && schema.path(delField)) {
      const wasEmpty = delChange.from == null || delChange.from === null;
      const nowEmpty = delChange.to == null || delChange.to === null;
      if (wasEmpty && !nowEmpty) action = 'soft_delete';
      if (!wasEmpty && nowEmpty) action = 'restore';
    }

    if (action) {
      trail.push({
        at: new Date(),
        action,
        actorId: actorFrom(doc),
        changes: { [delField]: delChange },
      });
      trimTrail(trail, maxEntries);
      next();
      return;
    }

    const filtered = Object.fromEntries(
      Object.entries(changes).filter(([k]) => !meta.has(k))
    );

    if (Object.keys(filtered).length === 0) {
      next();
      return;
    }

    trail.push({
      at: new Date(),
      action: 'update',
      actorId: actorFrom(doc),
      changes: filtered,
    });
    trimTrail(trail, maxEntries);

    next();
  });

  schema.post('save', function postAuditSave(doc) {
    const d = doc as typeof doc & { $locals: Record<string, unknown> };
    d.$locals.__auditBaseline = baselineLean(doc, fields);
  });
}

function actorFrom(doc: {
  _actorUserId?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}): Types.ObjectId | undefined {
  return doc._actorUserId ?? doc.updatedBy;
}

function trimTrail(trail: { length: number; splice: (s: number, d: number) => void }, max: number): void {
  if (trail.length <= max) return;
  trail.splice(0, trail.length - max);
}

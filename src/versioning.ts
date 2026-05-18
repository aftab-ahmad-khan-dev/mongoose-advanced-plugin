import { Schema } from 'mongoose';
import type { Types } from 'mongoose';
import type { VersioningOptions } from './types';

function normalizeVersioning(
  input: boolean | VersioningOptions | undefined
): VersioningOptions | null {
  if (input === undefined || input === false) return null;
  if (input === true) return { optimistic: true };
  return input;
}

export type VersioningContext = {
  /** Strip this embedded audit array from snapshots (matches `auditLog.path`, default `auditTrail`). */
  auditTrailPath?: string;
};

function pickSnapshot(
  obj: Record<string, unknown>,
  paths: string[] | undefined,
  historyPath: string,
  auditTrailPath?: string
): Record<string, unknown> {
  const trail = auditTrailPath ?? 'auditTrail';
  if (!paths?.length) {
    const copy = { ...obj };
    delete copy[historyPath];
    delete copy[trail];
    return copy;
  }
  const out: Record<string, unknown> = {};
  for (const p of paths) {
    if (Object.prototype.hasOwnProperty.call(obj, p)) {
      out[p] = obj[p];
    }
  }
  return out;
}

export function applyVersioning(
  schema: Schema,
  raw: boolean | VersioningOptions | undefined,
  ctx?: VersioningContext
): void {
  const opts = normalizeVersioning(raw);
  if (!opts) return;

  const vk = opts.versionKey ?? '__v';
  if (opts.optimistic !== false) {
    schema.set('versionKey', vk);
  }

  if (!opts.history) return;

  const path = opts.historyPath ?? 'versionHistory';
  const max = Math.max(1, opts.maxSnapshots ?? 50);
  const snapFields = opts.snapshotFields;
  const actorRef = opts.actorRef ?? 'User';
  const auditTrailPath = ctx?.auditTrailPath;

  if (!schema.path(path)) {
    schema.add({
      [path]: [
        {
          version: { type: Number, required: true },
          savedAt: { type: Date, default: Date.now },
          savedBy: { type: Schema.Types.ObjectId, ref: actorRef },
          snapshot: { type: Schema.Types.Mixed, required: true },
        },
      ],
    });
  }

  schema.post('save', function postVersionHistory(doc, next) {
    const Model = doc.constructor as typeof doc.constructor & {
      collection: { updateOne: (f: unknown, u: unknown) => Promise<unknown> };
    };

    const plain = doc.toObject({ depopulate: true, virtuals: false }) as Record<string, unknown>;
    const snapshot = pickSnapshot(plain, snapFields, path, auditTrailPath);

    const entry = {
      version: doc.get(vk) as number,
      savedAt: new Date(),
      savedBy: (doc as { _actorUserId?: Types.ObjectId; updatedBy?: Types.ObjectId })._actorUserId ??
        (doc as { updatedBy?: Types.ObjectId }).updatedBy,
      snapshot,
    };

    Model.collection
      .updateOne(
        { _id: doc._id },
        {
          $push: {
            [path]: {
              $each: [entry],
              $slice: -max,
            },
          },
        } as Record<string, unknown>
      )
      .then(() => next())
      .catch(next);
  });
}

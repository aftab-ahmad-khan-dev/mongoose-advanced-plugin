import { Schema } from 'mongoose';
import type { Document, Types } from 'mongoose';
import type { TimestampsUserOptions } from './types';

type ActorDoc = Document & {
  isNew: boolean;
  set: (path: string, val: unknown) => void;
  _actorUserId?: Types.ObjectId;
};

export function applyUserTracking(schema: Schema, opts?: TimestampsUserOptions): void {
  if (!opts?.userTracking) return;

  const ref = opts.userRef ?? 'User';

  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref, index: true },
  });

  schema.pre('save', function preSaveWithActor(next) {
    const doc = this as ActorDoc;
    const uid = doc._actorUserId;
    if (uid) {
      if (doc.isNew) doc.set('createdBy', uid);
      doc.set('updatedBy', uid);
    }
    next();
  });

  schema.methods.setActorForSave = function setActorForSave(this: ActorDoc, userId: Types.ObjectId) {
    this._actorUserId = userId;
    return this;
  };
}

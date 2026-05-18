import type { Schema } from 'mongoose';
import type { SoftDeleteOptions } from './types';

const DEFAULT_FIELD = 'deletedAt';

function normalizeSoftDeleteOptions(
  input: boolean | SoftDeleteOptions | undefined
): SoftDeleteOptions | null {
  if (input === false || input === undefined) return null;
  if (input === true) return {};
  return input;
}

export function applySoftDelete(schema: Schema, raw?: boolean | SoftDeleteOptions): void {
  const opts = normalizeSoftDeleteOptions(raw);
  if (!opts) return;

  const field = opts.field ?? DEFAULT_FIELD;
  const filterQueries = opts.filterQueries !== false;

  if (!schema.path(field)) {
    schema.add({
      [field]: { type: Date, default: null, index: true },
    });
  }

  schema.methods.softDelete = async function softDelete(this: {
    save: () => Promise<unknown>;
    set: (key: string, value: unknown) => void;
  }) {
    this.set(field, new Date());
    return this.save();
  };

  schema.methods.restore = async function restore(this: {
    save: () => Promise<unknown>;
    set: (key: string, value: unknown) => void;
  }) {
    this.set(field, null);
    return this.save();
  };

  if (!filterQueries) return;

  const excludeDeleted = function excludeDeleted(this: {
    getOptions: () => { includeDeleted?: boolean };
    where: (v: Record<string, unknown>) => unknown;
  }) {
    const qOpts = this.getOptions() as { includeDeleted?: boolean };
    if (!qOpts.includeDeleted) {
      this.where({ [field]: null });
    }
  };

  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('findOneAndUpdate', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);
}

import type { FilterQuery, Model, Schema } from 'mongoose';
import type {
  PaginationOptions as PaginationPluginOptions,
  PaginateParams,
  PaginateResult,
} from './types';

export function applyPagination(
  schema: Schema,
  raw?: boolean | PaginationPluginOptions
): void {
  if (raw === false || raw === undefined) return;

  const maxLimit = typeof raw === 'object' && raw.maxLimit != null ? raw.maxLimit : 100;
  const defaultLimit =
    typeof raw === 'object' && raw.defaultLimit != null ? raw.defaultLimit : 10;

  schema.statics.paginate = async function paginate<T>(
    this: Model<T>,
    params: PaginateParams<T>
  ): Promise<PaginateResult<T>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const limit = Math.min(
      maxLimit,
      Math.max(1, Math.floor(params.limit ?? defaultLimit))
    );
    const skip = (page - 1) * limit;

    const base = { ...(params.filter ?? {}) } as FilterQuery<T>;
    let filter: FilterQuery<T> = base;

    const q = params.search?.trim();
    if (q && params.searchFields && params.searchFields.length > 0) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const searchPart = {
        $or: params.searchFields.map((f) => ({ [f]: rx } as Record<string, RegExp>)),
      };

      const hasFilter = Object.keys(base as object).length > 0;
      filter = (
        hasFilter ? { $and: [base, searchPart] } : searchPart
      ) as FilterQuery<T>;
    }

    const sort = params.sort ?? { _id: -1 };

    const [docs, total] = await Promise.all([
      this.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.countDocuments(filter).exec(),
    ]);

    const pages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      docs,
      total,
      page,
      limit,
      pages,
      hasNextPage: page < pages,
      hasPrevPage: page > 1,
    };
  };
}

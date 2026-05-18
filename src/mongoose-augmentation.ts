import type { AdvancedQueryOptions } from './types';

declare module 'mongoose' {
  interface QueryOptions extends AdvancedQueryOptions {}
}

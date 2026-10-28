import './mongoose-augmentation';
import 'dotenv/config'

export type { VersioningContext } from './versioning';

export { advancedPlugin } from './plugin';
export type {
  AdvancedPluginOptions,
  AdvancedQueryOptions,
  AuditLogOptions,
  PaginateParams,
  PaginateResult,
  PaginationOptions,
  SoftDeleteOptions,
  TimestampsUserOptions,
  VersioningOptions,
} from './types'

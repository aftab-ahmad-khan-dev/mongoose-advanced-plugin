# Changelog

## [0.2.0] — 2026-05-10

### Added

- **`auditLog`** ([`src/audit-log.ts`](src/audit-log.ts)): embedded trail (default **`auditTrail`**) with actions **`create`**, **`update`** (per-field **`{ from, to }`** diffs), **`soft_delete`**, **`restore`** when soft delete is enabled. Options: **`fields`**, **`path`**, **`maxEntries`**, **`actorRef`**. **`actorId`** uses **`_actorUserId`** or **`updatedBy`** (with **`setActorForSave`**). Soft-delete field name follows **`softDelete`** (`deletedAt` or custom **`field`**).
- **`versioning`** ([`src/versioning.ts`](src/versioning.ts)): **`versionKey`** (default **`__v`**, overridable) for optimistic concurrency; optional **`history`** with **`versionHistory`** (or **`historyPath`**); each **`save()`** appends via **`collection.updateOne`** with **`$push` / `$slice`**; **`maxSnapshots`** defaults to **50**, minimum **1**.

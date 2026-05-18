Co-authored-by: Aftab Ahmad Khan <dev.aftabahmadkhan@gmail.com>

# mongoose-advanced-plugin
**Mongoose 8+** plugin: **soft delete**, **`Model.paginate`**, **actor fields** (`createdBy` / `updatedBy`), **embedded audit trail** (`auditLog`), and **optimistic locking + version history** (`versioning`). Written in TypeScript with full type exports.

**Author:** [Aftab Ahmad Khan](https://github.com/aftab-ahmad-khan-dev) · **Repository:** [mongoose-advanced-plugin](https://github.com/aftab-ahmad-khan-dev/mongoose-advanced-plugin) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

---
## Install

```bash
npm install mongoose-advanced-plugin mongoose
```

`mongoose` is a **peer dependency** (install it in your app).

---

## Quick start

Register the plugin once per schema. Only enable the features you need.

```ts
import mongoose, { Schema } from "mongoose";
import { advancedPlugin } from "mongoose-advanced-plugin";

const articleSchema = new Schema(
  { title: String, body: String },
  { timestamps: true },
);

articleSchema.plugin(advancedPlugin, {
  softDelete: true,
  pagination: true,
});

export const Article = mongoose.model("Article", articleSchema);
```

Then:

- **Lists** default exclude soft-deleted rows (`deletedAt != null`).
- **Pagination:** `await Article.paginate({ page: 1, limit: 10, filter: {}, sort: { createdAt: -1 } })`.

---

## Full example (all major options)

```ts
import mongoose, { Schema, Types } from "mongoose";
import { advancedPlugin } from "mongoose-advanced-plugin";

const projectSchema = new Schema(
  {
    name: String,
    slug: String,
    status: { type: String, enum: ["draft", "live"] },
  },
  { timestamps: true },
);

projectSchema.plugin(advancedPlugin, {
  softDelete: true,
  pagination: {
    maxLimit: 50,
    defaultLimit: 15,
  },
  timestamps: {
    userTracking: true,
    userRef: "User",
  },
  auditLog: {
    fields: ["name", "slug", "status"],
    path: "auditTrail",
    maxEntries: 150,
    actorRef: "User",
  },
  versioning: {
    optimistic: true,
    versionKey: "__v",
    history: true,
    historyPath: "versionHistory",
    maxSnapshots: 25,
    snapshotFields: ["name", "slug", "status"],
    actorRef: "User",
  },
});

export const Project = mongoose.model("Project", projectSchema);
```

**Saving with an actor** (fills `createdBy` / `updatedBy`, audit `actorId`, history `savedBy` when set):

```ts
const userId = new Types.ObjectId(/* … */);
const doc = new Project({ name: "Alpha", slug: "alpha", status: "draft" });
await doc.setActorForSave(userId).save();
```

---

## Feature guides

### Soft delete

| Plugin option                          | Meaning                                             |
| -------------------------------------- | --------------------------------------------------- |
| `softDelete: true`                     | Adds **`deletedAt`** (`Date`, nullable, indexed).   |
| `softDelete: { field: 'removedAt' }`   | Custom delete field name.                           |
| `softDelete: { filterQueries: false }` | Do **not** auto-filter reads (you filter manually). |

**Queries:** `find`, `findOne`, `findOneAndUpdate`, `countDocuments` automatically add `{ deletedAt: null }` (or your custom field) unless you opt out:

```ts
await Model.find({ status: "live" }); // excludes soft-deleted

await Model.find({ status: "live" }).setOptions({ includeDeleted: true }); // includes them
```

TypeScript picks up `includeDeleted` on query options when you import the package (ambient augmentation).

**Document helpers:**

```ts
await doc.softDelete(); // sets delete field → save
await doc.restore(); // clears delete field → save
```

---

### Pagination

Enable with `pagination: true` or tune defaults:

| Option                    | Default |
| ------------------------- | ------- |
| `pagination.maxLimit`     | `100`   |
| `pagination.defaultLimit` | `10`    |

**Static method:** `Model.paginate(params)` → `PaginateResult`.

```ts
const result = await Article.paginate({
  page: 1,
  limit: 10,
  filter: { status: "published" },
  sort: { updatedAt: -1 },
  search: "mongodb",
  searchFields: ["title", "body"],
});

// result.docs, result.total, result.page, result.limit, result.pages,
// result.hasNextPage, result.hasPrevPage
```

- **`page`** / **`limit`**: page is clamped to ≥ 1; limit to ≥ 1 and ≤ `maxLimit`.
- **`search`** + **`searchFields`**: case-insensitive substring match (regex-safe escaping); combined with **`filter`** via `$and` when both are present.

---

### User tracking (`timestamps`)

Requires **`{ timestamps: true }`** on the schema.

| Option                          | Description                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `timestamps.userTracking: true` | Adds **`createdBy`** and **`updatedBy`** (`ObjectId`, indexed). |
| `timestamps.userRef`            | `ref` name (default `'User'`).                                  |

Always use **`setActorForSave(userId)`** before **`save()`** when you want actor metadata:

```ts
await doc.setActorForSave(actorObjectId).save();
```

If you never call it, `createdBy` / `updatedBy` stay unset on create/update paths that rely on this hook.

---

### Audit log (`auditLog`)

| Option           | Default                          | Description                                              |
| ---------------- | -------------------------------- | -------------------------------------------------------- |
| `auditLog: true` | —                                | Same as `{}`: trail at **`auditTrail`**, broad diffs.    |
| `fields`         | —                                | Limit diffs to these **top-level** fields (recommended). |
| `path`           | `'auditTrail'`                   | Embedded array field name.                               |
| `maxEntries`     | `200`                            | Oldest entries removed when over limit.                  |
| `actorRef`       | `timestamps.userRef` or `'User'` | `ref` for **`actorId`**.                                 |

Each entry includes **`at`**, **`action`**, optional **`actorId`**, and either **`changes`** or **`snapshot`**.

| Action            | When                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| **`create`**      | First persisted save (`isNew`).                                       |
| **`update`**      | Field changes vs internal baseline (`changes[field] = { from, to }`). |
| **`soft_delete`** | Delete field went from empty → date (needs **`softDelete`** enabled). |
| **`restore`**     | Delete field went from date → empty.                                  |

Use **`setActorForSave`** so **`actorId`** aligns with the acting user when possible.

---

### Versioning (`versioning`)

| Option             | Default            | Description                                                                  |
| ------------------ | ------------------ | ---------------------------------------------------------------------------- |
| `versioning: true` | —                  | Same as `{ optimistic: true }` (only concurrency key).                       |
| `optimistic`       | `true`             | Sets **`schema.set('versionKey', …)`** (see **`versionKey`**).               |
| `versionKey`       | `'__v'`            | Mongoose optimistic concurrency field name.                                  |
| `history`          | `false`            | When **`true`**, append snapshots after each **`save()`**.                   |
| `historyPath`      | `'versionHistory'` | Array path for history entries.                                              |
| `maxSnapshots`     | `50`               | Keep last **N** entries via **`$slice`** (minimum **1**).                    |
| `snapshotFields`   | —                  | If set, snapshot only these fields; else full document minus trails/history. |
| `actorRef`         | `'User'`           | `ref` for **`savedBy`**.                                                     |

History rows are written with **`collection.updateOne`** (`$push` + `$slice`) so middleware does not recurse. **Reload** the document if you need the latest **`versionHistory`** immediately after save in the same process.

Handle concurrent updates with Mongoose’s usual **`VersionError`** pattern when two saves race on the same **`__v`** (or custom **`versionKey`**).

---

## TypeScript

Types are published under **`dist/*.d.ts`**. Import options and helpers:

```ts
import type {
  AdvancedPluginOptions,
  AuditLogOptions,
  PaginateParams,
  PaginateResult,
  PaginationOptions,
  SoftDeleteOptions,
  TimestampsUserOptions,
  VersioningOptions,
} from "mongoose-advanced-plugin";
```

`VersioningContext` is exported for advanced extension use.

`import 'mongoose-advanced-plugin'` extends **`mongoose.QueryOptions`** with optional **`includeDeleted?: boolean`**.

---

## MERN / Express (sketch)

```ts
// models/Project.ts — register plugin (see examples above).
// routes/projects.ts
import { Router } from "express";
import { Project } from "../models/Project.js";
import { Types } from "mongoose";

const r = Router();

r.get("/projects", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const { docs, total, pages, hasNextPage } = await Project.paginate({
    page,
    limit: 20,
    filter: { status: "live" },
    sort: { updatedAt: -1 },
  });
  res.json({ data: docs, total, page, pages, hasNextPage });
});

r.post("/projects", async (req, res) => {
  const userId = new Types.ObjectId(req.user.id);
  const doc = new Project(req.body);
  await doc.setActorForSave(userId).save();
  res.status(201).json(doc);
});
```

---

## Plugin option cheat sheet

```ts
advancedPlugin(schema, {
  softDelete: true | SoftDeleteOptions,
  pagination: true | PaginationOptions,
  timestamps: { userTracking?: boolean; userRef?: string },
  auditLog: true | AuditLogOptions,
  versioning: true | VersioningOptions,
});
```

See **`AdvancedPluginOptions`** in the published types for the exact shape.

---

## Limitations

- Soft-delete middleware does **not** hook **`aggregate()`** — add **`$match`** on your delete field in pipelines.
- **`paginate` `search`** is regex substring search, not Atlas Search / text indexes.
- Version **history** uses an extra DB write per save; reload to see the array on the in-memory document if needed.

---

## Scripts (this repo)

| Command         | Description                              |
| --------------- | ---------------------------------------- |
| `npm run build` | Compile `src/` → `dist/`                 |
| `npm test`      | Build, then Jest + mongodb-memory-server |
| `npm run lint`  | `tsc --noEmit`                           |

---

## License

MIT © [Aftab Ahmad Khan](https://github.com/aftab-ahmad-khan-dev). See [LICENSE](./LICENSE).

Open For remarks

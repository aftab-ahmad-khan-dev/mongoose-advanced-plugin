const mongoose = require('mongoose');
const { Schema, Types } = mongoose;
const { advancedPlugin } = require('../dist/index.js');

function register(name, schema) {
  if (mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
  return mongoose.model(name, schema);
}

describe('advancedPlugin', () => {
  describe('soft delete', () => {
    it('soft-deletes, hides by default, and restores', async () => {
      const schema = new Schema({ name: String });
      schema.plugin(advancedPlugin, { softDelete: true });
      const M = register('SoftUserTest', schema);

      await M.deleteMany({});
      const doc = await M.create({ name: 'a' });

      const visibleBefore = await M.find({ name: 'a' });
      expect(visibleBefore).toHaveLength(1);

      await doc.softDelete();

      const visibleAfter = await M.find({ name: 'a' });
      expect(visibleAfter).toHaveLength(0);

      const included = await M.find({ name: 'a' }).setOptions({ includeDeleted: true });
      expect(included).toHaveLength(1);

      await included[0].restore();
      const visibleRestored = await M.find({ name: 'a' });
      expect(visibleRestored).toHaveLength(1);
    });

    it('respects custom soft-delete field name', async () => {
      const schema = new Schema({ name: String });
      schema.plugin(advancedPlugin, {
        softDelete: { field: 'removedAt', filterQueries: true },
      });
      const M = register('SoftCustomField', schema);

      await M.deleteMany({});
      const doc = await M.create({ name: 'x' });
      await doc.softDelete();

      const hidden = await M.find({ name: 'x' });
      expect(hidden).toHaveLength(0);

      const row = await M.findOne({ name: 'x' }).setOptions({ includeDeleted: true }).lean();
      expect(row.removedAt).toBeInstanceOf(Date);
    });

    it('does not filter queries when filterQueries is false', async () => {
      const schema = new Schema({ name: String });
      schema.plugin(advancedPlugin, {
        softDelete: { filterQueries: false },
      });
      const M = register('SoftNoFilter', schema);

      await M.deleteMany({});
      const doc = await M.create({ name: 'y' });
      await doc.softDelete();

      const stillFound = await M.find({ name: 'y' });
      expect(stillFound).toHaveLength(1);
      expect(stillFound[0].deletedAt).toBeInstanceOf(Date);
    });

    it('countDocuments excludes soft-deleted unless includeDeleted', async () => {
      const schema = new Schema({ code: Number });
      schema.plugin(advancedPlugin, { softDelete: true });
      const M = register('SoftCount', schema);

      await M.deleteMany({});
      const a = await M.create({ code: 1 });
      await M.create({ code: 2 });
      await a.softDelete();

      expect(await M.countDocuments({})).toBe(1);
      expect(await M.countDocuments({}).setOptions({ includeDeleted: true })).toBe(2);
    });

    it('findOneAndUpdate targets only non-deleted by default', async () => {
      const schema = new Schema({ name: String, extra: String });
      schema.plugin(advancedPlugin, { softDelete: true });
      const M = register('SoftFAU', schema);

      await M.deleteMany({});
      const doc = await M.create({ name: 'z' });
      await doc.softDelete();

      const updated = await M.findOneAndUpdate(
        { name: 'z' },
        { extra: 'nope' },
        { new: true }
      );
      expect(updated).toBeNull();

      const forced = await M.findOneAndUpdate(
        { name: 'z' },
        { extra: 'yes' },
        { new: true }
      ).setOptions({ includeDeleted: true });
      expect(forced.extra).toBe('yes');
    });
  });

  describe('pagination', () => {
    it('paginates with search merged into filter', async () => {
      const schema = new Schema({ title: String, status: String });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageTest', schema);

      await M.deleteMany({});
      await M.insertMany([
        { title: 'hello world', status: 'open' },
        { title: 'hello there', status: 'open' },
        { title: 'other', status: 'open' },
        { title: 'hello moon', status: 'closed' },
      ]);

      const result = await M.paginate({
        page: 1,
        limit: 10,
        filter: { status: 'open' },
        search: 'hello',
        searchFields: ['title'],
      });

      expect(result.total).toBe(2);
      expect(result.docs).toHaveLength(2);
      expect(result.pages).toBe(1);
      expect(result.hasPrevPage).toBe(false);
      expect(result.hasNextPage).toBe(false);
    });

    it('handles empty results and zero pages', async () => {
      const schema = new Schema({ n: Number });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageEmpty', schema);

      await M.deleteMany({});
      const result = await M.paginate({ page: 1, limit: 10, filter: { n: 999 } });

      expect(result.total).toBe(0);
      expect(result.pages).toBe(0);
      expect(result.docs).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPrevPage).toBe(false);
    });

    it('clamps page to >= 1 and limit to >= 1', async () => {
      const schema = new Schema({ id: Number });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageClamp', schema);

      await M.deleteMany({});
      await M.insertMany([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const r = await M.paginate({ page: 0, limit: 0 });
      expect(r.page).toBe(1);
      expect(r.limit).toBe(1);
      expect(r.docs.length).toBeLessThanOrEqual(1);
    });

    it('respects maxLimit', async () => {
      const schema = new Schema({ x: Number });
      schema.plugin(advancedPlugin, { pagination: { maxLimit: 2, defaultLimit: 10 } });
      const M = register('PageMax', schema);

      await M.deleteMany({});
      await M.insertMany([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const r = await M.paginate({ page: 1, limit: 100 });
      expect(r.limit).toBe(2);
      expect(r.docs).toHaveLength(2);
      expect(r.total).toBe(3);
      expect(r.hasNextPage).toBe(true);
    });

    it('second page returns remainder and flags', async () => {
      const schema = new Schema({ ord: Number });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageSecond', schema);

      await M.deleteMany({});
      await M.insertMany([{ ord: 1 }, { ord: 2 }, { ord: 3 }]);

      const r = await M.paginate({ page: 2, limit: 2, sort: { ord: 1 } });
      expect(r.docs).toHaveLength(1);
      expect(r.total).toBe(3);
      expect(r.pages).toBe(2);
      expect(r.hasPrevPage).toBe(true);
      expect(r.hasNextPage).toBe(false);
    });

    it('ignores search when searchFields is empty', async () => {
      const schema = new Schema({ title: String });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageSearchSkip', schema);

      await M.deleteMany({});
      await M.insertMany([{ title: 'alpha' }, { title: 'beta' }]);

      const r = await M.paginate({
        page: 1,
        limit: 10,
        search: 'alpha',
        searchFields: [],
      });
      expect(r.total).toBe(2);
    });

    it('escapes regex special characters in search', async () => {
      const schema = new Schema({ title: String });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageRegexEsc', schema);

      await M.deleteMany({});
      await M.insertMany([{ title: 'a+b' }, { title: 'aab' }]);

      const r = await M.paginate({
        page: 1,
        limit: 10,
        search: 'a+b',
        searchFields: ['title'],
      });
      expect(r.total).toBe(1);
      expect(r.docs[0].title).toBe('a+b');
    });

    it('merges search with filter that uses $or', async () => {
      const schema = new Schema({ title: String, tag: String });
      schema.plugin(advancedPlugin, { pagination: true });
      const M = register('PageOrFilter', schema);

      await M.deleteMany({});
      await M.insertMany([
        { title: 'alpha-unique', tag: 'a' },
        { title: 'bar', tag: 'b' },
        { title: 'gamma', tag: 'c' },
      ]);

      const r = await M.paginate({
        page: 1,
        limit: 10,
        filter: { $or: [{ tag: 'a' }, { tag: 'c' }] },
        search: 'alpha',
        searchFields: ['title'],
      });
      expect(r.total).toBe(1);
      expect(r.docs[0].title).toBe('alpha-unique');
    });
  });

  describe('user tracking', () => {
    it('sets createdBy / updatedBy when using setActorForSave', async () => {
      const schema = new Schema({ label: String }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        timestamps: { userTracking: true, userRef: 'User' },
      });
      const M = register('ActorTest', schema);

      await M.deleteMany({});
      const uid = new Types.ObjectId();

      const doc = new M({ label: 'x' });
      await doc.setActorForSave(uid).save();

      const row = await M.findById(doc._id).lean();
      expect(row.createdBy.toString()).toBe(uid.toString());
      expect(row.updatedBy.toString()).toBe(uid.toString());
    });

    it('updates updatedBy on subsequent saves with a new actor', async () => {
      const schema = new Schema({ label: String }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        timestamps: { userTracking: true, userRef: 'User' },
      });
      const M = register('ActorUpdate', schema);

      await M.deleteMany({});
      const u1 = new Types.ObjectId();
      const u2 = new Types.ObjectId();

      const doc = new M({ label: 'm' });
      await doc.setActorForSave(u1).save();
      doc.label = 'n';
      await doc.setActorForSave(u2).save();

      const row = await M.findById(doc._id).lean();
      expect(row.createdBy.toString()).toBe(u1.toString());
      expect(row.updatedBy.toString()).toBe(u2.toString());
    });

    it('does not set actor fields when setActorForSave is not used', async () => {
      const schema = new Schema({ label: String }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        timestamps: { userTracking: true, userRef: 'User' },
      });
      const M = register('ActorNone', schema);

      await M.deleteMany({});
      const doc = await M.create({ label: 'solo' });
      const row = await M.findById(doc._id).lean();
      expect(row.createdBy).toBeUndefined();
      expect(row.updatedBy).toBeUndefined();
    });
  });

  describe('audit log', () => {
    it('records create and tracked field updates', async () => {
      const schema = new Schema({ name: String, other: String }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        auditLog: { fields: ['name'], maxEntries: 50 },
      });
      const M = register('AuditBasic', schema);

      await M.deleteMany({});
      const doc = await M.create({ name: 'a', other: 'x' });
      doc.name = 'b';
      await doc.save();

      const row = await M.findById(doc._id).lean();
      expect(row.auditTrail.length).toBe(2);
      expect(row.auditTrail[0].action).toBe('create');
      expect(row.auditTrail[1].action).toBe('update');
      expect(row.auditTrail[1].changes.name.to).toBe('b');
    });

    it('records soft_delete and restore when soft delete is enabled', async () => {
      const schema = new Schema({ name: String }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        softDelete: true,
        auditLog: { path: 'auditTrail' },
      });
      const M = register('AuditSoft', schema);

      await M.deleteMany({});
      const doc = await M.create({ name: 'z' });
      await doc.softDelete();

      let row = await M.findById(doc._id)
        .setOptions({ includeDeleted: true })
        .lean();
      expect(row.auditTrail.some((e) => e.action === 'soft_delete')).toBe(true);

      const again = await M.findById(doc._id).setOptions({ includeDeleted: true });
      await again.restore();

      row = await M.findById(doc._id).lean();
      expect(row.auditTrail.some((e) => e.action === 'restore')).toBe(true);
    });
  });

  describe('versioning', () => {
    it('appends history snapshots after saves', async () => {
      const schema = new Schema({ n: Number }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        versioning: { history: true, maxSnapshots: 10, snapshotFields: ['n'] },
      });
      const M = register('VerHist', schema);

      await M.deleteMany({});
      const doc = await M.create({ n: 1 });
      doc.n = 2;
      await doc.save();

      const row = await M.findById(doc._id).lean();
      expect(row.versionHistory.length).toBe(2);
      expect(row.versionHistory[0].snapshot.n).toBe(1);
      expect(row.versionHistory[1].snapshot.n).toBe(2);
    });

    it('respects maxSnapshots via $slice', async () => {
      const schema = new Schema({ k: Number }, { timestamps: true });
      schema.plugin(advancedPlugin, {
        versioning: { history: true, maxSnapshots: 2, snapshotFields: ['k'] },
      });
      const M = register('VerSlice', schema);

      await M.deleteMany({});
      let doc = await M.create({ k: 0 });
      for (let i = 1; i <= 4; i += 1) {
        doc.k = i;
        await doc.save();
      }

      const row = await M.findById(doc._id).lean();
      expect(row.versionHistory.length).toBe(2);
      expect(row.versionHistory[1].snapshot.k).toBe(4);
    });
  });

  describe('combined features', () => {
    it('applies soft-delete filter to paginate results', async () => {
      const schema = new Schema({ name: String });
      schema.plugin(advancedPlugin, { softDelete: true, pagination: true });
      const M = register('ComboPage', schema);

      await M.deleteMany({});
      const live = await M.create({ name: 'live' });
      const gone = await M.create({ name: 'gone' });
      await gone.softDelete();

      const r = await M.paginate({ page: 1, limit: 10, filter: {} });
      expect(r.total).toBe(1);
      expect(r.docs).toHaveLength(1);
      expect(r.docs[0]._id.toString()).toBe(live._id.toString());
    });
  });
});

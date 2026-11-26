import { Database } from '@nocobase/database';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregateTableSummary } from '../aggregate';

describe('date non-empty counts with a real NocoBase repository', () => {
  const tableName = `summary_count_test_${randomBytes(6).toString('hex')}`;
  let database: Database;
  let collection: any;
  let created = false;

  beforeAll(async () => {
    if (!process.env.DB_DIALECT || !process.env.DB_DATABASE) {
      throw new Error('Load database settings with node -r dotenv/config before running integration tests');
    }
    database = new Database({
      dialect: process.env.DB_DIALECT as any,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_DATABASE,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      logging: false,
    });
    collection = database.collection({
      name: tableName,
      timestamps: false,
      fields: [
        { name: 'recordedAt', type: 'date' },
        { name: 'recordedOn', type: 'dateOnly' },
        { name: 'active', type: 'boolean' },
        { name: 'amount', type: 'double' },
        { name: 'label', type: 'string' },
        { name: 'flag', type: 'boolean' },
      ],
    });
    await collection.model.sync();
    created = true;
    await collection.repository.createMany({ records: [
      { recordedAt: '2026-01-02T00:00:00Z', recordedOn: '2026-01-02', active: true, amount: 1.5, label: '', flag: false },
      { recordedAt: '2026-02-03T00:00:00Z', recordedOn: '2026-02-03', active: true, amount: 2.5, label: 'text', flag: true },
      { recordedAt: null, recordedOn: null, active: true, amount: null, label: null, flag: null },
      { recordedAt: '2026-03-04T00:00:00Z', recordedOn: '2026-03-04', active: false, amount: 4.5, label: 'other', flag: true },
    ] });
  });

  afterAll(async () => {
    try {
      if (created) await collection.model.drop();
    } finally {
      await database?.close();
    }
  });

  async function summarize(field: string, operation = 'countNonEmpty', filter: any = { active: true }) {
    const ctx: any = {
      action: { params: { filter, summary: [{ field, operation, key: `${operation}:${field}` }] } },
      permission: { can: { params: { fields: ['recordedAt', 'recordedOn', 'active', 'amount', 'label', 'flag'] } } },
      database,
      getCurrentRepository: () => collection.repository,
      throw: (status: number, message: string) => { throw Object.assign(new Error(message), { status }); },
    };
    await aggregateTableSummary(ctx);
    return JSON.parse(JSON.stringify(ctx.body))[`${operation}:${field}`];
  }

  it.each(['recordedAt', 'recordedOn'])('returns an integer for %s after JSON serialization', async (field) => {
    const value = await summarize(field);
    expect(value).toBe(2);
    expect(Number.isInteger(value)).toBe(true);
    const [expected] = await database.sequelize.query(`SELECT COUNT(${database.sequelize.getQueryInterface().quoteIdentifier(field)}) AS total FROM ${database.sequelize.getQueryInterface().quoteIdentifier(tableName)} WHERE active = true`);
    expect(value).toBe(Number((expected[0] as any).total));
  });

  it.each(['recordedAt', 'recordedOn'])('returns zero for %s with only null dates', async (field) => {
    expect(await summarize(field, 'countNonEmpty', { [field]: { $eq: null } })).toBe(0);
  });

  it.each(['recordedAt', 'recordedOn'])('returns zero for %s with no matching rows', async (field) => {
    expect(await summarize(field, 'countNonEmpty', { id: -1 })).toBe(0);
  });

  it('distinguishes row count from non-empty date count', async () => {
    expect(await summarize('recordedAt', 'count')).toBe(3);
    expect(await summarize('recordedAt')).toBe(2);
    expect(await summarize('recordedAt', 'countNonEmpty', {})).toBe(3);
  });

  it('preserves date minimum and maximum types', async () => {
    expect(await summarize('recordedAt', 'min')).toBe('2026-01-02T00:00:00.000Z');
    expect(await summarize('recordedAt', 'max')).toBe('2026-02-03T00:00:00.000Z');
    expect(await summarize('recordedOn', 'min')).toBe('2026-01-02');
    expect(await summarize('recordedOn', 'max')).toBe('2026-02-03');
  });

  it('preserves other aggregate operations and SQL non-empty semantics', async () => {
    expect(await summarize('amount', 'sum')).toBe(4);
    expect(await summarize('amount', 'average')).toBe(2);
    expect(await summarize('label')).toBe(2);
    expect(await summarize('flag')).toBe(2);
  });
});

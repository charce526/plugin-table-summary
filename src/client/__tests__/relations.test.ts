import { describe, expect, it, vi } from 'vitest';
vi.mock('@nocobase/acl', () => ({
  createUserProvider: () => ({}),
  parseJsonTemplate: async (value: any) => value,
}));
import { aggregateTableSummary } from '../../server/aggregate';

function fixture(operation = 'sum') {
  const target: any = {
    name: 'customers', model: { primaryKeyAttribute: 'id' },
    getField: (name: string) => name === 'amount' ? { name, type: 'decimal' } : undefined,
    repository: { find: vi.fn(async () => [{ id: 1 }]) },
  };
  const root: any = {
    model: { primaryKeyAttribute: 'id' },
    getField: (name: string) => name === 'customer'
      ? { name, type: 'belongsTo', targetCollection: () => target } : undefined,
  };
  const repo: any = {
    collection: root, count: vi.fn(async () => 3), aggregate: vi.fn(),
    find: vi.fn(async () => [
      { id: 1, customer: { id: 1, amount: '10' } },
      { id: 2, customer: { id: 2, amount: '999' } },
      { id: 3, customer: null },
    ]),
  };
  const permission = { params: { fields: ['amount'], filter: { ownerId: 7 } } };
  const ctx: any = {
    action: { params: { summary: [{ field: 'customer.amount', operation }], filter: { active: true } } },
    permission: { can: { params: { fields: ['customer'] } } },
    acl: { can: vi.fn(() => permission) }, state: { currentRole: 'member' },
    getCurrentRepository: () => repo,
    throw: (status: number, message: string) => { throw Object.assign(new Error(message), { status }); },
  };
  return { ctx, repo, target, permission };
}

describe('association summary authorization', () => {
  it('resolves the full path, preserves root filter and excludes unreadable target records', async () => {
    const { ctx, repo, target } = fixture();
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ 'customer.amount': 10 });
    expect(repo.find.mock.calls[0][0].filter).toEqual({ active: true });
    expect(target.repository.find.mock.calls[0][0].filter.$and[1]).toEqual({ ownerId: 7 });
  });
  it('checks target field permission before counting', async () => {
    const { ctx, permission, repo } = fixture('count');
    permission.params.fields = [];
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 403 });
    expect(repo.count).not.toHaveBeenCalled();
  });
  it('counts the actual nested value rather than the relation foreign key', async () => {
    const { ctx, repo } = fixture('countNonEmpty');
    repo.find.mockImplementation(async () => [{ id: 1, customer: { id: 1, amount: null } }]);
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ 'customer.amount': 0 });
  });
  it('returns a client error for invalid JSON', async () => {
    const { ctx } = fixture();
    ctx.action.params.summary = '{';
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects a hidden relation even for count', async () => {
    const { ctx } = fixture('count');
    ctx.permission.can.params.fields = [];
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects missing nested fields instead of aggregating a similarly named root field', async () => {
    const { ctx } = fixture();
    ctx.action.params.summary[0].field = 'customer.missing';
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 400 });
  });
  it('retains the result key on the server', async () => {
    const { ctx } = fixture();
    ctx.action.params.summary[0].key = 'sum:customer.amount';
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ 'sum:customer.amount': 10 });
  });
  it('fails explicitly instead of returning a truncated all-records result', async () => {
    const { ctx, repo } = fixture();
    repo.find.mockImplementation(async (options: any) => Array.from({ length: options.limit }, (_, id) => ({ id, customer: null })));
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 400 });
  });
  it('expands to-many paths without including denied target records', async () => {
    const { ctx, repo } = fixture();
    repo.find.mockImplementation(async () => [{ id: 1, customer: [
      { id: 1, amount: 4 }, { id: 2, amount: 999 },
    ] }, { id: 2, customer: [{ id: 1, amount: 4 }] }]);
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ 'customer.amount': 8 });
  });
});

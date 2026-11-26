import { describe, expect, it, vi } from 'vitest';
import { DataTypes } from '@nocobase/database';

vi.mock('@nocobase/acl', () => ({
  createUserProvider: () => ({}),
  parseJsonTemplate: async (value: any) => value,
}));
import { aggregateTableSummary } from '../../server/aggregate';

function setup(summary: any) {
  const repository = {
    collection: {
      getField: (name: string) => ({
        amount: { name, type: 'decimal' },
        date: { name, type: 'date' },
        title: { name, type: 'string' },
      })[name],
    },
    count: vi.fn(async () => 29),
    aggregate: vi.fn(async (_options: any): Promise<any> => null),
  };
  const ctx: any = {
    action: { params: { summary, filter: { status: 'active' } } },
    permission: { can: { params: { fields: ['amount', 'date', 'title'] } } },
    getCurrentRepository: () => repository,
    throw: (status: number, message: string) => { throw Object.assign(new Error(message), { status }); },
  };
  return { ctx, repository };
}

describe('server summary validation and SQL aggregation', () => {
  it.each([
    [], null, {}, '{',
    Array.from({ length: 51 }, () => ({ field: 'amount', operation: 'sum' })),
    [{ field: 'amount; DROP TABLE orders', operation: 'sum' }],
    [{ field: 'amount', operation: 'execute' }],
    [{ field: 'missing', operation: 'count' }],
    [{ field: 'a.b.c.d.e', operation: 'sum' }],
    [{ field: 'title', operation: 'sum' }],
    [{ field: 'date', operation: 'average' }],
  ].map((summary) => ({ summary })))('rejects malformed or unsupported configurations %# before querying', async ({ summary }) => {
    const { ctx, repository } = setup(summary);
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 400 });
    expect(repository.aggregate).not.toHaveBeenCalled();
    expect(repository.count).not.toHaveBeenCalled();
  });

  it.each([
    ['countNonEmpty', 'count', 0],
    ['sum', 'sum', 0],
    ['average', 'avg', null],
    ['min', 'min', null],
    ['max', 'max', null],
  ])('handles empty SQL results for %s while preserving data scope', async (operation, method, expected) => {
    const { ctx, repository } = setup([{ field: 'amount', operation, key: `${operation}:amount` }]);
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ [`${operation}:amount`]: expected });
    expect(repository.aggregate).toHaveBeenCalledWith({
      method, field: 'amount', filter: ctx.action.params.filter, context: ctx,
      ...(operation === 'countNonEmpty' ? { dataType: DataTypes.INTEGER } : {}),
    });
  });

  it('counts all filtered records and validates field permissions first', async () => {
    const { ctx, repository } = setup([{ field: 'amount', operation: 'count' }]);
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ amount: 29 });
    expect(repository.count).toHaveBeenCalledWith({ filter: ctx.action.params.filter, context: ctx });
    ctx.permission.can.params.fields = [];
    await expect(aggregateTableSummary(ctx)).rejects.toMatchObject({ status: 403 });
    expect(repository.count).toHaveBeenCalledTimes(1);
  });

  it('retains zero, decimal strings and date values returned by the repository', async () => {
    const { ctx, repository } = setup([
      { field: 'amount', operation: 'sum', key: 'sum:amount' },
      { field: 'amount', operation: 'min', key: 'min:amount' },
      { field: 'date', operation: 'max', key: 'max:date' },
    ]);
    repository.aggregate.mockResolvedValueOnce('1234.50').mockResolvedValueOnce(0).mockResolvedValueOnce('2026-11-26');
    await aggregateTableSummary(ctx);
    expect(ctx.body).toEqual({ 'sum:amount': '1234.50', 'min:amount': 0, 'max:date': '2026-11-26' });
  });
});

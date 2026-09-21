import { describe, expect, it } from 'vitest';
import { calculatePageSummary } from '../../shared/aggregation';

describe('calculatePageSummary', () => {
  const rows = [
    { amount: 100, ratio: 0.5, name: 'A', date: '2026-01-01' },
    { amount: 200, ratio: null, name: '', date: '2026-03-01' },
    { amount: null, ratio: 1, name: null, date: '2026-02-01' },
  ];

  it('handles count, non-empty count and null values', () => {
    expect(calculatePageSummary(rows, [
      { field: 'name', operation: 'count' },
      { field: 'amount', operation: 'countNonEmpty' },
    ])).toEqual({ name: 3, amount: 2 });
  });

  it('calculates sum and average without treating null as zero', () => {
    expect(calculatePageSummary(rows, [
      { field: 'amount', operation: 'sum' },
      { field: 'ratio', operation: 'average' },
    ])).toEqual({ amount: 300, ratio: 0.75 });
  });

  it('returns null for average on an empty value set', () => {
    expect(calculatePageSummary([{ amount: null }], [
      { field: 'amount', operation: 'average' },
    ])).toEqual({ amount: null });
  });

  it('calculates lexical ISO date minimum and maximum', () => {
    expect(calculatePageSummary(rows, [
      { field: 'date', operation: 'min' },
    ])).toEqual({ date: '2026-01-01' });
  });

  it('reads nested to-one and to-many values without treating missing relations as zero', () => {
    const related = [
      { customer: { amount: '9' }, items: [{ price: 2 }, { price: 8 }] },
      { customer: { amount: '100' }, items: [{ price: 5 }] },
      { customer: null, items: [] },
    ];
    expect(calculatePageSummary(related, [{ field: 'customer.amount', operation: 'max' }]))
      .toEqual({ 'customer.amount': 100 });
    expect(calculatePageSummary(related, [{ field: 'items.price', operation: 'sum' }]))
      .toEqual({ 'items.price': 15 });
    expect(calculatePageSummary(related, [{ field: 'items.price', operation: 'average' }]))
      .toEqual({ 'items.price': 5 });
    expect(calculatePageSummary(related, [{ field: 'items.price', operation: 'countNonEmpty' }]))
      .toEqual({ 'items.price': 3 });
    expect(calculatePageSummary(related, [{ field: 'customer.amount', operation: 'count' }]))
      .toEqual({ 'customer.amount': 3 });
  });

  it('does not coerce blank strings, booleans or objects into numeric values', () => {
    expect(calculatePageSummary([{ n: '' }, { n: false }, { n: {} }, { n: 10 }], [
      { field: 'n', operation: 'average' },
    ])).toEqual({ n: 10 });
  });
  it('keeps independent operations for duplicated fields', () => {
    expect(calculatePageSummary([{ n: 1 }, { n: 3 }], [
      { field: 'n', operation: 'sum', key: 'sum:n' },
      { field: 'n', operation: 'average', key: 'average:n' },
    ])).toEqual({ 'sum:n': 4, 'average:n': 2 });
  });
});

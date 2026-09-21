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
});

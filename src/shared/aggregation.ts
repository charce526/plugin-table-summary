import type { FieldSummaryConfig, SummaryResult, SummaryValue } from './types';

function nonEmpty(value: unknown) {
  return value !== null && value !== undefined;
}

function numeric(values: unknown[]) {
  return values
    .filter(nonEmpty)
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function readValue(row: Record<string, any>, path: string) {
  if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];
  return path.split('.').reduce((value: any, part) => value?.[part], row);
}

export function calculatePageSummary(
  rows: Record<string, any>[],
  fields: FieldSummaryConfig[],
): SummaryResult {
  const result: SummaryResult = {};

  for (const config of fields) {
    const values = rows.map((row) => readValue(row, config.field));
    let value: SummaryValue;

    switch (config.operation) {
      case 'count':
        value = rows.length;
        break;
      case 'countNonEmpty':
        value = values.filter(nonEmpty).length;
        break;
      case 'sum': {
        const numbers = numeric(values);
        value = numbers.reduce((total, item) => total + item, 0);
        break;
      }
      case 'average': {
        const numbers = numeric(values);
        value = numbers.length ? numbers.reduce((total, item) => total + item, 0) / numbers.length : null;
        break;
      }
      case 'max': {
        const candidates = values.filter(nonEmpty) as any[];
        value = candidates.length
          ? candidates.reduce((current, item) => (item > current ? item : current)) as SummaryValue
          : null;
        break;
      }
      case 'min': {
        const candidates = values.filter(nonEmpty) as any[];
        value = candidates.length
          ? candidates.reduce((current, item) => (item < current ? item : current)) as SummaryValue
          : null;
        break;
      }
      default:
        value = null;
    }

    result[config.field] = value;
  }

  return result;
}

import type { FieldSummaryConfig, SummaryResult, SummaryValue } from './types';

/**
 * 表格数据的轻量签名，用于判断数据是否发生变化。
 * 分页、筛选之外，新增 / 编辑 / 删除 / 行内编辑同样会改变它，
 * 统计栏据此重新计算“全部数据”的统计值。
 */
export function rowsSignature(rows: Record<string, any>[] | undefined): string {
  if (!Array.isArray(rows) || !rows.length) return '';
  try {
    return JSON.stringify(rows);
  } catch {
    return `rows:${rows.length}`;
  }
}

function nonEmpty(value: unknown) {
  return value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0);
}

function numeric(values: unknown[]) {
  return values
    .filter((value) => nonEmpty(value) && (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')))
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

export function readValue(row: Record<string, any>, path: string): any {
  if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];
  const read = (value: any, parts: string[]): any => {
    if (!parts.length) return value;
    if (Array.isArray(value)) return value.flatMap((item) => read(item, parts) ?? []);
    return read(value?.[parts[0]], parts.slice(1));
  };
  return read(row, path.split('.'));
}

export function calculatePageSummary(
  rows: Record<string, any>[],
  fields: FieldSummaryConfig[],
): SummaryResult {
  const result: SummaryResult = {};

  for (const config of fields) {
    const values = rows.flatMap((row) => {
      const value = readValue(row, config.field);
      return Array.isArray(value) ? value.flat(Infinity) : [value];
    });
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
        const candidates = comparable(values);
        value = candidates.length
          ? candidates.reduce((current, item) => (item > current ? item : current)) as SummaryValue
          : null;
        break;
      }
      case 'min': {
        const candidates = comparable(values);
        value = candidates.length
          ? candidates.reduce((current, item) => (item < current ? item : current)) as SummaryValue
          : null;
        break;
      }
      default:
        value = null;
    }

    result[config.key || config.field] = value;
  }

  return result;
}

// SQL DECIMAL/BIGINT commonly arrive as strings. Do not compare "9" > "100" lexically.
function comparable(values: unknown[]): any[] {
  const present = values.filter(nonEmpty);
  const numbers = numeric(present);
  return numbers.length === present.length ? numbers : present;
}

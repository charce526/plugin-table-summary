import type { Context } from '@nocobase/actions';
import type { FieldSummaryConfig, SummaryFunction, SummaryResult } from '../shared/types';

const OPERATIONS = new Set<SummaryFunction>(['count', 'countNonEmpty', 'sum', 'average', 'max', 'min']);
const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'timestamp']);
const MAX_FIELDS = 50;
const SAFE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseSummary(value: unknown): FieldSummaryConfig[] {
  let input = value;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error('统计配置不是有效的 JSON');
    }
  }
  if (!Array.isArray(input) || !input.length) {
    throw new Error('请至少配置一个统计字段');
  }
  if (input.length > MAX_FIELDS) {
    throw new Error(`一次最多统计 ${MAX_FIELDS} 个字段`);
  }
  return input.map((item: any) => ({
    field: String(item?.field || ''),
    operation: item?.operation as SummaryFunction,
  }));
}

function fieldType(field: any) {
  return String(field?.type || field?.options?.type || '').trim();
}

function assertOperationAllowed(field: any, operation: SummaryFunction) {
  if (operation === 'count' || operation === 'countNonEmpty') return;
  const type = fieldType(field);
  if (operation === 'sum' || operation === 'average') {
    if (!NUMERIC_TYPES.has(type)) throw new Error(`字段 ${field.name} 不支持该统计方式`);
    return;
  }
  if (!NUMERIC_TYPES.has(type) && !DATE_TYPES.has(type)) {
    throw new Error(`字段 ${field.name} 不支持该统计方式`);
  }
}

export async function aggregateTableSummary(ctx: Context) {
  const repository: any = ctx.getCurrentRepository();
  const collection: any = repository?.collection;
  if (!repository || !collection) ctx.throw(404, '数据表不存在');

  const params: any = ctx.action?.params || {};
  const configs = parseSummary(params.summary);
  const permittedFields = ctx.permission?.can?.params?.fields;
  const restricted = Array.isArray(permittedFields);
  const result: SummaryResult = {};

  for (const config of configs) {
    if (!SAFE_FIELD.test(config.field) || !OPERATIONS.has(config.operation)) {
      ctx.throw(400, '统计字段或统计方式无效');
    }
    const field: any = collection.getField(config.field);
    if (!field) ctx.throw(400, `统计字段 ${config.field} 不存在`);
    if (restricted && !permittedFields.includes(config.field)) {
      ctx.throw(403, `没有字段 ${config.field} 的查看权限`);
    }
    assertOperationAllowed(field, config.operation);

    if (config.operation === 'count') {
      result[config.field] = await repository.count({ filter: params.filter });
      continue;
    }

    const method = config.operation === 'countNonEmpty'
      ? 'count'
      : config.operation === 'average'
        ? 'avg'
        : config.operation;

    const value = await repository.aggregate({
      method,
      field: config.field,
      filter: params.filter,
    });
    result[config.field] = value ?? (config.operation === 'countNonEmpty' || config.operation === 'sum' ? 0 : null);
  }

  ctx.body = result;
}

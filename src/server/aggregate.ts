import type { FieldSummaryConfig, SummaryFunction, SummaryResult } from '../shared/types';
import { serverTranslate, type ServerTranslate } from './i18n';
import { aggregateRelations, resolveSummaryPath } from './relations';

const OPERATIONS = new Set<SummaryFunction>(['count', 'countNonEmpty', 'sum', 'average', 'max', 'min']);
const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'timestamp']);
const MAX_FIELDS = 50;
const MAX_FIELD_DEPTH = 4;
const SAFE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseSummary(value: unknown, t: ServerTranslate): FieldSummaryConfig[] {
  let input = value;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error(t('Summary configuration is not valid JSON'));
    }
  }
  if (!Array.isArray(input) || !input.length) {
    throw new Error(t('At least one summary field is required'));
  }
  if (input.length > MAX_FIELDS) {
    throw new Error(t('At most {{count}} summary fields are allowed', { count: MAX_FIELDS }));
  }
  return input.map((item: any) => ({
    field: String(item?.field || ''),
    operation: item?.operation as SummaryFunction,
    key: item?.key === `${item?.operation}:${item?.field}` ? item.key : undefined,
  }));
}

function fieldType(field: any) {
  return String(field?.type || field?.options?.type || '').trim();
}

function assertOperationAllowed(field: any, operation: SummaryFunction, t: ServerTranslate) {
  if (operation === 'count' || operation === 'countNonEmpty') return;
  const type = fieldType(field);
  const unsupported = () => new Error(
    t('Field {{field}} does not support this summary operation', { field: field.name }),
  );
  if (operation === 'sum' || operation === 'average') {
    if (!NUMERIC_TYPES.has(type)) throw unsupported();
    return;
  }
  if (!NUMERIC_TYPES.has(type) && !DATE_TYPES.has(type)) {
    throw unsupported();
  }
}

export async function aggregateTableSummary(ctx: any) {
  const t = serverTranslate(ctx);
  const repository: any = ctx.getCurrentRepository();
  const collection: any = repository?.collection;
  if (!repository || !collection) ctx.throw(404, t('Collection not found'));

  const params: any = ctx.action?.params || {};
  let configs: FieldSummaryConfig[] = [];
  try { configs = parseSummary(params.summary, t); } catch { ctx.throw(400, t('Invalid summary configuration; configure 1 to 50 fields')); }
  const result: SummaryResult = {};

  for (const config of configs) {
    const resultKey = config.key || config.field;
    // Validate the complete association path before querying.
    const segments = config.field.split('.');
    const head = segments[0] || '';
    if (
      !head ||
      segments.length > MAX_FIELD_DEPTH ||
      segments.some((segment) => !SAFE_FIELD.test(segment)) ||
      !OPERATIONS.has(config.operation)
    ) {
      ctx.throw(400, t('Invalid summary field or operation'));
    }

    const resolved = resolveSummaryPath(ctx, collection, config.field);
    try { assertOperationAllowed(resolved.field, config.operation, t); } catch (error: any) { ctx.throw(400, error.message); }

    // Validate path and permissions even for row counts.
    if (config.operation === 'count') {
      if (typeof repository.count !== 'function') ctx.throw(400, t('The current data source does not support counting'));
      result[resultKey] = await repository.count({ filter: params.filter, context: ctx });
      continue;
    }

    if (resolved.relations.length) {
      result[resultKey] = await aggregateRelations(ctx, repository, config, resolved.relations);
      continue;
    }

    const method = config.operation === 'countNonEmpty'
      ? 'count'
      : config.operation === 'average'
        ? 'avg'
        : config.operation;

    if (typeof repository.aggregate !== 'function') ctx.throw(400, t('The current data source does not support aggregation'));
    const value = await repository.aggregate({
      method,
      field: head,
      filter: params.filter,
      context: ctx,
    });
    result[resultKey] = value ?? (config.operation === 'countNonEmpty' || config.operation === 'sum' ? 0 : null);
  }

  ctx.body = result;
}

import type { FieldSummaryConfig, SummaryFunction, SummaryResult } from '../shared/types';

const OPERATIONS = new Set<SummaryFunction>(['count', 'countNonEmpty', 'sum', 'average', 'max', 'min']);
const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'timestamp']);
const RELATION_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'hasManyThrough']);
const MAX_FIELDS = 50;
const MAX_FIELD_DEPTH = 4;
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

/** 是否为关联字段（belongsTo / hasOne / hasMany / belongsToMany 等）。 */
function isRelationField(field: any) {
  return RELATION_TYPES.has(fieldType(field));
}

/**
 * 关联字段「非空计数」用的外键。
 * belongsTo / hasOne 的外键在本表上，可以按外键是否为空统计；
 * hasMany / belongsToMany 的外键在对方表上，无法在本表聚合。
 */
function relationForeignKey(collection: any, field: any, head: string): string | null {
  const declared = typeof field?.foreignKey === 'string' ? field.foreignKey : '';
  if (declared && collection.getField(declared)) return declared;

  const type = fieldType(field);
  if (type === 'belongsTo' || type === 'hasOne') {
    const fallback = `${head}Id`;
    if (collection.getField(fallback)) return fallback;
  }
  return null;
}

export async function aggregateTableSummary(ctx: any) {
  const repository: any = ctx.getCurrentRepository();
  const collection: any = repository?.collection;
  if (!repository || !collection) ctx.throw(404, '数据表不存在');

  if (typeof repository.aggregate !== 'function' || typeof repository.count !== 'function') {
    ctx.throw(400, '当前数据源不支持聚合统计');
  }

  const params: any = ctx.action?.params || {};
  const configs = parseSummary(params.summary);
  const permittedFields = ctx.permission?.can?.params?.fields;
  const restricted = Array.isArray(permittedFields);
  const result: SummaryResult = {};

  for (const config of configs) {
    // 字段名可能是关联路径（例如 createdBy.nickname），逐段校验后只使用第一段（本表字段）。
    const segments = config.field.split('.');
    const head = segments[0] || '';
    const nested = segments.length > 1;
    if (
      !head ||
      segments.length > MAX_FIELD_DEPTH ||
      segments.some((segment) => !SAFE_FIELD.test(segment)) ||
      !OPERATIONS.has(config.operation)
    ) {
      ctx.throw(400, '统计字段或统计方式无效');
    }

    // 计数只统计行数，不涉及字段值，字段允许是关联路径。
    if (config.operation === 'count') {
      result[config.field] = await repository.count({ filter: params.filter });
      continue;
    }

    const field: any = collection.getField(head);
    if (!field) ctx.throw(400, `统计字段 ${config.field} 不存在`);

    // 关联数据表的字段（含 createdBy.nickname 这类路径）无法在本表直接聚合：
    // 「非空计数」退化为「该关联是否为空」，其余统计方式给出明确提示，
    // 而不是笼统的“统计字段不存在”。
    if (nested || isRelationField(field)) {
      if (config.operation !== 'countNonEmpty') {
        ctx.throw(400, `字段 ${config.field} 来自关联数据表，仅支持「计数」「非空计数」`);
      }
      const foreignKey = relationForeignKey(collection, field, head);
      if (!foreignKey) {
        ctx.throw(400, `字段 ${config.field} 的关联方式无法在本表统计，请改用「计数」`);
      }
      const relationFilter = { [foreignKey]: { $not: null } };
      result[config.field] = await repository.count({
        filter: params.filter ? { $and: [params.filter, relationFilter] } : relationFilter,
      });
      continue;
    }

    if (restricted && !permittedFields.includes(head)) {
      ctx.throw(403, `没有字段 ${config.field} 的查看权限`);
    }
    assertOperationAllowed(field, config.operation);

    const method = config.operation === 'countNonEmpty'
      ? 'count'
      : config.operation === 'average'
        ? 'avg'
        : config.operation;

    const value = await repository.aggregate({
      method,
      field: head,
      filter: params.filter,
    });
    result[config.field] = value ?? (config.operation === 'countNonEmpty' || config.operation === 'sum' ? 0 : null);
  }

  ctx.body = result;
}

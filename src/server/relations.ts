import { createUserProvider, parseJsonTemplate } from '@nocobase/acl';
import { calculatePageSummary } from '../shared/aggregation';
import type { FieldSummaryConfig } from '../shared/types';

interface RelationStep { name: string; collection: any; permission: any }

export function resolveSummaryPath(ctx: any, collection: any, path: string) {
  let permission = ctx.permission?.can;
  let field: any;
  const relations: RelationStep[] = [];
  const parts = path.split('.');
  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index];
    field = collection.getField(name);
    if (!field) ctx.throw(400, `统计字段 ${path} 不存在`);
    const params = permission?.params;
    if (Array.isArray(params?.fields) || Array.isArray(params?.appends)) {
      const allowed = [...(params.fields || []), ...(params.appends || [])];
      if (!allowed.includes(name)) ctx.throw(403, `没有字段 ${path} 的查看权限`);
    }
    const target = typeof field.targetCollection === 'function' ? field.targetCollection() : field.targetCollection;
    if (target) {
      const roles = ctx.state?.currentRoles?.length ? ctx.state.currentRoles : [ctx.state?.currentRole || 'anonymous'];
      permission = ctx.permission?.skip ? {} : ctx.acl?.can({ roles, resource: target.name, action: 'view' });
      if (!permission) ctx.throw(403, `没有关联数据表 ${target.name} 的查看权限`);
      relations.push({ name, collection: target, permission });
      collection = target;
    } else if (index < parts.length - 1) {
      ctx.throw(400, `字段 ${name} 不是关联字段`);
    }
  }
  return { field, relations };
}

const plain = (row: any) => typeof row?.toJSON === 'function' ? row.toJSON() : row;

/** Appending related rows is not an ACL check: intersect them with each target's readable records. */
async function restrictRelations(ctx: any, rows: any[], steps: RelationStep[], depth = 0): Promise<void> {
  if (depth >= steps.length) return;
  const { name, collection, permission } = steps[depth];
  const related = rows.flatMap((row) => Array.isArray(row[name]) ? row[name] : row[name] ? [row[name]] : []);
  if (related.length > 50000) ctx.throw(400, '关联记录过多，请缩小筛选范围');
  if (!related.length) return;
  const pk = collection.model?.primaryKeyAttribute;
  if (!pk) ctx.throw(400, '关联数据源缺少可用主键，无法安全统计');
  const ids = [...new Set(related.map((row) => row[pk]).filter((id) => id !== null && id !== undefined))];
  let scope = permission?.params?.filter;
  if (scope) {
    scope = await parseJsonTemplate(scope, {
      state: ctx.state,
      timezone: ctx.get?.('x-timezone'),
      userProvider: createUserProvider({ db: ctx.database, currentUser: ctx.state?.currentUser }),
    });
    if (!scope) ctx.throw(403, '无法解析关联数据权限');
  }
  const allowed = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const byIds = { [pk]: { $in: ids.slice(offset, offset + 500) } };
    const found = await collection.repository.find({
      fields: [pk], filter: scope ? { $and: [byIds, scope] } : byIds, context: ctx, limit: 500,
    });
    found.map(plain).forEach((row: any) => allowed.add(String(row[pk])));
  }
  const kept: any[] = [];
  for (const row of rows) {
    const value = row[name];
    if (Array.isArray(value)) {
      row[name] = value.filter((item) => allowed.has(String(item[pk])));
      kept.push(...row[name]);
    } else if (value && allowed.has(String(value[pk]))) {
      kept.push(value);
    } else {
      row[name] = null;
    }
  }
  await restrictRelations(ctx, kept, steps, depth + 1);
}

export async function aggregateRelations(ctx: any, repository: any, config: FieldSummaryConfig, steps: RelationStep[]) {
  const pk = repository.collection.model?.primaryKeyAttribute;
  if (!pk || typeof repository.find !== 'function') ctx.throw(400, '当前数据源不支持关联统计');
  const rows: any[] = [];
  // Keep the current repository so association-block source constraints remain effective.
  // Never return a silently truncated "all records" aggregate.
  for (let offset = 0; offset <= 10000; offset += 200) {
    const batch = await repository.find({
      filter: ctx.action.params.filter,
      appends: [steps.map((step) => step.name).join('.')],
      sort: [pk], limit: Math.min(200, 10001 - offset), offset, context: ctx,
    });
    const items = (Array.isArray(batch) ? batch : batch ? [batch] : []).map(plain);
    rows.push(...items);
    if (rows.length > 10000) ctx.throw(400, '关联统计最多处理 10000 条主表记录，请缩小筛选范围');
    if (items.length < 200) break;
  }
  await restrictRelations(ctx, rows, steps);
  return calculatePageSummary(rows, [config])[config.key || config.field];
}

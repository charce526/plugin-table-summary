import { createUserProvider, parseJsonTemplate } from '@nocobase/acl';
import { calculatePageSummary } from '../shared/aggregation';
import type { FieldSummaryConfig } from '../shared/types';
import { serverTranslate } from './i18n';

interface RelationStep { name: string; collection: any; permission: any }

export function resolveSummaryPath(ctx: any, collection: any, path: string) {
  const t = serverTranslate(ctx);
  let permission = ctx.permission?.can;
  let field: any;
  const relations: RelationStep[] = [];
  const parts = path.split('.');
  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index];
    field = collection.getField(name);
    if (!field) ctx.throw(400, t('Summary field not found: {{field}}', { field: path }));
    const params = permission?.params;
    if (Array.isArray(params?.fields) || Array.isArray(params?.appends)) {
      const allowed = [...(params.fields || []), ...(params.appends || [])];
      if (!allowed.includes(name)) ctx.throw(403, t('No permission to view field {{field}}', { field: path }));
    }
    const target = typeof field.targetCollection === 'function' ? field.targetCollection() : field.targetCollection;
    if (target) {
      const roles = ctx.state?.currentRoles?.length ? ctx.state.currentRoles : [ctx.state?.currentRole || 'anonymous'];
      permission = ctx.permission?.skip ? {} : ctx.acl?.can({ roles, resource: target.name, action: 'view' });
      if (!permission) {
        ctx.throw(403, t('No permission to view associated collection {{collection}}', { collection: target.name }));
      }
      relations.push({ name, collection: target, permission });
      collection = target;
    } else if (index < parts.length - 1) {
      ctx.throw(400, t('Field {{field}} is not a relation field', { field: name }));
    }
  }
  return { field, relations };
}

const plain = (row: any) => typeof row?.toJSON === 'function' ? row.toJSON() : row;

/** Appending related rows is not an ACL check: intersect them with each target's readable records. */
async function restrictRelations(ctx: any, rows: any[], steps: RelationStep[], depth = 0): Promise<void> {
  if (depth >= steps.length) return;
  const t = serverTranslate(ctx);
  const { name, collection, permission } = steps[depth];
  const related = rows.flatMap((row) => Array.isArray(row[name]) ? row[name] : row[name] ? [row[name]] : []);
  if (related.length > 50000) ctx.throw(400, t('Too many associated records; narrow the filter'));
  if (!related.length) return;
  const pk = collection.model?.primaryKeyAttribute;
  if (!pk) ctx.throw(400, t('The associated data source has no usable primary key'));
  const ids = [...new Set(related.map((row) => row[pk]).filter((id) => id !== null && id !== undefined))];
  let scope = permission?.params?.filter;
  if (scope) {
    scope = await parseJsonTemplate(scope, {
      state: ctx.state,
      timezone: ctx.get?.('x-timezone'),
      userProvider: createUserProvider({ db: ctx.database, currentUser: ctx.state?.currentUser }),
    });
    if (!scope) ctx.throw(403, t('Unable to resolve the associated data permission'));
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
  const t = serverTranslate(ctx);
  const pk = repository.collection.model?.primaryKeyAttribute;
  if (!pk || typeof repository.find !== 'function') ctx.throw(400, t('The current data source does not support relation summary'));
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
    if (rows.length > 10000) {
      ctx.throw(400, t('Relation summary processes at most {{count}} source records; narrow the filter', { count: 10000 }));
    }
    if (items.length < 200) break;
  }
  await restrictRelations(ctx, rows, steps);
  return calculatePageSummary(rows, [config])[config.key || config.field];
}

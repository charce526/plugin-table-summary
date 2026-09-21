import { TableBlockModel, TableColumnModel } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import type { TableSummaryConfig } from '../shared/types';
import { createSummaryRenderer } from './TableSummaryRenderer';

const DEFAULT_CONFIG: TableSummaryConfig = {
  enabled: false,
  position: 'bottom',
  scope: 'all',
  label: '统计',
  fields: [],
};

function applySummary(model: any, patch: Partial<TableSummaryConfig> = {}) {
  const config = { ...DEFAULT_CONFIG, ...(model.props.tableSummary || {}), ...patch };
  model.setProps('tableSummary', config);
  model.setProps('summary', config.enabled ? createSummaryRenderer(model) : undefined);
}

export function registerTableSummaryV2() {
  TableBlockModel.registerFlow({
    key: 'tableSummarySettings',
    sort: 550,
    title: tExpr('Table summary'),
    steps: {
      enabled: {
        title: tExpr('Enable summary row'),
        uiMode: { type: 'switch', key: 'enabled' },
        defaultParams: { enabled: false },
        handler(ctx, params) {
          applySummary(ctx.model, { enabled: params.enabled });
        },
      },
      position: {
        title: tExpr('Summary position'),
        uiMode: {
          type: 'select',
          key: 'position',
          props: {
            options: [
              { label: tExpr('Top'), value: 'top' },
              { label: tExpr('Bottom'), value: 'bottom' },
            ],
          },
        },
        defaultParams: { position: 'bottom' },
        handler(ctx, params) {
          applySummary(ctx.model, { position: params.position });
        },
      },
      scope: {
        title: tExpr('Summary scope'),
        uiMode: {
          type: 'select',
          key: 'scope',
          props: {
            options: [
              { label: tExpr('All filtered records'), value: 'all' },
              { label: tExpr('Current page'), value: 'page' },
            ],
          },
        },
        defaultParams: { scope: 'all' },
        handler(ctx, params) {
          applySummary(ctx.model, { scope: params.scope });
        },
      },
      label: {
        title: tExpr('Summary label'),
        uiSchema: {
          label: {
            'x-component': 'Input',
            'x-decorator': 'FormItem',
          },
        },
        defaultParams: { label: '统计' },
        handler(ctx, params) {
          applySummary(ctx.model, { label: params.label || '统计' });
        },
      },
    },
  });

  TableColumnModel.registerFlow({
    key: 'tableSummaryColumnSettings',
    sort: 560,
    title: tExpr('Summary'),
    steps: {
      operation: {
        title: tExpr('Summary method'),
        uiMode: (ctx) => {
          const field = ctx.model.collectionField;
          const type = String(field?.type || field?.options?.type || '');
          const numeric = ['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number'].includes(type);
          const date = ['date', 'dateOnly', 'datetime', 'timestamp'].includes(type);
          return {
            type: 'select',
            key: 'operation',
            props: {
              options: [
                { label: tExpr('None'), value: 'none' },
                { label: tExpr('Count'), value: 'count' },
                { label: tExpr('Count non-empty'), value: 'countNonEmpty' },
                ...(numeric
                  ? [
                      { label: tExpr('Sum'), value: 'sum' },
                      { label: tExpr('Average'), value: 'average' },
                    ]
                  : []),
                ...(numeric || date
                  ? [
                      { label: tExpr('Maximum'), value: 'max' },
                      { label: tExpr('Minimum'), value: 'min' },
                    ]
                  : []),
              ],
            },
          };
        },
        defaultParams: { operation: 'none' },
        handler(ctx, params) {
          ctx.model.setProps('summaryOperation', params.operation);
          const block = ctx.model.context.blockModel;
          if (block) {
            block.setProps('tableSummaryRevision', Number(block.props.tableSummaryRevision || 0) + 1);
            applySummary(block);
          }
        },
      },
    },
  });
}

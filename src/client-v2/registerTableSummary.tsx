import { TableBlockModel, TableColumnModel } from '@nocobase/client-v2';
import { getT, tExpr } from '@nocobase/flow-engine';
import {
  PRECISION_AUTO,
  PRECISION_VALUES,
  normalizePrecision,
  precisionLabelKey,
} from '../shared/display';
import { NAMESPACE } from '../shared/locale';
import type { TableSummaryConfig } from '../shared/types';
import { createSummaryRenderer } from './TableSummaryRenderer';

/**
 * flow / step 的 title 以及 uiSchema 会被 NocoBase 编译（分别经过
 * getT(model) 与 Schema.compile，作用域里都有 t），因此这两处必须传
 * tExpr 表达式 `{{t("key", {"ns":...})}}`，由编译器翻译。
 */
const tx = (key: string) => tExpr(key, { ns: NAMESPACE });

/**
 * 与之相对，uiMode.props 里的文案（下拉选项等）会原样交给 antd 组件，不经过
 * 任何编译，传 tExpr 表达式只会把 `{{t(...)}}` 原样显示出来，所以这里必须
 * 在运行时取真实译文 —— 与内置 blockHeight 等设置项一致，用 ctx.t(key, { ns })。
 */
const tProp = (ctx: any, key: string) => ctx.t(key, { ns: NAMESPACE });

const DEFAULT_CONFIG: TableSummaryConfig = {
  enabled: false,
  position: 'bottom',
  scope: 'all',
  // 留空时由渲染处回退到当前语言的「统计 / Summary」，避免把中文写死进默认值
  label: '',
  highlight: 'none',
  color: '',
  fields: [],
};

function applySummary(model: any, patch: Partial<TableSummaryConfig> = {}) {
  const config = { ...DEFAULT_CONFIG, ...(model.props.tableSummary || {}), ...patch };
  model.setProps('tableSummary', config);
  model.setProps('summary', config.enabled ? createSummaryRenderer(model) : undefined);
}

/**
 * 早期版本把统计栏设置拆成了 enabled / position / scope / label 四个步骤，
 * 合并成单个步骤后这些已保存的参数不再生效，这里把它们作为兜底读出来，
 * 避免升级后已配置好的表格统计栏“消失”。新步骤保存的值优先。
 */
function legacyParams(model: any): Partial<TableSummaryConfig> {
  if (typeof model?.getStepParams !== 'function') return {};
  return ['enabled', 'position', 'scope', 'label'].reduce<Partial<TableSummaryConfig>>((result, key) => {
    const saved = model.getStepParams('tableSummarySettings', key);
    return saved ? { ...result, ...saved } : result;
  }, {});
}

export function registerTableSummaryV2() {
  TableBlockModel.registerFlow({
    key: 'tableSummarySettings',
    sort: 550,
    title: tx('Table summary'),
    steps: {
      // 与 V1 保持一致：统计栏的全部设置集中在一个弹窗内，而不是拆成多个菜单项。
      settings: {
        title: tx('Summary settings'),
        uiMode: { type: 'dialog' },
        // 组件名使用字符串，交给 NocoBase 注册的表单组件解析，
        // 这样 Switch / ColorPicker 的取值映射才正确。
        uiSchema: {
          enabled: {
            title: tx('Enable summary row'),
            type: 'boolean',
            'x-decorator': 'FormItem',
            'x-component': 'Switch',
          },
          position: {
            title: tx('Summary position'),
            enum: [
              { label: tx('Top'), value: 'top' },
              { label: tx('Bottom'), value: 'bottom' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          scope: {
            title: tx('Summary scope'),
            enum: [
              { label: tx('All filtered records'), value: 'all' },
              { label: tx('Current page'), value: 'page' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          label: {
            title: tx('Summary label'),
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          precision: {
            title: tx('Display precision'),
            enum: PRECISION_VALUES.map((value) => ({
              label: tx(precisionLabelKey(value)),
              value,
            })),
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          highlight: {
            title: tx('Highlight summary row'),
            enum: [
              { label: tx('No highlight'), value: 'none' },
              { label: tx('Theme color'), value: 'theme' },
              { label: tx('Custom color'), value: 'custom' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          color: {
            title: tx('Highlight color'),
            'x-decorator': 'FormItem',
            'x-component': 'TableSummaryColorPicker',
            'x-reactions': {
              dependencies: ['highlight'],
              fulfill: {
                state: {
                  hidden: '{{$deps[0] !== "custom"}}',
                },
              },
            },
          },
        },
        // 弹窗默认值：出厂值 < 旧版拆分布骤的参数（兜底）< 当前生效配置，
        // 保证打开设置时看到的就是区块当前的配置，而不是旧参数或出厂值。
        defaultParams: (ctx: any) => {
          const current = ctx.model.props.tableSummary || {};
          return {
            ...DEFAULT_CONFIG,
            ...legacyParams(ctx.model),
            ...current,
            label: current.label || getT(ctx.model)('Summary', { ns: NAMESPACE }),
            precision: normalizePrecision(current.precision) ?? PRECISION_AUTO,
          };
        },
        handler(ctx, params) {
          const { precision, ...rest } = params || {};
          applySummary(ctx.model, {
            ...legacyParams(ctx.model),
            ...rest,
            // 负数（自动）归一化为 undefined，避免把哨兵值写进配置
            precision: normalizePrecision(precision),
          });
        },
      },
    },
  });

  TableColumnModel.registerFlow({
    key: 'tableSummaryColumnSettings',
    sort: 560,
    title: tx('Summary'),
    steps: {
      operation: {
        title: tx('Summary method'),
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
                { label: tProp(ctx, 'None'), value: 'none' },
                { label: tProp(ctx, 'Count'), value: 'count' },
                { label: tProp(ctx, 'Count non-empty'), value: 'countNonEmpty' },
                ...(numeric
                  ? [
                      { label: tProp(ctx, 'Sum'), value: 'sum' },
                      { label: tProp(ctx, 'Average'), value: 'average' },
                    ]
                  : []),
                ...(numeric || date
                  ? [
                      { label: tProp(ctx, 'Maximum'), value: 'max' },
                      { label: tProp(ctx, 'Minimum'), value: 'min' },
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

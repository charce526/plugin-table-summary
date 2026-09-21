import type { ISchema } from '@formily/react';
import { useField, useFieldSchema } from '@formily/react';
import { useColumnSchema, useDesignable } from '@nocobase/client';
import {
  PRECISION_AUTO,
  PRECISION_VALUES,
  normalizePrecision,
  precisionLabelKey,
} from '../shared/display';
import type { SummaryFunction, TableSummaryConfig } from '../shared/types';
import { useSummaryTranslation } from './locale';

const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'timestamp']);

type Translate = (key: string) => string;

function operationOptions(type: string, t: Translate) {
  return [
    { label: t('None'), value: 'none' },
    { label: t('Count'), value: 'count' },
    { label: t('Count non-empty'), value: 'countNonEmpty' },
    ...(NUMERIC_TYPES.has(type)
      ? [
          { label: t('Sum'), value: 'sum' },
          { label: t('Average'), value: 'average' },
        ]
      : []),
    ...(NUMERIC_TYPES.has(type) || DATE_TYPES.has(type)
      ? [
          { label: t('Maximum'), value: 'max' },
          { label: t('Minimum'), value: 'min' },
        ]
      : []),
  ];
}

/** 显示精度选项：自动（跟随字段配置）与固定小数位数。 */
function precisionOptions(t: Translate) {
  return PRECISION_VALUES.map((value) => ({
    label: value === PRECISION_AUTO ? t('Auto (follow field)') : t(precisionLabelKey(value)),
    value,
  }));
}

export const tableSummaryBlockSetting: any = {
  type: 'modal',
  sort: 650,
  useComponentProps() {
    const field = useField() as any;
    const fieldSchema = useFieldSchema() as any;
    const { dn } = useDesignable();
    const { t } = useSummaryTranslation() as { t: Translate };
    const current: TableSummaryConfig = fieldSchema?.['x-decorator-props']?.tableSummary || {};

    return {
      title: t('Summary settings'),
      schema: {
        type: 'object',
        properties: {
          enabled: {
            title: t('Enable summary row'),
            default: current.enabled === true,
            'x-decorator': 'FormItem',
            'x-component': 'Checkbox',
          },
          position: {
            title: t('Summary position'),
            default: current.position || 'bottom',
            enum: [
              { label: t('Top'), value: 'top' },
              { label: t('Bottom'), value: 'bottom' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          scope: {
            title: t('Summary scope'),
            default: current.scope || 'all',
            enum: [
              { label: t('All filtered records'), value: 'all' },
              { label: t('Current page'), value: 'page' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          label: {
            title: t('Summary label'),
            default: current.label || t('Summary'),
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          precision: {
            title: t('Display precision'),
            default: current.precision ?? PRECISION_AUTO,
            enum: precisionOptions(t),
            'x-decorator': 'FormItem',
            'x-component': 'Select',
            description: t('Precision hint'),
          },
          highlight: {
            title: t('Highlight summary row'),
            default: current.highlight || 'none',
            enum: [
              { label: t('No highlight'), value: 'none' },
              { label: t('Theme color'), value: 'theme' },
              { label: t('Custom color'), value: 'custom' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          color: {
            title: t('Highlight color'),
            default: current.color || '',
            'x-decorator': 'FormItem',
            // V1 的 schema 组件注册表自带 ColorPicker，直接使用即可
            'x-component': 'ColorPicker',
            'x-reactions': {
              dependencies: ['highlight'],
              fulfill: {
                state: {
                  hidden: '{{ $deps[0] !== "custom" }}',
                },
              },
            },
          },
        },
      } as ISchema,
      onSubmit(values: TableSummaryConfig) {
        const next = {
          enabled: Boolean(values.enabled),
          position: values.position || 'bottom',
          scope: values.scope || 'all',
          label: values.label || current.label || t('Summary'),
          highlight: values.highlight || 'none',
          // 保留已选颜色，切回“自定义颜色”时不用重新挑
          color: values.color || '',
          // 负数（自动）归一化为 undefined，避免把哨兵值写进配置
          precision: normalizePrecision(values.precision),
        };
        field.decoratorProps = field.decoratorProps || {};
        field.decoratorProps.tableSummary = next;
        fieldSchema['x-decorator-props'] = fieldSchema['x-decorator-props'] || {};
        fieldSchema['x-decorator-props'].tableSummary = next;
        dn.emit('patch', {
          schema: {
            'x-uid': fieldSchema['x-uid'],
            'x-decorator-props': fieldSchema['x-decorator-props'],
          },
        });
        dn.refresh();
      },
    };
  },
};

export const tableSummaryColumnSetting: any = {
  type: 'select',
  sort: 650,
  useComponentProps() {
    const { columnSchema, collectionField } = useColumnSchema() as any;
    const { dn } = useDesignable();
    const { t } = useSummaryTranslation() as { t: Translate };
    const fieldType = String(collectionField?.type || collectionField?.options?.type || '');
    return {
      title: t('Summary method'),
      value: columnSchema?.['x-component-props']?.summaryOperation || 'none',
      options: operationOptions(fieldType, t),
      onChange(operation: SummaryFunction | 'none') {
        columnSchema['x-component-props'] = columnSchema['x-component-props'] || {};
        columnSchema['x-component-props'].summaryOperation = operation;
        dn.emit('patch', {
          schema: {
            'x-uid': columnSchema['x-uid'],
            'x-component-props': columnSchema['x-component-props'],
          },
        });
        dn.refresh();
      },
    };
  },
};

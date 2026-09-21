import type { ISchema } from '@formily/react';
import { useField, useFieldSchema } from '@formily/react';
import { useColumnSchema, useDesignable } from '@nocobase/client';
import type { SummaryFunction, TableSummaryConfig } from '../shared/types';

const NUMERIC_TYPES = new Set(['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number']);
const DATE_TYPES = new Set(['date', 'dateOnly', 'datetime', 'timestamp']);

function operationOptions(type: string) {
  return [
    { label: '不统计', value: 'none' },
    { label: '计数', value: 'count' },
    { label: '非空计数', value: 'countNonEmpty' },
    ...(NUMERIC_TYPES.has(type)
      ? [
          { label: '合计', value: 'sum' },
          { label: '平均值', value: 'average' },
        ]
      : []),
    ...(NUMERIC_TYPES.has(type) || DATE_TYPES.has(type)
      ? [
          { label: '最大值', value: 'max' },
          { label: '最小值', value: 'min' },
        ]
      : []),
  ];
}

export const tableSummaryBlockSetting: any = {
  type: 'modal',
  sort: 650,
  useComponentProps() {
    const field = useField() as any;
    const fieldSchema = useFieldSchema() as any;
    const { dn } = useDesignable();
    const current: TableSummaryConfig = fieldSchema?.['x-decorator-props']?.tableSummary || {};

    return {
      title: '统计栏',
      schema: {
        type: 'object',
        properties: {
          enabled: {
            title: '启用统计栏',
            default: current.enabled === true,
            'x-decorator': 'FormItem',
            'x-component': 'Checkbox',
          },
          position: {
            title: '显示位置',
            default: current.position || 'bottom',
            enum: [
              { label: '表格顶部', value: 'top' },
              { label: '表格底部', value: 'bottom' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          scope: {
            title: '统计范围',
            default: current.scope || 'all',
            enum: [
              { label: '全部符合条件的数据', value: 'all' },
              { label: '当前页', value: 'page' },
            ],
            'x-decorator': 'FormItem',
            'x-component': 'Select',
          },
          label: {
            title: '统计栏名称',
            default: current.label || '统计',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
        },
      } as ISchema,
      onSubmit(values: TableSummaryConfig) {
        const next = {
          enabled: Boolean(values.enabled),
          position: values.position || 'bottom',
          scope: values.scope || 'all',
          label: values.label || '统计',
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
    const fieldType = String(collectionField?.type || collectionField?.options?.type || '');
    return {
      title: '统计方式',
      value: columnSchema?.['x-component-props']?.summaryOperation || 'none',
      options: operationOptions(fieldType),
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

import { useField, useFieldSchema } from '@formily/react';
import {
  useAPIClient,
  useDataBlockResource,
  useTableBlockContext,
  useTableBlockProps,
} from '@nocobase/client';
import { Alert, Table, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { calculatePageSummary } from '../shared/aggregation';
import type { FieldSummaryConfig, SummaryResult, TableSummaryConfig } from '../shared/types';

const DEFAULT_CONFIG: TableSummaryConfig = {
  enabled: false,
  position: 'bottom',
  scope: 'all',
  label: '统计',
  fields: [],
};

function collectionFieldName(fieldSchema: any) {
  const qualified = String(fieldSchema?.['x-collection-field'] || '');
  return String(fieldSchema?.name || qualified.split('.').pop() || '');
}

function columnsOf(tableSchema: any) {
  return Object.values(tableSchema?.properties || {})
    .map((column: any) => {
      const fieldSchema = column?.reduceProperties?.((result: any, item: any) => {
        if (result) return result;
        return item?.['x-collection-field'] || item?.name ? item : result;
      }, null);
      return {
        uid: column?.['x-uid'],
        title: column?.title || fieldSchema?.title,
        field: collectionFieldName(fieldSchema),
        operation: column?.['x-component-props']?.summaryOperation,
        hidden: column?.['x-hidden'] === true,
        fieldSchema,
      };
    })
    .filter((column: any) => !column.hidden);
}

function formatSummaryValue(value: unknown, column: any) {
  if (value === null || value === undefined || value === '') return '—';
  const props = column?.fieldSchema?.['x-component-props'] || {};
  if (typeof value === 'number') {
    const precision = Number(props.precision);
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: Number.isFinite(precision) ? precision : undefined,
      maximumFractionDigits: Number.isFinite(precision) ? precision : 20,
    }).format(value);
  }
  const component = String(column?.fieldSchema?.['x-component'] || '');
  if (component.includes('Date')) {
    const date = new Date(value as any);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return String(value);
}

function V1Summary({
  config,
  columns,
  rows,
  resource,
  requestParams,
  rowSelection,
}: {
  config: TableSummaryConfig;
  columns: any[];
  rows: Record<string, any>[];
  resource: any;
  requestParams: any;
  rowSelection: any;
}) {
  const fields = useMemo<FieldSummaryConfig[]>(
    () =>
      columns
        .filter((column) => column.field && column.operation && column.operation !== 'none')
        .map((column) => ({ field: column.field, operation: column.operation })),
    [columns],
  );
  const fieldsKey = fields.map((item) => `${item.field}:${item.operation}`).join('|');
  const requestKey = JSON.stringify(requestParams || {});
  const [allValues, setAllValues] = useState<SummaryResult>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (config.scope !== 'all' || !fields.length) return undefined;
    setLoading(true);
    setError('');

    (resource as any)
      .tableSummary({
        ...(requestParams || {}),
        page: undefined,
        pageSize: undefined,
        paginate: false,
        summary: JSON.stringify(fields),
      })
      .then((response: any) => {
        if (active) setAllValues(response?.data?.data ?? response?.data ?? response ?? {});
      })
      .catch((reason: any) => {
        if (active) setError(reason?.message || '统计数据加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [config.scope, fieldsKey, requestKey, resource]);

  const values = config.scope === 'page' ? calculatePageSummary(rows || [], fields) : allValues;
  const hasSelection = rowSelection && rowSelection.type !== 'none';
  const offset = hasSelection ? 1 : 0;

  return (
    <Table.Summary fixed={config.position === 'top' ? 'top' : 'bottom'}>
      <Table.Summary.Row>
        {offset ? <Table.Summary.Cell index={0} /> : null}
        {columns.map((column, index) => {
          const configured = fields.some((item) => item.field === column.field);
          const formatted = configured ? formatSummaryValue(values[column.field], column) : null;
          const content =
            index === 0
              ? formatted
                ? `${config.label || '统计'} · ${formatted}`
                : config.label || '统计'
              : formatted;
          return (
            <Table.Summary.Cell key={column.uid || column.field || index} index={index + offset}>
              <Typography.Text strong>{loading && configured ? '…' : content}</Typography.Text>
            </Table.Summary.Cell>
          );
        })}
        {error ? (
          <Table.Summary.Cell index={columns.length + offset}>
            <Alert type="error" showIcon={false} message={error} />
          </Table.Summary.Cell>
        ) : null}
      </Table.Summary.Row>
    </Table.Summary>
  );
}

export function useTableSummaryBlockProps() {
  const baseProps = useTableBlockProps() as any;
  const fieldSchema = useFieldSchema() as any;
  const blockSchema = fieldSchema?.parent;
  const field = useField() as any;
  const resource = useDataBlockResource() as any;
  const { service } = useTableBlockContext() as any;
  const config: TableSummaryConfig = {
    ...DEFAULT_CONFIG,
    ...(blockSchema?.['x-decorator-props']?.tableSummary || {}),
  };

  // Keep the hook active for every V1 table, but add no runtime behavior while disabled.
  if (!config.enabled) return baseProps;

  const columns = columnsOf(fieldSchema);
  const rows = baseProps.value || field?.value || [];
  const requestParams = service?.params?.[0] || {};

  return {
    ...baseProps,
    summary: () => (
      <V1Summary
        config={config}
        columns={columns}
        rows={rows}
        resource={resource}
        requestParams={requestParams}
        rowSelection={baseProps.rowSelection ?? fieldSchema?.['x-component-props']?.rowSelection}
      />
    ),
  };
}

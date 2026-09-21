import { observer } from '@nocobase/flow-engine';
import { Alert, Table, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { calculatePageSummary } from '../shared/aggregation';
import type { FieldSummaryConfig, SummaryResult, TableSummaryConfig } from '../shared/types';

function formatValue(value: unknown, column: any) {
  if (value === null || value === undefined || value === '') return '—';
  const field = column?.collectionField;
  const type = String(field?.type || field?.options?.type || '');
  const componentProps = field?.getComponentProps?.() || {};

  if (['date', 'dateOnly', 'datetime', 'timestamp'].includes(type)) {
    const date = new Date(value as any);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  if (typeof value === 'number') {
    const precision = Number(componentProps.precision);
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: Number.isFinite(precision) ? precision : undefined,
      maximumFractionDigits: Number.isFinite(precision) ? precision : 20,
    }).format(value);
  }
  return String(value);
}

function getFieldConfigs(model: any): FieldSummaryConfig[] {
  return model
    .mapSubModels('columns', (column: any) => {
      const field = column?.collectionField?.name || column?.props?.dataIndex;
      const operation = column?.props?.summaryOperation;
      return field && operation && operation !== 'none' ? { field, operation } : null;
    })
    .filter(Boolean);
}

export const TableSummaryRenderer = observer(({ model }: { model: any }) => {
  const config = model.props.tableSummary as TableSummaryConfig;
  const fields = useMemo(() => getFieldConfigs(model), [model, model.props.tableSummaryRevision]);
  const rows = model.resource.getData() || [];
  const requestOptions = model.resource.getRequestOptions?.() || {};
  const requestKey = JSON.stringify(requestOptions.params || {});
  const [allValues, setAllValues] = useState<SummaryResult>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (config.scope !== 'all' || !fields.length) return undefined;

    setLoading(true);
    setError('');
    model.resource
      .runAction('tableSummary', {
        params: {
          ...(requestOptions.params || {}),
          page: undefined,
          pageSize: undefined,
          paginate: false,
          summary: JSON.stringify(fields),
        },
      })
      .then((response: any) => {
        if (!active) return;
        setAllValues(response?.data?.data ?? response?.data ?? response ?? {});
      })
      .catch((reason: any) => {
        if (!active) return;
        setError(reason?.message || '统计数据加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [config.scope, fields.map((item) => `${item.field}:${item.operation}`).join('|'), requestKey]);

  const values = config.scope === 'page' ? calculatePageSummary(rows, fields) : allValues;
  const columns = model.mapSubModels('columns', (column: any) => column).filter((column: any) => !column.hidden);
  const offset = model.isRowSelectionEnabled?.() || model.getLeftAuxiliaryColumn?.() ? 1 : 0;
  const fixed = config.position === 'top' ? 'top' : 'bottom';

  return (
    <Table.Summary fixed={fixed}>
      <Table.Summary.Row>
        {offset ? <Table.Summary.Cell index={0} /> : null}
        {columns.map((column: any, columnIndex: number) => {
          const field = column?.collectionField?.name || column?.props?.dataIndex;
          const configured = fields.some((item) => item.field === field);
          const formatted = configured ? formatValue(values[field], column) : null;
          const content = columnIndex === 0
            ? formatted
              ? `${config.label || '统计'} · ${formatted}`
              : config.label || '统计'
            : formatted;
          return (
            <Table.Summary.Cell key={column.uid || field || columnIndex} index={columnIndex + offset}>
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
});

export function createSummaryRenderer(model: any) {
  return () => <TableSummaryRenderer model={model} />;
}

import { useField, useFieldSchema } from '@formily/react';
import {
  useDataBlockResource,
  useTableBlockContext,
  useTableBlockProps,
} from '@nocobase/client';
import { Alert, Table, Typography, theme } from 'antd';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { calculatePageSummary, rowsSignature } from '../shared/aggregation';
import {
  formatSummaryNumber,
  resolveFractionDigits,
  resolveHighlightStyle,
  summaryOperationLabel,
} from '../shared/display';
import {
  measureHeader,
  measureLeadingColumns,
  nextSummaryAnchorClass,
  placeSummaryRow,
} from '../shared/summaryRow';
import type { FieldSummaryConfig, SummaryResult, TableSummaryConfig } from '../shared/types';
import { useSummaryTranslation } from './locale';

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

function collectionFieldName(fieldSchema: any) {
  const qualified = String(fieldSchema?.['x-collection-field'] || '');
  if (qualified) {
    // x-collection-field 形如 users.department.title：去掉数据表名，保留关联路径，
    // 之前直接取最后一段（title）会让服务端在关联表字段上报“统计字段不存在”。
    const segments = qualified.split('.').filter(Boolean);
    return segments.length > 1 ? segments.slice(1).join('.') : segments[0] || '';
  }
  return String(fieldSchema?.name || '');
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

function formatSummaryValue(value: unknown, column: any, config: TableSummaryConfig) {
  if (value === null || value === undefined || value === '') return '—';
  const props = column?.fieldSchema?.['x-component-props'] || {};
  if (['count', 'countNonEmpty'].includes(column?.operation)) {
    return formatSummaryNumber(Number(value), { digits: 0 });
  }
  if (typeof value === 'number') {
    return formatSummaryNumber(value, {
      // 统计栏设置里的显示精度优先，未配置时跟随字段自身精度
      digits: resolveFractionDigits(config?.precision, props.precision, props.step),
      addonBefore: props.addonBefore,
      addonAfter: props.addonAfter,
    });
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
  showIndex,
}: {
  config: TableSummaryConfig;
  columns: any[];
  rows: Record<string, any>[];
  resource: any;
  requestParams: any;
  rowSelection: any;
  showIndex?: boolean;
}) {
  const { t } = useSummaryTranslation();
  const { token } = theme.useToken();
  const [headerInfo, setHeaderInfo] = useState<{ titles: string[]; columnCount: number; hasIndex: boolean } | null>(null);

  // 序号列是否启用：统计栏名称只在序号列展示，序号关闭时不显示名称。
  // 优先用 DOM 实测（NocoBase 的行序号带 table-index 标记），首屏回退到区块开关。
  const showIndexColumn = headerInfo ? headerInfo.hasIndex : !!showIndex;

  // 左侧辅助列（选择列 / 序号列 / 拖拽列）数量：先给出候选值，渲染后按表头实测校正。
  // 注意：删除列后 rowSelection / showIndex 等开关可能仍为 true，不能只依赖开关。
  const candidateLeading = (rowSelection && rowSelection.type !== 'none' ? 1 : 0) + (showIndex ? 1 : 0);
  const [leading, setLeading] = useState(candidateLeading);

  // 统计行单元格数必须与表格真实数据列数一致，否则多出的单元格会让表格多出一列、数字整体偏移。
  // 列顺序仍按 schema（与表格渲染顺序一致），仅按实测列数裁剪多余项、不足处补空单元格。
  const expectedDataCells = headerInfo ? Math.max(0, headerInfo.columnCount - leading) : null;
  const rowColumns = useMemo(
    () => (expectedDataCells === null ? columns : columns.slice(0, expectedDataCells)),
    [columns, expectedDataCells],
  );
  const fillerCells = expectedDataCells === null ? 0 : Math.max(0, expectedDataCells - rowColumns.length);

  const fields = useMemo<FieldSummaryConfig[]>(
    () =>
      rowColumns
        .filter((column) => column.field && column.operation && column.operation !== 'none')
        .map((column) => ({ field: column.field, operation: column.operation, key: `${column.operation}:${column.field}` })),
    [rowColumns],
  );
  const fieldsKey = fields.map((item) => `${item.field}:${item.operation}`).join('|');
  const requestKey = JSON.stringify(requestParams || {});
  const [allValues, setAllValues] = useState<SummaryResult>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 数据签名变化（新增 / 编辑 / 删除 / 行内编辑 / 刷新）后需要重算“全部数据”统计。
  const dataKey = rowsSignature(rows);

  useEffect(() => {
    let active = true;
    if (config.scope !== 'all' || !fields.length) {
      setLoading(false);
      setError('');
      return undefined;
    }
    setLoading(true);
    setError('');
    setAllValues({});

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
        if (active) setError(reason?.message || t('Failed to load summary data'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [config.scope, fieldsKey, requestKey, resource, dataKey]);

  const values = config.scope === 'page' ? calculatePageSummary(rows || [], fields) : allValues;
  const position = config.position === 'top' ? 'top' : 'bottom';
  const anchorClass = useMemo(() => nextSummaryAnchorClass(), []);

  const highlightStyle = resolveHighlightStyle(config.highlight, config.color, token);
  const textColor = highlightStyle?.color;

  // 数值在上、统计方式在下，避免同行过长；统计方式用小字号、淡色显示。
  const stackStyle: React.CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    lineHeight: 1.25,
  };
  const secondaryStyle: React.CSSProperties = {
    color: textColor || token.colorTextTertiary,
    fontSize: 12,
    fontWeight: 400,
    opacity: textColor ? 0.72 : 1,
  };
  const label = config.label || t('Summary');

  // 每次渲染后校正统计行位置并铺满宽度，状态正确时不会产生任何副作用。
  useLayoutEffect(() => {
    placeSummaryRow(anchorClass, position);

    // 辅助列数量以表头实测为准（V1 的序号列与选择列往往是两列）。
    // 注意：删除列后 rowSelection / showIndex 等开关可能仍为 true，不能作为依据。
    const measured = measureLeadingColumns(anchorClass, candidateLeading);
    if (measured !== leading) {
      setLeading(measured);
    }

    const measuredHeader = measureHeader(anchorClass);
    if (measuredHeader) {
      const nextKey = `${measuredHeader.columnCount}|${measuredHeader.hasIndex}|${measuredHeader.titles.join('|')}`;
      const currentKey = headerInfo
        ? `${headerInfo.columnCount}|${headerInfo.hasIndex}|${headerInfo.titles.join('|')}`
        : '';
      if (nextKey !== currentKey) {
        setHeaderInfo(measuredHeader);
      }
    }
  });

  return (
    <Table.Summary.Row className={anchorClass} style={highlightStyle}>
      {/* 名称显示在「序号列」，序号关闭时不显示名称，也不并入第一个数据列 */}
      {leading > 1 ? <Table.Summary.Cell index={0} colSpan={leading - 1} /> : null}
      {leading > 0 ? (
        <Table.Summary.Cell index={Math.max(0, leading - 1)}>
          {showIndexColumn ? (
            <Typography.Text strong style={textColor ? { color: textColor } : undefined}>
              {label}
            </Typography.Text>
          ) : null}
        </Table.Summary.Cell>
      ) : null}
      {rowColumns.map((column, index) => {
        const configured = fields.some((item) => item.field === column.field);
        const formatted = configured ? formatSummaryValue(values[`${column.operation}:${column.field}`], column, config) : null;
        const operationLabel = configured ? summaryOperationLabel(column.operation, t) : '';
        const primary = formatted ?? '';
        const secondary = operationLabel || '';
        return (
          <Table.Summary.Cell key={column.uid || column.field || index} index={index + leading}>
            <Typography.Text strong style={textColor ? { color: textColor } : undefined}>
              {loading && configured ? '…' : (
                primary || secondary ? (
                  <span style={stackStyle}>
                    <span>{primary}</span>
                    {secondary ? <span style={secondaryStyle}>{secondary}</span> : null}
                  </span>
                ) : null
              )}
            </Typography.Text>
          </Table.Summary.Cell>
        );
      })}
      {/* 实测列数多于 schema 列时补空单元格，保证统计行与表格列数一致 */}
      {Array.from({ length: fillerCells }).map((_, index) => (
        <Table.Summary.Cell
          key={`table-summary-filler-${index}`}
          index={leading + rowColumns.length + index}
        />
      ))}
      {error ? (
        <Table.Summary.Cell index={leading + rowColumns.length + fillerCells}>
          <Alert
            type="error"
            showIcon={false}
            message={error}
            style={textColor ? { color: textColor } : undefined}
          />
        </Table.Summary.Cell>
      ) : null}
    </Table.Summary.Row>
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
    // 统计行位置由 V1Summary 自己维护（把 <tfoot> 移到 <tbody> 之前或之后），
    // 不使用 rc-table 的 Summary.fixed —— 后者要求表格有固定表头，且会让
    // 全高/指定高度的表格多出一行高度而出现多余的滚动条。
    summary: () => (
      <V1Summary
        config={config}
        columns={columns}
        rows={rows}
        resource={resource}
        requestParams={requestParams}
        rowSelection={baseProps.rowSelection ?? fieldSchema?.['x-component-props']?.rowSelection}
        showIndex={baseProps.showIndex}
      />
    ),
  };
}

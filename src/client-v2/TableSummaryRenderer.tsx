import { getT, observer } from '@nocobase/flow-engine';
import { Alert, Table, Typography, theme } from 'antd';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { calculatePageSummary, rowsSignature } from '../shared/aggregation';
import {
  formatSummaryNumber,
  resolveFractionDigits,
  resolveHighlightStyle,
  summaryOperationLabel,
} from '../shared/display';
import { NAMESPACE } from '../shared/locale';
import { measureLeadingColumns, nextSummaryAnchorClass, placeSummaryRow } from '../shared/summaryRow';
import type { FieldSummaryConfig, SummaryResult, TableSummaryConfig } from '../shared/types';

/** 无数据时复用同一个空数组，避免每次渲染都新建引用而反复触发统计请求。 */
const EMPTY_ROWS: any[] = [];

function columnField(column: any) {
  const path = column?.fieldPath || column?.props?.dataIndex || column?.collectionField?.name;
  const normalized = Array.isArray(path) ? path.join('.') : path;
  const prefix = column?.context?.prefixFieldPath;
  return prefix && typeof normalized === 'string' && normalized.startsWith(`${prefix}.`)
    ? normalized.slice(prefix.length + 1)
    : normalized;
}

function formatValue(value: unknown, column: any, config: TableSummaryConfig) {
  if (value === null || value === undefined || value === '') return '—';
  const field = column?.collectionField;
  const type = String(field?.type || field?.options?.type || '');
  const componentProps = field?.getComponentProps?.() || {};

  if (['count', 'countNonEmpty'].includes(column?.props?.summaryOperation)) {
    return formatSummaryNumber(Number(value), { digits: 0 });
  }
  if (['integer', 'bigInt', 'float', 'double', 'decimal', 'real', 'number'].includes(type) && typeof value === 'string' && Number.isFinite(Number(value))) {
    value = Number(value);
  }

  if (['date', 'dateOnly', 'datetime', 'timestamp'].includes(type)) {
    const date = new Date(value as any);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  if (typeof value === 'number') {
    return formatSummaryNumber(value, {
      // 统计栏设置里的显示精度优先，未配置时跟随字段自身精度
      digits: resolveFractionDigits(config?.precision, componentProps.precision, componentProps.step),
      addonBefore: componentProps.addonBefore,
      addonAfter: componentProps.addonAfter,
    });
  }
  return String(value);
}

function getFieldConfigs(columns: any[]): FieldSummaryConfig[] {
  return columns
    .map((column: any) => {
      const field = columnField(column);
      const operation = column?.props?.summaryOperation;
      return field && operation && operation !== 'none' ? { field, operation, key: `${operation}:${field}` } : null;
    })
    .filter(Boolean);
}

export const TableSummaryRenderer = observer(({ model }: { model: any }) => {
  const config = model.props.tableSummary as TableSummaryConfig;
  const { token } = theme.useToken();
  const t = useMemo(() => (key: string) => getT(model)(key, { ns: NAMESPACE }), [model]);

  // 配置态下隐藏列仍会被表格渲染，统计行必须与之保持同样的列，否则会错位，
  // 因此这里的过滤条件与 TableColumnModel.getColumnProps() 的 hidden 语义一致。
  const configMode = !!model.context?.flowSettingsEnabled;
  // 这里刻意不用 useMemo 缓存：界面配置态下拖动 / 增删列时子模型顺序会变化，
  // 而缓存依赖里没有"列顺序"这一项，会导致统计行滞后到退出配置态才更新。
  // 每次渲染重新取一遍（列数很少，开销可忽略），保证统计行实时跟随列顺序。
  const columns = model
    .mapSubModels('columns', (column: any) => column)
    .filter((column: any) => !(column.hidden && !configMode));
  const fields = useMemo(() => getFieldConfigs(columns), [columns]);
  const fieldsKey = fields.map((item) => `${item.field}:${item.operation}`).join('|');

  const rows = model.resource.getData() || EMPTY_ROWS;
  const requestOptions = model.resource.getRequestOptions?.() || {};
  const requestKey = JSON.stringify(requestOptions.params || {});
  const [allValues, setAllValues] = useState<SummaryResult>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 数据签名变化（新增 / 编辑 / 删除 / 行内编辑 / 刷新）后需要重算“全部数据”统计，
  // 否则统计栏会停留在旧数字上。签名是字符串，不会因渲染次数变化而反复请求。
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
        setError(reason?.message || t('Failed to load summary data'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [config.scope, fieldsKey, requestKey, dataKey, t]);

  const values = config.scope === 'page' ? calculatePageSummary(rows, fields) : allValues;
  const position = config.position === 'top' ? 'top' : 'bottom';
  const anchorClass = useMemo(() => nextSummaryAnchorClass(), []);

  // 序号列是否启用：统计栏名称只在序号列展示，序号关闭时不显示名称。
  const showIndexColumn = !!model.isShowIndexEnabled?.();

  // 左侧辅助列（选择列 / 序号列 / 拖拽列）数量：V2 在选择列开启时把序号画在选择列内部，
  // 只有一列；这里先给出候选值，渲染后按表头实测校正。
  const candidateLeading = model.isRowSelectionEnabled?.() || model.getLeftAuxiliaryColumn?.() ? 1 : 0;
  const [leading, setLeading] = useState(candidateLeading);

  // 表格自身会追加一个空列（配置态还有“添加字段”列），统计行必须补齐这些单元格，
  // 否则统计行的下边框不会延伸到表格最右侧。
  const declaredColumns = model?.columns?.value;
  const declaredCount = Array.isArray(declaredColumns) ? declaredColumns.length : columns.length + 1;
  const usedCount = leading + columns.length + (error ? 1 : 0);
  const fillerCount = Math.max(0, declaredCount + leading - usedCount);

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

    // 辅助列数量以表头实测为准（选择列关闭时序号列才是独立的一列）。
    const measured = measureLeadingColumns(
      anchorClass,
      candidateLeading,
      columns.map((column: any) => (typeof column?.props?.title === 'string' ? column.props.title : '')),
    );
    if (measured !== leading) {
      setLeading(measured);
    }
  });

  return (
    <Table.Summary.Row className={anchorClass} style={highlightStyle}>
      {/* 名称显示在「序号列」，序号关闭时不显示名称，也不并入第一个数据列 */}
      {/* leading 为 0 时表格没有任何辅助列，此时也不显示名称 */}
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
      {columns.map((column: any, columnIndex: number) => {
        const field = columnField(column);
        const configured = fields.some((item) => item.field === field);
        const formatted = configured ? formatValue(values[`${column.props.summaryOperation}:${field}`], column, config) : null;
        const operationLabel = configured ? summaryOperationLabel(column?.props?.summaryOperation, t) : '';
        const primary = formatted ?? '';
        const secondary = operationLabel || '';
        return (
          <Table.Summary.Cell key={column.uid || field || columnIndex} index={columnIndex + leading}>
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
      {error ? (
        <Table.Summary.Cell index={columns.length + leading}>
          <Alert
            type="error"
            showIcon={false}
            message={error}
            style={textColor ? { color: textColor } : undefined}
          />
        </Table.Summary.Cell>
      ) : null}
      {Array.from({ length: fillerCount }).map((_, index) => (
        <Table.Summary.Cell
          key={`table-summary-filler-${index}`}
          index={columns.length + leading + (error ? 1 : 0) + index}
        />
      ))}
    </Table.Summary.Row>
  );
});

/**
 * 统计行不通过 rc-table 的 Table.Summary.fixed 呈现（该机制要求表格存在固定表头，
 * 且会让表格多出一行高度），而是由 TableSummaryRenderer 自己把 <tfoot> 移到
 * <tbody> 之前或之后，因此在任意“区块高度”设置下顶部与底部都能生效。
 */
export function createSummaryRenderer(model: any) {
  return () => <TableSummaryRenderer model={model} />;
}

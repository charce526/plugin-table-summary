export type SummaryFunction =
  | 'count'
  | 'countNonEmpty'
  | 'sum'
  | 'average'
  | 'max'
  | 'min';

export type SummaryPosition = 'top' | 'bottom';
export type SummaryScope = 'all' | 'page';

/** 统计行高亮方式：不高亮 / 跟随主题色 / 自定义颜色 */
export type SummaryHighlight = 'none' | 'theme' | 'custom';

export interface FieldSummaryConfig {
  field: string;
  operation: SummaryFunction;
  /** Optional result key distinguishes duplicate columns using different operations. */
  key?: string;
}

export interface TableSummaryConfig {
  enabled: boolean;
  position: SummaryPosition;
  scope: SummaryScope;
  label?: string;
  /** 统计行高亮方式，缺省为 none */
  highlight?: SummaryHighlight;
  /** highlight 为 custom 时使用的十六进制颜色 */
  color?: string;
  /** 统计结果显示精度（保留几位小数）；缺省或负数表示自动，跟随字段自身配置 */
  precision?: number;
  fields: FieldSummaryConfig[];
}

export interface SummaryRequest {
  collection: string;
  filter?: unknown;
  dataScope?: unknown;
  fields: FieldSummaryConfig[];
}

export type SummaryValue = number | string | null;
export type SummaryResult = Record<string, SummaryValue>;

export type SummaryFunction =
  | 'count'
  | 'countNonEmpty'
  | 'sum'
  | 'average'
  | 'max'
  | 'min';

export type SummaryPosition = 'top' | 'bottom';
export type SummaryScope = 'all' | 'page';

export interface FieldSummaryConfig {
  field: string;
  operation: SummaryFunction;
}

export interface TableSummaryConfig {
  enabled: boolean;
  position: SummaryPosition;
  scope: SummaryScope;
  label?: string;
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

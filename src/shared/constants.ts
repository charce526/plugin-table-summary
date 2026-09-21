import type { SummaryFunction, SummaryPosition, SummaryScope } from './types';

export const SUMMARY_FUNCTIONS: readonly SummaryFunction[] = [
  'count',
  'countNonEmpty',
  'sum',
  'average',
  'max',
  'min',
];

export const DEFAULT_SUMMARY_POSITION: SummaryPosition = 'bottom';
export const DEFAULT_SUMMARY_SCOPE: SummaryScope = 'all';

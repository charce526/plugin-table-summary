import type { SummaryFunction, SummaryHighlight, SummaryValue } from './types';

export type SummaryTranslate = (key: string) => string;

/**
 * 统计方式在界面上的名称，键与 locale.ts 中的资源保持一致。
 */
export const OPERATION_LABEL_KEYS: Record<Exclude<SummaryFunction, 'none'>, string> = {
  count: 'Count',
  countNonEmpty: 'Count non-empty',
  sum: 'Sum',
  average: 'Average',
  max: 'Maximum',
  min: 'Minimum',
};

/** 统计方式名称，例如「平均值」；未配置时返回空串。 */
export function summaryOperationLabel(
  operation: SummaryFunction | 'none' | undefined,
  t: SummaryTranslate,
): string {
  if (!operation || operation === 'none') return '';
  const key = OPERATION_LABEL_KEYS[operation as Exclude<SummaryFunction, 'none'>];
  return key ? t(key) : '';
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR = /^rgba?\([^)]*\)$/i;
const HSL_COLOR = /^hsla?\([^)]*\)$/i;
const NAMED_COLOR = /^[a-z]{3,20}$/i;

/**
 * 是否是可直接用于 CSS 的颜色值。
 * antd 取色器的回调可能返回 `rgb(...)`，历史配置里也可能存的是这种格式，
 * 因此这里不能只认 `#rrggbb`。
 */
export function isCssColor(value?: string): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return HEX_COLOR.test(text) || RGB_COLOR.test(text) || HSL_COLOR.test(text) || NAMED_COLOR.test(text);
}

/** 解析颜色为 [r, g, b]（0-255）；无法解析时返回 null。 */
function parseRgb(value: string): [number, number, number] | null {
  const text = value.trim();
  if (HEX_COLOR.test(text)) {
    const hex = text.slice(1);
    const full = hex.length <= 4
      ? hex
        .slice(0, 3)
        .split('')
        .map((char) => char + char)
        .join('')
      : hex.slice(0, 6);
    return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number];
  }
  const match = text.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const channels = match[1]
      .split(/[,/\s]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => {
        const number = parseFloat(part);
        return part.includes('%') ? Math.round((number / 100) * 255) : Math.round(number);
      });
    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
      return channels as [number, number, number];
    }
  }
  return null;
}

const DARK_TEXT = 'rgba(0, 0, 0, 0.88)';
const LIGHT_TEXT = '#ffffff';

/**
 * 依据背景色亮度选择可读的前景色（比较黑/白与背景的对比度，取更大者），
 * 避免自定义颜色偏深或偏浅时数字看不清。
 */
export function readableTextColor(background: string): string {
  const rgb = parseRgb(background);
  if (!rgb) return DARK_TEXT;
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const contrastWithDark = (luminance + 0.05) / 0.05;
  const contrastWithLight = 1.05 / (luminance + 0.05);
  return contrastWithDark >= contrastWithLight ? DARK_TEXT : LIGHT_TEXT;
}

export interface HighlightStyle {
  background: string;
  color: string;
}

/**
 * 统计行高亮样式；不高亮时返回 undefined。
 * theme 使用表格主题色，custom 使用用户选择的颜色并按亮度自动配前景色。
 */
export function resolveHighlightStyle(
  highlight: SummaryHighlight | undefined,
  color: string | undefined,
  token?: Record<string, any>,
): HighlightStyle | undefined {
  if (highlight === 'theme') {
    return {
      background: token?.colorPrimaryBg || 'rgba(22, 119, 255, 0.1)',
      color: token?.colorText || 'rgba(0, 0, 0, 0.88)',
    };
  }
  if (highlight === 'custom' && isCssColor(color)) {
    const background = String(color).trim();
    return { background, color: readableTextColor(background) };
  }
  return undefined;
}

/** 统计行中用于展示的值统一转成字符串。 */
export function toDisplayText(value: SummaryValue | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** 显示精度下拉中「自动」选项的取值：负数即自动。 */
export const PRECISION_AUTO = -1;

/** 显示精度下拉的可选值（小数位数）。 */
export const PRECISION_VALUES = [-1, 0, 1, 2, 3, 4, 6] as const;

/** 「自动」选项的翻译键，其余选项为 `Decimals N`。 */
export const PRECISION_AUTO_LABEL_KEY = 'Auto (follow field)';

/** 显示精度选项对应的翻译键。 */
export function precisionLabelKey(value: number): string {
  return value === PRECISION_AUTO ? PRECISION_AUTO_LABEL_KEY : `Decimals ${value}`;
}

/** 把表单/配置里的精度值归一化为非负整数；-1、空值等一律视为「自动」（undefined）。 */
export function normalizePrecision(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : undefined;
}

/**
 * 统计值的小数位数：
 * 1. 统计栏设置里显式配置的精度优先；
 * 2. 否则跟随字段自身的 precision（与字段默认展示一致）；
 * 3. 再否则由字段的 step 推断；都没有时返回 undefined，表示不限制精度。
 */
export function resolveFractionDigits(
  configured?: number,
  fieldPrecision?: unknown,
  step?: unknown,
): number | undefined {
  const explicit = normalizePrecision(configured);
  if (explicit !== undefined) return explicit;
  const field = normalizePrecision(fieldPrecision);
  if (field !== undefined) return field;
  const stepText = String(step ?? '');
  return stepText.includes('.') ? stepText.split('.')[1].length : undefined;
}

/** 统计行中的数值展示：按精度千分位格式化，并带上字段的单位前后缀。 */
export function formatSummaryNumber(
  value: number,
  options: { digits?: number; addonBefore?: unknown; addonAfter?: unknown } = {},
): string {
  const digits = options.digits;
  const text = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits ?? 20,
  }).format(value);
  const prefix = typeof options.addonBefore === 'string' ? options.addonBefore : '';
  const suffix = typeof options.addonAfter === 'string' ? options.addonAfter : '';
  return `${prefix}${text}${suffix}`;
}

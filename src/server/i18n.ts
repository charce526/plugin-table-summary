import { NAMESPACE } from '../shared/locale';

export type ServerTranslate = (key: string, vars?: Record<string, unknown>) => string;

/**
 * 服务端翻译函数：统一带上插件命名空间，语言由当前请求上下文决定
 * （`ctx.t` 绑定的是本次请求的 i18n 实例）。
 * 上下文里没有 i18n 时（例如直接调用聚合函数的测试）退化为返回键本身，避免抛错。
 */
export function serverTranslate(ctx: any): ServerTranslate {
  if (typeof ctx?.t !== 'function') return (key) => key;
  return (key, vars) =>
    ctx.t(key, {
      ns: NAMESPACE,
      // 字段名等变量直接原样输出，不做 HTML 转义
      interpolation: { escapeValue: false },
      ...(vars || {}),
    });
}

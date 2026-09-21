/**
 * V1 stores block-level defaults (including "Set data scope") in _defaultParams,
 * while pagination and interactive filters live in params[0]. The native list
 * request shallow-merges them in this order; summary requests must do the same.
 */
export function effectiveRequestParams(service: any): Record<string, any> {
  return {
    ...(service?._defaultParams || {}),
    ...(service?.params?.[0] || {}),
  };
}

/** Remove pagination only. Keep filter, association context and other list params. */
export function withoutPagination(params: Record<string, any> | undefined) {
  const { page: _page, pageSize: _pageSize, paginate: _paginate, ...rest } = params || {};
  return { ...rest, paginate: false };
}

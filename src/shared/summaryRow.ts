/**
 * 在表格中定位并铺满统计行。
 *
 * 背景一：antd / rc-table 只有在表格存在固定表头（scroll.y）或 sticky 时，才会为
 * Table.Summary 提供“顶部”渲染分支，普通表格无论把 fixed 设成什么，统计行都会
 * 被放进表格底部的 <tfoot>。此外一旦走 rc-table 的 fixed 分支，统计行会在表格
 * 高度之外多占一行高度，使“全高/指定高度”的表格出现多余的滚动条。
 *
 * 背景二：<tfoot> 的 display 是 table-footer-group，浏览器会无视 DOM 顺序把它画在
 * 表格底部（实测：仅把 tfoot 移到 tbody 之前无效，必须同时改成 table-row-group）。
 *
 * 因此这里不使用 rc-table 的 fixed 机制，而是直接调整统计行所在的 <tfoot>：
 * - 顶部：移到 <tbody> 之前，并把 display 改为 table-row-group；
 * - 底部：移回 <tbody> 之后，恢复默认 display。
 *
 * 另外统计行的单元格数可能少于表格实际列数（例如 V2 表格会额外追加一个空列），
 * 那样底边框就到不了表格最右侧，这里按数据行的列数为最后一个单元格补 colSpan。
 */
const ANCHOR_PREFIX = 'xiezuo-table-summary-anchor';
const SPAN_STAMP = 'data-xiezuo-summary-span';

let seed = 0;

/** 为每个统计行实例生成唯一 class，用于在 DOM 中定位它自己所属的 <tfoot>。 */
export function nextSummaryAnchorClass() {
  seed += 1;
  return `${ANCHOR_PREFIX}-${seed}`;
}

function cellCount(row: Element | null): number {
  if (!row) return 0;
  return Array.from(row.children).reduce<number>(
    (sum, cell) => sum + ((cell as HTMLTableCellElement).colSpan || 1),
    0,
  );
}

/** 统计行横向铺满：不足的列数用最后一个单元格的 colSpan 补齐。 */
function fillRowWidth(row: HTMLTableRowElement, tbody: Element) {
  const cells = Array.from(row.children) as HTMLTableCellElement[];
  if (!cells.length) return;

  // 先还原上一次的改动，保证重复调用时结果一致。
  cells.forEach((cell) => {
    const original = cell.getAttribute(SPAN_STAMP);
    if (original !== null) {
      cell.colSpan = Number(original) || 1;
      cell.removeAttribute(SPAN_STAMP);
    }
  });

  // 以同表数据行的列数为准（实测 V1 的 colgroup 列数会少于真实列数，
  // 例如操作列不在 colgroup 里，用它做参考会导致漏补）。
  const bodyRow = tbody.querySelector('tr');
  const bodyCellCount = bodyRow ? bodyRow.children.length : 0;
  if (!bodyCellCount || cells.length >= bodyCellCount) return;

  const reference = cellCount(bodyRow);
  const own = cellCount(row);
  const last = cells[cells.length - 1];
  const missing = reference - own;
  if (missing > 0 && last) {
    last.setAttribute(SPAN_STAMP, String(last.colSpan || 1));
    last.colSpan = (last.colSpan || 1) + missing;
  }
}

/**
 * 统计行左侧需要跳过的辅助列数（选择列、序号列、拖拽列等非数据列）。
 *
 * 调用方虽然能给出候选值，但各版本对辅助列的处理并不一致：
 * V2 在选择列开启时会把序号画在选择列内部（只有一列），V1 则通常是独立的两列；
 * 操作列也可能被配置到表格最左侧。因此这里以表头实测为准：
 * 表头左侧**连续的、没有标题的**单元格就是辅助列（选择列/序号列/拖拽列都没有标题）。
 *
 * 表头尚未渲染时（首屏）回退到候选值。
 */
export function measureLeadingColumns(anchorClass: string, fallback: number, titles: string[] = []): number {
  if (typeof document === 'undefined' || !anchorClass) return fallback;

  const row = document.querySelector(`tr.${anchorClass}`);
  const table = row?.closest('table') || null;
  const headerRows = table ? Array.from(table.querySelectorAll('thead tr')) : [];
  const header = headerRows.length ? Array.from(headerRows[headerRows.length - 1].children) : [];
  // 表头还没渲染时只能用调用方给的候选值。
  if (!header.length) return fallback;

  // 优先用「第一个数据列标题出现的位置」判断：即使序号列表头有文字也能算准。
  const known = new Set(titles.map((title) => title.trim()).filter(Boolean));
  if (known.size) {
    for (let index = 0; index < header.length; index += 1) {
      const text = (header[index].textContent || '').replace(/\s+/g, ' ').trim();
      if (text && known.has(text)) return index;
    }
  }

  // 退而求其次：数左侧连续没有标题的单元格。
  let leading = 0;
  for (const cell of header) {
    if ((cell.textContent || '').trim()) break;
    leading += 1;
  }

  return leading;
}

/**
 * 表头实测信息：
 * - titles：按渲染顺序的列标题（仅用于诊断，列标题可能是空或翻译表达式，不能作为匹配依据）；
 * - columnCount：表格真实列数（以 <colgroup> 为准，比表头单元格数更可靠——表头会多一个填充格）；
 * - hasIndex：是否存在「序号列」。NocoBase 的行序号带 aria-label="table-index-N"，
 *   V2 在选择列开启时会把序号画在选择格里，因此只能靠这个标记判断。
 */
export function measureHeader(
  anchorClass: string,
): { titles: string[]; columnCount: number; hasIndex: boolean } | null {
  if (typeof document === 'undefined' || !anchorClass) return null;

  const row = document.querySelector(`tr.${anchorClass}`);
  const table = row?.closest('table') || null;
  if (!table) return null;

  const headerRows = Array.from(table.querySelectorAll('thead tr'));
  const header = headerRows.length ? Array.from(headerRows[headerRows.length - 1].children) : [];
  const columnCount = table.querySelectorAll('colgroup col').length;
  if (!header.length && !columnCount) return null;

  return {
    titles: header.map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()),
    columnCount,
    hasIndex: !!table.querySelector('[aria-label^="table-index-"]'),
  };
}

/**
 * 把统计行放到表格顶部或底部，并铺满表格宽度。可重复调用，状态正确时是幂等的。
 */
export function placeSummaryRow(anchorClass: string, position: 'top' | 'bottom') {
  if (typeof document === 'undefined' || !anchorClass) return;

  const row = document.querySelector(`tr.${anchorClass}`) as HTMLTableRowElement | null;
  const tfoot = row?.closest('tfoot');
  const table = tfoot?.parentElement;
  const tbody = table?.querySelector('tbody');
  if (!row || !tfoot || !table || !tbody) return;

  if (position === 'top') {
    if (tfoot.nextElementSibling !== tbody) {
      table.insertBefore(tfoot, tbody);
    }
    // tfoot 默认 display:table-footer-group，会被强制画在底部，必须改成普通行组。
    if (tfoot.style.display !== 'table-row-group') {
      tfoot.style.display = 'table-row-group';
    }
  } else {
    if (tfoot.previousElementSibling !== tbody) {
      table.insertBefore(tfoot, tbody.nextSibling);
    }
    if (tfoot.style.display) {
      tfoot.style.display = '';
    }
  }

  fillRowWidth(row, tbody);
}

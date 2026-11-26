// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { measureHeader, measureLeadingColumns, placeSummaryRow } from '../../shared/summaryRow';

afterEach(() => { document.body.innerHTML = ''; });

function setup() {
  document.body.innerHTML = '<table><colgroup><col><col><col></colgroup><thead><tr><th></th><th>Amount</th><th>Title</th></tr></thead><tbody><tr><td aria-label="table-index-1">1</td><td>10</td><td>A</td></tr></tbody><tfoot><tr class="summary-test"><td>Summary</td><td>10</td></tr></tfoot></table>';
  return document.querySelector('table');
}

describe('summary row placement', () => {
  it('moves between top and bottom repeatedly without growing the final colspan', () => {
    const table = setup();
    for (const position of ['top', 'top', 'bottom', 'bottom', 'top', 'bottom'] as const) {
      placeSummaryRow('summary-test', position);
      expect(table.tFoot.rows[0].cells[1].colSpan).toBe(2);
      expect(position === 'top' ? table.tFoot.nextElementSibling : table.tFoot.previousElementSibling).toBe(table.tBodies[0]);
      expect(table.tFoot.style.display).toBe(position === 'top' ? 'table-row-group' : '');
    }
  });

  it('measures actual column count and index visibility', () => {
    setup();
    expect(measureHeader('summary-test')).toEqual({ titles: ['', 'Amount', 'Title'], columnCount: 3, hasIndex: true });
    expect(measureLeadingColumns('summary-test', 0, ['Amount', 'Title'])).toBe(1);
    document.querySelector('[aria-label]').removeAttribute('aria-label');
    expect(measureHeader('summary-test').hasIndex).toBe(false);
  });

  it('safely handles an empty table and an unmounted summary', () => {
    setup();
    document.querySelector('tbody').innerHTML = '';
    expect(() => placeSummaryRow('summary-test', 'top')).not.toThrow();
    expect(() => placeSummaryRow('missing', 'bottom')).not.toThrow();
    expect(measureHeader('missing')).toBeNull();
    expect(measureLeadingColumns('missing', 2)).toBe(2);
  });
});

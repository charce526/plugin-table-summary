// @vitest-environment jsdom
import React from 'react';
import { EventEmitter } from 'node:events';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTableSummaryBlockProps } from '../../client/TableSummaryV1';
import { TableSummaryRenderer } from '../TableSummaryRenderer';

const fixture = vi.hoisted(() => ({
  config: { enabled: true, scope: 'all', position: 'bottom', fields: [] } as any,
  rows: [] as any[],
  service: { data: undefined as any, params: [{ page: 1, pageSize: 10 }], _defaultParams: {} as any },
  resource: undefined as any,
  translate: (key: string) => key,
  operation: 'count',
  fieldProps: {} as any,
}));

vi.mock('@formily/react', () => ({
  useField: () => ({}),
  useFieldSchema: () => ({
    parent: { 'x-decorator-props': { tableSummary: fixture.config } },
    properties: {
      amount: {
        reduceProperties: () => ({ 'x-collection-field': 'orders.amount', 'x-component-props': fixture.fieldProps }),
        'x-component-props': { summaryOperation: fixture.operation },
      },
    },
  }),
}));

vi.mock('@nocobase/client', () => ({
  useDataBlockResource: () => fixture.resource,
  useTableBlockContext: () => ({ service: fixture.service }),
  useTableBlockProps: () => ({ value: fixture.rows }),
}));

vi.mock('@nocobase/flow-engine', () => ({ observer: (component: any) => component, getT: () => fixture.translate }));
vi.mock('../../client/locale', () => ({ useSummaryTranslation: () => ({ t: fixture.translate }) }));
vi.mock('../../shared/summaryRow', () => ({
  measureHeader: () => null,
  measureLeadingColumns: (_anchor: string, candidate: number) => candidate,
  nextSummaryAnchorClass: () => 'test-summary',
  placeSummaryRow: () => undefined,
}));

vi.mock('antd', () => ({
  Alert: ({ message }: any) => <span>{message}</span>,
  Table: { Summary: {
    Row: ({ children }: any) => <tr>{children}</tr>,
    Cell: ({ children }: any) => <td>{children}</td>,
  } },
  Typography: { Text: ({ children }: any) => <span>{children}</span> },
  theme: { useToken: () => ({ token: {} }) },
}));

afterEach(cleanup);

function V1Table() {
  const props = useTableSummaryBlockProps();
  return <table><tfoot>{props.summary()}</tfoot></table>;
}

function setup(version: 'V1' | 'V2', scope = 'all', operation = 'count') {
  fixture.operation = operation;
  fixture.fieldProps = {};
  fixture.config = { enabled: true, scope, position: 'bottom', fields: [] };
  fixture.rows = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, amount: index + 1 }));
  fixture.service.data = { data: fixture.rows, meta: { count: 27 } };
  fixture.service._defaultParams = { filter: { status: { $eq: 'active' } } };
  let total: number | string = 27;
  const aggregate = vi.fn(async (..._args: any[]) => ({ data: { data: { [`${operation}:amount`]: total } } }));
  const resource = Object.assign(new EventEmitter(), {
    getData: () => fixture.rows,
    getRequestOptions: () => ({ params: { ...fixture.service._defaultParams, ...fixture.service.params[0] } }),
    runAction: aggregate,
    tableSummary: aggregate,
  });
  fixture.resource = resource;
  const model = {
    props: { tableSummary: fixture.config },
    resource,
    mapSubModels: () => [{
      uid: 'amount', fieldPath: 'amount', props: { summaryOperation: operation },
      collectionField: { type: 'decimal', getComponentProps: () => fixture.fieldProps },
    }],
  };
  const element = () => version === 'V1'
    ? <V1Table />
    : <table><tfoot><TableSummaryRenderer model={model} /></tfoot></table>;
  const view = render(element());
  return {
    aggregate,
    resource,
    view,
    rerender: () => view.rerender(element()),
    refresh: (count: number | string) => {
      total = count;
      if (version === 'V1') {
        fixture.service.data = { data: fixture.rows, meta: { count } };
        view.rerender(element());
      } else {
        act(() => { resource.emit('refresh'); });
      }
    },
  };
}

describe.each(['V1', 'V2'] as const)('%s summary refresh', (version) => {
  it('updates after off-page additions and deletions without changing current rows or page', async () => {
    const table = setup(version);
    await screen.findByText('27');
    const initialRows = JSON.stringify(fixture.rows);
    table.refresh(29);
    await screen.findByText('29');
    expect(JSON.stringify(fixture.rows)).toBe(initialRows);
    table.refresh(28);
    await screen.findByText('28');
    expect(table.aggregate).toHaveBeenCalledTimes(3);
    const request = table.aggregate.mock.calls[2] as any[];
    const params = version === 'V1' ? request[0] : request[1].params;
    expect(params.filter).toEqual(fixture.service._defaultParams.filter);
    expect(params.page).toBeUndefined();
    expect(params.pageSize).toBeUndefined();
    expect(params.paginate).toBe(false);
  });

  it('refreshes aggregates even when the total and visible records stay unchanged', async () => {
    const table = setup(version);
    await screen.findByText('27');
    table.refresh(27);
    await waitFor(() => expect(table.aggregate).toHaveBeenCalledTimes(2));
    table.rerender();
    expect(table.aggregate).toHaveBeenCalledTimes(2);
  });

  it('keeps current-page statistics local during refresh', async () => {
    const table = setup(version, 'page');
    await screen.findByText('10');
    table.refresh(29);
    expect(screen.getByText('10')).toBeTruthy();
    expect(table.aggregate).not.toHaveBeenCalled();
  });

  it('ignores an older response that completes after the latest refresh', async () => {
    const table = setup(version);
    await screen.findByText('27');
    let finishOlder: (response: any) => void;
    table.aggregate.mockImplementationOnce(() => new Promise((resolve) => { finishOlder = resolve; }));
    table.refresh(28);
    await waitFor(() => expect(table.aggregate).toHaveBeenCalledTimes(2));
    table.refresh(29);
    await screen.findByText('29');
    await act(async () => { finishOlder({ data: { data: { 'count:amount': 28 } } }); });
    expect(screen.getByText('29')).toBeTruthy();
    expect(screen.queryByText('28')).toBeNull();
  });

  it('recovers from a failed aggregate after the next list refresh', async () => {
    const table = setup(version);
    await screen.findByText('27');
    table.aggregate.mockRejectedValueOnce(new Error('Summary unavailable'));
    table.refresh(28);
    await screen.findByText('Summary unavailable');
    table.refresh(29);
    await screen.findByText('29');
    expect(screen.queryByText('Summary unavailable')).toBeNull();
  });

  it('switches to current-page scope while a server aggregate is pending', async () => {
    const table = setup(version);
    await screen.findByText('27');
    let finishOlder: (response: any) => void;
    table.aggregate.mockImplementationOnce(() => new Promise((resolve) => { finishOlder = resolve; }));
    table.refresh(28);
    await waitFor(() => expect(table.aggregate).toHaveBeenCalledTimes(2));
    fixture.config.scope = 'page';
    table.rerender();
    await screen.findByText('10');
    await act(async () => { finishOlder({ data: { data: { 'count:amount': 28 } } }); });
    expect(screen.getByText('10')).toBeTruthy();
    fixture.config.scope = 'all';
    table.rerender();
    await screen.findByText('28');
  });

  it('formats SQL decimal strings with field precision, thousands separators and units', async () => {
    const table = setup(version, 'all', 'sum');
    await screen.findByText('27');
    fixture.fieldProps = { precision: 2, addonBefore: '¥', addonAfter: '元' };
    table.refresh('1234.50');
    await screen.findByText('¥1,234.50元');
  });
});

it('unsubscribes V2 refresh listeners on unmount', () => {
  const table = setup('V2', 'page');
  expect(table.resource.listenerCount('refresh')).toBe(1);
  table.view.unmount();
  expect(table.resource.listenerCount('refresh')).toBe(0);
});

import { describe, expect, it } from 'vitest';
import { effectiveRequestParams, withoutPagination } from '../../shared/request';

describe('summary request params', () => {
  it('keeps V1 block data scope from _defaultParams', () => {
    const service = {
      _defaultParams: { filter: { status: { $eq: 'active' } }, pageSize: 20, appends: ['owner'] },
      params: [{ page: 2 }],
    };
    expect(withoutPagination(effectiveRequestParams(service))).toEqual({
      filter: { status: { $eq: 'active' } },
      appends: ['owner'],
      paginate: false,
    });
  });

  it('uses the current merged filter when interactive filtering replaced the default filter', () => {
    const service = {
      _defaultParams: { filter: { status: { $eq: 'active' } } },
      params: [{ filter: { $and: [{ status: { $eq: 'active' } }, { city: { $eq: '厦门' } }] } }],
    };
    expect(effectiveRequestParams(service).filter).toEqual({
      $and: [{ status: { $eq: 'active' } }, { city: { $eq: '厦门' } }],
    });
  });

  it('removes only pagination and retains every filtering/context parameter', () => {
    expect(withoutPagination({
      filter: { id: { $gt: 1 } }, sourceId: 8, association: 'projects.tasks',
      filterByTk: 3, tree: true, page: 4, pageSize: 10, paginate: true,
    })).toEqual({
      filter: { id: { $gt: 1 } }, sourceId: 8, association: 'projects.tasks',
      filterByTk: 3, tree: true, paginate: false,
    });
  });
});

import { Plugin } from '@nocobase/server';

/** Server-side aggregate resource. All queries must execute in the request ACL context. */
export default class PluginTableSummaryServer extends Plugin {
  async load() {
    // Phase 1: register a read-only aggregate action after ACL/filter propagation is verified.
  }
}

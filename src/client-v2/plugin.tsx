import { Application, Plugin } from '@nocobase/client-v2';

/** V2/FlowEngine client adapter; this is the primary implementation target. */
export default class PluginTableSummaryClientV2 extends Plugin<any, Application> {
  async load() {
    // Phase 1: register TableBlockModel flows/models without replacing the native table block.
  }
}

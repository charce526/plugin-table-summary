import { Plugin } from '@nocobase/server';
import { aggregateTableSummary } from './aggregate';

export default class PluginTableSummaryServer extends Plugin {
  async load() {
    // Global collection action: /api/<collection>:tableSummary
    this.app.resourceManager.registerActionHandlers({
      tableSummary: aggregateTableSummary,
    });

    // Reuse the collection "view" permission. The ACL middleware therefore
    // merges the same role data scope into ctx.action.params.filter.
    const acl = this.app.acl as any;
    acl.actionAlias.set('tableSummary', 'view');
  }
}

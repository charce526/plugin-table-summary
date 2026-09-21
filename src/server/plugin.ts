import { Plugin } from '@nocobase/server';
import { aggregateTableSummary } from './aggregate';

export default class PluginTableSummaryServer extends Plugin {
  private readonly registeredManagers = new WeakSet<object>();

  private registerForDataSource(dataSource: any) {
    const manager = dataSource?.resourceManager;
    const acl = dataSource?.acl;
    if (!manager || !acl || this.registeredManagers.has(manager)) return;

    manager.registerActionHandlers({
      tableSummary: aggregateTableSummary,
    });

    // Map to the collection view permission so ACL merges the same data scope,
    // field whitelist and current-user variables as the native list request.
    acl.actionAlias.set('tableSummary', 'view');
    this.registeredManagers.add(manager);
  }

  async load() {
    this.app.dataSourceManager.afterAddDataSource((dataSource: any) => {
      this.registerForDataSource(dataSource);
    });
  }
}

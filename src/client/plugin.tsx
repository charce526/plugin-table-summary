import { Plugin } from '@nocobase/client';
import { registerTableSummaryV2 } from '../client-v2/registerTableSummary';
import { useTableSummaryBlockProps } from './TableSummaryV1';
import { tableSummaryBlockSetting, tableSummaryColumnSetting } from './settings';

export default class PluginTableSummaryClient extends Plugin {
  async load() {
    // V1 tables already use the scope name "useTableBlockProps". Replacing that
    // scope entry composes the native hook and adds summary only when enabled.
    this.app.addScopes({
      useTableBlockProps: useTableSummaryBlockProps,
    });

    this.app.schemaSettingsManager.addItem(
      'blockSettings:table',
      'tableSummary',
      tableSummaryBlockSetting,
    );
    this.app.schemaSettingsManager.addItem(
      'fieldSettings:TableColumn',
      'tableSummary',
      tableSummaryColumnSetting,
    );

    // Some 2.2.x deployments render V2 pages through the legacy client entry.
    registerTableSummaryV2();
  }
}

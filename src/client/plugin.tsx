import { Plugin } from '@nocobase/client';
import { registerTableSummaryV2 } from '../client-v2/registerTableSummary';
import { localeResources, NAMESPACE } from '../shared/locale';
import TableSummaryColorPicker from '../shared/TableSummaryColorPicker';
import { useTableSummaryBlockProps } from './TableSummaryV1';
import { tableSummaryBlockSetting, tableSummaryColumnSetting } from './settings';

export default class PluginTableSummaryClient extends Plugin {
  async load() {
    // 插件自带的颜色选择器：V1 组件注册表 + flow 设置表单注册表
    // （某些 2.2.x 部署会用旧客户端壳渲染 V2 页面，见下方 registerTableSummaryV2）。
    this.app.addComponents({ TableSummaryColorPicker });
    (this.app as any).flowEngine?.flowSettings?.registerComponents?.({
      TableSummaryColorPicker,
    });

    Object.entries(localeResources).forEach(([language, resource]) => {
      this.app.i18n.addResources(language, this.options?.packageName || NAMESPACE, resource);
      this.app.i18n.addResources(language, NAMESPACE, resource);
    });

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

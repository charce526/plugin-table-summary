import { Application, Plugin } from '@nocobase/client-v2';
import { localeResources, NAMESPACE } from '../shared/locale';
import TableSummaryColorPicker from '../shared/TableSummaryColorPicker';
import { registerTableSummaryV2 } from './registerTableSummary';

export default class PluginTableSummaryClientV2 extends Plugin<any, Application> {
  async load() {
    Object.entries(localeResources).forEach(([language, resource]) => {
      this.app.i18n.addResources(language, this.options?.packageName || NAMESPACE, resource);
      this.app.i18n.addResources(language, NAMESPACE, resource);
    });

    // flow 设置表单的组件来自 @formily/antd-v5，其中没有 ColorPicker，
    // 直接写 'x-component': 'ColorPicker' 会渲染空白，因此注册插件自带的组件。
    (this.app as any).flowEngine?.flowSettings?.registerComponents?.({
      TableSummaryColorPicker,
    });

    registerTableSummaryV2();
  }
}

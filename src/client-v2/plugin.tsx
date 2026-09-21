import { Application, Plugin } from '@nocobase/client-v2';
import { registerTableSummaryV2 } from './registerTableSummary';

export default class PluginTableSummaryClientV2 extends Plugin<any, Application> {
  async load() {
    registerTableSummaryV2();
  }
}

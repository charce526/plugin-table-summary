import { Application, Plugin } from '@nocobase/client';

/** V1 client adapter. Table injection is implemented independently from V2. */
export default class PluginTableSummaryClient extends Plugin<any, Application> {
  async load() {
    // Phase 1: register V1 table settings and summary renderer after the spike is verified.
  }
}

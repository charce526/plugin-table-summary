# Table Summary（表格统计栏）

为 NocoBase 表格区块增加动态统计栏，包含计数、非空计数、合计、平均值、最大值、最小值，支持表格顶部 / 底部展示、全部数据或当前页统计、统计行高亮与显示精度。

## 基本信息

| 项目 | 说明 |
| --- | --- |
| 包名 | `@xiezuo/plugin-table-summary` |
| 当前版本 | 1.0.0 |
| 适配版本 | NocoBase 2.2.10 ~ 2.2.x（V1 与 V2 页面） |
| 依赖 | React 18、antd 5、Formily 2（作为 peerDependencies） |
| 作者 | 偕作BIM |
| 官网 | https://www.xzbim.cn |
| 代码仓库 | https://github.com/charce526/plugin-table-summary |
| 问题反馈 | https://github.com/charce526/plugin-table-summary/issues |
| 许可 | Apache License 2.0（可商用、可修改，需保留版权声明并注明来源） |

## 功能特性

- **统计方式**：计数、非空计数、合计、平均值、最大值、最小值；按字段类型限定可选范围（文本类仅计数，数值类支持合计 / 平均值，数值与日期类支持极值）。
- **显示位置**：表格顶部 / 表格底部，不受区块高度与固定表头设置影响。
- **统计范围**：全部符合条件的数据（服务端聚合，忽略分页）/ 当前页（浏览器端计算，无额外请求）。
- **展示形式**：数值在上、统计方式在下；首列显示统计栏名称。
- **统计行高亮**：不高亮 / 主题高亮色 / 自定义颜色（按背景亮度自动配深色或浅色文字）。
- **显示精度**：自动（跟随字段精度）或固定 0 / 1 / 2 / 3 / 4 / 6 位小数。
- **自动刷新**：筛选、分页、新增、删除、行内编辑后自动重算。
- **多语言**：内置简体中文与英文文案。
- **权限一致**：统计复用集合查看权限的 ACL 数据范围与字段权限。

## 安装

本项目按 NocoBase 插件规范打包，产物为 `@xiezuo/plugin-table-summary-1.0.0.tgz`：

1. 在应用的插件管理器中上传该插件包；
2. 上传完成后启用插件；
3. 生产环境需重新构建应用前端（`yarn build`），开发环境重启 dev 服务即可。

> 也可以把包放进应用的 `packages/plugins` 目录（或加入应用依赖）后，执行
> `yarn pm enable @xiezuo/plugin-table-summary` 启用。

## 使用

需先开启界面编辑模式，然后在表格区块中配置：

- **V1 页面**：表格区块 → 设置 →「统计栏设置」；每列的统计方式在「字段设置 → 统计方式」中选择。
- **V2 页面**：表格区块 → 设置 →「统计栏」→「统计栏设置」；每列的统计方式在列的 Flow 设置 →「统计」中选择。

统计栏设置项：启用统计栏、显示位置、统计范围、统计栏名称、显示精度、高亮统计行、高亮颜色。

> 精度为「自动」时跟随字段自身的 `precision`（其次由 `step` 推断），均未配置则不限制小数位。

## 技术说明

- **服务端聚合**：「全部符合条件的数据」通过表格区块的 `tableSummary` 动作聚合，复用表格当前的 filter、数据范围、变量与关联上下文，并忽略分页参数。
- **当前页统计**：在浏览器端对已加载行计算，不产生额外请求。
- **权限**：`tableSummary` 动作经 `acl.actionAlias` 映射到 `view`，与列表请求共享同一套权限与数据范围；服务端额外校验字段存在性、字段类型与字段查看权限。
- **安全**：仅接受白名单聚合方式与合法字段名，单次最多 50 个字段；统计失败不会阻断表格加载。
- **V2 注入方式**：统计行交给 `TableBlockModel` 的原生 `summary` 渲染，渲染后校正 `<tfoot>` 位置，因此在任意「区块高度」设置下顶部 / 底部都生效。
- **多数据源**：对所有已加载及后续加载的数据源注册统计动作。

## 开发与打包

```bash
# 编译（含 .d.ts），在仓库根目录执行
yarn nocobase-v1 build @xiezuo/plugin-table-summary

# 单元测试（在仓库根目录执行；测试文件需位于 src/client|client-v2 下的 __tests__）
npx vitest run packages/plugins/@xiezuo/plugin-table-summary

# 打包：按 NocoBase 插件规范生成插件包，产物在 storage/tar/
# 注意：该命令会打包 packages/plugins 下的全部插件
yarn nocobase-v1 tar
```

## 目录结构

```
src/
├─ client/        # V1 客户端：区块设置、字段设置、统计栏渲染
├─ client-v2/     # V2 客户端：FlowEngine 步骤注册与统计栏渲染
├─ server/        # 服务端：统计动作与聚合实现
└─ shared/        # 两端共用：类型、数值格式化、聚合计算、统计行定位
client.js / client-v2.js / server.js   # NocoBase 约定的入口 shim（指向 dist/）
```

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可与支持

本项目采用 [Apache License 2.0](./LICENSE) 开源，版权归 偕作BIM 所有。

使用、修改、分发时的要求（白话版）：

- **保留版权与许可**：不得删除或隐藏版权声明，分发时需一并提供 `LICENSE` 文件。
- **注明来源**：分发本项目或其修改版本时，请标注来源与仓库地址
  <https://github.com/charce526/plugin-table-summary>。
- **标注改动**：修改过的文件请添加「此文件已被修改」之类的说明。
- **允许商用与闭源集成**：不要求衍生作品开源。
- **无担保**：软件按「原样」提供，不附带任何明示或默示担保。
- **不含商标授权**：不得使用版权所有者名称或标识来暗示官方背书。

> NocoBase 是 NocoBase Co., Ltd. 的商标；本项目为第三方插件，与 NocoBase 官方无隶属关系。
> 插件运行于 NocoBase 之上（社区版为 AGPL-3.0 与商业双许可），使用者需同时遵循 NocoBase 自身的许可条款。

- 官网：https://www.xzbim.cn
- 代码仓库：https://github.com/charce526/plugin-table-summary
- 问题反馈：https://github.com/charce526/plugin-table-summary/issues

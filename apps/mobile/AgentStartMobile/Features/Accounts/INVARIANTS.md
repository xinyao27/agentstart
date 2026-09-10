# Accounts invariants

Accounts 页面同时负责 provider 选择、用量快照和 reset countdown，三者共享同一连接状态。

## Entrypoints and transport

- Workspace List 的 host 菜单进入 `Accounts · <host>`，返回后仍在同一个 host。
- 首次显示调用 protobuf `AccountsService.List`，同时调用 `AccountsService.Subscribe`；订阅
  首帧必须是带完整 snapshot 的 `ready`，后续 `snapshot` 都替换完整状态。
- 订阅失败后重新调用 protobuf `List` 刷新当前内容，并持续重订阅；这不是旧 wire fallback。
  页面退出必须发送 protobuf stream cancellation。
- Claude 和 Codex 都调用强类型 `AccountsService.Select`；选择成功立即 list，不能只等待下一次
  server push。其他 provider 不显示账号切换入口，daemon 也必须拒绝其 selection。

## State and recovery

- 无 snapshot 且尚未连上时显示 Connecting；连接后首次请求显示 Loading；两种 loader 都是灰色。
- 已有 snapshot 时，刷新或订阅错误不得清空现有内容。
- 未连接时不创建 protobuf subscription、不调用 protobuf list；断连期间保留已有 snapshot，
  重连后重新 list 并恢复订阅。
- 断连时刷新、Use default 和 managed account 行不可操作；重连后恢复。
- 同时只能有一个账号切换 mutation。失败保留原 snapshot 并显示 server message。
- reset countdown 每 60 秒更新；百分比先四舍五入再 clamp 到 0…100。

## Visual contract

- 页面水平 16、顶部 8；provider 卡片间距 20；卡片圆角 16。
- Provider mark 使用仓库内的品牌资源，画布 24、图标 15；不得用无关 SF Symbol 代替。
- Provider 标题 16 semibold；account 标题 14 medium；supporting copy 12。
- Detail usage bar 高 8；compact bar 高 6；60% 以下绿、60–79% 橙、80% 起红。
- Toolbar action、Loader、账号 active check 使用中性色；不得出现默认系统蓝色 chrome。
- Light/dark、managed/default、active/inactive、fetching/error 和长列表滚动都需要 fixture
  或真实 host 视觉证据。

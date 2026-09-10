# AgentStart 接手交接（2026-09-10）

## 目标与权限边界

唯一目标是让 AgentStart 可以正常使用，并把代码与发布配置整理成可正式发布的候选。
Root Agent 负责规划、拆分和最终 review；代码修改交给 Sol subagent。继续工作时应先检查当前
源码、diff 和真实运行状态，不能只依赖本文档的快照。

必须遵守：

- 用户刻意恢复了 client 的圆角。不要改 `packages/client` 的圆角、圆角 token 或相关视觉。
- 不得新增或保留 test、smoke、E2E、validation-only script；不要用 allow/suppress 绕过 lint。
- 工作树是多人共享的超大 dirty worktree。不得 `reset`、`checkout --`、`restore`、`clean`
  或 stash；修改前先检查对应文件的当前 diff。
- 用户已授权对最终 review 通过的当前候选执行 **commit 和 push**。
- 用户尚未授权创建或推送 tag，也未授权发布 GitHub Release、npm、Chrome Web Store、
  TestFlight/App Store 或执行 notarization。这些外部发布动作必须保持未执行。
- 构建成功只代表候选可以继续验收。Developer ID、notarization、TestFlight、Chrome Web
  Store 和 npm 的真实发布仍需要各自的外部证据。

## Git 基线

- 分支：`main`
- `HEAD`：`085fe6036cdcea0fc0c932473d15f0497c8fc9b0`
- `origin/main`：`085fe6036cdcea0fc0c932473d15f0497c8fc9b0`
- 写本文档时，`git status --porcelain=v1 --untracked-files=all | wc -l` 为 **4347**。
- 当前重构、品牌、运行时、发布和移动端修复仍在共享工作树中，尚未提交或推送。

换设备或恢复任务后的第一组命令：

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short --branch
git rev-parse HEAD origin/main
git diff --stat HEAD
git diff --check HEAD
```

状态数量会随生成文件和后续修复变化。判断功能是否完成时，应检查对应文件、diff、门禁和
真实运行证据。

## 已完成的产品修复

### Chrome 与工作台

- Chrome 开发扩展与正式扩展使用不同 icon；开发版带 `DEV` badge。
- Daemon 不可用页包含自动重连、手动重试、连接/安装入口和诊断帮助。
- Browser-only 设置已并入 Settings，不再占用独立主 tab。
- Usage 的连接、错误和空状态均可落到可解释状态，不再永久显示 `Loading usage...`。
- workspace 并发保存按当前 revision 处理，不再反复弹出覆盖冲突。
- 点击 project 会展开或收起 workspace；进入 workspace 由 workspace row 完成。

### `pnpm dev` 的 daemon 接管与恢复

开发启动会识别并安全接管由已安装 AgentStart 菜单栏宿主拥有的 daemon：

- 捕获原 runtime identity、Native Messaging executable、父子进程身份和宿主 executable；
  只有同一 bundle 的菜单栏宿主身份仍匹配时才停止原 daemon。
- runtime metadata 尚未发布时进行最多 10 秒的有界等待；身份改变或超时会 fail closed。
- guardian 在 Ctrl-C 或父进程异常退出时恢复原 daemon 与 Native Messaging 配置。
- shutdown 在 stop/restore 完成后合并 guardian 的非零退出状态，不会把恢复失败吞成成功。
- 真实运行已到达 WXT ready；单次 Ctrl-C 后原 bundle runtime 与 Native Messaging 恢复。
- 锁竞争路径已验证会非零退出，并给出 `daemon_lock_held` 的明确诊断。

主要文件：

- `scripts/dev.mjs`
- `scripts/dev-daemon-lifecycle.mjs`
- `scripts/dev-daemon-installation.mjs`
- `scripts/dev-runtime-process.mjs`
- `apps/daemon/src/entry/daemon_runtime.rs`

### My Brain / Claude Code 真实 workspace

已在 My Brain project 的真实 workspace 中使用 Claude Code 验证：

- ANSI/256-color 输出正常，Claude Code 不再整体黑白。
- terminal 出现后可以立即输入，早期键盘输入能够进入 PTY。
- workspace archive 会清理对应 terminal、session 和 layout 状态，不再遗留随后触发
  revision 冲突的旧布局。

如果继续修改 terminal、SessionTabs、archive 或 daemon 生命周期，必须重新用真实 workspace
做同样的人工回归。

## iOS Simulator 回归：已通过

最新 Debug Simulator build 在 2026-09-10 18:16（Asia/Shanghai）完成，Xcode 输出
`** BUILD SUCCEEDED **`。本轮随后使用真实 daemon、真实 workspace 和真实 terminal 完成了
active workspace、sleeping workspace、显式 Resume 和 SessionTabs 回归。

已确认的产品语义：

- active workspace：从列表进入 session 后，terminal 和当前 tab 可直接使用。
- sleeping workspace：列表点击只导航到 sleeping session，不隐式调用
  `WorktreeService/Activate`，不会等待 25 秒，也不会在返回列表后弹出
  `Workspace action failed`。
- sleeping session 显示显式 `Resume Workspace`；只有用户点击它才执行恢复。
- Resume 成功后重新读取 SessionTabs，terminal multiplex 恢复可用。
- SessionTabs 的 pending/ready tab 切换会显式激活目标 tab，新的 terminal stream 可以建立；
  不会靠标题或 tab 顺序猜测 runtime handle。

daemon trace 中可复核的精确顺序（时间为 UTC）：

- `10:17:20`：active workspace 进入时，`WorktreeService/Show`、
  `SessionTabsService/List` 和 `TerminalService/List` 均成功。
- `10:18:17`：真实 tab 切换触发 `SessionTabsService/Activate`，86.76 ms 成功；对应的
  mobile terminal multiplex snapshot 已建立。
- `10:18:58`：进入 sleeping session时只出现 `WorktreeService/Show`、
  `SessionTabsService/List`、`TerminalService/Show/OpenMultiplex` 和 mobile snapshot；该导航
  区间没有 `WorktreeService/Activate`。
- `10:20:32`：点击显式 Resume 后才出现 `WorktreeService/Activate`，224.35 ms 成功；紧随其后
  `SessionTabsService/List` 1.31 ms 成功，并重新建立 terminal list/snapshot。

对应源码边界：

- `apps/mobile/AgentStartMobile/Features/Workspace/list/ContentView.swift` 的 row selection 只调用
  导航闭包。
- `apps/mobile/AgentStartMobile/Features/Terminal/Tabs/WorkspaceModelActions.swift` 的
  `resumeWorkspace()` 才调用 workspace activate。
- `apps/mobile/AgentStartMobile/Features/Terminal/Tabs/WorkspaceModelActions.swift` 的 tab activate
  和 pending selection 逻辑负责 SessionTabs 恢复。
- `apps/mobile/AgentStartMobile/Platform/Runtime/RuntimeClient+SessionTabs.swift` 把 sleeping、ready
  与 pending handle 映射成明确状态。

不要通过调大全局 25 秒 timeout 改回“导航隐式执行长时间恢复”的旧语义。

## 品牌、版本与 APNs

- Shipping 版本已统一为 **0.1.0**：root、daemon npm/Cargo/lock、computer-use、extension、
  macOS、mobile workspace package、npm CLI 和 release 文档一致。
- iOS App Store `MARKETING_VERSION` 为 **1.0.0**；正式 build number 由 workflow 决定。
- APNs 已端到端删除：gateway app/workflow、daemon publisher/queue/env、移动端 remote
  registration/notification service extension、协议 push registration/capability、发布脚本和文档
  中的 APNs deploy/secrets 均已移除。
- 移动端 entitlements 不包含 `aps-environment`；发布脚本会在签名产物意外出现该 entitlement
  时拒绝发布。
- daemon event stream、连接期间的移动端本地提醒、点击路由和 macOS 本地通知继续保留。
- 当前产品名称、logo、bundle/package/artifact 路径均为 AgentStart，没有旧品牌资源回退。

## Apple 与 Chrome Web Store 公开标识

Apple Developer Team：`8H6Q2YA365`

- iOS App ID：`com.xinyao27.agentstart.mobile`
- Widgets App ID：`com.xinyao27.agentstart.mobile.Widgets`
- App Group：`group.com.xinyao27.agentstart.mobile`
- macOS App ID：`com.xinyao27.agentstart.macos`
- iOS App Store Connect Apple ID：`6810343597`
- macOS App Store record：`AgentStart for Mac`，SKU `agentstart-macos`，Apple ID `6810480610`
- main app、widget 和 macOS identifiers 的 Push Notifications 均关闭。

macOS 当前正式交付方案仍是 Developer ID + notarized DMG。当前 app 没有 App Sandbox/Xcode
Store archive/export，不能把已经创建的 macOS App Store record 当成可上传完成状态；细节见
`apps/macos/APP-STORE.md`。

Chrome Web Store：

- item ID：`mfgmfiabfncmdekmikepemddejoeihbf`
- `chrome-web-store` environment 已建立，required reviewer 为 `xinyao27`，tag policy 为
  `extension-v*`。
- 公开 listing 的 canonical slug 仍显示 `empty-title`，因此 listing 和审核尚未完成。

## Release conductor：仓库侧修复与 Root review 已完成

Root 已完成对 Formula staging 和 release status 的 review，当前实现已修复原来的两项发布
阻断：

1. 首发前仓库只保留不可安装的 `Formula/agentstart.rb.template`。daemon release workflow 使用
   tag checkout 中的 template 和实际 attested artifacts 生成 Formula；只有 npm 成功且 GitHub
   Release 已公开后，才通过 Contents API 创建或更新 `Formula/agentstart.rb`。同版本同内容可
   安全重跑，旧版本 rerun 不会覆盖更新版本。
2. `pnpm release -- status 0.1.0 --ios-version 1.0.0` 分别查询
   `daemon-release.yml`、`extension-package.yml`、`mobile-release.yml`，并用精确 ref 过滤
   `v0.1.0`、`extension-v0.1.0`、`mobile-v1.0.0`，不会混入无关旧 workflow run。

相关 Node syntax、workflow YAML parse、Formula template 约束和 `git diff --check` 已在修复后
通过，临时检查文件未保留。当前 workspace 已经是 0.1.0，`release prepare` 会正确拒绝小于或
等于当前版本的输入；不要对当前候选运行 `pnpm release -- prepare 0.1.0`。该命令只用于未来
更高版本。

## 当前产物与必须重打包的边界

### Chrome MV3

- 路径：`apps/extension/release/agentstart-extension-0.1.0.zip`
- SHA-256：`24e257e15fcbb4a844322d46d41b889384812c232761e3c6e482cf19c62d267e`
- 同目录 `.sha256` 匹配；旧 0.0.36 包已删除。
- 包内 manifest 为 0.1.0、使用 production icon、没有 sourcemap，也没有独立 Browser settings
  主 tab。

### macOS

现有 `apps/macos/dist/AgentStart.dmg` 的历史 SHA-256 是
`f350ed1608581b96a026ed276997a303489f36b28923c3146da75954006bcad4`。它与当前安装的
`/Applications/AgentStart.app` 都早于最新 daemon 修复：当时 DMG 生成于 17:29，本机安装
daemon 生成于 16:49，而最新 release daemon 源码产物生成于 18:15（均为 2026-09-10，
Asia/Shanghai）。

因此这份 DMG 和当前安装 app 只能作为较早的本地验收记录，**不能作为最终 0.1.0 发布
候选**。正式发布前必须用最新源码重新构建 universal app、重新生成 DMG、重新安装并验证
Native Messaging/daemon ownership，再计算新 hash。随后还需要 Developer ID 签名、
notarization 和 staple；现有 DMG 未完成这些外部发布步骤。

## 外部硬阻断与尚未发布的边界

以下 secret 名称可以公开记录；本文档不包含任何 secret value：

- GitHub repo 缺 `NPM_TOKEN`；`@agentstart/cli@0.1.0` 尚不存在，首发 npm 步骤会失败。
- GitHub repo 缺 `POSTHOG_WRITE_KEY`；daemon release workflow 当前将其作为硬要求。
- `chrome-web-store` environment 缺 `CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、
  `CWS_PUBLISHER_ID`、`CWS_REFRESH_TOKEN`。
- GitHub 已存在 `APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_ID`、`APPLE_TEAM_ID`、
  `APP_STORE_APP_ID`、`ASC_API_KEY_P8`、`ASC_ISSUER_ID`、`ASC_KEY_ID`、
  `IOS_DIST_CERT_P12`、`IOS_DIST_CERT_PASSWORD`、`MAC_CERTS`、`MAC_CERTS_PASSWORD`；值不可读，
  尚未由一次真实 archive/upload workflow 证明能够配套使用。

仍需在外部平台完成：

- App Store Connect 当前认证失败，record metadata 不能实时确认。
- iOS metadata/screenshots 仍是仓库草稿；workflow 只上传 TestFlight，不上传 metadata，也不
  提交 App Review。App Privacy、年龄分级、出口合规、分类、价格/地区、support/review info、
  选择 build 和提交审核均未完成。
- Chrome Web Store 的 Listing/Privacy、item ownership/visibility、OAuth production 状态和
  Google review 未完成。
- Developer ID/notarized/stapled DMG、TestFlight、Chrome Web Store、npm CLI 和 GitHub
  Release 均未实际发布。
- 本地没有已签名 `.ipa`/`.xcarchive` 作为交付证据；当前 generic iOS Release build 使用
  `CODE_SIGNING_ALLOWED=NO`。
- 远端仍是旧 `origin/main`，因此被当前工作树删除的旧 workflow 在 push 前仍可能显示为
  active。完成本轮 commit/push 后再复查 GitHub Actions。
- Apple Developer/App Store Connect 中可能保留平台不允许删除的历史 identifier/record；
  它们不属于当前 shipping 产品配置，不应为了文本零命中而破坏历史记录。

## Commit 前的最终步骤

用户已经授权当前代码候选的 commit 和 push，并明确这次是**提交代码，不是发布**。以下步骤
完成后可以直接 commit/push，不需要再次询问同一权限：

1. 确认没有其他 agent 正在修改共享工作树，并重新读取当前 `git status`。
2. 确认本轮已经通过的代码门禁仍有完整结果，并在最后一次文档修改后再跑 diff check：

   ```bash
   pnpm check
   pnpm exec vp run @agentstart/extension#package:web-store
   pnpm exec vp run agentstart-mobile#check
   git diff --check HEAD
   ```

3. 对完整候选做 secrets、证书、私钥、token、个人路径、大二进制、构建缓存、tests/smoke/
   E2E/validation scripts、allow suppress 和旧品牌 active residue 扫描。
4. `git add -A` 后审查完整 staged diff 与 `git diff --cached --check`，确认 `HANDOFF.md` 一并
   纳入公开提交，且没有把 `dist`、`target`、`.build`、`.output` 或本机日志加入 index。
5. 创建一个描述 AgentStart 0.1.0 可用性、品牌迁移和发布准备的本地 commit，并 push 当前
   `main`。不要创建或推送 tag，不要触发 publish。
6. push 后确认远端 commit、GitHub workflow 文件和被删除 workflow 的状态与本地一致。

此前为准备最新 macOS release bundle 启动的构建，因用户把当前范围明确为“只提交代码”而被
Root 主动停止，exit 130 表示收到中断信号，不是产品 gate 失败，也不阻止当前 commit/push。

## 未来正式发布前的步骤

这些步骤不属于当前代码 commit 的门槛；准备 tag/publish 前再执行：

1. 用最新 daemon 重新构建 universal macOS app 并生成 DMG。
2. 安装新 app，验证菜单栏宿主、daemon ownership、Native Messaging 和
   `pnpm dev` → WXT ready → Ctrl-C 恢复。
3. 重新计算 app/DMG hash，并完成 Developer ID 签名、notarization 和 staple 验证。
4. 补齐外部 secrets 与商店 metadata，审查具体发布候选后再取得 tag/publish 授权。

## 完成标准

- `pnpm check`、mobile check、extension package 和 `git diff --check` 全绿。
- Root 完成完整 staged Spec + Standards review，未覆盖并行改动，未提交 secret、缓存或禁用项。
- 当前候选已按授权 commit 并 push；tag 和所有外部 publish 继续等待单独授权与外部资源就绪。
- 最新 macOS app/DMG、安装回归、新 hash、签名和 notarization 明确保留为未来 release gate，
  不被误写成当前 commit 已完成。

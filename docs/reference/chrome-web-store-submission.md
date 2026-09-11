# Chrome Web Store submission

This is the release and reviewer checklist for the AgentStart MV3 extension. The extension key in
[`wxt.config.ts`](../../apps/extension/wxt.config.ts) pins ID
`mfgmfiabfncmdekmikepemddejoeihbf`; changing it breaks Native Messaging and enterprise force-install
policy. That key is for development and subsequent updates; it must not be present in the first ZIP
used to create the Web Store item.

The first Web Store item now exists at
`https://chromewebstore.google.com/detail/agentstart/ljgpbhfigjepmdeaggfdagchkgaogglp`. Until its
Package page supplies the authoritative public key, keep the development ID above in the manifest,
Native Messaging origin, enterprise policy, and CI upload configuration. Change those technical
references together with the public key; do not change only the item ID.

## Listing

**Manifest short description:** Run coding agents across projects from Chrome.

Category: Developer Tools. Homepage URL: `https://agentstart.ai`. Support URL:
`https://github.com/xinyao27/agentstart/issues`. Privacy-policy URL:
`https://github.com/xinyao27/agentstart/blob/main/PRIVACY.md`.

### Dashboard field map

Use this map on the Store listing tab after the first item has been created. The English and
Simplified Chinese descriptions below are the source text; keep their feature claims consistent.

| Dashboard field | Value to enter | Notes |
| --- | --- | --- |
| Item name | `AgentStart` | Keep the same name as the manifest in both locales. |
| Summary — English | `Run coding agents across projects from Chrome.` | Matches `_locales/en/messages.json`; under the 132-character limit. |
| Summary — 简体中文 | `在 Chrome 中跨项目运行编程 agent。` | Matches `_locales/zh_CN/messages.json`. |
| Primary category | `Developer Tools` | The extension's primary function is a coding workspace. |
| Languages | `English` and `Chinese (Simplified)` | Add both locales because both are packaged in `_locales/`. |
| Homepage URL | `https://agentstart.ai` | Public AgentStart product website. |
| Support URL | `https://github.com/xinyao27/agentstart/issues` | Public issue tracker for support. |
| Privacy policy URL | `https://github.com/xinyao27/agentstart/blob/main/PRIVACY.md` | Use the dedicated privacy-policy field, not only the description. |
| Pricing | `Free` | AgentStart has no in-extension payment flow. |
| Visibility | `Public` after review | Use `Unlisted` only for a temporary validation pass. |
| Mature content | `No` | The extension has no mature content. |

The store icon source is `apps/extension/public/icons/icon-128.png`; the production package copies it
to `apps/extension/.output/chrome-mv3/icons/icon-128.png`. Upload the two checked-in `1280x800`
screenshots in this order: `screenshot-claude-workspace.png` (projects, agents, and side-panel
navigation; suggested caption: `Organize projects and coding agents in a focused Chrome side panel.`),
then `screenshot-terminal-truecolor.png` (terminal and source-diff review; suggested caption:
`Review terminal changes and source diffs without leaving your workspace.`). Upload
`promo-tile.png` as the global `440x280` small promo tile. The current repository has no published
YouTube demo URL; leave the video field empty when the dashboard allows it, and do not enter a
placeholder URL. A `1400x560` marquee tile is optional and is not currently supplied.

If the dashboard shows a Test instructions field, paste the following after the daemon release is
available:

> Install the AgentStart daemon from the latest release at
> https://github.com/xinyao27/agentstart/releases, then install this extension from the Chrome Web
> Store. Open the AgentStart side panel, choose Connection settings, and connect to the local daemon.
> Open a local Git project, create or select a worktree, and start a terminal-based coding agent.
> Verify that the workspace, terminal, source control, browser context, and review panels load. No
> test account or hosted credentials are required; the extension connects to the daemon selected by
> the reviewer.

### English copy

**Single purpose**

Operate coding agents and development workspaces from Chrome's side panel, with user-initiated browser
context and debugging tools for the page being developed.

**Detailed description**

AgentStart is an open-source Chrome workbench for agent-assisted software development. It keeps
coding-agent sessions, git worktrees, terminals, source control, browser evidence, and GitHub review
work together in one side panel and one focused workspace per tab.

AgentStart requires the separately installed AgentStart daemon. The daemon runs beside your projects
on your Mac, Windows or Linux computer, in WSL, or on a host you configure. It owns filesystem, git,
terminal, and agent processes; the extension connects to that selected daemon through an authenticated
connection.

You can organize project and worktree tabs, start or resume terminal-based coding agents, inspect
changes, and open project pages. When you explicitly use a browser feature, AgentStart can attach
selected page context, capture a tab, inspect Console or Network activity, record browser actions, or
save an artifact. Optional access to sites, history, bookmarks, notifications, keep-awake, display
layout, tab capture, and user scripts is requested from the feature that needs it and can be revoked in Chrome. Trusted
sites and locally installed community adapters can be reviewed in AgentStart's Browser settings.

AgentStart has no advertising or AgentStart account. Workspace content stays in Chrome's local
extension storage or on the daemon host you selected, except when you send it to a coding-agent
provider you invoke. Telemetry-capable release builds can send product events to PostHog according to
the in-product Privacy & Telemetry setting. Feedback, crash, and diagnostic reports are sent only
through their explicit submission flow. See the privacy policy for the exact data, controls, and
retention boundaries.

### 简体中文文案

**单一用途**

通过 Chrome 侧边栏操作编程智能体和开发工作区，并在用户主动调用时为正在开发的页面提供浏览器上下文和调试工具。

**详细描述**

AgentStart 是一款开源的 Chrome 智能体辅助开发工作台。它把编程智能体会话、Git worktree、终端、源代码管理、浏览器证据和 GitHub 审查集中在侧边栏中，并为每个标签页提供专注的工作区。

AgentStart 需要单独安装 AgentStart daemon。daemon 可以运行在项目所在的 macOS、Windows 或 Linux 电脑、WSL，或由你配置的主机上，并负责文件系统、Git、终端和智能体进程。扩展通过经过身份验证的连接访问你选择的 daemon。

你可以整理项目和 worktree 标签页，启动或恢复基于终端的编程智能体，查看改动并打开项目页面。只有在你主动使用相应功能时，AgentStart 才会附加选中的页面上下文、捕获标签页、检查 Console 或 Network 活动、记录浏览器操作或保存产物。站点、历史记录、书签、通知、防休眠、显示器布局、标签页捕获和用户脚本等可选访问权限会在具体功能中请求，并可在 Chrome 中撤销。你也可以在 AgentStart 的浏览器设置中检查可信站点和本地安装的社区适配器。

AgentStart 不含广告，也不要求 AgentStart 账户。工作区内容保存在 Chrome 的本地扩展存储或你选择的 daemon 主机上；只有当你主动调用编程智能体提供商时，相关内容才会发送给该提供商。支持遥测的发布版本可以按照应用内“隐私与遥测”设置向 PostHog 发送产品事件。反馈、崩溃和诊断报告只会通过对应的主动提交流程发送。有关具体数据、控制方式和保留边界，请查看隐私政策。

The checked-in `apps/extension/web-store/` release assets contain two `1280x800` English screenshots
using the synthetic `atlas-notes` workspace and the required `440x280` small promotional tile. Review
them against the final packaged build, then upload them without resizing. Up to five screenshots are
allowed; the optional marquee tile is `1400x560`. Capture separate Simplified Chinese screenshots if
the localized listing should show Chinese UI; promotional tiles cannot be localized.

## Permission rationale

The following text is ready to paste into the permission-justification fields.

| Permission | English | 简体中文 |
| --- | --- | --- |
| `sidePanel` | Hosts AgentStart's primary workbench and cross-tab project navigator. | 承载 AgentStart 的主要工作台和跨标签页项目导航。 |
| `nativeMessaging` | Starts or reconnects to the separately installed local daemon and receives its short-lived authenticated connection details. | 启动或重新连接单独安装的本地 daemon，并接收其短期有效的身份验证连接信息。 |
| `storage` | Stores device-local connection credentials, managed policy, UI state, and non-secret preferences. Authentication tokens are not placed in Chrome Sync. | 保存设备本地连接凭据、托管策略、界面状态和非敏感偏好；身份验证令牌不会写入 Chrome 同步。 |
| `tabGroups` | Groups tabs by the exact AgentStart project and worktree selected by the user. | 按用户选择的 AgentStart 项目和 worktree 准确整理标签页分组。 |
| `contextMenus` | Provides explicit actions for page selections, links, and images chosen by the user. | 为用户选中的页面文本、链接和图片提供明确触发的操作。 |
| Loopback host access | Connects to AgentStart daemon health and bootstrap endpoints on `127.0.0.1`, `::1`, or `localhost`. | 连接 `127.0.0.1`、`::1` 或 `localhost` 上的 AgentStart daemon 健康检查和引导端点。 |
| `activeTab` | Grants temporary access to the active page after a user gesture for selected context and browser tools. | 在用户操作后临时访问当前页面，用于选定的上下文和浏览器工具。 |
| `scripting` and optional site origins | Injects bounded page-context or a user-installed site adapter only after the user activates the feature and grants that origin. | 仅在用户启用功能并授权对应站点后，注入受限的页面上下文脚本或用户安装的站点适配器。 |
| `tabs` and `webNavigation` | Finds, focuses, or opens the exact project page requested by the user and keeps daemon-owned preview tabs in the correct group. | 查找、聚焦或打开用户指定的项目页面，并把 daemon 管理的预览标签页保留在正确分组中。 |
| `debugger` | Attaches only for user-started Chrome DevTools Protocol recording, replay, network simulation, Console or Network inspection, and performance capture. AgentStart detaches explicitly and on failure. | 仅在用户启动 CDP 录制、回放、网络模拟、Console 或 Network 检查及性能捕获时附加调试器；AgentStart 会主动分离，并在失败时自动分离。 |
| `tabCapture` | Captures a tab only when the user starts a preview recording; it is not used for background browsing capture. | 仅在用户启动预览录制时捕获标签页，不用于后台浏览捕获。 |
| `history` | Reads only the time-bounded history window the user reviews and confirms; the feature is disabled by default. | 只读取用户检查并确认的限定时间段历史记录；该功能默认关闭。 |
| `downloads` | Saves a daemon-produced artifact through Chrome's native download surface after a user action. | 在用户操作后，通过 Chrome 原生下载界面保存 daemon 生成的产物。 |
| `bookmarks` | Creates the exact AgentStart project bookmark folder requested by the user. | 创建用户明确要求的 AgentStart 项目书签文件夹。 |
| `notifications` | Shows agent progress and return notifications after the user enables them. | 在用户启用后显示智能体进度和返回通知。 |
| `idle` | Determines whether a user-enabled return digest should wait until the user is active. | 判断用户启用的返回摘要是否应等到用户恢复活跃后再显示。 |
| `power` | Keeps the device awake only while the user-enabled keep-awake feature is active. | 仅在用户启用防休眠功能期间保持设备唤醒。 |
| `system.display` | Reads display work areas only when the user chooses to arrange project windows across displays. | 仅在用户选择跨显示器排列项目窗口时读取显示器工作区域。 |
| `userScripts` | Registers locally installed, user-reviewable community adapters in Chrome's isolated user-script world. | 在 Chrome 隔离的用户脚本环境中注册本地安装、可由用户检查的社区适配器。 |

`contextMenus`, `debugger`, `downloads`, `nativeMessaging`, `sidePanel`, `storage`, `tabGroups`,
`tabs`, and `webNavigation` are required permissions. Loopback hosts are required. `activeTab`,
`bookmarks`, `history`, `idle`, `notifications`, `power`, `scripting`, `system.display`, `tabCapture`,
`userScripts`, and non-loopback site origins are optional. The Store build contains no remote
executable code and does not download it; Chrome on-device AI is feature-detected, opt-in, and runs
in Chrome.

### 简体中文逐项粘贴版

如果后台按单个字段要求填写，使用下面的短文本。每段都控制在 1,000 字符以内，并与当前
打包 manifest 和产品行为保持一致。

**单一用途**

AgentStart 的唯一用途是让用户在 Chrome 侧边栏中管理编程智能体和开发工作区，并在用户主动请求时为当前页面提供浏览器上下文和调试工具。

**必需权限**

| 字段 | 可粘贴说明 |
| --- | --- |
| `contextMenus` | 为用户主动选择的文本、链接和图片提供右键操作，并将所选内容交给 AgentStart 工作区处理；不会在后台读取页面内容。 |
| `debugger` | 仅在用户启动浏览器调试功能时连接当前标签页，用于录制或回放、网络模拟、Console/Network 检查和性能采集；操作结束或失败时立即解除连接。 |
| `downloads` | 仅在用户主动导出 daemon 生成的文件时调用 Chrome 下载界面；不会在后台下载文件。 |
| `nativeMessaging` | 连接用户单独安装的 AgentStart daemon，交换短期认证信息和工作区能力，让扩展能够访问用户选择的本地或远程开发环境。 |
| `sidePanel` | 承载 AgentStart 的主要工作台和跨标签页项目导航，供用户管理项目、worktree、智能体会话、终端和审查面板。 |
| `storage` | 保存设备本地的连接设置、托管策略、界面状态和非敏感偏好；认证令牌保存在本地或会话存储中，不写入 Chrome Sync。 |
| `tabGroups` | 按用户选择的项目和 worktree 管理对应标签页分组，并同步分组标题、折叠状态和颜色。 |
| `tabs` | 查找、聚焦、创建和关闭用户请求的 AgentStart 工作区或预览标签页，并维护当前标签页与项目的对应关系。 |
| `webNavigation` | 监听用户打开的预览页导航完成事件，以便把 daemon 管理的预览标签页保持在正确的项目分组中。 |

**可选权限**

| 字段 | 可粘贴说明 |
| --- | --- |
| `activeTab` | 用户通过明确手势调用浏览器上下文功能后，临时读取当前标签页所需的页面上下文；不会在用户未操作时访问页面。 |
| `bookmarks` | 用户启用项目书签功能并确认后，创建或更新其明确要求的 AgentStart 项目书签文件夹和链接。 |
| `history` | 用户启用历史记录功能并确认时间范围后，只读取该限定时间段的浏览记录用于上下文选择。 |
| `idle` | 用户启用返回摘要后，判断设备是否处于活跃状态，以决定是否延迟显示通知；不会记录用户活动内容。 |
| `notifications` | 用户启用通知后，显示智能体进度、需要决定的事项和返回摘要；通知可在 Chrome 中撤销。 |
| `power` | 用户启用防休眠功能期间保持设备唤醒，功能关闭或会话结束后立即释放保持唤醒请求。 |
| `scripting` | 仅在用户主动使用页面上下文、元素选择器或已安装站点适配器时注入受限脚本；不会注入远程代码。 |
| `system.display` | 用户选择跨显示器排列项目窗口时读取显示器工作区域，用于计算窗口位置；不会持续追踪显示器。 |
| `tabCapture` | 仅在用户启动预览录制后捕获当前标签页媒体流；不会在后台录制或上传标签页内容。 |
| `userScripts` | 用户安装并启用可检查的社区站点适配器后，在 Chrome 隔离的用户脚本环境中注册和移除该适配器。 |

**主机访问权限**

| 字段 | 可粘贴说明 |
| --- | --- |
| `http://127.0.0.1/*`、`http://[::1]/*`、`http://localhost/*` | 连接用户本机 AgentStart daemon 的健康检查和引导端点；访问限制在本机回环地址，不读取其他网站内容。 |
| `http://*/*`、`https://*/*`、`https://github.com/*` | 仅在用户从浏览器上下文或站点适配器入口主动授权后访问所选网站，用于执行用户请求的上下文、调试或适配器操作；默认不启用，也不会后台收集网站数据。 |

### 数据使用勾选项

在“目前或未来您打算向用户收集哪些用户数据？”中勾选以下六项：

- `个人身份信息` — 用户主动提交非匿名支持报告时可能包含 GitHub 登录名和电子邮件。
- `身份验证信息` — 连接用户所选 daemon 的短期认证令牌。
- `浏览记录` — 用户启用并确认时间范围后读取的限定历史记录。
- `用户活动` — 用户主动触发的浏览器和工作流操作，以及不含页面内容的产品事件。
- `网站内容` — 用户选择或捕获的页面内容、截图、录制内容和 DevTools 详情。
- `用户生成的内容` — 用户主动提供的提示词、终端和工作区内容、附件、反馈和诊断信息。

不要勾选健康信息、财务和付款信息、个人通信或位置信息。产品不使用 Google Analytics，左侧
的 Google Analytics 页面保持未配置即可。远程代码选择“否，我未使用远程代码”。在下方的
Limited Use 合规声明中勾选全部标准声明：数据只用于已披露功能、必要时才向提供该功能的
服务转移、不用于个性化广告或信用/借贷判断，也不出售用户数据。提交前确认这些勾选与
[`PRIVACY.md`](../../PRIVACY.md) 保持一致。

## Privacy disclosure copy

Select these data categories in the dashboard and use the corresponding explanation. Confirm the
hosted PostHog retention value before submitting because the application does not configure it.

| Data category | English explanation | 简体中文说明 |
| --- | --- | --- |
| Website content | User-selected or captured page content, screenshots, recordings, and DevTools details are handled only for browser-context and debugging actions the user invokes. | 仅在用户主动调用浏览器上下文或调试操作时，处理用户选择或捕获的页面内容、截图、录制内容和 DevTools 详情。 |
| Web history | A bounded history interval is read only after the user enables the optional feature and reviews its time range. | 仅在用户启用可选功能并检查时间范围后，读取限定时间段的浏览记录。 |
| User activity | Explicit browser actions, agent workflow actions, and schema-limited product-event names and outcomes are handled to perform the requested feature and, when enabled, measure product use. | 处理用户主动触发的浏览器操作、智能体工作流操作，以及受固定字段约束的产品事件名称和结果，用于执行所请求的功能，并在启用时衡量产品使用情况。 |
| Authentication information | A random daemon token authenticates the extension to the selected daemon. It remains in device-local extension storage and is not placed in Chrome Sync. | 随机 daemon 令牌用于验证扩展与所选 daemon 的连接；它保存在设备本地扩展存储中，不会写入 Chrome 同步。 |
| User-generated content | Prompts, terminal and workspace content, attachments, feedback, and diagnostics are handled only for the agent workflow or submission the user requests. | 仅为用户要求的智能体工作流或提交流程处理提示词、终端和工作区内容、附件、反馈与诊断信息。 |
| Personally identifiable information | GitHub login and email are included only when the user chooses a non-anonymous support submission. Product telemetry has no dedicated fields for names, email addresses, or account identities; one installation-failure event can include a bounded error message. | 只有在用户选择非匿名支持提交时才包含 GitHub 登录名和电子邮件。产品遥测没有姓名、电子邮件地址或账户身份的专用字段；一个安装失败事件可以包含长度受限的错误消息。 |

### English

AgentStart uses Chrome API data only to provide the workspace, navigation, browser-context,
debugging, recording, download, and notification action the user requests. It does not sell Chrome
API data or use it for advertising, lending, or credit decisions. Browser and workspace data is
stored locally in Chrome extension storage or on the AgentStart daemon host selected by the user. It
is sent to a coding-agent provider only when the user invokes that provider. If product telemetry is
enabled, the daemon sends schema-limited product events to PostHog. Their schema has no dedicated
fields for file contents, prompts, terminal output, page content, repository paths, names, email
addresses, or account identities; one installation-failure event can include a bounded error message.
Feedback, crash, and diagnostic reports use a separate explicit submission flow. AgentStart's use and
transfer of information received from Google APIs complies with the Chrome Web Store User Data Policy,
including the Limited Use requirements.

### 简体中文

AgentStart 仅使用 Chrome API 数据来提供用户要求的工作区、导航、浏览器上下文、调试、录制、下载和通知操作。AgentStart 不会出售 Chrome API 数据，也不会将其用于广告、借贷或信用决策。浏览器与工作区数据保存在 Chrome 本地扩展存储或用户选择的 AgentStart daemon 主机上；只有当用户主动调用编程智能体提供商时，相关数据才会发送给该提供商。启用产品遥测后，daemon 会向 PostHog 发送受固定字段约束的产品事件。其字段不专门记录文件内容、提示词、终端输出、页面内容、仓库路径、姓名、电子邮件地址或账户身份；一个安装失败事件可以包含长度受限的错误消息。反馈、崩溃和诊断报告使用独立的主动提交流程。AgentStart 对从 Google API 获得的信息的使用和传输遵守 Chrome Web Store 用户数据政策，包括 Limited Use 要求。

## Build and review

For the first Web Store item only, run `vp run @agentstart/extension#package:web-store:initial`. It
builds the extension and writes a staged ZIP with `manifest.key` removed; upload
`apps/extension/release/agentstart-extension-<version>-initial-upload.zip` without repacking it.
Chrome assigns the item's ID during this upload. In the item's Package tab, use View public key to
copy the single-line public key into `apps/extension/wxt.config.ts`, then replace the pinned ID in
the extension, Native Messaging, enterprise policy, release metadata, and CI before publishing any
update. Do not skip this synchronization or the installed extension will not match the Web Store
item.

For subsequent updates, run `vp run @agentstart/extension#package:web-store`. It validates the MV3
manifest and pinned key, rejects source maps, credential key files, environment files, and dependency directories,
normalizes timestamps, then writes a versioned ZIP and SHA-256 file under
`apps/extension/release/`. Upload the ZIP without repacking it.

Before submission:

1. Install the matching daemon and load the ZIP unpacked once on the minimum Chrome version.
2. Verify toolbar click opens the side panel and Native Messaging recovery handles a stopped daemon.
3. Exercise every required permission without granting optional permissions, including the
   `debugger`, `downloads`, `tabs`, and `webNavigation` permissions that are present at install time.
4. Grant each optional permission only from its feature entry point, verify its visible disclosure,
   then revoke it and verify graceful degradation.
5. For `debugger`, show recording, interception teardown, and the unavoidable Chrome debugging
   banner to the reviewer. For `history` and `tabCapture`, show the review screen and time bound.
6. Confirm the package contains the 128 px icon, localized name and description, and no credentials
   or remote-code loader. Confirm the Web Store listing links to the published privacy policy.
7. Review the detailed description, category, distribution, homepage and support URLs, single-purpose
   field, every permission justification, remote-code answer, data-use answers, screenshots, and small
   promotional tile in the dashboard.

Actual Web Store review remains an external gate. Record the submitted package checksum, reviewer
notes, decision, and any requested permission changes in the release issue. A locally valid ZIP is
not evidence that Google approved the permission combination.

After the first item has complete Listing and Privacy tabs, configure the protected
`chrome-web-store` GitHub environment with `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
`CWS_REFRESH_TOKEN`, and `CWS_PUBLISHER_ID`. Pushing `extension-v<package version>` then builds the
same deterministic ZIP, uploads it through Chrome Web Store API v2, and submits the revision for
review. Google approval remains asynchronous; the workflow submission is not an approval signal.

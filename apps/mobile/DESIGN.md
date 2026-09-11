# Liquid Glass Design System

## Interface icons

All user-interface icons in the new iOS client, including the widget extension, use the free
Hugeicons Swift package through `DesignSystem/Icons/AgentStartIconID.swift` and `AgentStartIcon.swift`.
Features use semantic IDs (`AgentStartIcon(.refresh, size: 16)`) and never reference Hugeicons assets,
SF Symbols, Phosphor assets, or hand-created icon images directly. Product wordmarks and agent
logos are brand artwork and remain image assets. `AgentStartIcon` owns the shared resizable, colorable,
size-constrained rendering and hides decorative icons from accessibility; interactive controls
must provide their own localized accessibility label.

Navigation-bar icon actions use `AgentStartToolbarIcon` inside a native `ToolbarItem`. The Design
System fixes Hugeicons glyphs at 24pt while SwiftUI owns the circular Liquid Glass surface and hit
target. Header actions inherit the app's default neutral foreground accent; feature code must not
add `.font`, `.fontWeight`, `.frame`, `.foregroundStyle`, `.tint`, `.buttonStyle`, or
`.glassEffect` to these labels. Hugeicons owns the glyph stroke weight. All top-leading,
top-trailing, and other icon-only header actions use this same entry point. Adjacent independent
actions use separate `ToolbarItem`s with a fixed `ToolbarSpacer`; `ToolbarItemGroup` is reserved
for actions that intentionally share one capsule. A feature that must retain a custom sheet or
docked-panel header uses `GlassHeaderButton`; it reuses the same 24pt icon entry point, inherited
color, 36pt visible circle, and 44pt hit target.

`AgentStartLoader` reads the active loader style from `appLoaderStyle`, which is populated by Settings at
the app root. Product features choose only the semantic size and never hardcode an
`AppLoaderStyle`; the loader picker is the sole exception because it previews the available choices.

AgentStart iOS 的设计语言由系统 Liquid Glass、中性纯色背景和清晰的内容层组成。它不是把每张
卡片都模糊化；玻璃代表导航、控制和临时浮层，内容仍然保持稳定、可读和高性能。

## 承重原则

1. **系统组件优先。** `NavigationStack`、toolbar、sheet、menu、search、tab 和 Button
   首先使用原生形态，让 iOS 26 自动提供玻璃外观、形变、命中反馈与辅助功能。
2. **玻璃只在功能层。** 自定义玻璃用于浮动操作组、临时 HUD 和必须悬在内容之上的
   控件。列表行、代码、diff、terminal、聊天气泡和普通内容卡片不使用玻璃。
3. **一个层级一个 owner。** 页面决定布局；Design System 决定 token 和共享视觉语法；
   feature 决定自己的信息结构。Feature 不复制全局颜色、间距或玻璃配方。
4. **背景保持纯色。** 页面只使用系统自适应 background，任何页面和组件都不使用装饰性
   渐变；控件本身也不堆叠手工阴影、高光和多层描边去仿造玻璃。
5. **可读性优先于效果。** Reduce Transparency、Reduce Motion、Increase Contrast、动态
   字体、深浅色和浅色壁纸都必须可用。

## 功能保真合同

原生实现的保真约束**行为、能力与状态语义**，不要求复制已退役客户端的页面排布。功能基准是
runtime protocol 和各 feature 的 `INVARIANTS.md`：实现或改动页面前，确认它覆盖的能力、状态
分支、图标语义与文案含义。历史客户端只提供迁移背景，不再是可引用的合同；需要保留的行为和
 视觉数值必须直接写在本文件或对应 feature 的 `INVARIANTS.md` 中。

- 业务页面允许使用 feature-owned 固定视觉 metric，以便准确映射既有 token；同一 metric
  必须只有一个 owner，不能散落成互不一致的 magic number。
- 内容图标使用 Hugeicons Free 的语义图标；不在页面中
  创建逐个图片资产，也不保留 Phosphor 或 SF Symbols 作为 UI 图标 provider。
- Header action 继承 App 默认的中性前景强调色，不在页面局部设置颜色；普通内容图标和
  Loader 使用 `mutedForeground`。橙色 `primary`（`#FF5B03`）只保留给明确的主操作，不作为
  App 的默认 tint，也不用于工作中状态。Liquid Glass 的全局 tint 使用
  `Theme.Colors.foreground`；`selection` 是表面状态色，不作为普通按钮文字 tint。
- Glass 只改变控件表面，不改变图标尺寸或状态颜色的语义映射；页面自身的排版、分组与控件
  摆放不受此约束。

### Diff Code Surface

Diff is an editor surface, not a tinted list. Review, source-control branch diffs, file tabs, and
inline review comments use the adaptive `editor-surface` background,
20pt rows, a 20pt `+`/`-` prefix column, a 44pt right-aligned line-number column, and 8pt code
insets. Additions and deletions use the defined light/dark semantic washes and git status
colors; context lines stay on the editor surface. Paired deletion/addition lines retain the shared
inline emphasis renderer, but no native page may substitute a desktop-only dark canvas, colored
rail, or second syntax palette. Syntax colors follow the editor tokens in both appearances while
Liquid Glass remains limited to navigation and controls.

## 响应式布局合同

Native 不使用 `horizontalSizeClass` 或设备型号猜测手机/桌面布局。根导航和所有需要宽屏
行为的 feature 读取 `AgentStartLayoutMetrics`：实际窗口宽度至少 700pt 且短边至少 600pt 才是
`isWideLayout`。因此 iPhone 横屏和窄 iPad 分屏仍保持手机的单列导航、Session header、
Terminal accessory 和 sheet 密度；只有有足够空间的 iPad 窗口才显示 Workspace master-detail
分栏、右侧 dock 或 Review 的并排面板。这个判断必须由 Design System 统一提供，feature 不得
重新写一套设备型号或 size class 条件。

Workspace List 的第一组基准由 `Features/Workspace/list/Metrics.swift` 持有：文字
17 / 15 / 13pt，项目图标 20pt，普通图标和工作区 Loader 16pt，紧凑图标 12pt，agent 状态
10pt、内部方块 6pt，section / row 最小高度 44pt，open-tab 行高 24pt。工作区内容图标来自
Hugeicons Free。普通 Repo fallback、分支、非 Agent tab、备注、折叠箭头和 Loader 使用
`mutedForeground`；Agent mark 保留品牌色，未读 Bell 使用 `unread`，Pull Request 使用
open / closed / merged 的语义状态色，不能退回默认黑色。所有 section 的项目图标使用同一个
20pt 固定列并在 44pt 行内垂直居中，Project Name 共用一个 leading anchor；项目 rail 从行顶
32pt 独立绘制，不能通过把图标容器改为顶部对齐来迁就 rail。

Terminal 的基准由 `Features/Terminal/ChromeMetrics.swift` 持有：Tab Strip 位于标题下方且高
44pt，左右边距 12pt、间距 8pt；Tab 可视高度 36pt、宽 96–160pt、图标 16pt、文字
15pt。未选中 Tab 透明，选中 Tab 使用灰色 `selection` 胶囊，不能把每个 Tab 做成 Glass，新增
按钮是 36pt 中性实色圆形和 44pt 点击区，不使用会在 Terminal 边缘形成分隔阴影的 Glass。
Tab Strip、Add Button 外层与 Terminal 使用同一个连续 `background`。Terminal 内容左右保留
12pt。连接与恢复状态显示为不参与布局的顶部浮层，始终可以关闭，关闭提示不取消后台重连。
Session 右上角 More 只承载页面级导航：Terminal / Chat 视图切换、Quick commands、
文件浏览、Source Control、Agent History 和 Checks，并按 capability 隐藏不可用项。Terminal
尺寸切换、Rename、Clear 和 Close 属于当前 Terminal Tab 的长按菜单；尺寸切换同时保留底部
快捷栏的直接按钮。两组 action 不能合并，`Terminal Settings` 不出现在任一 Session 菜单。
底部快捷键栏常驻，
其 native iOS 基准为 52pt 行高、6pt 间距、40pt 可视控件、44pt 点击区、14pt 等宽文字和
18pt 模式图标；箭头和删除键固定使用 `↑ ↓ ← → ⌫` 字形。快捷键、toolbar、连接 Loader
与模式切换全部使用灰色，只有业务内容自身的 ANSI 色保留颜色。快捷键横向滚动区域保持
透明并隐藏系统 Scroll Edge Effect，不能在底部区域上再形成矩形 material 或背景层。

## 组件决策树

添加 UI 前按顺序判断：

1. SwiftUI 是否已有语义正确的标准组件？有则直接使用。
2. 是否只是一个 feature 私有组合？留在 `Features/<Name>/UI`。
3. 是否被三个以上无关 feature 使用，并且拥有统一视觉不变量？才进入
   `DesignSystem/Components`。
4. 是否需要自定义玻璃？只有浮动或交互控制层回答“是”。普通内容 surface 回答“否”。

## Liquid Glass 合同

- 本包最低 iOS 26，直接使用最新 API，不写 `#available` fallback。
- `glassEffect` 放在 frame、padding、shape 等布局 modifier 之后。
- 只有能点击、拖拽或选择的自定义玻璃使用 `.interactive()`。
- 多个相邻自定义玻璃放入同一个 `GlassEffectContainer`，spacing 使用 Theme token。
- 标准 `Button` 使用 `.buttonStyle(.glass)` 或 `.glassProminent`，不再额外叠
  `glassEffect`。
- 中性主操作使用 `appProminentGlassButton()`；它封装系统 `.glassProminent`，让系统根据
  中性的 App tint 自动选择对比度。不要在页面再覆盖标签颜色。破坏性操作仍直接使用
  `.glassProminent` 加
  `Theme.Colors.attention`，保留红色语义。
- tint 表达语义或主操作，不是装饰。destructive、warning、connected 等状态使用系统
  semantic color。
- 玻璃不承载长文本、diff、代码或 terminal 内容；这些内容使用不透明或系统 content
  background 保证对比度。

## 按钮尺寸合同

按钮大小由使用场景决定，不能由页面临时挑选。可见高度只使用 32 / 36 / 44pt；
所有自定义按钮的实际点击区至少 44×44pt。文字按钮与图标按钮使用同一套场景语义。

| 场景 | 可见高度 | 图标 | 点击区 | SwiftUI 用法 |
| --- | ---: | ---: | ---: | --- |
| navigation title、系统 toolbar、sheet confirmation | 系统决定 | icon-only 24pt | 系统保证 | 原生 placement；不加 `appButtonContext`，不套自定义 Glass |
| 标准行内操作：filter、chip、row accessory、紧凑格式栏 | 32pt | 16pt | 44pt | `.appButtonContext(.inline)` |
| 普通内容操作：retry、次要操作、panel 内成组操作 | 36pt | 18pt | 44pt | `.appButtonContext(.regular)` |
| 大型操作：submit、底部主 CTA、custom sheet header、44pt mode selector | 44pt | 20pt | 44pt | `.appButtonContext(.large)` |
| list row、menu item、navigation row | 行高至少 44pt | 随内容 metric | 整行 | 使用 `Button` / `Menu` 的 plain content row，不做 Glass pill |

不需要系统视觉样式的 `Button` 统一使用 `.buttonStyle(.appPlain)`，不直接使用 `.plain`。
`appPlain` 把 label 的布局矩形声明为 `.interaction` 命中区域；绘制或扩展交互表面的 owner 必须
把 frame、padding 和视觉 shape 放进 label，或在 Button 最终的外层 hit frame 后再声明
`.contentShape(.interaction, .rect)`。可见表面与可点击表面不能由不同调用点分别维护。

- 相邻且同层级的 action 必须使用相同尺寸。主次关系通过 `.glassProminent` / `.glass`、文字
  weight 和位置表达，不能把首要按钮做大、旁边按钮做小。
- 一个页面同时最多 1–2 个 prominent action。默认 action 和 Loader 都不使用蓝色；普通 icon
  和工作中状态使用 `mutedForeground`，destructive 才使用红色语义色。
- `GlassIconButton` 必须传场景 `context`，不能直接写 frame。普通文字 `Button` 在
  `.buttonStyle(.glass)` 或 `.glassProminent` 后使用 `appButtonContext`。
- 全宽通常用于 `.large` 的表单、footer 主 CTA，以及 Pairing 这类全屏安全确认；普通 retry
  属于 `.regular`，不因为处于空状态而放大。全屏确认上下排列主次按钮；小型确认弹层
  里并排的两个按钮使用 `.regular`。
  `.inline` 和普通 `.regular` 不因容器变宽。
- 已经位于 content section 内的空态保留 section header 和正文密度：header
  action 使用 `.inline`，不能改造成居中的 hero 图标、粗大标题和大型 CTA。只有进入独立表单
  后的最终提交按钮才可使用全宽 `.large`。
- 业务专用控件可以由 feature 持有尺寸，但必须在 feature metric 中声明场景和 44pt 命中区，
  例如 Terminal tab、快捷键和 Workspace row；不能在 view body 里散落 magic number。
  Workspace lineage chip 是 24pt 可见高度、搜索清除圆是 24pt，二者继续使用 44pt 命中区；
  Terminal 快捷键则是 40pt 可见高度、44pt 命中区。

## Loader 合同

Loader 分为两类，不能用一套近似动画代替：

- `working`、`searching`、`solving`、`listening`、`composing`、`shaping` 使用
  `expo-thinking-orbs` 0.1.0 的原生移植，包括 20 / 64 两套 density、dot radius、speed、
  depth、轨迹和 morph 参数。
- `S1...S5`、`B1...B5`、`C1...C5`、`M1...M5` 使用
  `orb-lattice`、`orb-lens`、`orb-ring`、`orb-morph` 几何、delay、duration、opacity 和 scale。

用户选择的 Loader 样式用于所有不定进度状态，包括 10pt agent state、16pt Workspace working
status、18pt attachment upload、20pt Chat Working，以及页面请求、保存、搜索和提交。App 根节点
通过 `AgentStartProgressViewStyle` 把系统 `ProgressView` 接入同一个 Settings 环境值；页面不选择具体
动画。可以量化的确定进度继续使用系统 linear progress，不能伪装成无限循环动画。

所有 Loader 使用中性的 `foreground` 灰色，不使用蓝色，
样式仍然完全由 Settings 驱动，也不套 Glass。Reduce Motion 下停在每种动画原有的确定帧。
Appearance picker 必须直接渲染全部 26 个候选动画；Design System Catalog
只用当前 Settings 选中的样式展示 10 / 16 / 18 / 20pt 场景尺寸，不能写死家族样例。

## Token

所有跨 feature 数值集中在 `DesignSystem/Foundations/Theme.swift`：

- spacing 使用 4 / 8 / 12 / 16 / 20 / 24 / 32 的阶梯；
- radius 只定义 content、control、floating surface 三种语义；
- 新页面 typography 使用动态系统 text style；既有页面按上面的保真合同使用 feature-owned
  metric；
- animation 使用系统 `.snappy` / `.smooth` token，并尊重 Reduce Motion；
- opacity、glass spacing、minimum hit target 和页面边距不在 feature 内重复硬编码。

内容本身需要的语义色——ANSI terminal、diff、syntax highlighting、agent identity、图片和
状态——属于 feature/domain，不强行压成品牌色。

### Feature 样式约束

- Feature 只能通过 `Theme`、Design System 组件及语义 modifier 选择颜色、字号、间距、圆角、
  描边和控件尺寸；不得在 view body 里复制跨页面数值。只有确实属于业务内容几何的尺寸可以由
  feature-owned metric 持有，并且同一 metric 只有一个 owner。
- UI 正文默认使用 regular。`bold` / `semibold` 只用于 navigation title、内容标题和 section
  title；按钮、Tab、状态、Badge、数量、作者、时间、辅助信息和 row accessory 均保持 regular，
  通过字号、颜色和位置表达层级，不能靠任意加粗制造强调。
- 新页面的文字角色只使用 `Theme.Typography`：13pt metadata、15pt supporting、17pt primary、
  19pt emphasis、21pt page title。Feature 不得用相邻的 12 / 14 / 18pt 近似值重新造一套层级。
- 内容 Surface 使用 `ContentSurface`，由它统一拥有 16pt 内边距、content radius 和 hairline；
  feature 不复制背景、圆角和描边配方。普通交互行至少 44pt，控件可见尺寸继续遵循按钮尺寸合同。

Source Control 的 hosted review 由 `HostedReviewPage`、`HostedReviewSection` 和
`SourceSelectionStrip` 共同持有页面节奏：页面横向 16pt，section 之间 12pt，section header
高度 44pt、header 到 Surface 4pt、Surface 内元素分组 12pt。身份、检查、Reviewer、描述和评论
不得各自重写这组数值。PR 身份信息到首要操作使用 20pt；首要操作到后续 44pt 控件行补 4pt，
使首要操作上下的可见留白保持同一 20pt 节奏。紧邻的图标操作使用 `.regular` 的 36pt 可见尺寸、
44pt hit target，并共享零 layout gap 的连续操作组，不能因 hit target 的隐形空间再次叠加间距。

## 页面语法

- 页面统一使用纯色 `AppBackground`；禁止渐变、彩色光晕或其他装饰性背景。
- 主内容使用 `ScrollView` + lazy container 或 `List`；大型集合不得用 eager stack。
- 页面标题和首要操作进入 navigation/toolbar，由系统生成玻璃。
- 内容页面的 navigation header 使用紧凑 inline 标题；对应 SwiftUI 页面必须显式使用
  `.navigationBarTitleDisplayMode(.inline)`，不能因为 SwiftUI 默认采用大标题而改变首屏密度。
  Home 等本来就在内容内显示标题的页面继续由内容持有标题。
- 浮动底部操作组使用 `GlassActionGroup`；同一操作不能同时出现在 toolbar 与浮层。
- 产品空态和错误态使用 `AppUnavailableState`：28pt 中性 Hugeicon、regular body title、
  secondary subheadline 描述，以及 36pt `.regular` retry。系统 `ContentUnavailableView` 的小图标、
  粗标题和大型 prominent action 不符合本产品的信息密度，不在 feature 中直接使用。
- 状态 chip 使用 `SemanticBadge`，它不是玻璃，避免每个小标签都产生昂贵折射层。

## 状态 Overlay

连接中、重连、恢复和动作失败属于跨 Terminal/Chat 的 transient state，不得占用页面的内容
布局，也不能只存在于 Terminal renderer 的可见分支。统一使用
`TerminalConnectionStatusBanner`：中性 Liquid Glass、Settings 驱动的灰色 Loader、可关闭的
44pt dismiss hit target；失败和结束状态提供同一 banner 内的 retry。Terminal 的动作反馈使用
`TerminalActionNoticeLabel`，Chat composer 上方也必须保留它，避免切换到 Chat 后丢失 Stop、
rename、clear 或 reconnect 的失败信息。

## Sheet 呈现合同

所有产品内 Sheet 通过 `appSheetPresentation` 声明语义，feature 不得直接组合
`presentationDetents`、`presentationSizing` 和 `presentationDragIndicator`，也不依赖系统
`.automatic` 推断。相机、照片库等系统 controller 保留系统自己的 presentation。

- `.page`：创建、选择、详情等有自己 header/toolbar 的完整流程，使用系统 page
  sizing，隐藏拖动条。
- `.fixed(detent)`：确认、简短编辑和固定高度 action drawer，只有一个停靠高度，
  隐藏拖动条。

`AppSheetPresentation` 只有这两个 case，且两者都写死 `.presentationDragIndicator(.hidden)`。
**没有可调整高度的 sheet，也没有任何 sheet 显示拖动条**——每个 sheet 都通过自己的 header 或
导航栏动作关闭。需要更多高度时改用 `.page`，不要引入第二个 detent 或拖动条。

## 动效与性能

- 动效解释状态变化、空间关系或操作结果，不为静态装饰持续运行。
- 玻璃 morph 只用于同一组控件的插入、移除和形态切换，identity 必须稳定。
- transcript、terminal、diff 和文件树是性能红线：窄观察、lazy 渲染、稳定 identity、可
  取消任务；不在 cell body 中做 Markdown parse、diff parse、图片 decode 或网络读取。
- 每个复杂页面在浅色/深色、Reduce Transparency、Reduce Motion、最大动态字体和 iPad
  分屏下验收。

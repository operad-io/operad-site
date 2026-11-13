---
description: 终端客户端：主题、实时更新、状态与退出。
---

# 终端客户端 {#the-terminal-client}

`operad tui` 是同一个 `/v1` 接口的终端客户端。在全新的 `~/.operad` 下，它不需要任何其他东西：不用改 config，不用在另一个终端里运行 `operad serve`，也不用 token。它从不打开 store，也从不加载插件。

## 为什么需要它 {#why-it-exists}

等你处理的事和正在进行的 run 都由 `operad serve` 持有。终端客户端让你不离开终端就能看到并处理它们：哪些 pending、哪些在运行、对象的各个部分和 history，以及对象提供的 action。它只通过 `/v1` 接口与 `serve` 通信，这与手机 app 用的是同一个接口，所以它显示的内容与 app 相同，也不认识任何插件。没有服务器在运行时，它会替你启动一个，所以第一次使用不需要任何设置。它自己从不打开 store，只通过运行对象提供的 action 来做出改动。

## 它如何工作 {#how-it-works}

1. `operad tui` 先找到地址和 token：给出 `--url` 和 `--token` 就用它们，否则用 `config.json` 中的 `http.listen` 和 `http.port`，以及 `$OPERAD_HOME/secrets/http.json` 中的 token。
2. 它向该地址请求 `/v1/types`。如果没有 `serve` 响应，且没有 `serve` 持有此 home，它会启动 `operad serve`（除非给出 `--no-start`），并最多等待 15 秒。细节见下面的列表。
3. 它从 `--theme` 或 `$OPERAD_HOME/tui.json` 读取主题和 layout（见 [tui.json 文件](#the-tuijson-file)和[主题](#themes)），并从 `GET /v1/keys` 读取按键绑定，其中包含你的 [`keys.json`](#keysjson)。
4. 它绘制各个列表：先是 Pending 和 Running，然后是每个插件的顶层对象类型各一个 tab，数据来自 `GET /v1/pending`、`GET /v1/running` 和 `GET /v1/objects`。`enter` 用 `GET /v1/objects/<id>` 打开一行：该行、各个 section tab，以及该 section 的 Markdown。
5. 它读取 `GET /v1/events`。某个对象的事件会让每个已打开的列表重新获取该对象；`reset` 会重新获取所有已打开的内容。服务器不可达时，它保留最后的列表并重试（见[实时更新、状态与退出](#live-updates-states-and-leaving)）。
6. 按键或 `:` 面板中的条目用 `POST /v1/act` 运行 action；action 需要时，会先要求输入 note 或确认。被拒绝的 action 会在页脚显示服务器的消息。
7. `q` 或 Ctrl-C 恢复终端并退出。由 TUI 启动的 `serve` 继续运行；用 `operad serve stop` 停止它。

它按下面的方式找到或启动服务器：

- 给出 `--url` 和 `--token` 时，它们优先于 home。给出 `--url` 时，从不启动任何东西。
- 没有 `--url` 时，URL 是 `http://<address>:<port>`，其中 address 取自 `config.json` 中 `http.listen` 的第一项，port 取自 `http.port`；没有 `http` 部分时是 `http://127.0.0.1:7480`。
- 它向该地址请求 `/v1/types`。如果有 `serve` 响应，就继续。
- 如果没有任何东西响应，且没有 `serve` 持有此 home，它会为这个 `OPERAD_HOME` 启动 `operad serve`，打印 `starting operad serve (log: <path>)`，最多等待 15 秒（探测时间也计入）让它响应，然后打开界面。这个 `serve` 使用与你所输入命令相同的运行时和 `operad` 入口，以 `$OPERAD_HOME` 作为工作目录，把输出追加到 `$OPERAD_HOME/serve.log`，并且在你退出 TUI 之后继续运行，因为 hub 要继续运行 flow。用 `operad serve stop` 停止它（见 "Stopping serve"），或者在你自己运行 `operad serve` 的终端里按 Ctrl-C。如果它立即退出或始终不响应，`operad tui` 会以一条点明 `serve.log` 的错误失败，并显示它的最后几行；`serve.log` 可能包含插件的输出，所以粘贴之前请先阅读这些行。如果是另一个 `operad tui` 先启动了这个 `serve`，那么本次会在同样的 15 秒内等待该 `serve` 响应。
- 如果已有 `serve` 持有此 home，但该地址没有任何东西响应（`http.enabled` 为 false，或 `http.port`/`http.listen` 不同），它不启动任何东西并说明这一点，同时点明 `http.enabled` 和 `http.port`。
- 如果该地址有东西响应，但它不是 operad，它会失败并点明端口。
- `http.port` 为 0 或 `http.listen` 为空时，它不启动任何东西，并提示设置 `http.port`（或 `http.listen`）或传入 `--url`。
- `http` 中为 `"enabled": false` 时，它不启动任何东西，并点明 `http.enabled`。
- `--no-start` 关闭启动：界面照常打开，并在页脚显示失败信息。
- 没有 `--token` 时，token 是 `operad pair` 从 `$OPERAD_HOME/secrets/http.json` 读取的那一个。`operad pair --show-token` 会把它打印出来。

| 输入 | 类型 | 默认值 | 允许的值 |
|---|---|---|---|
| `--url` | 字符串 | `http://<first http.listen address>:<http.port>`，没有 `http` 部分时即 `http://127.0.0.1:7480` | 不带凭据、query 或 fragment 的 `http` 或 `https` URL。 |
| `--no-start` | flag | 关闭 | 即使没有任何东西响应，也从不启动 `operad serve`。 |
| `--theme` | 字符串 | `$OPERAD_HOME/tui.json` 中的 `theme`，否则为 `auto` | `auto`、`light`、`dark`、`terminal`、一个 family 或内置主题（见 Themes），或你自己的主题文件的名称。本次会话中优先于 `tui.json`。 |
| `--token` | 字符串 | `$OPERAD_HOME/secrets/http.json` 中的 token | 正在运行的 `serve` 的 bearer token。 |
| `OPERAD_HOME` | 环境变量 | `~/.operad` | 存放 `config.json`、`secrets/http.json`、`serve.lock` 以及被启动的 `serve` 所写的 `serve.log` 的目录。 |
| `http.listen` | `config.json` 中的字符串数组 | `["127.0.0.1"]` | `serve` 可以监听的 IP 字面量；第一个是 TUI 的默认地址。 |
| `http.port` | `config.json` 中的整数 | `7480` | `0` 到 `65535`；TUI 需要 `serve` 实际使用的端口，所以 `0` 需要配合 `--url`。 |

## tui.json 文件 {#the-tuijson-file}

`$OPERAD_HOME/tui.json` 保存这个客户端自己的设置。它是 JSON；文件缺失表示使用默认值。TUI 监视该文件，并在它变化时重绘。如果文件不是 JSON 对象、不是合法的 JSON、使用了下面两个键和 `$schema` 之外的键，或使用了未知的主题，就会被拒绝，并指出文件和问题；启动时 TUI 不会打开。

<!-- schema: tui.schema.json -->
```json
{ "theme": "nord", "layout": "tree" }
```

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `theme` | 字符串 | `"auto"` | `auto`、`light`、`dark`、`terminal`、一个 family 或内置主题，或 `$OPERAD_HOME/themes` 中某个主题文件的名称 | 启动时，以及 `tui.json` 变化时；`--theme` 在一次会话中优先于它 | 被拒绝：TUI 不会启动，消息指出文件和未知的主题 |
| `layout` | 字符串 | `"tree"` | `tree`、`list` | 启动时，以及 `tui.json` 变化时；`t` 切换它并把选择保存到 `tui.json` | 被拒绝：TUI 不会启动，消息指出文件和键 |

`layout` 决定对象页面如何绘制它的下一层级：`tree` 把子对象嵌套在按 `after` 顺序排在最前的同级对象之下，`list` 则显示一个平铺的列表。

## 主题 {#themes}

| 名称 | 外观 |
|---|---|
| `auto`（默认） | 按终端的主题模式使用 `light` 或 `dark`，终端切换时它会实时切换。 |
| `light`、`dark` | operad 应用的颜色。 |
| `terminal` | 终端自己的 16 种颜色（accent 为品红，run 为蓝，ok 为绿，error 为红，weak 为亮黑），因此由它的配色方案决定外观；不需要 truecolor。 |

未知的名称是一个错误，并会列出可用的名称。`tui.json` 中未知的主题是一个指出文件和问题的错误；TUI 不会启动。`tui.json` 的键在[它的小节](#the-tuijson-file)中。

颜色来自主题。`tui.json` 中的 `theme` 选择一个主题；`--theme` 为一次会话选择一个主题。主题文件只写它所更改的 token；其余的由 `extends` 补全。颜色可以是 `"#rrggbb"`，也可以是 0 到 15 的 ANSI 索引。

<!-- schema: theme.schema.json -->
```json
{ "extends": "dark", "colors": { "accent": "#ff8800", "error": 9 } }
```

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `comment` | 字符串 | 不存在 | 写给人看的说明：颜色的来源及其许可证 | 读取文件时；它不改变任何颜色 | 是文本则忽略；其他任何类型都会使文件被拒绝 |
| `extends` | 字符串 | `"dark"` | `light`、`dark`、`terminal`、一个内置主题，或另一个主题文件 | 读取文件时；出现环会被拒绝 | 被拒绝：显示 `theme not changed: <why>`，最后一个有效的主题保持不变；启动时 TUI 不会打开 |
| `colors` | 对象 | `{}` | 下面的 token 名称 | 读取文件时；省略的 token 来自 `extends` | 被拒绝：未知的 token 会指出文件和键 |
| `colors.text` | 字符串或整数 | 继承自 `extends` | `"#rrggbb"` 或整数 `0`–`15` | 绘制主题时 | 被拒绝：错误的颜色会指出文件和键；最后一个有效的主题保持不变 |
| `colors.weak` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；次要文本 | 绘制主题时 | 被拒绝，同上 |
| `colors.rule` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；分隔线和边框 | 绘制主题时 | 被拒绝，同上 |
| `colors.accent` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；需要你处理的内容 | 绘制主题时 | 被拒绝，同上 |
| `colors.run` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；进行中的工作 | 绘制主题时 | 被拒绝，同上 |
| `colors.ok` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；成功 | 绘制主题时 | 被拒绝，同上 |
| `colors.error` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；失败 | 绘制主题时 | 被拒绝，同上 |
| `colors.cancelled` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；已取消的对象 | 绘制主题时 | 被拒绝，同上 |
| `colors.add` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；diff 中新增的行 | 绘制主题时 | 被拒绝，同上 |
| `colors.remove` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；diff 中删除的行 | 绘制主题时 | 被拒绝，同上 |
| `colors.tint` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；选中行的背景 | 绘制主题时 | 被拒绝，同上 |
| `colors.code` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；代码块的背景 | 绘制主题时 | 被拒绝，同上 |
| `colors.background` | 字符串或整数 | 继承 | `"#rrggbb"` 或 `0`–`15`；palette、note、确认和键列表框的填充色 | 绘制主题时 | 被拒绝，同上 |

这些 token 的含义是：`text`、`weak`（次要文本）、`rule`（分隔线和边框）、`accent`（需要你处理）、`run`（进行中）、`ok`（成功）、`error`、`cancelled`（已取消的对象）、`add` 和 `remove`（diff 行）、`tint`（选中行的背景）、`code`（代码块的背景）以及 `background`（palette、note、确认和键列表框的填充色）。名称与内置主题相同的文件（`auto`、`light`、`dark`、`terminal`、一个 family 或一个内置主题）会被拒绝。`extends` 中出现环、未知的 token、错误的颜色或未知的键，都会使文件被拒绝，指出该文件，并保留最后一个有效的主题。

### 常用主题 {#popular-themes}

operad 内置了这些配色，每一种都取自其项目自己的仓库（来源、许可证和每一处对比度调整都写在 `packages/tui/themes/` 中对应文件的 `comment` 里，许可证文本就在这些文件旁边）。要选用其中一个，在 `tui.json` 中写上它的名称（`{ "theme": "nord" }`），或传入 `--theme nord`。

| Family（像 `auto` 一样跟随终端） | 浅色 | 深色 |
|---|---|---|
| `catppuccin` | `catppuccin-latte` | `catppuccin-mocha` |
| `solarized` | `solarized-light` | `solarized-dark` |
| `tokyo-night` | `tokyo-night-day` | `tokyo-night-night` |
| `one` | `one-light` | `one-dark` |
| `rose-pine` | `rose-pine-dawn` | `rose-pine-main` |
| `github` | `github-light` | `github-dark` |
| `kanagawa` | `kanagawa-lotus` | `kanagawa-wave` |

写 family 的名称时，TUI 在浅色终端中显示它的浅色成员，在深色终端中显示它的深色成员，并像 `auto` 一样实时切换。写某个成员的名称，则无论终端如何都保持该成员。下面这些没有成对的另一个，始终保持不变：`dracula`、`nord`、`catppuccin-frappe`、`catppuccin-macchiato` 和 `kanagawa-dragon`（都是深色）。Gruvbox 没有内置，因为它的仓库没有许可证文件。

### 你自己的主题 {#your-own-themes}

`theme` 也可以写主题文件的名称，即 `$OPERAD_HOME/themes/<name>.json`（JSON Schema：`packages/tui/theme.schema.json`）。它只写所更改的 token；其余的由 `extends`（`light`、`dark`、`terminal`、一个内置主题或另一个主题文件；省略时为 `dark`）补全。颜色可以是 `"#rrggbb"`，也可以是 0 到 15 的 ANSI 索引：

```json
{ "extends": "dark", "colors": { "accent": "#ff8800", "error": 9 } }
```

`extends` 中出现环、未知的 token、错误的颜色或未知的键，都是一个指出文件和键的错误。名称与内置主题相同的文件（`auto`、`light`、`dark`、`terminal`、一个 family 或一个内置主题）会被拒绝。

`docs/themes/` 中有两个示例，它们没有被安装：`high-contrast.json` 和 `low-saturation.json`。要以其中一个为起点：

```sh
mkdir -p ~/.operad/themes
cp docs/themes/high-contrast.json ~/.operad/themes/mine.json
echo '{ "theme": "mine" }' > ~/.operad/tui.json
```

TUI 监视 `tui.json` 和主题目录，其中任何一个变化时都会重绘，无需重启。变为无效的文件会让最后一个有效的主题保持不变，页脚会显示一行 `theme not changed: <why>`，直到下一次有效的更改。

每个主题都定义同样的 token：`text`、`weak`（次要文本）、`rule`（分隔线和边框）、`accent`（需要你处理）、`run`（进行中）、`ok`（成功）、`error`、`add` 和 `remove`（diff 行）、`tint`（选中行的背景）、`code`（代码块的背景）以及 `background`（palette、note、确认和键列表框的填充色）。

`operad tui` 使用终端的尺寸：在 100 列或更宽时，列表和对象窗格并排显示；不足 100 列时，列表占满屏幕，打开的对象会替换它，直到按 `escape`。页眉统计 Pending 和 Running，然后列出每个带有标签页的插件。对象归在设置之下的插件没有标签页：它的对象列在 `:` palette 的设置区域中，每个类型一组，并像从 Pending、Running 或其他标签页中的分组标题一样，从那里打开。在打开某一行之前，右侧窗格显示 `select an object`。`enter` 通过 `GET /v1/objects/<id>` 打开选中的行：窗格以该行开头（id、标题、state、note 徽标和标记），然后是按服务器顺序排列的 section 标签页（History 在最后），然后是该 section 的 Markdown。实时的 section 在它的标签页上有一个圆点，并在窗格位于底部时跟随它的末尾（`following`）；向上滚动会停止跟随，`End` 会恢复。被服务器按大小上限截断的 section 会显示 `Truncated` 提示，`f` 会加载整个 section。请求失败，或事件流被拒绝（例如 token 错误），会在页脚显示原因，直到某次获取成功；屏幕关闭后会打印同样的消息。列表会滚动以保持光标可见，刷新时，如果所选对象仍然存在，就会保持选中。在 100 列或更宽时，列表和对象并排显示：对象跟随选中的行（光标停止后约 150 ms 打开），`j` / `k` 和方向键继续移动列表，而滚动或切换 section 的键作用于对象。在不足 100 列时，对象占满屏幕：`enter` 打开它，`escape` 返回，`j` / `k` 滚动它。切换标签页会关闭对象。在声明了过滤器的类型的标签页上，`f` 按服务器的顺序显示下一个过滤器（每次启动时每个标签页都以该类型的默认过滤器打开；这个选择不会被保存）。页眉在标签页之后加上 ` · <filter>`，并且除非过滤器是 `all`，还加上 ` · N hidden`。如果新的过滤器仍然显示所选对象，选择就停留在同一个对象上，否则移到第一行。通过实时更新离开过滤器的对象会从列表中消失。在打开了对象时，`f` 在 section 被截断时加载整个 section，否则切换过滤器；打开对象的下一层级也跟随该过滤器，所以它的进度条和数字只统计列表所显示的行。在窄屏幕上打开了对象时，它只加载 section。应用读取的每个键都在下面。

| 输入 | 类型 | 默认值 | 允许的值 |
|---|---|---|---|
| `1`–`9` | 键 | 无 | 编号对应的标签页。 |
| `tab` | 键 | 无 | 下一个标签页。 |
| `shift-tab` | 键 | 无 | 上一个标签页。 |
| `enter` | 键 | 无 | 把选中的行作为对象打开（不足 100 列时；并排显示时它已经是打开的）。在已经打开的那一行上不做任何事。 |
| `↑` / `↓` | 键 | 无 | 把列表光标移动一行；列表在接近末尾时加载它的下一页。在不足 100 列且打开了对象时，改为把 section 滚动一行。 |
| `j` / `k` | 键 | 无 | 与 `↓` / `↑` 相同。 |
| `PgUp` / `PgDn` | 键 | 无 | 把打开的 section 滚动一页。到末尾时，向该 section 请求它的 `next` 页。 |
| `b` / `space` | 键 | 无 | 与 `PgUp` / `PgDn` 相同。 |
| `Home` / `End` | 键 | 无 | 打开的 section 的顶部或末尾；`End` 会恢复跟随实时的 section。 |
| `[` / `]` | 键 | 无 | 切换到上一个或下一个 section 标签页。 |
| `←` / `→` | 键 | 无 | 与 `[` / `]` 相同。 |
| `p` | 键 | 无 | 在打开的 section 有分页时，选择一页。 |
| `n` / `N` | 键 | 无 | 在打开的 section 有分页时，下一页或上一页。 |
| `t` | 键 | 无 | 在 `tree` 和 `list` 之间切换子对象列表；选择会保存到 `tui.json`。仅当打开的对象有子对象时可用。 |
| `c` | 键 | 无 | 在 chat 标签页上，开始一个新的 chat；palette 会列出父对象（仓库或 bot）。 |
| `f` | 键 | 无 | 用 `full=true` 加载被截断的 section；否则，在有过滤器的标签页上，切换到下一个过滤器。 |
| `g` | 键 | 无 | 第一行；在不足 100 列且打开了对象时，是 section 的顶部。 |
| `G` | 键 | 无 | 最后一行；在不足 100 列且打开了对象时，是 section 的末尾（它会恢复跟随实时的 section）。 |
| `r` | 键 | 无 | 重新获取每个列表，以及打开的对象和它的实时 section。当打开的 section 加载失败时，也会重新请求该 section。 |
| `a` | 键 | 无 | 运行打开的对象的主 action，即该对象当前提供的第一个 action（页脚会连同它的键一起写出它的名称）。绑定到某个 action 的键（见下）优先于 `a`。在 Pending 上，当所选项的选项不是其对象上的 action 时，`a` 会打开这些选项并回答问题。没有 action 时，页脚会用一行说明这一点。 |
| 已绑定的键 | 键 | `GET /v1/keys` | 在打开的对象上运行那个 action。`keys.json` 中的用户绑定优先于同一个键上的插件默认值。保留键不能被绑定：`enter`、`return`、`escape`、`esc`、`tab`、方向键（`up`、`down`、`left`、`right`）、`pageup`、`pagedown`、`home`、`end`、`space`、`[`、`]`、`:`、`?`、`/`、`b`、`f`、`g`、`j`、`k`、`n`、`p`、`q`、`r`、`t`（字母大小写均可）和 `1`–`9`，以及 Ctrl-C 和任何 Ctrl 或 Meta 组合键。保留键上的插件默认值或 `keys.json` 条目会被丢弃；启动时页脚会用一行写出每个被丢弃的键及其 action 和来源。该 action 仍可通过 `:` palette 使用，不显示键。如果对象当前不提供该 action，页脚会用一行说明它不可用。 |
| `:` | 键 | 无 | 打开 palette：输入即可对打开的对象所提供的 `plugin:action` 名称做模糊匹配，每个都带有它的键以及“需要 note”或“要求确认”，也包括 TUI 自己的命令和设置。对象归在设置之下的插件会在这里列出它们，每个类型一个以类型命名的分组；`enter` 打开该对象的页面。`↑` / `↓`（或 Ctrl-P / Ctrl-N）移动，`enter` 运行，`escape` 关闭。没有打开对象时，它只列出 "no object is selected"。 |
| note 输入 | 键 | 无 | 带有 note 字段的 action 会打开一个文本输入框。键入会添加文本，`backspace` 删除，`shift-enter` 或 `Ctrl-J` 换行，`enter` 发送，`escape` 取消。必填的 note 不能为空发送。 |
| 确认 | 键 | 无 | 要求确认的 action 会以红色显示 `<action> <id>? [y/N]`。`y` 以 `confirmed: true` 发送它；其他任何键都会取消。 |
| `?` | 键 | 无 | 显示或隐藏键列表。 |
| `q` | 键 | 无 | 退出。 |
| `Ctrl-C` | 键 | 无 | 立即退出。终端会自行恢复；其他任何 Ctrl 或 Meta 组合键都不起作用。 |
| `escape` | 键 | 无 | 关闭键列表，或关闭打开的对象并停止它的请求。键列表打开时，只有 `?`、`escape` 和 `q` 起作用；其他键不影响列表。 |

## `keys.json` {#keysjson}

`$OPERAD_HOME/keys.json` 覆盖插件所带的键绑定。它是一个 JSON 对象，键是键名，值是 action 名称，即 `<plugin>:<action>`。用户绑定优先于同一个键上的插件默认值。保留键上的绑定会被丢弃；启动时页脚会用一行写出每个被丢弃的键及其 action 和来源，该 action 仍在 `:` palette 中，不显示键。不是已加载 action 的值会被忽略，并记录一行日志，无论它怎么拼写。

<!-- schema: keys.schema.json -->
```json
{ "m": "dev:merge", "g": "dev:reject", "n": "dev:rework" }
```

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `keys.<name>` | 字符串 | 不覆盖 | 任何非空字符串；已加载的 action 通常写作 `<plugin>:<action>` | 插件加载时；运行中的 `serve` 会在文件变化时重新加载，TUI 从它读取绑定 | 仅当值为空或不是字符串，或文件不是 JSON 对象时被拒绝：`key bindings "<path>": <reason>`。指向未加载 action 的非空值会被忽略，并记录 `key "<key>": "<action>" is not a loaded action; the key is ignored` |

保留键有 `enter`、`return`、`escape`、`esc`、`tab`、方向键（`up`、`down`、`left`、`right`，以及它们的 `arrow` 名称）、`pageup`、`page-up`、`prior`、`pagedown`、`page-down`、`next`、`home`、`end`、`space`、`[`、`]`、`:`、`?`、`/`、`b`、`f`、`g`、`j`、`k`、`n`、`p`、`q`、`r`、`t`（字母大小写均可）和 `1`–`9`，以及 Ctrl-C 和任何 Ctrl 或 Meta 组合键。保留键不能被绑定。

## 实时更新、状态与退出 {#live-updates-states-and-leaving}

界面跟随事件流。某个对象的事件会让每个打开的列表重新获取该对象的行；如果它是打开的对象，则重新获取该对象及其打开的实时 section。`reset`（服务器无法恢复事件流，或事件流重新连接后没有可恢复的内容）会让每个打开的列表和打开的对象重新获取。任何事件都会让 Pending 和 Running 重新获取。一起到达的事件会合并成一批处理，每 250 ms 至多一批。

| 状态 | 界面显示 |
|---|---|
| 服务器无法连接 | 页脚一行，`no server at <url>: is `operad serve` running? retrying`。最后的列表保留在屏幕上，变暗显示。界面在 250 ms 后再次请求，然后是 500 ms、1 s、2 s、4 s，之后每 5 s 一次，并在服务器响应时恢复正常。 |
| 401 | `the token was rotated: run the TUI again or pass --token`。不会重试；`q` 退出。 |
| Pending 为空 | `nothing waits for you` |
| 某个对象类型的列表为空 | `nothing in <type>`，开启了过滤器时为 `nothing <filter> in <type>` |
| 加载失败的 section | 用服务器的消息和 `r retries` 取代该 section；`r` 再次请求该 section（并重新获取各列表）。 |

`q`、Ctrl-C、SIGINT 和 SIGTERM 都以同样的方式结束界面：关闭事件流，恢复终端（离开备用屏幕，显示光标），打印界面打开期间收集到的失败信息，命令以 0 退出。由 TUI 启动的 `serve` 会继续运行。

被拒绝的 action 会在一行页脚中原样显示服务器的状态和消息（例如 `409 …`），直到下一次按键。成功之后，应用会重新获取各列表和打开的对象。

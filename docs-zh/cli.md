---
description: operad 的每个命令和选项、它们的参数、输出和退出码。
---

# 命令行 {#the-command-line}

`operad help` 会打印命令表；本页说明每个命令做什么、接受哪些选项、打印什么。`dev` 插件的命令也在[它自己的页面](dev.md)；终端客户端在[它自己的页面](tui.md)，`pair` 在[应用页面](app.md)，`mcp` 在 [MCP 页面](mcp.md)，环境变量在[环境页面](environment.md)。

## 为什么需要它 {#why-it-exists}

`operad` 是在终端、脚本或 agent 里访问一个 home 的唯一入口：设置它、启动 `serve`、查看 pending、回答 pending，以及运行插件声明的命令。CLI 并不写死插件能做什么。插件声明自己的对象类型、action 和 verb，CLI 据此生成 `operad <plugin>:<action>` 及其选项，所以新插件无需改动 CLI 就能在命令行中使用。大多数命令直接读写 home，因此无论 `serve` 是否在运行都能工作；让 run 继续推进的是 `serve` 这个进程，CLI 自己不做这件事。

## 它如何工作 {#how-it-works}

1. 命令先找到 home：`$OPERAD_HOME`，否则是 `~/.operad`。它打开 store，并加载 `config.json` 中启用的插件。这一步不需要任何进程在运行。
2. 它为这些词选择路由。内核命令（`pending`、`list`、`show`、`history`、`settings`、`plugin`、`secret`、`trigger`，以及[命令](#commands)表中的其余命令）由 CLI 处理。`<plugin>:<action> <id>` 对一个对象运行 action；`<plugin> <verb>` 运行该插件声明的 verb，只有一个插件声明它时可以只写 `<verb>`。见 [Actions](#actions)。
3. 读取类命令打印插件产生的行和 section。输出是给终端看的文本，加 `--json` 则是 JSON；见[过滤列表](#filtering-a-list)和 [History section](#the-history-section)。
4. 会改变状态的命令，例如 action 或对 pending 项的回答，会把记录写入 home。正在运行的 `serve` 读到记录后，继续 run 所请求的 step。没有 `serve` 时，回答会打印 `recorded; it runs when `operad serve` is running`。
5. `operad serve` 在打开 store 或端口之前先取得 home 锁（`serve.lock`），所以同一个 home 的第二个 `serve` 会以退出码 `4` 退出，并且什么都不改。`operad serve stop` 向该锁中记录的进程发信号；见[停止 serve](#stopping-serve)。
6. 每个命令都以某个[退出码](#exit-codes)结束，脚本因此能区分出错（`1`）、用法错误（`2`）和状态不允许（`3`）。

## 退出码 {#exit-codes}

| 退出码 | 含义 |
|---|---|
| `0` | 命令完成了要求的事，或没有事可做。 |
| `1` | 出错：id 有误、config 或插件无法加载、检查被拒绝、编辑器失败。 |
| `2` | 用法错误：未知的命令或选项、缺少参数、值不合法。消息之后会打印 `operad help`。 |
| `3` | 当前状态不允许该操作：插件已禁用、有 run 正在进行、任务所处的阶段不允许这项更改、`serve` 没有在限时内停止。 |
| `4` | 另一个进程持有 home 锁，或同一个 home 已有第二个 `serve`。 |
| `141` | 读取方关闭了管道（128 + SIGPIPE）。之后的输出会被丢弃。 |

## 命令 {#commands}

CLI 自身拥有的命令，在下表注明处接受紧跟在命令名之后的 `--help`；插件的 verb 会原样收到它的参数。`operad --help` 和 `operad help` 会打印完整的命令表。

| 命令 | 参数 | 作用与输出 |
|---|---|---|
| `operad init` | 无 | 在 `config.json` 缺失时创建它，并检查每个已加载的插件。打印 `created <file>` 或 `using <file>`，然后每项检查打印一行 `<plugin>: <result>`。检查失败时退出码为 `1`。 |
| `operad serve` | 无 | 运行此 home 的循环：启动等待、运行 step、提供 HTTP 服务并运行 notify。为每个监听地址打印 `http <url>`，最后打印 `serving <home>`。另一个 `serve` 持有该 home 时退出码为 `4`。 |
| `operad serve stop` | `--timeout <secs>` | 用 SIGTERM 停止此 home 的 `serve`；见[停止 serve](#stopping-serve)。 |
| `operad pending` | `--json` | 列出等待人处理的事项：run、step、对象的标题、提示、选项和 action。为空时打印 `nothing is waiting`。 |
| `operad list <type>` | `--filter <name>`、`--repo <name>`、`--parent <id>`、`--root`、`--where <field=value>`、`--limit <n>`、`--cursor <c>`、`--json` | 列出某一对象类型的行。见[过滤列表](#filtering-a-list)和[层级](#levels)。为空时打印 `no objects of type "<type>"`，后面还有内容时打印 `next: operad list … --cursor …`，过滤器漏掉了一些行时打印 `N hidden (--filter all to show)`。 |
| `operad show [<id>]` | `--section <id>`、`--page <label or number>`、`--cursor <c>`、`--full`、`--raw`、`--json`、`--repo <name>` | 给出 id 时：打印该行、它的父对象、它的子对象、各 section 的名称和可用的 action，然后打印第一个 section（或 `--section` 指定的）。不给 id 时：打印最近变化的十个对象和 `operad show <id>`。 |
| `operad history <id>` | `--json` | 以 [History](#the-history-section) 的形式打印一个 run 的 step，或某个对象的所有 run。若一个裸 id 属于多个对象类型，会因有歧义而被拒绝。 |
| `operad running` | `--json` | 列出进行中的 run：对象、step、step 耗时、标题、run 的存续时间和排队时间。为空时打印 `nothing is running`。 |
| `operad flows` | `--json` | 列出已加载的 flow、各自所属的插件，以及某个 flow 无法启动的原因。为空时打印 `no flows loaded`。 |
| `operad plugin list` | 无 | 列出已配置的插件及其版本，以及 `enabled` 或 `disabled`。 |
| `operad plugin enable <name>` | 无 | 在下一条命令时启用一个插件；config 中没有的内置插件会被加入。打印 `<name>: enabled`。 |
| `operad plugin disable <name>` | 无 | 在下一条命令时禁用一个插件。当有 run 正在使用它的某个 step 时拒绝，退出码为 `3`。打印 `<name>: disabled`。 |
| `operad plugin check <path>` | 无 | 加载一个插件声明，但不启动 run。打印 `<name>: ok` 或问题所在；有问题时退出码为 `1`。 |
| `operad secret set <plugin> <name>` | 无 | 从终端读取值且不回显，或读取 stdin 的第一行，并存储它。打印 `secret "<name>" set for plugin "<plugin>"`；值从不会被打印。 |
| `operad secret list <plugin>` | 无 | 每行打印一个该插件的 secret 名称，从不打印值。打印 `no secrets for plugin "<plugin>"`。 |
| `operad secret delete <plugin> <name>` | 无 | 删除一个 secret。打印 `secret "<name>" deleted for plugin "<plugin>"`。 |
| `operad settings` | `--repo <name>`、`--json` | 列出所有设置：作用域、名称、值、默认值、`editable` 或 `read-only`、是否要求确认，以及它的描述。 |
| `operad settings set <name> <value>` | `--repo <name>`、`--yes` | 更改一项设置。值能解析为 JSON 时按 JSON 处理，否则当作普通字符串。要求确认的设置需要 `--yes`。打印 `<name> = <value>`。 |
| `operad http token rotate` | 无 | 立即替换 bearer token。打印 `http token rotated`。 |
| `operad pair` | `--url <url>`、`--show-token` | 以二维码形式显示应用所用的地址和 token；见[配对](app.md#pairing-the-app)。 |
| `operad tui` | `--url <url>`、`--token <token>`、`--no-start`、`--theme <name>` | 打开终端客户端，并在没有响应时启动 `serve`；见[终端客户端](tui.md)。 |
| `operad mcp` | `--claude-channel`、`--types <t,…>` | 在 stdio 上为 lead agent 运行 MCP 服务器；见 [MCP 页面](mcp.md)。 |
| `operad trigger <source> <key>` | `--type <type>`、`--object <id>`、`--summary <text>`、`--data <file>` | 让一个事件经过各条规则。打印 `started <run>`、`waiting <pending id>`、`recorded in <run>`、`observed <flow> on <object>`、`not started: <reason>` 或 `recorded <id>`。 |
| `operad trigger rules` | 无 | 打印当前生效的规则，以及每条规则来自哪个文件。打印 `no trigger rules`。 |
| `operad:start <id>` | 无 | 启动由某个事件创建的 pending 项。打印 `started <run>`。 |
| `operad:dismiss <id>` | 无 | 忽略由某个事件创建的 pending 项。打印 `dismissed <id>`。 |
| `operad <plugin>:<action> <id>` | action 的参数、`--yes`、`--repo <name>` | 对一个对象运行一个 action；见 [Actions](#actions)。 |
| `operad <plugin> <verb>` | verb 的参数 | 运行插件声明的 verb。当恰好有一个插件声明了该 verb，且没有内核命令使用这个名字时，可以只写 `<verb>`。 |
| `operad dev repo add <path>` | `--name <name>` | 注册一个仓库；见 [dev 命令](#dev-commands)。 |
| `operad dev repo list` | 无 | 列出已注册的仓库。 |
| `operad dev repo remove <name>` | 无 | 移除一个已注册的仓库。 |
| `operad dev plan add` | `--slug`、`--title`、`--concurrency`、`--flow`、`--repo` | 创建一个计划并打印它的 id。 |
| `operad dev task add` | `--plan`、`--slug`、`--title`、`--after`、`--area`、`--flow`、`--repo`、`--chat` | 创建一个任务并打印它的 id。 |
| `operad dev task edit <id>` | `--repo` | 用 stdin 或 `$EDITOR` 替换一个 proposed 或 ready 任务的 brief。打印任务 id。 |
| `operad dev task update <id>` | `--title`、`--after`、`--area`、`--flow`、`--repo` | 更改一个任务并打印它的 id。 |
| `operad dev start <task>` | `--repo` | 请求启动一个 ready 任务。打印 `start requested for <id>`。 |
| `operad dev reruns` | 无 | 列出仅在 rerun 时才通过的测试，以及它们所属的任务。 |
| `operad bot skill <bot> <name>` | `--from <dir>` | 提议一个新的或已更改的 skill；由人批准。 |
| `operad bot mcp <bot> <name> [<command> [args…]]` | 自身没有选项；命令中的词是服务器的 | 读取一个本地 MCP 服务器的 tools 后提议注册它。不给命令时，从 stdin 读取粘贴进来的 `mcpServers` 条目。 |
| `operad bot setting <bot>` | 无 | 根据 stdin 上的 JSON，为一个 bot 提议更改设置；由人批准。 |

## 选项 {#options}

| 选项 | 命令 | 含义 |
|---|---|---|
| `--help` | CLI 自身拥有的命令 | 打印该命令的用法。插件的 verb 会原样收到它的参数，因此 `--help` 会被传给插件，并可能因未知选项而被拒绝；请用 `operad help` 查看命令表。`operad --help` 打印完整的命令表。 |
| `--version`、`-V` | `operad` | 打印 `operad <version>`。 |
| `--timeout <secs>` | `serve stop` | 等待被停止的 `serve` 多久：从 1 起的整数，默认 30。`0`、缺少值或不是数字都属于用法错误。 |
| `--json` | `pending`、`history`、`running`、`flows`、`list`、`show`、`settings` | 打印 JSON 而不是文本行。`settings set` 不接受它。 |
| `--filter <name>` | `list` | 要使用的过滤器；`all` 显示每一行。没有过滤器的类型会拒绝它。 |
| `--repo <name>` | `list`、`show`、`settings`、`settings set`、action、插件命令 | 把列表限制在一个仓库内，或指明一个裸 id 属于哪个仓库。 |
| `--where <field=value>` | `list` | 对该类型的行所带的某个字段做一次精确匹配；可以重复。 |
| `--limit <n>` | `list` | 一页包含多少行。 |
| `--cursor <c>` | `list`、`show` | 前一页的 `next` cursor。 |
| `--parent <id>` | `list` | 父对象为该对象的行。不能与 `--root` 一起使用。 |
| `--root` | `list` | 没有父对象的行。不能与 `--parent` 一起使用。 |
| `--section <id>` | `show` | 要打印的 section；`history` 始终是最后一个。 |
| `--page <label or number>` | `show` | 有分页的 section 的某一页。不能与 `--cursor` 一起使用。 |
| `--full` | `show` | 跳过 section 的大小上限。 |
| `--raw` | `show` | 按原样打印 section 的 Markdown，不带颜色。 |
| `--yes` | action、`settings set` | 对确认回答“是”，或回答 action 所要求的确认。 |
| `--type <type>` | `trigger` | 事件类型；省略时为 `event`。 |
| `--object <id>` | `trigger` | 该事件所涉及的对象。 |
| `--summary <text>` | `trigger` | 事件的一行摘要。 |
| `--data <file>` | `trigger` | 事件的数据，从文件中读取。 |
| `--claude-channel` | `mcp` | 打开单向的 Claude Code channel。 |
| `--types <t,…>` | `mcp` | 把 channel 限制在这些对象类型内，以逗号分隔。 |
| `--url <url>` | `pair`、`tui` | 要指明的地址。对 `pair` 而言，它必须是 `http` 或 `https`，且不带凭据、query 或 fragment。 |
| `--show-token` | `pair` | 把 `url`、`token` 和 `link` 作为普通文本行打印，不显示二维码，即使输出不是终端也是如此。 |
| `--token <token>` | `tui` | 正在运行的 `serve` 的 bearer token。 |
| `--no-start` | `tui` | 从不启动 `operad serve`。 |
| `--theme <name>` | `tui` | 本次会话使用的主题；优先于 `tui.json`。 |
| `--name <name>` | `dev repo add` | 注册该仓库时使用的名称。 |
| `--slug <slug>` | `dev plan add`、`dev task add` | 新 id 中的短名称。 |
| `--title <title>` | `dev plan add`、`dev task add`、`dev task update` | 标题。 |
| `--concurrency <n>` | `dev plan add` | 计划中同时运行多少个任务，从 1 到 16 的整数（默认 1）。 |
| `--flow <name>` | `dev plan add`、`dev task add`、`dev task update` | 计划或任务的 flow。 |
| `--plan <plan>` | `dev task add` | 任务所属的计划。 |
| `--after <task>` | `dev task add`、`dev task update` | 要等待的任务；可以重复。`--after ""` 会清除它们。 |
| `--area <area>` | `dev task add`、`dev task update` | 任务的 area；`--area ""` 会清除它。 |
| `--chat <id>` | `dev task add` | 任务所使用 worktree 所属的 chat。 |
| `--from <dir>` | `bot skill` | 读取该 skill 的目录。 |

action 的 flag 由它的参数生成：名为 `note` 的参数变成 `--note <text>`，布尔值变成 `--flag` 或 `--flag=true`，数组或对象接受 JSON。声明了 `creates` 的 action 不会出现在父对象的页面上；它从新建对象的入口或命令行运行。

## 停止 serve {#stopping-serve}

`operad serve stop [--timeout <secs>]` 停止当前 `OPERAD_HOME` 的 `serve`。它读取 `serve.lock`：

- 没有锁，或锁对应的进程已不存在时，它打印 `no operad serve runs for <home>` 并以 0 退出。它不向任何进程发信号，也不删除过期的锁；下一个 `serve` 会替换它。
- 进程仍然存活时，它先确认该进程是一个 `serve`：向操作系统查询该进程的命令行（`ps -p <pid> -o command=`，在 macOS 和 Linux 上相同），并要求 `serve` 是其中的一个单词。仅有锁是不够的，因为一个 `serve` 死亡后，它的 PID 可能被复用。当该进程不是 `serve` 时，命令会打印一条点明该 PID 的错误，不向任何进程发信号，并以 3 退出。
- 否则它发送 SIGTERM（`serve` 本来就会处理的停止信号），打印 `stopping operad serve (pid <pid>)`，等到进程消失或锁被释放，打印 `stopped` 并以 0 退出。它从不发送 SIGKILL。

`--timeout <secs>` 是它等待的时长：整数秒，至少为 1，默认 30。若在此之后 `serve` 仍在运行，它会打印一条说明其未能停止的错误，并给出 `kill -9 <pid>` 作为强制停止的办法，然后以 3 退出。`--timeout` 为 0、没有值或不是整数，都属于用法错误（退出码 2）。不带子命令的 `operad serve` 照旧运行循环。

正在运行的工作会怎样：SIGTERM 让循环在当前这一轮结束后退出，随后 `serve` 停止 notifier、HTTP 服务器和 trigger 源，释放锁并退出。它不会杀掉 step。当 `serve` 停止时，在自己进程中运行的 step 会继续运行，该 home 的下一个 `serve` 会重新接管这个 run。没有 `serve` 运行时，没有任何东西会启动新工作，也不会推进等待和计时器；`operad serve` 或 `operad tui` 会让它们恢复。

step 会自行清理：它结束时，它启动的、仍在运行的每个进程（例如 worker 留在后台的循环）都会被停止，step 的日志会列出它们。启动时，`serve` 对不再活跃的 run 的 step 做同样的清理。关于如何找到这些进程以及哪些找不到，见 `packages/dev/REFERENCE.md` 中的 "What a step cleans up"。

重启不会打扰正在运行的检查或命令。每个 run 都是独立的进程，step 启动的命令由该 run 持有，而不是由 `serve` 持有：停止和启动 `serve` 不会向它发信号，不会停止它的那一行，也不会把它再运行一次。该命令自行结束，run 照常记录它的退出码，就像什么都没发生一样。只有 run 自己的进程死亡才会停止它的命令（此时下一个 `serve` 会重新开始这个 step）。

## 代码变更 {#changed-code}

`serve` 和每个 run 的进程只在文件变化之前一直运行它们加载的代码。`serve` 监视内核的代码（`engine`、`cli`）、每个已加载插件的包（源码、flow、schema）以及该包所依赖的 workspace 包。文件安静一秒之后，它会启动一个新进程来检查新代码能否加载。若能，`serve` 以 `operad serve stop` 的方式停止，打印 `reloading: <what changed>`，并使用同样的命令行和环境重新启动，仍处于你所启动的进程之下（它留在你的终端里，会转发 Ctrl-C，并以 serve 的退出码结束）。正在运行的 step 继续使用它启动时的代码并运行完毕；run 的进程会在 step 之间查看这些文件，若有变化，它就停止，以便由新进程执行下一个 step。`operad history` 为此显示一行 `continuing on updated code`。

无法加载的新代码（语法错误、无效的 schema）不会让任何东西停摆。`serve` 继续运行旧代码，并在它的错误输出上打印 `code changed (...) but
does not load; the old code keeps running: <problems>`；当文件再次能够加载时，它会重新加载，如果是某个设置文件（`config.json`、`triggers.json`、`keys.json`）读取失败后被修好，同样如此。run 的进程不会在无法加载的代码上执行下一个 step：它把同样的一行打印到该 run 的日志（`<store>/logs/runs/<run id>.out`）中，并等待文件能够加载。设置文件在下次使用时重新读取；仅仅更改它们不会重启 `serve`。

当 `serve` 运行的代码比磁盘上的文件旧时，`operad pending` 会显示一项：`serve runs older code than the files on disk: restart serve to load them
(operad serve stop, then operad serve)`。它出现在新代码无法加载时（见上文），或重启时无法监听它的地址、旧代码重新提供服务时。它没有 action，并在 `serve` 再次运行磁盘上的代码时消失：即文件加载成功且 `serve` 重新加载之后，或你重启它之后，或文件恢复为 `serve` 所加载的内容时。

当重启无法监听、旧代码重新提供服务时，该 serve 不会再次尝试同一个变更。它仍然沿用之前所运行内容的，是 `operad` 本身、按包名给出的插件（以及路径插件所 import 的文件），因此对这些的更改会让上面那一项持续显示。按路径给出的插件，以及自 `serve` 首次启动之后才启用的插件，会从磁盘上的文件重新加载，因此仅对这些的更改不会显示任何东西。下一个不同的变更会经过加载检查，并照常重新加载。

## History section {#the-history-section}

每个对象都有一个 History section（`operad show <id> --section history`，即网页和终端界面中的最后一个标签页）。它先按 run 分组，再按每个 step 的 attempt 分组。run 的标题写明 flow 和启动时间；run id 在该 run 的块末尾以小字出现一次，供支持人员使用。一个 step attempt 占一行：提供服务的主机的本地时间、step、attempt（大于 1 时）、启动的原因（当它不是顺理成章的下一个 step 时，如 `after fail`、`after reverify`）、结果、耗时（正在运行的 step 显示 `running` 和目前已用时间），以及被截成一行并以 `…` 结尾的结果详情。人的回答和事件各占一行。每新的一天以一行日期开头。

```
## dev run · started 21:38
**2026-11-08**
- 21:38:41  worktree  ready  1s
- 21:38:44  work  done  41m
- 22:20:01  review  fail  58s  packages/dev/src/gate.ts:1059 major …
- 22:21:01  work  attempt 2  after fail  done  1m
- 22:22:02  confirm  reverify  8m
- 22:30:02  you chose merge: via plugin, as dev
- 22:30:04  verify  after reverify  running  2m
```

`operad show <id> --section history --full` 会保留每条详情的完整内容。`operad history <id>` 以 UTC 时间打印每个 step；`--json` 为每个 step 打印一个对象，当 id 指向多个 run 时，则为每个 run 打印一个对象。

## 层级 {#levels}

插件可以把它的对象排成多个层级。一行可以带有 `parent`：上一层对象的 id，可以是完整 id（`plan:repo/P-0001`），也可以是按 `operad show` 的方式解析的裸 id。内核原样传递它，从不自行编造。没有 `parent` 的行位于顶层。

- `operad list <type> --root` 列出该类型中没有父对象的行；`operad list <type> --parent <id>` 列出父对象为该对象的行。普通的 `operad list <type>` 保持平铺。
- `GET /v1/objects?root` 和 `GET /v1/objects?parent=<id>` 的作用相同。对它们而言 `type` 是可选的。不带 `type` 时，它们按稳定的顺序跨所有插件的类型列出：类型按 `GET /v1/types` 给出的顺序（插件加载顺序，然后是每个插件声明其类型的顺序），同一类型内的行按该类型的普通列表的顺序（按 id）。`next` 在整个顺序中翻页。`root` 和 `parent` 不能一起使用。
- 该类型的过滤器在层级内生效：带 `type` 的请求使用指定的过滤器或该类型的默认过滤器；不带 `type` 时，每个类型使用各自的默认过滤器（或在该类型有指定过滤器时使用它）。`hidden` 统计该层级中被过滤器漏掉的行数。
- 指向不存在对象的 `parent` 不算错误：列表为空。若某行的 `parent` 指向一个不存在的对象，它仍会列在 `parent=<that id>` 之下，而不会列在 `root` 之下。
- 当一行有父对象时，`operad show <id>` 会在该行下面打印 `parent: <id>`。
- MCP 的 `list` tool 也接受 `root` 和 `parent`；见 [MCP 页面](mcp.md)。

## 过滤列表 {#filtering-a-list}

插件可以为对象类型提供过滤器，这样列表就不会显示每一个旧对象。在插件中，对象类型有一个可选的 `filters` 字段，是由 `{ "name": string, "states": string[], "default"?: boolean }` 组成的有序列表：

```ts
objects: [
  {
    name: "task",
    filters: [
      { name: "active", states: ["proposed", "ready", "running"], default: true },
      { name: "done", states: ["merged"] },
    ],
  },
],
```

过滤器是数据：当一行的 `state` 是 `states` 之一时，该行匹配。`state` 为 `error` 的行（它的视图失败了）会被每个过滤器显示，因此有问题的行永远不会被隐藏。至多一个过滤器带有 `default: true`；一个都没标时，第一个是默认的。加载插件时，会拒绝空名称或重复的名称、两个默认过滤器、空的 `states`，以及名称 `all`，并指出出问题的字段。

内核会在默认过滤器之后紧接着加入过滤器 `all`，它不测试任何 state。上面的任务列为 `active`、`all`、`done`。

`operad list <type> [--filter <name>] [--repo <name>]` 在类型有默认过滤器且没有给出 `--filter` 时，使用该默认过滤器。`--filter all` 列出所有内容。当过滤器漏掉了一些行时，最后一行是 `N hidden (--filter all to show)`。`--repo` 只保留一个仓库的对象，并可与 `--filter` 一起使用。没有过滤器的类型会以 "this type has no filters" 拒绝 `--filter`。HTTP 接口以 `filter` 接受同样的选择（见下面的端点）。

`dev` 插件声明了这些过滤器（`all` 跟在 `active` 之后）：

| 类型 | 过滤器 | State |
|---|---|---|
| task | `active`（默认） | proposed, ready, running, review, integrating, waiting, paused |
| task | `done` | merged |
| task | `cancelled` | cancelled |
| plan | `active`（默认） | draft, confirmed, paused |
| plan | `done` | finished |
| plan | `cancelled` | cancelled |
| repo | `active`（默认） | active |
| repo | `removed` | removed |

`chat` 插件声明了 `open`（默认）和 `closed`；`all` 跟在 `open` 之后。`bot` 插件声明了 `open`（默认）和 `removed`；`all` 跟在 `open` 之后。`bot` 的 proposal 类型声明了 `pending`（默认）、`applied` 和 `rejected`。

## Actions {#actions}

action 以 `<plugin>:<action> <id>` 运行，或以 `<plugin> <action> <id>` 运行，或在只有一个插件提供该 action 时以 `<action> <id>` 运行。命令行为 action 声明的每个参数生成一个 flag：

```sh
operad dev:reject T-0003 --note "cover concurrent writers"
operad dev confirm T-0003 --yes
operad chat:send C-0001 --note "why does the gate fail on main?"
operad dev:model C-0001 --model sonnet
```

必填的 note 没有 `--note` 时，在终端中会被询问，在管道中则被拒绝；`confirm: true` 的 action 会询问 `[y/N]`，`--yes` 跳过这个询问。action 返回值时，会打印它的记录。打开对象的 action（`opens`）只打印它那一行；由终端和应用来打开该对象。记录一个回答的 action，会打印 `recorded; it runs when `operad serve`
is running`，前提是没有 `serve` 持有该 home。

## dev 命令 {#dev-commands}

`operad dev repo add <path> [--name <name>]` 注册一个目录，该目录必须是带有 remote 的 git work tree。当目录没有 remote 时，它不写入任何内容，并打印原因。`operad dev repo list` 打印 `no repositories`，或每个仓库一行 `<name>  <path>`。`operad dev repo remove <name>` 打印 `removed <name>`。

`operad dev plan add --slug <slug> --title <title> [--concurrency <n>]
[--flow <name>] [--repo <name>]` 创建一个计划并打印它的 id。
有 stdin 时，请求从 stdin 读取。`--concurrency` 是从 1 到 16 的整数，省略时默认为 1。

`operad dev task add --plan <plan> --slug <slug> --title <title> [--after
<task>]… [--area <area>] [--flow <name>] [--repo <name>] [--chat <id>]` 在指定的计划中创建一个任务并打印它的 id。
有 stdin 时，brief 从 stdin 读取。`--after` 可以重复；该任务会等到每个指定的任务都被 merge 之后。另一个仓库的任务写作 `<repository>/<task id>`。任务不能跟随它自己，也不能构成环。`--chat` 使用该 chat 所请求的 worktree。

`operad dev task edit <id> [--repo <name>]` 替换一个 proposed 或 ready 任务的 brief。当 stdin 不是终端且带有内容时，新的 brief 就是 stdin 上的文本，否则是你在 `$EDITOR` 中保存的内容（`EDITOR` 未设置时用 `$VISUAL`）。没有编辑器也没有输入时，命令失败并说明这一点。它打印任务 id。

`operad dev task update <id> [--title <title>] [--after <task>]… [--area
<area>] [--flow <name>] [--repo <name>]` 更改一个任务并打印它的 id。
`--after ""` 清除它所等待的任务；`--area ""` 清除 area。flow 只能在第一次 attempt 之前更改；之后命令会拒绝。

`operad dev start <task> [--repo <name>]` 请求启动一个 ready 任务，并打印 `start requested for <id>`；下一轮 `serve` 会认领它。

`operad dev reruns` 为每个仅在 rerun 时才通过的测试打印一行：`<count>  <test name>  <task id>`；没有这样的测试时，打印 `no test has passed on a rerun yet`。

简写形式 `operad repo …`、`operad plan …`、`operad task …`、`operad start …` 和 `operad reruns` 之所以可用，是因为只有 `dev` 声明了这些 verb。

## bot 命令 {#bot-commands}

`operad bot skill <bot> <name> [--from <dir>]` 提议一个新的或已更改的 skill。不带 `--from` 时，stdin 是一个带有 `skill_md` 和 `files` 的 JSON 对象；带该选项时，读取该目录中的文件。skill 需要一个 `SKILL.md`。在有人于 pending 中批准该提议之前，不会写入任何内容。

`operad bot mcp <bot> <name> <command> [args…]` 启动一次本地 MCP 服务器，读取它的 tool 列表，并提议注册它。不给命令时，stdin 是粘贴进来的 `mcpServers` 条目。包命令（`npx`、`bunx`、`uvx`、`pipx`）必须指明确切的版本，如 `name@1.2.3`；tag 或版本范围会在服务器启动之前被拒绝。远程服务器（给出地址的）目前还无法注册。

`operad bot setting <bot>` 从 stdin 读取一个 JSON 对象并提议该更改。bot 可以收紧默认的访问配置，但绝不能放宽。MCP 服务器不在这里更改；请使用 `bot mcp`。

## 可运行的示例 {#runnable-examples}

下面的每个命令都能在全新的 home 中运行，并由文档测试运行。

```sh runnable
operad --version
operad pending
operad running
operad flows
operad plugin list
operad settings
operad show
operad trigger rules
```

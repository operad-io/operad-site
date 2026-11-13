---
description: 出问题时：operad 打印的每条需要你处理的消息，以及该怎么做。
---

# 故障排查 {#troubleshooting}

本页按来源列出 `operad` 打印的、需要你动手处理的消息。运行 `operad help` 查看命令表，运行 `operad pending` 查看有什么在等待，运行 `operad history <id>` 查看某个 run 做了什么。

## 命令行 {#the-command-line}

| 消息 | 含义 | 处理 |
|---|---|---|
| `operad: unknown command "<command>"` | 没有命令或插件 verb 叫这个名字。 | `operad help` 列出命令；插件 verb 写作 `<plugin> <verb>`，只有一个插件声明它时可用简写。 |
| `operad: <option> needs a value` | 需要值的 flag 位于行尾。 | 把值放在它后面，或使用 `--flag=value`。 |
| `operad: action "<name>" needs a note; pass --note <text>` | 该 action 需要 note，而 stdin 不是终端。 | 传入 `--note <text>`；在终端里它会询问。 |
| `operad: action "<name>" needs confirmation; pass --yes` | 该 action 要求确认，而 stdin 不是终端。 | 读过该 action 的作用后传入 `--yes`。 |
| `operad: action "<name>" has no argument "--<flag>"` | action 的 schema 没有声明该参数。 | `operad show <id>` 列出 action 及其参数；note 的 flag 名称可能不同。 |
| `operad: "<id>" is ambiguous: use task:<id>, …` | 一个裸 id 被多个对象类型占用。 | 加上消息中列出的类型作为前缀。 |
| `operad: no run or object "<id>"` | 没有 run、对象或事件使用该 id。 | `operad list <type>` 或不带 id 的 `operad show` 会显示最近的对象。 |
| `operad: no run "<id>"` | `run-internal` 指名了一个不存在的 run。 | 该命令是内部命令；请通过 `serve` 和 `pending` 启动工作。 |
| `operad: run "<id>": flow "<flow>" is not loaded` | 该 run 使用的 flow，其插件被禁用或缺失。 | `operad plugin list`，启用该插件，然后 `operad serve`。 |
| `operad: plugin "<name>" is disabled` | 该命令或 action 属于一个被禁用的插件。 | `operad plugin enable <name>`。 |
| `operad: plugins.<name>: no such plugin` | `plugin enable` 或 `disable` 指名了配置不认识的名称。 | 使用已配置的名称，或随附的可选插件（`pi`、`claude`、`pool`、`bot`）。 |
| `operad: cannot disable "<name>": run "<id>" (<step>) is active` | 有 run 正在使用该插件的 step。 | 等该 run 结束，或取消它，然后禁用该插件。 |
| `operad: lock <path>: run <pid> is still alive`（退出码 4） | 另一个进程持有 home 或某个 run 的锁。 | 等它结束，或用 `operad serve stop` 停止持有它的 `serve`。 |
| `operad: secret set: no value was read` | 终端或 stdin 没有给出值。 | 再运行一次并输入值，或通过管道传入一行。 |
| `operad: settings set needs a name and a value` | 缺少设置名或值。 | `operad settings` 列出名称；传入一个值，JSON 或普通字符串均可。 |
| `operad: <setting> …; pass --yes to change it` | 该设置会改变合并的内容，或是另一项受保护的选择。 | 读过这项改动后，加 `--yes` 重新执行。 |
| `operad: no editor is set; set $EDITOR` | `task edit` 需要一份 brief，而没有配置编辑器。 | 设置 `EDITOR`，或通过 stdin 传入 brief。 |
| `operad: task edit waited 1s for the brief on standard input; nothing arrived, and no editor is set; pipe the brief or set $EDITOR` | stdin 是一个没人写入的管道，也没有设置编辑器。 | 通过管道传入 brief，或设置 `EDITOR`/`VISUAL`。 |
| `operad: "<editor>" exited with code <n>` | 编辑器失败。 | 修正编辑器命令或文件，然后重试。 |
| `operad: task is <phase>; only proposed or ready tasks can change` | 该任务已经开始或已经结束。 | 只能在第一次 attempt 之前修改它；之后请用后续任务。 |

## serve 和 config.json {#serve-and-configjson}

| 消息 | 含义 | 处理 |
|---|---|---|
| `operad: lock <home>/serve.lock: run <pid> is still alive`（退出码 4） | 这个 home 已经有一个 `serve` 在运行。 | 使用正在运行的那个，或 `operad serve stop`。 |
| `Failed to start server. Is port <port> in use?` | 配置的地址和端口已被占用。 | 释放该端口，或修改 `http.port`/`http.listen`；`operad tui --url <url>` 可以连到另一个。 |
| `http.listen: "<address>" is a wildcard address; name each address to listen on` | `http.listen` 写了 `0.0.0.0` 或 `::`。 | 明确写出每个地址（loopback、私有、link-local 或 Tailscale）。 |
| `http.listen: "<address>" is not a loopback, private, link-local or Tailscale address` | 该地址是公网地址，或不是 IP 字面量。 | 使用允许的地址，或通过 Tailscale 访问该 home。 |
| `http.listen: needs at least one address` | 数组为空。 | 省略该键以使用 `["127.0.0.1"]`，或写出一个地址。 |
| `http: <address> did not release the port` | 停止或重新加载时，未能及时释放某个地址。 | 停止持有它的进程，然后 `operad serve`。 |
| `code changed (<what>) but does not load; the old code keeps running: <problems>` | 新代码或某个设置文件有错误。 | 修正该文件；旧代码继续提供服务，文件能加载时会重新加载。 |
| `reload: the new code could not listen (<reason>); the old code tries every address again` | 重新加载时端口被另一个进程占去。 | 释放该端口；其间旧代码继续提供服务。 |
| `operad: <file>: invalid JSON: <reason>` | `config.json`、`triggers.json`、`keys.json` 或 `tui.json` 无法解析。 | 修正 JSON；消息会指出文件名和解析器给出的原因。 |
| `operad: <file>: must be a JSON object` | 设置文件的内容是数组或标量。 | 让它的顶层成为对象。 |
| `operad: <file>: plugins.<name>: no such plugin` | 某个插件条目所指名称不是随附插件，也没有给出 module。 | 使用随附的名称，或写 `"module": "<package or path>"`。 |
| `operad: <file>: store.backend: must be "sqlite"` | 只支持 sqlite 一种存储。 | 把 `store.backend` 设为 `"sqlite"`，或省略它。 |
| `operad: <file>: notify.on: must be an array of "waiting"` | `notify.on` 写了别的值。 | 使用 `["waiting"]`；见[通知](notifications.md)。 |
| `operad: <file>: mcp.channel.notify: <value> is not a channel notification` | channel 列表写了别的值。 | 使用 `waiting`、`ended`、`loop` 或 `changes`。 |
| `operad: <file>: mcp.channel.loopAfter: must be an integer of 2 or more` | loop 阈值太小，或不是整数。 | 把 `loopAfter` 设为 2 或更大。 |
| `operad: <file>: ask.graceSecs: must be a whole number of 0 to <max>` | ask 的宽限时间超出范围。 | 使用消息给出范围内的整数。 |

## 终端客户端 {#the-terminal-client}

| 消息 | 含义 | 处理 |
|---|---|---|
| `no server at <url>: is `operad serve` running? retrying  q quit` | 该地址没有回应，或地址有误。 | 启动 `operad serve`，或传入 `--url`；检查 `http.enabled`、`http.port` 和 `http.listen`。 |
| `the token was rotated: run the TUI again or pass --token  q quit` | 服务器替换了它的 token。 | 再次运行 `operad tui`（它会读取新 token），或传入 `--token`。 |
| `tui needs a terminal` | 输出不是终端。 | 在终端里运行，不要通过管道。 |
| `theme not changed: <why>` | 被监视的 `tui.json` 或主题文件无效。 | 修正该文件；沿用上一个有效的主题。 |
| `unknown theme "<name>"; the themes are <names> in <file>` | `tui.json` 指名了未知的主题。 | 从列表中选一个名称，或创建 `themes/<name>.json`。 |
| `unknown theme "<name>"; the themes are <names> given with --theme` | `--theme` 指名了未知的主题。 | 从列表中选一个名称，或去掉该 flag。 |
| `reserved keys ignored: <key> (<action>, <source>), …` | `keys.json` 或某个插件绑定了 TUI 保留的键。 | 换一个键；该 action 仍可在 `:` 面板中使用。 |
| `starting operad serve (log: <path>)` 之后出现指向 `serve.log` 的错误 | TUI 尝试启动 `serve`，但失败了。 | 读 `serve.log` 的最后几行（其中可能有插件输出）；修正问题，然后重新启动。 |
| 没有 `serve` 持有该 home 且给了 `--no-start` 时的 `no server at <url> …` | `--no-start` 阻止启动。 | 自己启动 `operad serve`，或去掉 `--no-start`。 |

## app 和 HTTP {#the-app-and-http}

| 消息 | 含义 | 处理 |
|---|---|---|
| `a bearer token is required`（`401`） | 请求没有 token，或 token 已过期。 | 重新配对或轮换：`operad pair --show-token`，然后更新 app。 |
| `the token was rotated: run the TUI again or pass --token` | 同上，出现在终端客户端中。 | 再次运行客户端，或传入新 token。 |
| `pair prints the token and needs a terminal; pass --show-token to print it anyway` | `pair` 拒绝把 token 写入管道。 | 在终端里运行，或仅在安全的场合传入 `--show-token`。 |
| `pair needs "http.enabled" in config.json` | HTTP 已关闭。 | 把 `http.enabled` 设为 `true` 并重启 `serve`。 |
| `http.listen has only loopback addresses, which a phone cannot reach; add one or pass --url` | app 无法连到 loopback 地址。 | 在 `http.listen` 中加入私有或 Tailscale 地址，或传入 `--url`。 |
| `http.port is 0; set a port in config.json or pass --url` | 所选端口是动态的。 | 设置固定的 `http.port`，或传入 `--url`。 |
| `--url must be an http or https URL` | 缺少协议或协议有误。 | 使用 `http://…` 或 `https://…`。 |
| `--url must be an http or https URL without credentials or a query` | URL 带有用户、密码、query 或 fragment。 | 只传入基础 URL。 |
| `the file is larger than the 20 MB limit`（`413`） | 上传的文件太大。 | 发送更小的文件，或拆分它。 |
| `the request body is larger than the 1 MB limit`（`413`） | JSON 请求太大。 | 在一个 action 中发送更少的数据。 |
| `no such endpoint`（`404`） | 该路径不是 `/v1` 的 endpoint。 | 在 [HTTP 页](http.md#endpoints)检查路径。 |
| `this endpoint takes GET` 或 `this endpoint takes POST`（`405`） | method 错误。 | 使用该 endpoint 指明的 method。 |
| `the action is not available now`（`409`） | 对象当前的状态不提供它。 | 刷新对象；`operad show <id>` 列出它现在提供的 action。 |
| `the action needs confirmation`（`409`） | 该 action 要求确认，而请求没有确认。 | 读过之后发送 `"confirmed": true`。 |
| `the action's plugin is not loaded`（`409`） | 该插件被禁用，或没有加载成功。 | `operad plugin enable <name>`，然后重启 `serve`。 |
| `the request failed`（`500`） | 发生了意外错误；消息体不带 stack trace。 | `operad serve` 会在它的输出中打印原因；`operad history` 显示该 run。 |
| section 没有在规定时间内加载（`504`） | section 耗时太长。 | 重试；`--full` 不会改变超时。 |

## MCP {#mcp}

| 消息 | 含义 | 处理 |
|---|---|---|
| `action "<name>" is not allowed through MCP; the owner runs it` | 该 action 不在 `mcp.actions` 中，或要求确认却不在 `mcp.confirmActions` 中。 | 自己运行它，或把它加到 `config.json` 的两个列表中并重启 `operad mcp`。 |
| `there is no action "<name>"` | 没有已加载的插件声明它。 | `operad show <id>` 列出 action；如果插件被禁用，就启用它。 |
| `list needs a type, root or parent` | `list` 工具没有收到要列出什么的名称。 | 传入 `type`、`root` 或 `parent`。 |
| `"<plugin>" is a kernel verb; it is not reachable through MCP` | `command` 工具把一个 kernel 命令当成插件指名。 | 使用插件 verb（`dev`、`chat`、`bot`），或自己运行该命令。 |
| `"<verb>" is a kernel verb; it is not reachable through MCP` | 该 verb 属于 kernel。 | 使用插件 verb，或自己运行 kernel 命令。 |
| `no loaded plugin "<plugin>" declares the verb "<verb>"` | 这对组合有误。 | `operad flows` 和 `operad plugin list` 显示已加载的内容。 |
| `action "<name>" takes a file (<names>); a file is sent by a client that uploads it, not through these tools` | 文件参数不能是 MCP 的路径。 | 从 app 或其他客户端用 `POST /v1/uploads` 发送文件。 |
| JSON-RPC 错误 `-32602` | 工具调用的格式有误。 | 在 [MCP 页](mcp.md#tools)检查该工具的输入 schema。 |

## 检查和测试 {#checks-and-tests}

| 消息 | 含义 | 处理 |
|---|---|---|
| `run-tests: OPERAD_TEST_PARALLEL must be a whole number of 1 or more, not '<value>'` | 该变量有误。 | 设为 1 或更大的整数，或取消设置。 |
| `remote-check: no clone at ~/<tree>` | 检查主机在 `OPERAD_CHECK_TREE` 处没有 clone。 | 在那里 clone 该仓库，或设置 `OPERAD_CHECK_TREE`。 |
| `remote-check: fetch of the bundle failed` | 主机无法读取复制过去的 bundle。 | 检查 ssh 目标和主机磁盘；重试。 |
| 检查在其命令行运行之前就失败，退出码为 1 | bundle、复制、连接、fetch 或 checkout 失败。 | 那一行会指出失败的步骤；修复主机或网络，然后重试。 |
| 压力测试失败 | 某个测试在重复或负载下失败。 | 日志会指出每个失败的测试；修正测试或代码，然后 rerun。不要调大超时，也不要在测试内部加重试。 |

## dev 和 bot {#dev-and-bot}

| 消息 | 含义 | 处理 |
|---|---|---|
| `no repository "<name>"` | 该仓库没有注册。 | `operad dev repo add <path> [--name <name>]`。 |
| `repository "<name>" was removed` | 该仓库已被移除。 | 用它的路径重新添加。 |
| `<path> has no remote` | `repo add` 需要一个 remote。 | 添加一个 `origin` remote，然后重试。 |
| `no plan "<plan>"` | 计划 id 有误，或不在这个仓库中。 | `operad list plan --repo <name>`。 |
| `no task "<task>"` | 任务 id 有误。 | `operad list task --repo <name>`。 |
| `a task cannot follow itself` | `--after` 指名了任务自己。 | 去掉那个 `--after`。 |
| `cycle: <a> -> <b> -> <a>` | `--after` 链构成了环。 | 去掉其中一条边。 |
| `--flow: no flow "<name>" in repository "<name>"` | 该 flow 没有在 `.operad/dev.json` 中定义。 | 使用已定义的 flow，或添加它。 |
| `plan "<plan>" is not in repository "<name>"` | 该计划属于另一个仓库。 | 用 `--repo` 指定该计划所在的仓库。 |
| `task is <phase>; only proposed or ready tasks can change` | 该任务已经开始。 | 在第一次 attempt 之前修改它。 |
| `there is no bot "<name>"` | 该 bot 不在 `plugins.bot.settings.bots` 中。 | 添加它，然后重试。 |
| `bot "<name>": a name is lowercase letters, digits, "-" and "_", and starts with a letter or digit` | 该 bot 名称不被允许。 | 重命名。 |
| `agent "<name>" is not loaded; the loaded ones are: …` | bot 的 agent 或 `--agent` 没有加载。 | `operad plugin enable <name>`（`claude`、`pi`、`radian` 之一）。 |
| `MCP server "<name>": a name is lowercase letters, digits and "-", with single "_" between parts` | 该服务器名称不被允许。 | 重命名；`operad` 保留给 operad 自己的服务器。 |
| `"<spec>" is not pinned (<why>). Pin an exact version …` | 包命令指名了 tag 或版本范围。 | 写出确切版本，如 `name@1.2.3`。 |
| `a remote server (an address) cannot be registered yet; only a local one, a command with arguments` | 粘贴的条目是一个 URL。 | 使用本地命令。 |
| `the pasted server needs a command` | 输入中没有 `command`。 | 粘贴完整的 `mcpServers` 条目。 |
| `could not read the tools of "<name>" by starting it: <reason>` | 该服务器没有启动或没有回应。 | 修正它的命令或安装它；重试前用 `operad secret set bot <server>.<variable>` 保存它的 secret。 |
| `a skill needs a SKILL.md` | 提议的 skill 没有 `SKILL.md`。 | 添加一个，或把 `--from` 指向有它的目录。 |
| `MCP servers are registered with `operad bot mcp`…` | `bot setting` 试图编辑 `mcpServers`。 | 使用 `operad bot mcp`。 |
| `the user access file "<path>" <problem>; it is treated as empty` | `access-user.json` 无效。 | 修正或删除该文件；在它能被读取之前，不使用任何 always-allowed 条目。 |

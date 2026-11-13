---
description: 面向 lead agent 的 MCP server：设置、传输、Claude Code channel、工具和错误。
---

# MCP server {#mcp-server}

`operad mcp` 是运行在 stdio 上的 Model Context Protocol server。它让 lead agent 以带类型的方式访问对象、列表、section、pending 项、运行中的项和 history，这些内容与 `operad` 和 `/v1` 接口读取的相同。它还通过与 CLI 相同的路径运行插件 verb 和 `config.json` 允许的 lead action。它从不启动 step，也不做 owner 的决定；只有 `operad serve` 运行 step，未列入 `mcp.actions` 的 action 仍留在命令行或 app 中。

该 server 实现 MCP JSON-RPC 2.0 传输，协议版本为 `2025-06-18`。除 `@operad-io/engine` 外，它没有运行时依赖。

## 设置 {#setting-it-up}

`operad mcp` 在 stdio 上为 lead agent 运行一个 MCP server。它读取与各命令相同的对象、pending 项、运行中的项、section 和 history，并运行插件 verb 和 `config.json` 允许的 lead action。它从不启动 step，也不做 owner 的决定；只有 `operad serve` 运行 step，未列入 `mcp.actions` 的 action 仍留在命令行或 app 中。协议、工具和错误映射见下文；stdout 只承载 JSON-RPC，日志写到 stderr。

Claude Code 在项目的 `.mcp.json` 中找到该 server：

```json
{
  "mcpServers": {
    "operad": {
      "command": "operad",
      "args": ["mcp"]
    }
  }
}
```

server 使用 `$OPERAD_HOME`，未设置时使用 `~/.operad`。如果 agent 应读取另一个 home，在该条目的 `env` 中设置 `OPERAD_HOME`。

### 开启 channel {#turning-the-channel-on}

`operad mcp --claude-channel` 把 server 变成单向 channel：它声明实验性的 `claude/channel` capability，并在对象的状态、waiting 标志或 running 标志变化时发送 `notifications/claude/channel`。它从不声明 `claude/channel/permission`，也从不转发权限提示。不带该标志时，server 不发送任何通知，也不声明任何实验性 capability。

server 同时监视对象和 flow，因此即使没有写入任何对象，打开的等待或启动的 step 也会被报告（其他进程所做的变更由轮询发现，默认 500 ms）。在客户端发送 `notifications/initialized` 之前它不发送任何内容，之后再发送自启动以来的变化。启动时 server 读取当前的行，并且不为它们发送任何内容。之后的每条通知都有一行 `content`，格式为 `<id> <old state> -> <new state>`，当该行有 note 时附加 `: <note>`，另有字符串类型的 `meta`，含 `id`、`type`、`state`、`previous`、`waiting` 和 `running`。起始读取之后才首次出现的对象，其 `previous` 为 `new`。该 channel 是单向的；详情请用 `show`、`section`、`pending` 和 `history`。

`--types <t,…>` 把 channel 限制在某些对象类型上，类型之间用逗号分隔。默认是所有带视图的类型；不是类型的名称属于用法错误。例如：

```json
"args": ["mcp", "--claude-channel", "--types", "task"]
```

Claude Code 通过其 development-channel 标志启用该扩展，并指明 `.mcp.json` 中的 server：

```sh
claude --dangerously-load-development-channels server:operad
```

## 传输 {#transport}

消息为每行一个 JSON-RPC 对象，stdin 为输入，stdout 为输出。消息不得包含内嵌换行。stdout 只承载 JSON-RPC 消息；插件加载、视图错误和其他日志写到 stderr。

server 接受以下方法：

| Method | 作用 |
|---|---|
| `initialize` | 返回协议版本、`tools` capability、server 名称和版本，以及 instructions。 |
| `notifications/initialized` | 接受；没有响应。 |
| `ping` | 返回 `{}`。 |
| `tools/list` | 返回下面的工具表。 |
| `tools/call` | 运行一个工具。 |

`initialize` 的结果带有这条固定的 instruction：

```text
The operad MCP server reads objects, pending items and history, and writes the commands and lead actions it is allowed to. Owner decisions are not offered here.
```

`tools/call` 接受 `{ "name": "<tool>", "arguments": { ... } }`。在读取任何视图之前，先按该工具的输入 schema 检查参数。缺少必填字段、出现未知字段或字段类型错误，都属于格式错误的请求。

## Claude Code channel {#claude-code-channel}

`operad mcp --claude-channel` 还会把对象的变化推送给理解 Claude Code channel 扩展的客户端。不带该标志时，server 的工具、capability 和 instructions 与之前相同，并且不发送通知。

带该标志时，`initialize` 的结果含有 `capabilities.experimental["claude/channel"] = {}`。它从不声明 `claude/channel/permission`：server 不转发权限提示。instructions 会多出一段，说明该 channel 是单向的，详情由读取类工具提供。

有两个来源。一个是 store 的对象变化。另一个是 flow 的变化，因为对象的 `waiting` 和 `running` 标志来自它的 flow：打开的等待或启动的 step 不会写入对象。两者都使用目录监视，并以轮询作为后备，因此其他进程所做的变更也能被看到（轮询间隔是 store 自身和 flow 记录自身的间隔，默认 500 ms）。每次变化都会重新读取该对象的行。启动时，server 读取每个带视图的类型的当前行，并且不为它们发送任何内容；如果读不到某个类型的行，则该类型每个对象第一次看到的行就是它的基线，同样不发送任何内容。它记住每个对象最后看到的行，并且只为以下三种情况之一发送一个 block（见下面的 `mcp.channel.notify`）：

- **waiting**：`waiting` 标志变为开。content 带有该行的 note，其中有原因时即为原因（返工次数上限、work 失败、可以合并）。对象自己的插件会自动回答的等待不会被通知：dev 对计划为 auto merge 且评审已通过的任务这样处理，因为 dev 稍后就会回答 "merge"。kernel 每次都会询问插件（对象类型的 `answeredAutomatically` hook），并且 pending 项带有仅供 channel 使用的 `auto: true`。如果回答没有到来（dev 拒绝，或计划的 auto 级别改变），下一次变化会发现该等待没有被标记，此时才发送 block。插件不会回答的等待（要求返工、work 没做任何事、评审两次失败）照常发送。
- **ended**：对象到达最终状态。插件通过在返回的行上设置 `final: true` 来声明哪些状态是最终状态（dev：已合并或已取消的任务，已完成或已取消的计划）；channel 不认识任何状态名。
- **loop**：对象在没有等待或结束介入的情况下，到达同一状态 `loopAfter` 次，次数从 channel 自启动以来看到的状态变化计起。该情形在这一段期间只发送一次；等待或结束会让计数重新开始。

其他所有状态变化、`running` 的翻转以及 `waiting` 变为关都不发送任何内容，并且与该对象最后发送的行（state、`waiting` 和 `running`）相同的行不会再次发送。每个对象最后发送的行保存在 operad home 的一个文件中（`mcp-channel-<hash of the store root>.json`），在 block 送达时写入，因此重新连接或重启后再次看到的变化保持安静。起始读取之后才首次出现的对象，其 previous 状态为 `new`。再也找不到的对象会被遗忘。

该设置在 home 的 `config.json` 中，并在 server 启动时读取：

```json
{ "mcp": { "channel": { "notify": ["waiting", "ended", "loop"], "loopAfter": 3 } } }
```

省略该键则使用上面的值。把 `"changes"` 加入 `notify` 还会发送每一次状态变化，其 `reason` 为 `changes`，除非它同时也是一次 wait、一次 end 或一次 loop。不是 `waiting`、`ended`、`loop` 或 `changes` 的条目是会指出该条目的配置错误；`loopAfter` 是 2 或更大的整数。

在客户端发送 `notifications/initialized` 之前，server 不发送任何内容。它在此期间继续比较各行，然后按顺序发送自启动以来看到的变化。

每条通知都是 server 的 `notifications/claude/channel` 方法，参数如下：

```json
{
  "content": "T-0014-kernel running -> waiting: review passed",
  "meta": {
    "id": "T-0014-kernel",
    "type": "task",
    "state": "waiting",
    "previous": "running",
    "waiting": "true",
    "running": "false",
    "reason": "waiting",
    "step": "review"
  }
}
```

`reason` 说明发送该 block 的原因：`waiting`、`ended`、`loop` 或 `changes`。`step` 是对象当前 run 的最后一个 step；对象没有 run 时则没有该字段，因此当 review state 内 verify 失败时，block 显示为 `state="review" step="verify"`。

`content` 是一行，格式为 `<id> <old state> -> <new state>`，当该行有 note 时附加 `: <note>`。`meta` 的每个值都是字符串。该 channel 是单向的：没有回复工具，详情由 `show`、`section`、`pending`、`history` 和其他读取类工具提供。

`--types <t,…>` 把 channel 限制在指定的对象类型上，类型之间用逗号分隔；默认是所有带视图的类型。不是带视图的类型的名称属于会指出该名称的用法错误。该标志不改变读取类工具。

Claude Code 通过其 development-channel 标志启用该扩展，并指明 `.mcp.json` 中的 server：

```sh
claude --dangerously-load-development-channels server:operad
```

## lead 权限 {#lead-permissions}

server 只能运行 `mcp.actions` 列出的 action；其他所有 action 都属于 owner，`show` 会把它们列在 `ownerActions` 中。带有 `confirm: true` 的 action 还需要 `mcp.confirmActions` 列出它。这些设置在 `config.json` 中，并在 `operad mcp` 启动时读取：

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 |
|---|---|---|---|---|
| `mcp` | object | 见下面的各个键 | `channel`、`actions`、`confirmActions` | `operad mcp` 启动时。 |
| `mcp.actions` | 字符串数组 | `[]`（`operad init` 会把五个 `dev` lead action 和 `chat:close` 写入新文件） | `plugin:action` 名称 | `operad mcp` 启动时：lead 可以运行的 action。其他任何 action 都会被拒绝，消息中指出该 action 并说明由 owner 运行。 |
| `mcp.confirmActions` | 字符串数组 | `[]`（`operad init` 会把 `["chat:close"]` 写入新文件） | `plugin:action` 名称 | `operad mcp` 启动时：同时带有 `confirm: true` 的被允许 action。只在 `actions` 中且要求确认的 action 会被拒绝；只在此列表中的也会被拒绝。 |
| `mcp.channel` | object | 见下面的两个键 | `notify`、`loopAfter` | `operad mcp --claude-channel` 启动时。 |
| `mcp.channel.notify` | 字符串数组 | `["waiting", "ended", "loop"]` | `waiting`、`ended`、`loop`、`changes` | channel 启动时：什么情况会发送 block。`waiting` 是等待打开；`ended` 是最终状态；`loop` 是在没有等待或结束介入的情况下到达同一状态 `loopAfter` 次；`changes` 是每一次状态变化。未知的值是指出该值的配置错误。 |
| `mcp.channel.loopAfter` | integer | `3` | 从 2 起的整数 | channel 启动时：对象连续多少次到达同一状态之后发送 `loop` block。小于 2 的值是指出该值的配置错误。 |

`mcp.actions` 和 `mcp.confirmActions` 从不改变已经在运行的 action。MCP server 从不把 owner 的 action 当作自己的提供；`show` 把它们单独列出，以便 lead 告诉 owner 该运行什么。

`config.json` 中没有 `mcp.actions` 时，lead 不能运行任何 action。在 `operad init` 开始写入这些列表之前创建的 home 可能缺少它们；把 [config.json](config.md) 中的这些行加入其 `mcp` 部分并重启 `operad mcp`。之后启用某个插件不会添加它的 action；请手动列出。

## 工具 {#tools}

| 工具 | 必填参数 | 返回内容 |
|---|---|---|
| `types` | 无 | `{ "types": [...] }`，与 `GET /v1/types` 的列表相同。 |
| `list` | 无；`type`、`root`、`parent` 需要给出其中之一 | `{ "rows": [...], "next": "<c>" }`，与 `GET /v1/objects` 的页相同。 |
| `show` | `id` | 对象及其行、section、允许的 action 和 `ownerActions`。 |
| `section` | `id`、`section` | `{ "markdown", "next", "mark", "tail", "delta" }`，与 HTTP section 调用的读取相同；可选 `cursor`、`after`、`full`。 |
| `pending` | 无 | `{ "items": [...] }`，只含 lead 可以运行的 action。 |
| `answer` | `runId`、`waitId`、`choice` | `{ "runId", "waitId", "choice" }`；可选 `note`、`confirmed`。 |
| `running` | 无 | `{ "items": [...], "load": { "load1", "cores" } }`。 |
| `history` | `id` | `{ "id", "markdown", "next" }`，即 History section。 |
| `command` | `plugin`、`verb` | 插件 verb 的值，与 `operad <plugin> <verb>` 相同；可选 `args` 和 `input`。 |
| `act` | `action` | action 记录；可选 `id`、`args`、`note`。 |

本页其余部分给出每个工具完整的输入 schema 和结果形状。

工具表作为 `TOOLS` 从 `@operad-io/mcp` 导出；server 提供的就是同一张表。每个结果都是普通的 MCP 工具结果，带有 `structuredContent` 和一个文本块，文本是同样内容的 Markdown。`structuredContent` 始终是对象：列表被包装为 `{ "items": [...] }`。`next` 出现时是一个 cursor，调用方应原样传回。

### `types` {#types}

输入：`{ "type": "object", "additionalProperties": false, "properties": {} }`。

结果：`{ "types": [...] }`，与 `GET /v1/types` 提供的列表相同：每个带视图的对象类型，连同它的 `title`、`plugin`、`filters`（有则包含）和 `defaultFilter`，以及创建它的 action 所作用的 `parents`。声明了 `objectsUnderSettings` 的插件（bot）会把它的每个类型都标为 `"settings": true`：客户端不给它设标签页，而是把它的顶层对象列在 settings 之下。Markdown 是一张表，列出类型、title、插件、是否在 settings 之下、filters 和 parents。

### `list` {#list}

输入：

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "type": { "type": "string", "minLength": 1, "description": "An object type, such as task. Optional with root or parent: then every type is listed." },
    "root": { "type": "boolean", "description": "Only rows with no parent." },
    "parent": { "type": "string", "minLength": 1, "description": "Only rows whose parent is this object id." },
    "cursor": { "type": "string", "description": "The next cursor from an earlier list." }
  }
}
```

结果：`{ "rows": [ ... ], "next": "<cursor>" }`。`rows` 是某一个对象类型的行，带有插件的 `id`、`title`、`state` 以及可选的 `note` 和 `scope`，再加上 kernel 的 `waiting` 和 `running` 标志。出错的行还带有 `error`。Markdown 是一张表，列出 id、state、title、note 和标志。未知的类型是带有该视图消息的工具错误。

`root` 和 `parent` 列出一个层级，如 [Levels](cli.md#levels) 所述：给出 `type` 时列出该类型的行，不给出时按类型的顺序列出所有类型的行。该类型的默认 filter 在该层级中生效，`hidden` 统计被它排除的行数。不指向任何对象的 parent 得到空列表。不带 `type`、`root` 或 `parent` 的调用是工具错误。行的 `parent`（有则）出现在结构化的行和 `show` 的 Markdown 中。

### `show` {#show}

输入：

```json
{
  "type": "object",
  "required": ["id"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "minLength": 1, "description": "A bare id or type:id." }
  }
}
```

结果：对象 `{ "id", "type", "link", "row", "sections", "actions", "ownerActions" }`。`row` 是列表中的行。`sections` 是 section 目录。`actions` 是 lead 现在可以运行的可用 action，每个都带有 `name`、`on`、`args` JSON Schema、`note` 字段名、`noteRequired` 和 `confirm`。`ownerActions` 只包含 lead 不可以运行的可用 action 的名称，其中包括 `mcp.confirmActions` 没有列出的 `confirm: true` action。Markdown 显示行、section 目录、带参数的允许 action，以及一份 Owner actions 列表。未知的 id 是带有该视图消息的工具错误。

### `section` {#section}

输入：

```json
{
  "type": "object",
  "required": ["id", "section"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "minLength": 1, "description": "A bare id or type:id." },
    "section": { "type": "string", "minLength": 1, "description": "A section id from show." },
    "cursor": { "type": "string", "description": "The next cursor from an earlier read." },
    "after": { "type": "string", "description": "A mark from an earlier read: return only the finished content after it. The answer says in `delta` whether it is that part alone or a whole page." },
    "full": { "type": "boolean", "description": "Return the whole section without the size cap." }
  }
}
```

结果：`{ "markdown": "...", "next": "<cursor>", "mark": "<mark>", "tail": "..." }`。`mark` 是已完成内容所到达的不透明位置，`tail` 是仍在变化的那部分的 Markdown；不使用它们的插件两者都不发送。带着前一次读取得到的 `after=<mark>` 时，`markdown` 只包含该 mark 之后已完成的内容，`delta` 说明它是仅这一部分（true）还是客户端必须替换的整页（false）。大小上限同时计入 `markdown` 和 `tail`，但绝不截断 `tail`：两者放不下时，先缩短 `markdown`；连 tail 和截断说明都放不下时，调用被拒绝，消息提到超出上限并指明 `--full`。文本块是 Markdown，当 section 分页时，最后一行指明 `next`。未知的 id 或 section，或来自另一个 section 或对象的 mark，是带有该视图消息的工具错误。

### `pending` {#pending}

输入：

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

结果：`{ "items": [...] }`，与 `operad pending` 和 `GET /v1/pending` 的列表相同，只含 lead 现在可以运行的 action。问题带有 `waitId`。每个关于某个对象的项都带有它的 `row`，与 `GET /v1/pending` 中一样。`mcp.actions` 之外的 action，或 `mcp.confirmActions` 没有列出的 `confirm: true` action，在结构化内容和 Markdown 中都会被省略。Markdown 列出每个 pending 项、它的提示、choice 和 action。要查看 owner action，对该项的对象调用 `show`。

### `answer` {#answer}

输入：

```json
{
  "type": "object",
  "required": ["runId", "waitId", "choice"],
  "additionalProperties": false,
  "properties": {
    "runId": { "type": "string", "minLength": 1, "description": "The pending item's runId." },
    "waitId": { "type": "string", "minLength": 1, "description": "The pending item's waitId." },
    "choice": { "type": "string", "minLength": 1, "description": "One of the item's choices." },
    "note": { "type": "string", "description": "The note, when the question asks for one." },
    "confirmed": { "type": "boolean", "description": "Set when the answer is a choice whose action asks to confirm." }
  }
}
```

结果：`{ "runId", "waitId", "choice" }`，给出 note 时再加 `note`。它记录 actor `{ "via": "mcp", "id": "lead" }`。已经关闭的问题，或问题没有提供的 choice，是带有该视图消息的工具错误。当每个 choice 同时也是该项对象上的 action 时（`dev` 的等待），该 choice 通过那个 action 运行，因此它的确认和 `mcp.actions` 允许列表仍然适用，结果是 action 记录。需要确认的 action 要带 `"confirmed": true`。

### `running` {#running}

输入：

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

结果：`{ "items": [...] }`，与 `operad running` 和 `GET /v1/running` 的列表相同。Markdown 是一张表，列出每个活动的 run：它的对象、title、flow、step、step 耗时和 run 的存续时间。每个项还带有 `object`、`title`、`stepStartedAt`、`stepElapsedMs` 和 `mark`（对象行的 mark，没有时省略；见手册中的 `GET /v1/running`）。

### `history` {#history}

输入：

```json
{
  "type": "object",
  "required": ["id"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "minLength": 1, "description": "A bare id or type:id." }
  }
}
```

结果：`{ "id": "<the id as given>", "markdown": "...", "next": "<cursor>" }`。Markdown 是 kernel 为该对象提供的 History section。未知的 id 是带有该视图消息的工具错误。

### `command` {#command}

输入：

```json
{
  "type": "object",
  "required": ["plugin", "verb"],
  "additionalProperties": false,
  "properties": {
    "plugin": { "type": "string", "minLength": 1, "description": "A loaded plugin name, such as dev." },
    "verb": { "type": "string", "minLength": 1, "description": "A verb the plugin declares, such as plan." },
    "args": { "type": "array", "items": { "type": "string" }, "description": "The command-line arguments after the verb." },
    "input": { "type": "string", "description": "The text the CLI reads from stdin, such as a brief." }
  }
}
```

结果：插件 verb 的输出，与 `operad <plugin> <verb>` 打印的值相同。是对象的值原样作为结构化内容；其他任何值（列表、字符串）被包装为 `{ "value": ... }`。该调用构造 CLI 的 `[plugin, verb, ...args]`，由 `input` 代替 stdin，因此 `dev plan add` 和 `dev task add` 从它取得 brief。它针对已加载的插件解析这一对名称，因此即使插件名称与某个 kernel 命令相同，插件 verb 也会运行。名称本身就是 kernel verb 的插件会被拒绝，即使这一对名称解析到它的某个命令也一样。指定的插件没有声明的 kernel verb（`serve`、`init`、`plugin ...`、`secret ...`、`http ...`，以及 CLI 自己负责的其他命令），以及它没有声明的任何其他 verb，都会以工具错误被拒绝。

### `act` {#act}

输入：

```json
{
  "type": "object",
  "required": ["action"],
  "additionalProperties": false,
  "properties": {
    "action": { "type": "string", "minLength": 1, "description": "A <plugin>:<action> name from show." },
    "id": { "type": "string", "description": "The object id when the action targets one." },
    "args": { "type": "object", "description": "The action's arguments, as its schema names them." },
    "note": { "type": "string", "description": "The note for an action whose schema declares one." }
  }
}
```

结果：与 `POST /v1/act` 返回的相同的 action 记录，含 `plugin`、`action`、`name` 和 `value`。它通过 `views.act` 运行，记录 actor `{ "via": "mcp", "id": "lead" }`，并为处于等待的 run 记录一次人的回答。未列入 `mcp.actions` 的 action 是指出它并说明由 owner 运行的工具错误。带有 `confirm: true` 的 action 同样被拒绝，除非 `mcp.confirmActions` 也列出它。

## 错误 {#errors}

JSON-RPC 错误用于格式错误的请求，而不用于视图的拒绝：

| Code | 何时 |
|---|---|
| `-32700` | 该行不是 JSON。 |
| `-32600` | 消息不是 JSON-RPC 2.0 请求。 |
| `-32601` | 方法不是上面列出的方法之一。 |
| `-32602` | `tools/call` 格式错误：未知的工具、没有 `name`、`arguments` 不是对象，或参数与该工具的输入 schema 不符。 |
| `-32603` | 读取视图时发生意外错误；消息是通用的。 |

视图的拒绝是一个成功的 `tools/call` 响应，其结果带有 `"isError": true` 和一个文本块，文本是该视图自己的消息。这包括未知的 id、section 或类型。工具错误不带 `structuredContent`。server 不写堆栈跟踪，也不写内部名称。

示例：

```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"no object \"task:nope\""}],"isError":true}}
```

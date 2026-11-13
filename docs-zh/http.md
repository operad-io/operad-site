---
description: /v1 HTTP 接口：http 段、token、endpoint、事件和错误。
---

# HTTP 接口 {#the-http-interface}

`operad serve` 向 app 和终端客户端等客户端提供 `/v1` 接口。本页介绍 `http` 的键和 token，然后依次介绍每个 endpoint、行标记和链接、事件以及错误。手机配对见 [app 页](app.md)；终端客户端见[它自己的页面](tui.md)。

## 为什么需要它 {#why-it-exists}

app 和终端客户端运行在与 `operad serve` 不同的设备或进程上，它们需要命令行已有的那些东西：列表、对象的 section、pending 项、action 和设置。这个接口通过 HTTP 把这些提供给它们。接口不含任何插件的知识：客户端询问有哪些对象类型，读取每个对象的行、section 和当前可用的 action，然后把它们画出来，所以新插件出现在客户端里时无需改动客户端。因为它能从其他机器访问，所以默认只监听本机，只接受 loopback、私有、link-local 和 Tailscale 地址，并且每个请求都必须带 bearer token。

## 它如何工作 {#how-it-works}

1. 当 `http.enabled` 为 true 时，`operad serve` 在 `http.port` 上绑定 [`http.listen`](#the-http-section) 中的地址，并为每个地址打印 `http <url>`。第一次启动会在 `secrets/http.json` 中创建 bearer token。
2. 客户端在每个请求里带上 `Authorization: Bearer <token>`，也可以在 `X-Operad-Client` 中给自己命名。token 错误或缺失会得到 `401`。
3. 它先用 `GET /v1/types` 了解这个 home 的结构，再用 `GET /v1/objects?type=…` 列出行。每一行带有状态和可选的[标记](#row-marks)，由客户端渲染。
4. 它用 `GET /v1/objects/<id>` 打开一个对象，返回行、section 目录、当前可用的 action 和一个[链接](#links)。每个 section 用 `GET /v1/objects/<id>/sections/<section>` 读取；见[读取 section](#reading-a-section)。
5. 等待人处理的东西来自 `GET /v1/pending`。回答发到 `POST /v1/answer`，其他 action 发到 `POST /v1/act`。两者的记录方式与命令行 action 相同，由 `serve` 继续推进 run。需要确认的 action 要带 `"confirmed": true`。
6. 客户端不轮询。它保持 `GET /v1/events` 打开，每个[事件](#events)指明一个发生了变化的对象，客户端再去重新读取它。带着 `Last-Event-ID` 重连后，服务器会补发它仍保留的事件，或发送 `reset`，客户端随后重新读取列表和已打开的 section。
7. 设置走 `GET /v1/settings` 和 `POST /v1/settings`（[设置](#settings)），action 的文件走 `POST /v1/uploads`。失败时返回带 `error` 的 JSON 正文，状态码见[错误](#errors)表。

## `http` 段 {#the-http-section}

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `http` | 对象 | `{ "enabled": true, "port": 7480, "listen": ["127.0.0.1"] }` | 含下列键的对象；缺少该段表示使用这些默认值 | 每次命令启动时；`serve` 在启动时和重新加载后绑定 | 被拒绝：`http: must be an object` |
| `http.enabled` | 布尔值 | `true` | `true` 或 `false` | `serve` 启动时；重新加载后按新值开启或关闭接口 | 被拒绝：`http.enabled: must be a boolean` |
| `http.port` | 整数 | `7480` | `0` 到 `65535`；`0` 表示向系统要一个端口 | `serve` 绑定时；重新加载后绑定新端口 | 被拒绝：`http.port: must be an integer from 0 to 65535` |
| `http.listen` | 字符串数组 | `["127.0.0.1"]` | 至少一个非空的 IP 字面量：loopback、RFC 1918、link-local 或 Tailscale；通配地址和其他所有地址都被拒绝 | `serve` 绑定时；重新加载后绑定新地址 | 被拒绝：`http.listen: must be an array of IP addresses`、`http.listen: needs at least one address`、`http.listen: "<address>" is not an IP address`、`http.listen: "<address>" is a wildcard address; name each address to listen on`，或 `http.listen: "<address>" is not a loopback, private, link-local or Tailscale address` |

`http` 内的未知键会被忽略；只读取上面的键。`listen` 的每一项都是 IP 字面量。`serve` 接受 loopback 地址、RFC 1918 地址（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）、link-local 地址（`169.254.0.0/16`、`fe80::/10`）或 Tailscale 地址（`100.64.0.0/10`、`fd7a:115c:a1e0::/48`）。它在打开端口之前就拒绝通配地址（`0.0.0.0` 或 `::`）和其他所有地址，并指出是哪一项。默认只监听本机。没有 `http` 段的配置表示 `enabled` 为 true、端口为 `7480`、`listen` 为 `["127.0.0.1"]`。有 `http` 段但没有 `enabled` 时，接口会开启，监听 `listen` 中的地址。

`http.enabled` 为 true（默认）时，第一次 `operad serve` 会创建一个 bearer token，即 32 个随机字节的 base64url 编码，保存在 `secrets/http.json`。每个请求都必须带 `Authorization: Bearer <token>`；没有它，或 token 不是当前的，请求会得到 `401`。`operad http token rotate` 立即替换 token：运行中的 `serve` 从该命令返回的那一刻起拒绝旧 token，并结束用它打开的事件流。没有任何 endpoint 会显示 token。

客户端在 `X-Operad-Client` 头中给自己命名，这是一个小写单词，最多 32 个字母、数字、`-` 或 `_`（`ios`、`tui`）。它在 chat 中发送的消息会被记录，并显示为“via”该名称。没有该头，或值不是这样的单词，会被记录为 `http`；绝不会记录为 `cli`。

`serve` 为每个监听的地址打印一行：

```text
http http://127.0.0.1:7480
```

对已经有一个 operad serve 的 home，再启动第二个 `operad serve` 会在读取 store 或打开端口之前以退出码 4 退出。

## Endpoint {#endpoints}

所有 endpoint 都在 `/v1` 之下。除非 endpoint 另有说明，响应都是 JSON。路径中的对象 id 要做 URL 编码；`<id>` 可以是裸 id，也可以是 `<type>:<id>`。

| 方法和路径 | 返回内容 |
|---|---|
| `GET /v1/types` | `{ "types": [{ "type": "task", "title": "Task", "plugin": "dev" }] }`：有视图的对象类型、它们的显示名，以及各自所属插件的名称（客户端按它给类型分组）。声明了 filter 的类型还带有 `"filters"`，按显示顺序排列（`[{ "name": "active", "states": ["proposed", ...] }, { "name": "all" }, ...]`），以及 `"defaultFilter"`。没有 filter 的类型两者都没有。声明了 `objectsUnderSettings` 的插件，其每个类型还带有 `"settings": true`：这样的插件没有自己的 tab，它的顶层对象归在 settings 之下。 |
| `GET /v1/keys` | `{ "keys": [{ "key": "m", "action": "dev:merge", "source": "plugin" }] }`：当前生效的键绑定，即插件的默认值加上用户 `keys.json` 的覆盖；覆盖项的 `source` 为 `user`。 |
| `GET /v1/objects?type=<type>&filter=<name>&cursor=<c>`（还有 `root` 和 `parent=<id>`，见 [Levels](cli.md#levels)） | `{ "rows": [...], "next": "<c>", "hidden": 3 }`：列表的一页。`rows` 带有插件给出的 `id`、`title`、`state`，以及可选的 `note`、`wait`、`mark` 和 `badge`（见[行标记](#row-marks)），另有 `waiting` 和 `running`；错误行还带有 `error`。`filter` 只保留指定 filter 显示的行，`hidden` 是该类型中被它排除的行数（整个类型，而不只是这一页）。没有 `filter` 时，若类型有 filter，则应用类型的默认 filter；没有 filter 的类型列出每一行，也没有 `hidden`。`filter=all` 列出每一行，没有 `hidden`。未知名称会得到 `400`，并列出允许的名称。`next` 在过滤后的列表内翻页。 |
| `GET /v1/pending` | 与 `operad pending` 相同的列表，附上每一项提供的 action。问题带有 `waitId`，即答复所引用的 id。插件即将自动回答的 wait（dev：处于 auto merge 的计划中，某个任务通过了评审）不会列出，因此计数不会闪烁；如果自动回答没有到来，它才会被列出。插件在没有 run 在等待时提出的项（`kind` 为 `standing`，没有 action，`runId` 为 `<plugin>:<id>`）也在列表中，插件不再报告它时它就消失。与某个对象有关的项还带有 `object`（`<type>:<id>`）、它的 `link` 和 `row`：row 与 `GET /v1/objects?type=…` 为该对象返回的行相同（`id`、`title`、`state`，可选的 `note`、`mark`、`badge`、`waiting`、`running`），因此客户端不必逐个读取对象。当无法构造该行时（对象已不存在、没有已加载的插件显示它的类型，或插件的行出错），该项带有列表对坏行显示的错误行，`state` 为 `error`，并带 `error` 消息；列表本身绝不会因一个对象而失败。candidate 没有对象，也没有 `row`。`operad pending` 在每个有标题的行下面打印该行的标题。 |
| `GET /v1/running` | 与 `operad running` 相同的列表。每一项有 `runId`、`flow`、`step`、`stepLabel`、`queued`、`startedAt` 和 `elapsedMs`（run 的存在时长），以及：`object`，即行和 `operad show` 所用的对象 id（例如 `operad/T-0048-type-filters`），没有对象的 run 为 `null`；`title`，该对象的行标题，没有对象或查找失败时为 `null`（查找失败绝不会让列表失败）；`stepStartedAt` 和 `stepElapsedMs`，即当前 step 的当前 attempt 何时开始、已运行多久（第一个 step 之前为 `null`）；`mark`，对象的行标记（[行标记](#row-marks)之一），行没有标记或无法构造时省略。step 的时间在 step 变化和新 attempt 开始时重新计时。 |
| `GET /v1/objects/<id>` | `{ "id", "type", "link", "row", "sections", "actions" }`：打开该对象的链接、行、section 目录，以及当前可用的 action，附带它们的 `args` schema、`note` 字段和 `confirm` 标志。 |
| `GET /v1/objects/<id>/sections/<section>?cursor=<c>&full=<bool>&after=<mark>` | `{ "markdown": "...", "next": "<c>", "mark": "<m>", "tail": "..." }`。`full=true` 跳过大小上限。`mark` 是已完成内容所到的不透明位置，`tail` 是仍在变化的部分的 Markdown；不使用它们的插件两者都不发送。带上前一次读取得到的 `after=<mark>` 时，`markdown` 只包含该 mark 之后已完成的内容；此时答复还带有 `delta`：只有那一部分时为 true；插件答复的是整页、客户端必须替换而不是追加时为 false。大小上限同时涵盖 `markdown` 和 `tail`，但绝不截断 `tail`：两者放不下时，先缩短 `markdown`；连 tail 和截断说明也放不下时，调用会被拒绝，并给出提到 `--full` 的超限消息。来自其他 section 或对象的 mark 会以 `400` 被拒绝。 |
| `POST /v1/act` | 运行一个 action。请求体是 `{ "action": "plugin:action", "id": "<id>", "args": {...}, "note": "...", "confirmed": true }`；只有 `action` 始终必需，针对对象的 action 还需要 `id`。带 `confirm: true` 的 action 需要 `"confirmed": true`。请求体最大 1 MiB；更大的会得到 `413`，消息为 `the request body is larger than the 1 MB limit`。action 的 schema 中以 `"format": "file"` 声明的参数（一个字符串，或字符串列表）接受上传的 `ref`；action 以文件存放的路径运行。 |
| `GET /v1/settings?scope=<scope>` | 列出用户可以调整的设置：`{ "settings": [{ "name", "scope", "value", "default", "description", "type", "enum", "editable", "confirm" }] }`。没有 `scope` 时，列出全局设置和每个仓库 scope；一个 scope 指定一个仓库。在某个 scope 中无法读取的设置会被省略。 |
| `POST /v1/settings` | 修改一项设置。请求体是 `{ "name": "<plugin>.<path>", "value": <any>, "scope"?: "<repo>", "confirmed"?: true }`；`name` 和 `value` 必需，`value` 可以是 `null`。答复是改动后的设置，形状与上面的一项相同。未知的设置名是 `404`；schema 拒绝的值是 `422`，并附原因；不可编辑的设置，或要求确认却没有 `confirmed` 的设置，是 `409`。 |
| `POST /v1/uploads?name=<file name>` | 为 action 的文件参数上传文件。请求体就是文件本身，以流的方式发送；它的 `content-type` 头会保留为文件的类型。答复是 `201` 和 `{ "ref", "name", "type", "size" }`。大于 20 MB 的文件得到 `413` 和指出该上限的消息。`ref` 只能用一次：接收它的 action 把文件移到目标对象在 operad home 下的附件目录（`attachments/<type>/<id>/`），再次使用会以 `400` 被拒绝。一小时内没有 action 取用的上传会被删除。 |
| `GET /v1/attachments/<type>/<id>/<ref>/<name>` | 提供 action 文件参数所存的文件，类型取自上传时给出的类型。chat 的 transcript 把它的附件链接到这里。 |
| `POST /v1/answer` | 回答 pending 项中一个未决的问题。请求体是 `{ "runId": "<item runId>", "waitId": "<item waitId>", "choice": "<one of the item's choices>", "note": "...", "confirmed": true }`；`runId`、`waitId` 和 `choice` 必需，`note` 和 `confirmed` 可选。当每个选项同时也是该项对象上的 action（`dev` 的 wait）时，它运行该 action，因此适用该 action 的 note 和确认；需要确认的 action 与 `/v1/act` 一样需要 `"confirmed": true`。对已关闭的问题作答会得到 `409`，且不会被应用。 |
| `GET /v1/events` | 变更的 SSE 流。 |

action 的 `args` 可以带有 JSON Schema 条件，用一个字段来限定另一个字段：`allOf` 持有 `{ "if": { "properties": { "agent": { "const": "claude" } }, "required": ["agent"] }, "then": { "properties": { "model": { "enum": [...], "default": "..." }, "effort": { ... } } } }`，每个 agent 一条。新建 chat 的 action（`bot:chat`、`dev:chat`）使用它：顶层的 `model` 和 `effort` enum 列出每个已加载 agent 的选项（只读这些的客户端仍然可用），所选 agent 的 `then` 持有该 agent 采用的列表和默认值（该 agent 列出了 bot 配置的 model 或 effort 时取配置值，否则取 agent 的默认值）。没有列出 model 或 effort 的 agent，其 `then` 中没有 `model` 或 `effort`：不能为它选择。客户端显示所选 agent 的 enum 和默认值，在选定 agent 之前回退到顶层的值。服务器检查请求时不计算这些条件；它按名称拒绝 agent 没有列出的 model 或 effort。

`POST /v1/act` 把调用者记录为 `{ "via": "http", "id": "operad app" }`。它记录 action 的方式与命令行相同，运行中的 `operad serve` 会继续 waiting 的 run 所要求的 step。`POST /v1/answer` 以同样的方式记录它的调用者，并按与命令行和插件 action 相同的规则作答。

## 读取 section {#reading-a-section}

`GET /v1/objects/<id>/sections/<section>` 读取一个 section。`cursor` 取前一次读取的 `next`；`full=true`（或 `1`）跳过大小上限。有 `pages` 的 section 还会答复目录，因此客户端可以跳转：第一页没有 cursor，其他每一页带有自己的 cursor。

live section 还带有 `mark` 和 `tail`。`mark` 是已完成内容的不透明位置；`tail` 是仍在变化的部分的 Markdown（chat 中未完成的回复和思考、正在运行的工具调用），每次读取都给出整个 tail。若要追加而不是替换，传入上一次读取的 `after=<mark>`：此时答复的 `markdown` 只包含该 mark 之后已完成的内容，当它只包含这些时 `delta` 为 `true`。无法以 delta 作答的插件答复整页，`delta` 为 `false`；此时客户端替换自己的内容。来自其他 section 或对象的 mark 是 `400`。

大小上限同时涵盖 `markdown` 和 `tail`，但绝不截断 `tail`：它先缩短 `markdown`。连 tail 和截断说明也放不下时，调用是 `400`，并提到 `--full`。

## 设置 {#settings}

`GET /v1/settings?scope=<scope>` 读取设置，方式与 `operad settings` 相同。没有 `scope` 时返回全局设置和每个仓库 scope；有 scope 时返回一个仓库的设置。每一项有 `name`、`scope`、`value`、`default`、`description`、`type`、`enum`（有则带）、`editable` 和 `confirm`。没有 `value` 表示该设置未设置。

`POST /v1/settings` 修改一项。请求体是 `{ "name": "<plugin>.<path>", "value": <any>, "scope"?: "<repo>", "confirmed"?: true }`。`name` 和 `value` 必需；`value` 可以是 `null`。答复是改动后的那一项。不是设置的名称是 `404`；schema 拒绝的值是 `422`，附 schema 给出的原因；只读的设置，或要求确认却没有收到 `confirmed` 的设置，是 `409`。成功的修改以原子方式写入文件，并保留其他所有键。`POST /v1/act` 还会把调用者记录为 `{ "via": "<client>", "id": "<token label>" }`；除非 secret store 给出别的名称，token label 是 `operad app`。

## 行标记 {#row-marks}

插件的 `row` 除了 `id`、`title`、`state` 和 `note` 之外，还可以返回 `mark` 和 `badge`。`GET /v1/objects`、`GET /v1/objects/<id>`、pending 项的行，以及 MCP 的 `list` 和 `show` 结果都原样传递它们。

行还可以带有 `wait`：对象为何在等待，是一段单独的文本，与 `note` 分开（dev 把同样的文本放进两者，因此 note 的读法不变）。想把 wait 单独放在一行的客户端读取 `wait`，而不是按 ` · ` 拆分 note；当 wait 文本本身含有 ` · ` 时，拆分会出错。它是协议字段；不在等待任何东西的行没有 `wait`。`operad show --json` 以及 HTTP 和 MCP 的行都包含它。

`mark` 说明对象正在做什么，图标和颜色由客户端选择。它是下面 17 个值之一，kernel 会把任何其他值变成错误行，并列出这些值：

| 标记 | 含义 | TUI |
|---|---|---|
| `todo` | 未开始 | `○` |
| `blocked` | 等待另一个对象或被保留的区域 | `◌` |
| `retry_wait` | 等待重试时间 | `◷` |
| `paused` | 已暂停 | `‖` |
| `proposed` | 已建议，尚未接受 | `+` |
| `starting` | 正在设置 | `◔` |
| `running` | 工作进行中 | `◐` |
| `reconciling` | 正在与别处的变更对齐 | `↻` |
| `checking` | 正在验证或评审 | `⌕` |
| `rework_pending` | 正在询问是否重做 | `↩` |
| `waiting` | 等待用户 | `●` |
| `integrating` | 正在合并 | `⑂` |
| `ready_to_merge` | 已检查，等待合并 | `◉` |
| `done` | 已完成 | `✓` |
| `failed` | 已放弃 | `✗` |
| `cancelled` | 已取消 | `⊘` |
| `broken` | 无法使用 | `!` |

kernel 的 `waiting` 和 `running` 标志保持不变。客户端按这个顺序选择绘制内容：错误行绘制错误；当 `waiting` 为 true 时，`mark` 为 `waiting`、`proposed`、`rework_pending` 或 `ready_to_merge` 则保留它，其他任何 mark（或没有 mark）绘制 `waiting`；当 `waiting` 为 false 时，有 mark 就绘制 `mark`；否则 `running` 为 true 就绘制 `running`；这些都不满足的行是普通行。TUI 按角色给 mark 着色：`proposed`、`rework_pending` 和 `waiting` 用强调色，`starting`、`running`、`reconciling`、`checking` 和 `integrating` 用 run 的颜色，`ready_to_merge` 和 `done` 用成功色，`failed` 和 `broken` 用错误色，其余用弱色。

`after` 列出对象所等待的同级（`parent` 相同的行）的 id，采用行 id 的形式；它是由非空字符串组成的数组，否则该行是错误行。它在 list、get 和 pending 的行中原样传递，`operad list` 和 `operad show` 不打印它。`dev` 插件用任务所等待的任务 id 填写任务的 `after`，按存储的形式给出：其他仓库的任务显示为 `<repository>/<task id>`。

`operad task add` 和 `operad task update` 用 `--after <task>` 指同一仓库（任何计划）的任务，用 `--after <repository>/<task>` 指任何已注册仓库的任务。在它所跟随的每个任务都合并之前，该任务一直被阻塞，无论那些任务在哪里，它的 note 会说明它在等什么（对另一个仓库是 `waiting for operad/T-0188`）。被指名的任务必须存在，任务不能跟随自己，也不能构成环。

`operad plan add` 和 `operad task add` 接受 `--flow <name>`，取该仓库 `.operad/dev.json` 定义的 flow 之一。没有 `--flow` 的任务采用它所在计划的 flow，没有 flow 的计划采用 `default`。`operad task update <id> --flow <name>` 只能在任务的第一次 attempt 之前更改它的 flow；之后该命令会拒绝。flow 在 dev.json 中没有定义的任务保持 ready，它的行和它所在计划的行显示 `flow <name> is not defined in .operad/dev.json`。当仓库定义了不止一个 flow 时，任务行的 note 和 Brief section 会写出任务的 flow，History 会在每个 run 开始处写出 flow。

`badge` 是客户端原样显示的一小段文本，放在 state 之后：一行，最多 16 个字符，否则该行是错误行。`dev` 插件把任务的 badge 设为 `#<attempt>`（第一次 attempt 之前为 `#0`），并根据阶段、attempt 已到达的 step 和调度器记录的 hold 来标记它的任务和计划。`operad list` 和 `operad show` 的前几行会在 state 之后打印行的 badge；没有 badge 的行与没有 badge 功能时的打印相同。

## 链接 {#links}

对象链接是 `operad://objects/<id>`，其中 `<id>` 是 `get` 所接受的对象形式，即 `<type>:<id>` 并做 URL 编码：`item:a b/c` 是 `operad://objects/item%3Aa%20b%2Fc`。`GET /v1/objects/<id>` 和每个 pending 项都以 `link` 带有它，通知命令则以 `OPERAD_LINK` 得到它。在 app 中打开它会显示该对象。顺着链接的路径（`/v1/objects/<the part after objects/>`）能找到同一个对象。

## 事件 {#events}

`GET /v1/events` 以 server-sent events 流式发送。每个事件是一个发生了变化的对象：

```text
id: 3f9c2a1b7d4e5f60-7
data: {"id":"T-0019-http-api"}

```

`id:` 是不透明的字符串。它在每个事件上都会变化，并以进程在启动时选定的一个值开头，因此来自更早 `serve` 的 id 不可恢复。带着 `Last-Event-ID` 重新连接的客户端会收到它错过的事件。当该 id 比服务器仍保留的更旧，或来自更早的 `serve` 时，服务器改发一个 `reset` 事件；客户端随后重新获取列表和已打开的 section。没有变化时，注释行让流保持打开。停止读取的客户端，在其积压达到恢复窗口的大小时会被断开；它重新连接后会得到 `reset`。

## 错误 {#errors}

每个错误体都是：

```json
{ "error": { "kind": "not-found", "message": "no object \"T-1\"" } }
```

| 状态 | 何时 |
|---|---|
| `400` | 参数错误、未知的 filter、格式错误的 cursor，或有歧义的 id。 |
| `401` | 缺少 bearer token 或 token 错误。 |
| `404` | 没有这个对象、section 或 action，或没有这个 endpoint。 |
| `409` | action 现在不可用、需要确认，或它的插件未加载。 |
| `405` | endpoint 存在，但不支持该 method；消息体为 `this endpoint takes GET` 或 `this endpoint takes POST`。 |
| `413` | 请求体大于 1 MiB，或上传大于 20 MB。 |
| `422` | action 的插件拒绝了它；`message` 是插件自己的消息。 |
| `504` | section 没有在规定时间内加载。 |
| `500` | 其他情况；消息体不带 stack trace。 |

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
| `http` | 对象 | `{ "enabled": true, "port": 8765, "listen": ["127.0.0.1"] }` | an object with the keys below; a missing section means these defaults | At every command start; `serve` binds when it starts and after a reload | Refused: `http: must be an object` |
| `http.enabled` | 布尔值 | `true` | `true` 或 `false` | `serve` 启动时；重新加载后按新值开启或关闭接口 | 被拒绝：`http.enabled: must be a boolean` |
| `http.port` | 整数 | `8765` | `0` 到 `65535`；`0` 表示向系统要一个端口 | `serve` 绑定时；重新加载后绑定新端口 | 被拒绝：`http.port: must be an integer from 0 to 65535` |
| `http.listen` | 字符串数组 | `["127.0.0.1"]` | 至少一个非空的 IP 字面量：loopback、RFC 1918、link-local 或 Tailscale；通配地址和其他所有地址都被拒绝 | `serve` 绑定时；重新加载后绑定新地址 | 被拒绝：`http.listen: must be an array of IP addresses`、`http.listen: needs at least one address`、`http.listen: "<address>" is not an IP address`、`http.listen: "<address>" is a wildcard address; name each address to listen on`，或 `http.listen: "<address>" is not a loopback, private, link-local or Tailscale address` |

`http` 内的未知键会被忽略；只读取上面的键。`listen` 的每一项都是 IP 字面量。`serve` 接受 loopback 地址、RFC 1918 地址（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）、link-local 地址（`169.254.0.0/16`、`fe80::/10`）或 Tailscale 地址（`100.64.0.0/10`、`fd7a:115c:a1e0::/48`）。它在打开端口之前就拒绝通配地址（`0.0.0.0` 或 `::`）和其他所有地址，并指出是哪一项。默认只监听本机。没有 `http` 段的配置表示 `enabled` 为 true、端口为 `8765`、`listen` 为 `["127.0.0.1"]`。有 `http` 段但没有 `enabled` 时，接口会开启，监听 `listen` 中的地址。`listen` 中的 Tailscale 地址可以服务接受普通 HTTP 的客户端；手机 app 不接受，所以通过 Tailscale 时它需要 `tailscale serve` 给出的 HTTPS 名称（见 [Tailscale](tailscale.md)）。

`http.enabled` 为 true（默认）时，第一次 `operad serve` 会创建一个 bearer token，即 32 个随机字节的 base64url 编码，保存在 `secrets/http.json`。每个请求都必须带 `Authorization: Bearer <token>`；没有它，或 token 不是当前的，请求会得到 `401`。`operad http token rotate` 立即替换 token：运行中的 `serve` 从该命令返回的那一刻起拒绝旧 token，并结束用它打开的事件流。没有任何 endpoint 会显示 token。

客户端在 `X-Operad-Client` 头中给自己命名，这是一个小写单词，最多 32 个字母、数字、`-` 或 `_`（`ios`、`tui`）。它在 chat 中发送的消息会被记录，并显示为“via”该名称。没有该头，或值不是这样的单词，会被记录为 `http`；绝不会记录为 `cli`。

`serve` 为每个监听的地址打印一行：

```text
http http://127.0.0.1:8765
```

对已经有一个 operad serve 的 home，再启动第二个 `operad serve` 会在读取 store 或打开端口之前以退出码 4 退出。

## Endpoint {#endpoints}

所有 endpoint 都在 `/v1` 之下。除非 endpoint 另有说明，响应都是 JSON。路径中的对象 id 要做 URL 编码；`<id>` 可以是裸 id，也可以是 `<type>:<id>`。

| 方法和路径 | 返回内容 |
|---|---|
| `GET /v1/types` | `{ "types": [{ "type": "task", "title": "Task", "plugin": "dev" }] }`：有视图的对象类型、它们的显示名，以及各自所属插件的名称（客户端按它给类型分组）。给自己的列表命名的插件（`dev` 把它命名为 `Projects`）还会在它的每个类型上发送 `"pluginTitle"`，客户端用它作为该插件 tab 的标题；没有它时客户端显示插件的名称。声明了 filter 的类型还带有 `"filters"`，按显示顺序排列（`[{ "name": "active", "states": ["proposed", ...] }, { "name": "all" }, ...]`），以及 `"defaultFilter"`。没有 filter 的类型两者都没有。声明了 `objectsUnderSettings` 的插件，其每个类型还带有 `"settings": true`：这样的插件没有自己的 tab，它的顶层对象归在 settings 之下。 |
| `GET /v1/keys` | `{ "keys": [{ "key": "m", "action": "dev:merge", "source": "plugin" }] }`：当前生效的键绑定，即插件的默认值加上用户 `keys.json` 的覆盖；覆盖项的 `source` 为 `user`。 |
| `GET /v1/objects?type=<type>&filter=<name>&cursor=<c>`（还有 `root` 和 `parent=<id>`，见 [Levels](cli.md#levels)） | `{ "rows": [...], "next": "<c>", "hidden": 3 }`：列表的一页。`rows` 带有插件给出的 `id`、`title`、`state`，以及可选的 `note`、`wait`、`mark` 和 `badge`（见[行标记](#row-marks)），另有 `waiting` 和 `running`；错误行还带有 `error`。`filter` 只保留指定 filter 显示的行，`hidden` 是该类型中被它排除的行数（整个类型，而不只是这一页）。没有 `filter` 时，若类型有 filter，则应用类型的默认 filter；没有 filter 的类型列出每一行，也没有 `hidden`。`filter=all` 列出每一行，没有 `hidden`。未知名称会得到 `400`，并列出允许的名称。`next` 在过滤后的列表内翻页。 |
| `GET /v1/pending` | 与 `operad pending` 相同的列表，附上每一项提供的 action。问题带有 `waitId`，即答复所引用的 id，还可以带有 `choiceInfo`，它以选项为键，含可选的 `label`、`hint`、`role` 和 `note`。agent 以表单形式提出的问题（chat 的 agent 提出一个或多个问题）还带有 `questions`：`[{ "id", "text", "body"?, "header"?, "choices"?: [{ "label", "description"? }], "multiple"?, "freeText"? }]`。它的回答用 `id` 指明问题；`multiple` 表示可以选不止一个 label，`freeText` 表示用户可以用自己的话回答。问题还可以带有 `body`，即放不进其 text 的较长 Markdown。plan review 是只有一个问题的表单：它的 `text` 是计划的标题，`body` 是计划的 Markdown，`choices` 是 `Approve` 和 `Request changes`。表单没有自己的 `choices`：当它恰好只有一个带选项的问题，且不接受多个 label 时，`choices` 带有该问题的 label，这样画不出表单的客户端仍然可以回答它。插件即将自动回答的 wait（dev：处于 auto merge 的计划中，某个任务通过了评审）不会列出，因此计数不会闪烁；如果自动回答没有到来，它才会被列出。插件在没有 run 在等待时提出的项（`kind` 为 `standing`，没有 action，`runId` 为 `<plugin>:<id>`）也在列表中，插件不再报告它时它就消失。与某个对象有关的项还带有 `object`（`<type>:<id>`）、它的 `link` 和 `row`：row 与 `GET /v1/objects?type=…` 为该对象返回的行相同（`id`、`title`、`state`，可选的 `note`、`mark`、`badge`、`waiting`、`running`），因此客户端不必逐个读取对象。当无法构造该行时（对象已不存在、没有已加载的插件显示它的类型，或插件的行出错），该项带有列表对坏行显示的错误行，`state` 为 `error`，并带 `error` 消息；列表本身绝不会因一个对象而失败。candidate 没有对象，也没有 `row`。`operad pending` 在每个有标题的行下面打印该行的标题。 |
| `GET /v1/running` | 与 `operad running` 相同的列表。每一项有 `runId`、`flow`、`step`、`stepLabel`、`queued`、`startedAt` 和 `elapsedMs`（run 的存在时长），以及：`object`，即行和 `operad show` 所用的对象 id（例如 `operad/T-0048-type-filters`），没有对象的 run 为 `null`；`title`，该对象的行标题，没有对象或查找失败时为 `null`（查找失败绝不会让列表失败）；`stepStartedAt` 和 `stepElapsedMs`，即当前 step 的当前 attempt 何时开始、已运行多久（第一个 step 之前为 `null`）；`mark`，对象的行标记（[行标记](#row-marks)之一），行没有标记或无法构造时省略。step 的时间在 step 变化和新 attempt 开始时重新计时。 |
| `GET /v1/objects/<id>` | `{ "id", "type", "link", "row", "sections", "actions", "skills"? }`：打开该对象的链接、行、section 目录，以及当前可用的 action，附带它们的 `args` schema、`note` 字段、`confirm` 标志，以及当 chat 可以在 `/` 之后运行它时的 `command` 描述。chat 在它的 action 旁边还带有 `skills: [{ "name", "description"? }]`，这样一个请求就给出命令和 skill：每一个都是 chat 可以用 `/name` 输入的 skill，描述取自它的 `SKILL.md`，截到菜单的长度；文件读不到的 skill 会被省略。名称同时也是命令的 skill 不会作为 skill 运行：`/name` 运行的是命令。chat 的最后一条已完成的回复报告了 context 时，它还带有 `context: { "used", "window"?, "model"? }`：`used` 是最后一次 model 调用的 input 加上 cache read 和 cache write，`window` 是已知时该 model 的 context window，`model` 是已知时作答的 model。新的 session 在下一条回复之前不带 `context`。最新的 run 已经结束的对象还带有 `lastRun`：`{ "outcome": "done" | "failed" | "cancelled", "reason"?, "endedAt" }`，它读自 run 的结束记录，而不是 History 的文本。`reason` 是 run 结束时记录的那一行，对没有记录原因的失败，则是失败的 step 的消息；两者都没有时省略；`endedAt` 是自 epoch 起的毫秒数。没有 run 的对象，或最新的 run 仍在进行的对象，没有 `lastRun`。它不是行的一部分。 |
| `GET /v1/objects/<id>/sections/<section>?cursor=<c>&full=<bool>&after=<mark>` | `{ "markdown": "...", "next": "<c>", "mark": "<m>", "tail": "..." }`。section 还可以带有 `data`，即插件为它的客户端定义的对象，每次读取都带，包括带 `after` 的读取。chat 的 `transcript` 还带有来自最后一条已完成回复的 `context: { "used", "window"?, "model"? }`，与对象视图一样，每次读取都带，包括带 `after` 的读取；带有 `data.queued` 和 `data.queuedCount`，即已发送但尚未被 run 接收的消息，按发送顺序排列，每条有 `id`、`text`、`at` 和 `attachments`；还带有 `data.replies`，即每条回复在 Markdown 之外的结构化形式（见 [chat 的回复](#a-chats-replies)）。`data.replies` 跟随读取的窗口：一页带有该页上的回复，带 `after` 的读取带有该 mark 之后完成的回复和仍在运行的那一条，`tail` 事件带有正在运行的回复。`full=true` 跳过大小上限。`mark` 是已完成内容所到的不透明位置，`tail` 是仍在变化的部分的 Markdown；不使用它们的插件两者都不发送。带上前一次读取得到的 `after=<mark>` 时，`markdown` 只包含该 mark 之后已完成的内容；此时答复还带有 `delta`：只有那一部分时为 true；插件答复的是整页、客户端必须替换而不是追加时为 false。大小上限同时涵盖 `markdown`、`tail` 和插件的 `data`，但绝不截断 `tail`：chat 先截掉 `data.replies` 中的工具输出文本，保留它的行数并设置 `truncated`，之后才缩短 `markdown`；连 tail、data 和截断说明也放不下时，调用会被拒绝，并给出提到 `--full` 的超限消息。来自其他 section 或对象的 mark 会以 `400` 被拒绝。 |
| `POST /v1/act` | 运行一个 action。请求体是 `{ "action": "plugin:action", "id": "<id>", "args": {...}, "note": "...", "confirmed": true }`；只有 `action` 始终必需，针对对象的 action 还需要 `id`。带 `confirm: true` 的 action 需要 `"confirmed": true`。请求体最大 1 MiB；更大的会得到 `413`，消息为 `the request body is larger than the 1 MB limit`。action 的 schema 中以 `"format": "file"` 声明的参数（一个字符串，或字符串列表）接受上传的 `ref`；action 以文件存放的路径运行。 |
| `POST /v1/commands` | 像 `operad <plugin> <verb>` 一样运行一个插件 verb。请求体是 `{ "plugin": "cron", "verb": "routines", "args": ["list", "--json"], "input": "..." }`；`plugin` 和 `verb` 必需，`args` 是字符串数组，`input` 是命令从 stdin 读取的文本。答复是 `{ "plugin", "verb", "value" }`，其中 `value` 是命令返回的内容。没有已加载的插件声明的 verb 是 `404`；命令拒绝时得到 `422` 和它的原因。routines 命令列出、添加、编辑、暂停、恢复和删除 `triggers.json` 中的 cron 规则；见 [`triggers.json`](config.md#triggersjson)。 |
| `GET /v1/plugins` | `{ "plugins": [{ "name": "dev", "version": "0.4.0", "enabled": true, "origin": "builtin" }] }`：已配置的插件，按配置中的顺序排列，内容与 `operad plugin list` 打印的相同。关闭的或没有加载的插件，其 `version` 为 `null`，命令行在那里打印 `-`。`origin` 对 operad 自带的包是 `builtin`，对 home 的 `config.json` 指定的其他任何插件（一个路径或另一个包）是 `home`；项目的插件不会被加载，所以没有第三个值。已加载的 harness 插件还带有 `signedIn`：它的 agent 能判断用户是否已登录时为 `true` 或 `false`，不能判断时没有该字段（关闭的或不是 harness 的插件也没有）。只暴露是或否；它绝不显示凭据，客户端读取它也不需要 session。已加载的 harness 插件还带有 `models`：`{ "list", "default", "windows"?, "info"? }`。`list` 是 chat 可以选择的 model id，`info` 把一个 id 映射到 `{ "id", "name"?, "provider"?, "window"?, "capabilities"? }`；`capabilities` 是 `vision`、`reasoning`、`tools` 和 `web` 的子集。harness 不知道的字段不出现，绝不猜测；只读 `list` 的客户端仍然可用。已加载的 harness 插件还带有 `accessLevels`：它的 agent 能承载的访问级别（`plan`、`ask`、`edits`、`full`），一个都不能承载时是空列表。客户端在为某个级别的 chat 提供 agent 时，只提供能承载该级别的那些；以 agent 无法承载的级别创建、或改到这样的级别的 chat，会在该请求处被拒绝，并用一句话列出该 agent 能承载的级别。新 chat 的默认 agent 是第一个能承载该 chat 起始级别的已加载 agent。 |
| `POST /v1/plugins` | 开启或关闭一个插件，或从 npm 安装一个插件。切换时，请求体是 `{ "name": "<plugin>", "enabled": true, "confirmed"?: true }`；`name` 和 `enabled` 必需。安装时，请求体是 `{ "install": "<package>[@version]", "confirmed": true }`；答复是 `{ "plugin": { ... } }`，即处于关闭状态的新条目。见[插件](#plugins)。 |
| `GET /v1/plugins/<name>/setup` | `{ "setup": { "plugin", "enabled", "missing": [{ "name", "description" }] } }`：插件自己的检查发现尚未设置好的内容，供客户端在该插件的页面上使用。关闭的插件只答复 `enable` 这一项（不运行它的检查）。插件带有 setup guide 时，它在 `GET /v1/plugins` 中的行带有 `"guide": true`，客户端据此在它上面放一个 Setup <name> 按钮（bot 的 `setup` action，带 `plugin`）。guide 本身的文本绝不在答复中。没有 guide 的插件答复 `404`。 |
| `GET /v1/settings?scope=<scope>` | 列出用户可以调整的设置：`{ "settings": [{ "name", "scope", "value", "default", "title", "description", "type", "enum", "editable", "confirm" }] }`。没有 `scope` 时，列出全局设置和每个仓库 scope；一个 scope 指定一个仓库。在某个 scope 中无法读取的设置会被省略。 |
| `POST /v1/settings` | 修改一项设置。请求体是 `{ "name": "<plugin>.<path>", "value": <any>, "scope"?: "<repo>", "confirmed"?: true }`；`name` 和 `value` 必需，`value` 可以是 `null`。答复是改动后的设置，形状与上面的一项相同。未知的设置名是 `404`；schema 拒绝的值是 `422`，并附原因；不可编辑的设置，或要求确认却没有 `confirmed` 的设置，是 `409`。 |
| `POST /v1/uploads?name=<file name>` | 为 action 的文件参数上传文件。请求体就是文件本身，以流的方式发送；它的 `content-type` 头会保留为文件的类型。答复是 `201` 和 `{ "ref", "name", "type", "size" }`。大于 20 MB 的文件得到 `413` 和指出该上限的消息。`ref` 只能用一次：接收它的 action 把文件移到目标对象在 operad home 下的附件目录（`attachments/<type>/<id>/`），再次使用会以 `400` 被拒绝。一小时内没有 action 取用的上传会被删除。 |
| `GET /v1/attachments/<type>/<id>/<ref>/<name>` | 提供 action 文件参数所存的文件，类型取自上传时给出的类型。chat 的 transcript 把它的附件链接到这里，回复中工具的 `output.url` 也指向这里。对 chat，这个路由只提供该 chat 的某条记录指明的文件，即消息附件或某次工具调用的完整输出；它们旁边没有任何记录指明的文件、离开该 chat 目录的路径，以及其他 chat 的文件，都是 `404`。 |
| `POST /v1/answer` | 回答 pending 项中一个未决的问题。请求体是 `{ "runId": "<item runId>", "waitId": "<item waitId>", "choice"?: "<one of the item's choices>", "answers"?: [{ "id", "choices"?: ["<label>"], "text"? , "skipped"?: true }], "note": "...", "confirmed": true }`；`runId`、`waitId` 以及 `choice` 或 `answers` 必需，`note` 和 `confirmed` 可选。`answers` 填写表单：每个问题一项，带所选的 label、用户自己的文本，或 `skipped`；省略的问题算作跳过，必答问题缺少的回答不会被凭空补上。`choice` 回答一个提供选项的问题；对只有一个问题的表单，它也是该问题的回答。`note` 是用户对整个问题或表单的 note；plan review 的 `Request changes` 在其中写明要改什么。服务器在记录任何内容之前，先对照表单检查每个回答。当每个选项同时也是该项对象上的 action（`dev` 的 wait）时，它运行该 action，因此适用该 action 的 note 和确认；需要确认的 action 与 `/v1/act` 一样需要 `"confirmed": true`。对已关闭的问题作答会得到 `409`，且不会被应用。 |
| `GET /v1/events` | 变更的 SSE 流。 |

不针对任何对象的 action 发送时不带 `id`。`dev:repo-add` 就是一个：它在 serve 所在的机器上注册一个仓库，给出该仓库在那台机器上的 `path`，与 `operad dev repo add <path>` 完全一样；见[从客户端添加仓库](dev.md#adding-a-repository-from-a-client)。

```json
{ "action": "dev:repo-add", "args": { "path": "/srv/operad" }, "confirmed": true }
```

action 的 `args` 可以带有 JSON Schema 条件，用一个字段来限定另一个字段：`allOf` 持有 `{ "if": { "properties": { "agent": { "const": "claude" } }, "required": ["agent"] }, "then": { "properties": { "model": { "enum": [...], "default": "..." }, "effort": { ... } } } }`，每个 agent 一条。新建 chat 的 action（`bot:chat`、`dev:chat`）使用它：顶层的 `model` 和 `effort` enum 列出每个已加载 agent 的选项（只读这些的客户端仍然可用），所选 agent 的 `then` 持有该 agent 采用的列表和默认值（该 agent 列出了 bot 配置的 model 或 effort 时取配置值，否则取 agent 的默认值）。没有列出 model 或 effort 的 agent，其 `then` 中没有 `model` 或 `effort`：不能为它选择。客户端显示所选 agent 的 enum 和默认值，在选定 agent 之前回退到顶层的值。服务器检查请求时不计算这些条件；它按名称拒绝 agent 没有列出的 model 或 effort。

`model` 参数在它的 `enum` 旁边还带有 `info`，以 model id 为键：与插件列表给出的相同的 `name`、`provider`、`window` 和 `capabilities`，涵盖该参数提供其列表的那些 agent 的 model。`chat:model` 为该 chat 的 agent 带有它。只读 id 的客户端会忽略它。

更改已有值的 action 在该字段上带有 `current`：现在生效的值。`chat:model` 给出该 chat 的 model，否则是它最后一条回复的 model，否则是 agent 配置的 model；`chat:effort` 给出该 chat 选择的 effort，否则是 agent 现在声明的默认值，否则是它开始时的 effort。与开始时相同的 effort 是继承来的，不算一次选择。`current` 不是默认值：现在没有值的字段没有 `current`。

`POST /v1/act` 把调用者记录为 `{ "via": "<client>", "id": "<token label>" }`；除非客户端给自己命了名，`via` 是 `http`，除非 secret store 给出别的名称，token label 是 `operad app`。它记录 action 的方式与命令行相同，运行中的 `operad serve` 会继续 waiting 的 run 所要求的 step。`POST /v1/answer` 以同样的方式记录它的调用者，并按与命令行和插件 action 相同的规则作答。

### 创建计划和任务 {#creating-a-plan-and-a-task}

计划用 `dev:plan` 在仓库上创建；它要求确认。`flow` 是该仓库在 `dev.flowList` 中列出的 flow 之一，缺少 `slug` 时取自标题：

```http
POST /v1/act
{"action":"dev:plan","id":"repo:operad","confirmed":true,"args":{"title":"Tighten the checks","slug":"checks","request":"Make the checks finish sooner.","flow":"quick"}}
```

答复带有 `opens`，值为 `plan:operad/P-0042-checks`。任务用 `dev:task` 在该计划上创建；`after` 指明它所等待的该计划中的任务：

```http
POST /v1/act
{"action":"dev:task","id":"plan:operad/P-0042-checks","args":{"title":"Cache the check","brief":"Cache the check result.","flow":"quick","after":["T-0041-warm-cache"]}}
```

答复带有 `opens`，值为 `task:operad/T-0042-cache-the-check`。这两个 action 运行的代码与 `operad dev plan add` 和 `operad dev task add` 相同，所以拒绝时给出的就是命令的那一行，一字不差。

## 读取 section {#reading-a-section}

`GET /v1/objects/<id>/sections/<section>` 读取一个 section。`cursor` 取前一次读取的 `next`；`full=true`（或 `1`）跳过大小上限。有 `pages` 的 section 还会答复目录，因此客户端可以跳转：第一页没有 cursor，其他每一页带有自己的 cursor。

section 以通用的方式绘制：插件新增的 section（例如 `dev` 中任务的 Review，最新的一轮在最前，带有 `pages`）不需要桌面端或 iOS app 做任何改动，它们本来就能绘制任何 section 的 Markdown 和 `pages`。

live section 还带有 `mark` 和 `tail`。`mark` 是已完成内容的不透明位置；`tail` 是仍在变化的部分的 Markdown（chat 中未完成的回复和思考、正在运行的工具调用，或 agent 正等待重试的 model 请求），每次读取都给出整个 tail。live section 还可以带有 `retry`，即 agent 等待再试一次的 model 请求：`{ "attempt": 2, "maxAttempts": 3, "until": 1767225604000, "reason": "the provider is overloaded" }`。`until` 是下一次尝试开始的时间，为自 epoch 起的毫秒数，客户端据此倒计时；`reason` 是 provider 给出的、经过遮蔽的消息。不认识 `retry` 的客户端会忽略它。`serve` 还会把该 `tail` 作为 `tail` 事件推送到事件流上，这样客户端不必再读一次 section 就能渲染正在运行的回复（见[事件](#events)）。若要追加而不是替换，传入上一次读取的 `after=<mark>`：此时答复的 `markdown` 只包含该 mark 之后已完成的内容，当它只包含这些时 `delta` 为 `true`。无法以 delta 作答的插件答复整页，`delta` 为 `false`；此时客户端替换自己的内容。来自其他 section 或对象的 mark 是 `400`。

大小上限同时涵盖 `markdown`、`tail` 和插件的 `data`，但绝不截断 `tail`。chat 先截掉 `data.replies` 中的工具输出文本，保留它的行数并设置 `truncated`；之后才缩短 `markdown`。连 tail、data 和截断说明也放不下时，调用是 `400`，并提到 `--full`。带 `full=true` 的读取让 data 保持完整。

当 `data.replies` 超出它在上限中所占的份额时，chat 分三轮缩短，每一轮都从最旧的回复开始，逐条回复地向最新的推进。第一轮缩短所有不是答案的内容：thinking、text、工具输入和输入消息（输入消息保留约 200 字节的预览）。然后是答案，从最旧的开始，缩到约 200 字节（两行）的预览，附近有行尾或句末时就在那里截断，绝不截在一个字符中间，并以 `…` 结尾。只有当每条回复都已是这个预览而页面仍然超出份额时，chat 才会缩到预览以下，然后丢掉最旧的回复，所以每条较旧的回复都尽可能久地保留它答案的开头，而最新的回复和正在运行的回复保持完整最久。每段被缩短的文本都在它的块或条目上带有 `"cut": true`（输入或答案消息、thinking 或 text 条目、就其 `input` 而言的工具条目）。要完整读取被截断的回复，用 `full=true` 再读同一页（相同的 `cursor`，第一页则不带）；在 `after` 读取或 `tail` 事件中被截断的回复，由包含它的那一页的 `full=true` 读取完整读出：那次读取带有完整的每段文本，没有 `cut`。

### chat 的回复 {#a-chats-replies}

chat 的 `transcript` 在它的 Markdown 之外带有 `data.replies`。它的窗口就是读取的窗口：按页读取带有该页上的回复；带 `after` 的读取带有回答在该 mark 之后的回复和仍在运行的那一条；推送的 `tail` 事件带有正在运行的回复。客户端按 `runId` 合并：按页读取用该页的回复替换它所绘制的回复，而 `after` 读取或 `tail` 事件替换已有 `runId` 的那一块，并添加新的。只读 Markdown 的客户端仍然可用。每一项是一条回复：它的输入、它的过程，以及完成之后它的回答：

```json
{
  "runId": "run-1",
  "input": [{ "id": "m-1", "text": "hello", "at": 1700000000000 }],
  "process": [
    {
      "categories": ["read", "run"],
      "items": [
        { "kind": "thinking", "text": "look first", "at": 1700000000001 },
        { "kind": "text", "text": "I will look.", "at": 1700000000002 },
        {
          "kind": "tool",
          "callId": "t1",
          "name": "Bash",
          "input": "ls",
          "at": 1700000000003,
          "durationMs": 1500,
          "failed": false,
          "result": "done",
          "output": { "text": "a.txt\n", "lines": 1 }
        }
      ]
    }
  ],
  "answer": { "id": "m-2", "text": "final answer", "at": 1700000000004 },
  "durationMs": 1234
}
```

`input` 和 `answer` 是消息块 `{ id, text, at }`。仍在书写的回复没有 `answer`；已完成的回复在它的 agent 报告了计时时带有 `durationMs`。`process` 按时间顺序持有输入和回答之间的思考、中间文本和工具调用。回复在书写过程中接收的消息会结束一个过程组，并开始下一个。每个组带有 `categories`，即 `read`、`edit`、`run`、`search` 和 `other` 这些 id，表示它的工具做了什么，按首次使用的顺序排列；措辞由客户端决定。

思考或文本项是 `{ kind, text, at? }`。工具项是 `{ kind: "tool", callId, name, input, at?, durationMs?, failed, result?, output }`。`at` 是工具调用开始的时间。调用仍在运行时没有 `durationMs` 和 `result`。只有结果为 `failed` 时 `failed` 才为 true；其他结果是 `done`、`blocked` 和 `denied`。`output` 是 `{ text, lines, url?, truncated? }`：`text` 是记录下来的输出（最多前 4 KB），`lines` 是它的行数，`url` 是输出超过 4 KB 时通过本接口提供完整输出的 `/v1/attachments/...` 地址，`truncated` 表示那个文件比 `text` 的内容更多。回复绝不带该文件在 serve 机器上的本地路径。大小上限截掉输出时，`text` 为空，`lines` 保留它的计数，`truncated` 为 `true`；完整读取让文本保持完整。客户端显示前几行，折叠其余部分，并用 `url` 获取全部内容；变更文件卡片和 diff 不属于这个形状。

### wiki 的文件夹和笔记 {#a-wikis-folders-and-notes}

memory 插件把 wiki 作为两种只读的对象类型提供：`wiki`（标题 **Wiki**）表示文件夹，`note`（标题 **Note**）表示 Markdown 笔记。两者都没有 action。它们的行遵循通常的层级：带 `root`（或不带 parent）的列表显示 wiki 根目录的文件夹和笔记，`parent=<folder id>` 列出一个文件夹的子文件夹和笔记。文件夹行的 `note` 是它之下有多少笔记，包括子文件夹中的；笔记行的 `note` 是它的修改时间，当它的 frontmatter 写着 `untrusted: true` 时，后面跟 `(untrusted)`。行没有 `mark`。

笔记有一个 `content` section（标题 **Note**），内容是它的 Markdown 正文，只有在其他笔记链接到它时才有 `backlinks` section（标题 **Backlinks**）。`content` 与任何长 section 一样用 `pages` 和 `next` 分页。它的 `data` 是 `{ "links": [{ "target", "heading"?, "kind", "object"? }] }`，即笔记中按顺序排列的链接：`target` 是原样写出的目标，`kind` 是 `wikilink` 或 `markdown`，`object` 是它解析到的笔记的完整对象 id，没有匹配时省略。客户端用它来跟随 `[[links]]` 和相对的 Markdown 链接；Markdown 本身不变。

`backlinks` section 的 Markdown 是每个链接过来的笔记一条列表项，已经链接为 `operad://objects/<id>`，带它的行号和摘录。它的 `data` 是 `{ "backlinks": [{ "object", "path", "title", "target", "heading"?, "kind",
"line", "excerpt", "untrusted" }] }`。wiki 之外的路径会被拒绝，不存在的笔记是 `not-found`。

## 设置 {#settings}

`GET /v1/settings?scope=<scope>` 读取设置，方式与 `operad settings` 相同。没有 `scope` 时返回全局设置和每个仓库 scope；有 scope 时返回一个仓库的设置。每一项有 `name`、`title`、`scope`、`value`、`default`、`description`、`type`、`enum`（有则带）、`editable` 和 `confirm`。没有 `value` 表示该设置未设置。

`POST /v1/settings` 修改一项。请求体是 `{ "name": "<plugin>.<path>", "value": <any>, "scope"?: "<repo>", "confirmed"?: true }`。`name` 和 `value` 必需；`value` 可以是 `null`。答复是改动后的那一项。不是设置的名称是 `404`；schema 拒绝的值是 `422`，附 schema 给出的原因；只读的设置，或要求确认却没有收到 `confirmed` 的设置，是 `409`。成功的修改以原子方式写入文件，并保留其他所有键。

对于持有 map 或对象且可编辑的设置（`bot.bots`），`name` 可以更深一层：`bot.bots.<name>` 设置一个条目，`bot.bots.<name>.<field>` 设置它的一个字段。服务器在同一把锁下读取文件并写入该条目，所以其他客户端在此期间改动的条目会被保留；写入整个 map 的客户端会覆盖它，所以请优先使用更深的名称。值按该条目的 schema 检查，并适用父设置的 `editable` 和 `confirm` 规则。schema 中没有对应条目的路径是 `404`。更深名称上的 `null` 值会删除该条目或字段。

仓库的 flow 也是设置。`dev.flows`（scope：该仓库）可编辑，可以整体编辑，也可以按名称编辑（`dev.flows.<name>`，`null` 删除一个），`dev` 在写入之前会按将要写入的样子检查整个 `dev.json`：schema、flow 的两条硬性规则，以及没有哪个 flow 的名称同时也是仓库 `.operad/flows` 中某个 TypeScript flow 的名称（原因写作 `flow "<name>" is defined in dev.json and in .operad/flows/<name>.flow.ts; keep one`）。`dev` 拒绝的修改是 `422`，附 `dev` 自己的原因，一字不差，并且不写入任何内容；客户端不必重复这些规则。`dev.flowList` 是只读设置，它的值列出仓库的每个 flow，包括 TypeScript 的：`[{ "name", "source": "dev.json" | "typescript" | "built-in",
"stages"?, "steps"?, "refused"? }]`。`dev.json` 的 flow 和内置的 `default` 带有它们的 `stages`；内置 default 的 stage 带有仓库的 `worker`、`reviewer` 和 `gate` 设置。TypeScript flow 带有 `dev` 加载该文件时读到的 `steps`（`id`、`kind`、`use`），文件违反规则时则带有 `refused` 和 `dev` 的原因。TypeScript flow 仍然保存为文件。`dev.json` 完全读不了时，列表保留一个 `dev.json` 条目，它的 `refused` 就是原因，与 TypeScript flow 和内置 flow 并列。

## 插件 {#plugins}

`GET /v1/plugins` 列出 home 的 `config.json` 指定的插件，与 `operad plugin list` 一样；它每次调用都读取该文件，所以命令行或手工做的修改会立刻显示。它还带有 `progress`：插件正在启用时，其包安装打印的最新一行。正在启用的插件即使 `config.json` 尚未指定它也会被列出，带 `"version": null` 和 `"enabled": false`；安装结束时这一行消失，下一次列表显示切换后的条目。安装失败时，切换请求的答复是它的原因；说包无法下载的那一行指的是网络问题，再次发送同样的请求就会重试。

已加载的 harness 插件还会答复 `signedIn`，这样 Agents 页面不必启动 session 就能显示一个已安装但未登录的 agent。`claude` 读取 `claude auth status`（短时间内保留结果），`pi` 和 `radian` 读取它们自己的凭据文件来判断有没有凭据，绝不读取 secret，`codex` 读取 `codex login status`。答复是 `true`、`false`，或在 harness 无法判断时没有该字段；命令不存在、文件无法读取或插件已关闭，都没有该字段。没有任何 endpoint 会显示凭据。

同一个列表带有每个已加载 harness 的 `models`，每个 model 的 id 旁边有它的描述：`name`、`provider`、已知时的 context `window`，以及它确实知道的 `capabilities`。客户端按 `provider` 给 model 分组、搜索它们，并为 `vision`、`reasoning`、`tools` 和 `web` 绘制徽标。客户端可以把搜索标为 `Search models`，把徽标标为 `Vision`、`Reasoning`、`Tools` 和 `Web`；服务器发送的是数据，不是这些文本。

`POST /v1/plugins` 在同一个文件上做 `operad plugin enable <name>` 和 `operad plugin disable <name>` 所做的事：它设置 `plugins.<name>.enabled`，并保留其他所有键。启用 `dev` 也会启用 `pool` 和 `shell`，与命令一样。启用文件中没有列出的自带插件会添加它，启用 `claude` 会先把它的包安装到 home 中，与命令一样。启用 `pi` 时，如果 `PATH` 中没有 `pi`，会把 operad 自己锁定版本的 pi 安装到 home 中，否则使用 `PATH` 上的那个。拒绝的情形与命令行相同，措辞也相同：

| 状态 | 何时 |
|---|---|
| `404` | `plugins.<name>: no such plugin`：该名称不在文件中，也不是自带的可选插件。 |
| `409` | `cannot disable "<name>": run "<run>" (<step>) is active`：有 run 在使用该插件的某个 step，相当于命令行上的退出码 `3`。 |
| `409` | 不带 `"confirmed": true` 的关闭。命令行没有这一步；在这里，手机上的一次点按就可能为所有客户端关掉一个插件的命令、action 和自动工作，所以客户端要表明它是有意的。开启插件从不询问。run 的检查在先，所以正在使用的插件得到的是 run 的原因，而不是确认。 |
| `400` | 请求体缺少 `name`，`enabled` 不是 true 或 false，或 `confirmed` 不是布尔值。 |

带 `{ "install": "<package>[@version]", "confirmed": true }` 的 `POST /v1/plugins` 做 `operad plugin add` 所做的事：它把包安装到 home 的插件目录，关闭其安装脚本，运行检查，并把它以关闭状态加入 `config.json`。`<package>` 是合法的 npm 名称，带确切的 `@version`，或不带版本表示最新版。答复是 `{ "plugin": { ... } }`，即带 `"enabled": false` 的新条目。安装需要 `"confirmed": true`，因为它改变 home 能加载的内容，并安装来自 home 之外的代码。拒绝的情形与命令行相同，措辞也相同：

| 状态 | 何时 |
|---|---|
| `409` | 不带 `"confirmed": true` 的安装。 |
| `400` | `install` 不是非空的包名，或者包名或版本不是合法的 npm 语法。 |
| `422` | 包无法安装、它的默认导出不是插件声明、它声明的名称已经配置过，或它的入口需要一个没有运行的安装脚本。 |

修改在下一次加载时生效，与命令行一样：下一条 `operad` 命令，或 `serve` 的下一次加载。答复立刻显示新的 `enabled`，但运行中的 `serve` 仍然持有它加载时的插件。`serve` 监视 `config.json`，文件安静片刻之后它会自行重新加载，并在自己的输出中说明（`reloading: ...`）。没有任何字段或事件表示即将重新加载；客户端看到的重新加载是它的事件流结束并重连，随后它重新读取列表（见[事件](#events)）。

与 `POST /v1/act` 一样，切换会连同调用者 `{ "via": "<client>", "id": "<token label>" }` 一起被记录：作为 run 日志中的一个事件，以及 `serve` 日志中的一行：`http: plugin "dev" disabled via tui as operad app`。拒绝会连同它的状态码写入日志。与每个 endpoint 一样，这里也需要 bearer token。

## 行标记 {#row-marks}

插件的 `row` 除了 `id`、`title`、`state` 和 `note` 之外，还可以返回 `mark` 和 `badge`。`GET /v1/objects`、`GET /v1/objects/<id>`、pending 项的行，以及 MCP 的 `list` 和 `show` 结果都原样传递它们。

行还可以带有 `wait`：对象为何在等待，是一段单独的文本，与 `note` 分开（dev 把同样的文本放进两者，因此 note 的读法不变）。想把 wait 单独放在一行的客户端读取 `wait`，而不是按 ` · ` 拆分 note；当 wait 文本本身含有 ` · ` 时，拆分会出错。它是协议字段；不在等待任何东西的行没有 `wait`。`operad show --json` 以及 HTTP 和 MCP 的行都包含它。

`mark` 说明对象正在做什么，图标和颜色由客户端选择。它是下面 17 个值之一，kernel 会把任何其他值变成错误行，并列出这些值：

| 标记 | 含义 | TUI |
|---|---|---|
| `todo` | 未开始 | `○` |
| `blocked` | 等待另一个对象或被保留的区域 | `◌` |
| `retry_wait` | 等待重试时间 | `⋯` |
| `paused` | 已暂停 | `‖` |
| `proposed` | 已建议，尚未接受 | `+` |
| `starting` | 正在设置 | `◔` |
| `running` | 工作进行中 | `⊙` |
| `reconciling` | 正在与别处的变更对齐 | `↕` |
| `checking` | 正在验证或评审 | `◎` |
| `rework_pending` | 正在询问是否重做 | `↩` |
| `waiting` | 等待用户 | `●` |
| `integrating` | 正在合并 | `↔` |
| `ready_to_merge` | 已检查，等待合并 | `◉` |
| `done` | 已完成 | `✓` |
| `failed` | 已放弃 | `✗` |
| `cancelled` | 已取消 | `⊘` |
| `broken` | 无法使用 | `!` |

kernel 的 `waiting` 和 `running` 标志保持不变。客户端按这个顺序选择绘制内容：错误行绘制错误；当 `waiting` 为 true 时，`mark` 为 `waiting`、`proposed`、`rework_pending` 或 `ready_to_merge` 则保留它，其他任何 mark（或没有 mark）绘制 `waiting`；当 `waiting` 为 false 时，有 mark 就绘制 `mark`；否则 `running` 为 true 就绘制 `running`；这些都不满足的行是普通行。TUI 按角色给 mark 着色：`proposed`、`rework_pending` 和 `waiting` 用强调色，`starting`、`running`、`reconciling`、`checking` 和 `integrating` 用 run 的颜色，`ready_to_merge` 和 `done` 用成功色，`failed` 和 `broken` 用错误色，其余用弱色。

`after` 列出对象所等待的同级（`parent` 相同的行）的 id，采用行 id 的形式；它是由非空字符串组成的数组，否则该行是错误行。它在 list、get 和 pending 的行中原样传递，`operad list` 和 `operad show` 不打印它。`dev` 插件用任务所等待的任务 id 填写任务的 `after`，按存储的形式给出：其他仓库的任务显示为 `<repository>/<task id>`。

`operad dev task add` 和 `operad dev task update` 用 `--after <task>` 指同一仓库（任何计划）的任务，用 `--after <repository>/<task>` 指任何已注册仓库的任务。在它所跟随的每个任务都合并之前，该任务一直被阻塞，无论那些任务在哪里，它的 note 会说明它在等什么（对另一个仓库是 `waiting for operad/T-0188`）。被指名的任务必须存在，任务不能跟随自己，也不能构成环。

`operad dev plan add` 和 `operad dev task add` 接受 `--flow <name>`，取该仓库 `.operad/dev.json` 定义的 flow 之一。没有 `--flow` 的任务采用它所在计划的 flow，没有 flow 的计划采用 `default`。`operad dev task update <id> --flow <name>` 只能在任务的第一次 attempt 之前更改它的 flow；之后该命令会拒绝。flow 在 dev.json 中没有定义的任务保持 ready，它的行和它所在计划的行显示 `flow <name> is not defined in .operad/dev.json`。当仓库定义了不止一个 flow 时，任务行的 note 和 Brief section 会写出任务的 flow，History 会在每个 run 开始处写出 flow。

`badge` 是客户端原样显示的一小段文本，放在 state 之后：一行，最多 16 个字符，否则该行是错误行。`dev` 插件把任务的 badge 设为 `#<attempt>`（第一次 attempt 之前为 `#0`），并根据阶段、attempt 已到达的 step 和调度器记录的 hold 来标记它的任务和计划。`operad list` 和 `operad show` 的前几行会在 state 之后打印行的 badge；没有 badge 的行与没有 badge 功能时的打印相同。

## 行数据 {#row-data}

行还可以带有 `data`，即插件为它的客户端定义的对象。kernel 在 list、get 和 pending 的行中原样传递它。不认识某个插件的形状的客户端会忽略它。

定时任务是 `bot-routine` 类型的对象（id 为 `RT-0001`，bot 内置的梦境整理则为 `dreaming-<bot>`），列在 `GET /v1/objects/bot-routine`。它的行以定时任务的名称为 `title`，以 bot 的名称为 `note`，`parent` 为 `bot:<bot>`，`state` 为 `open`、`paused` 或 `removed`（默认列表显示前两种）。它的 `data` 如下，这样编辑表单不必解析页面的 Markdown：

```json
{
  "bot": "default",
  "schedule": "0 8 * * *",
  "prompt": "Collect the day's news.",
  "model": "claude-sonnet",
  "effort": "high",
  "paused": false,
  "builtin": false,
  "nextRun": "2026-01-02T08:00:00.000Z",
  "lastResult": "done",
  "lastSummary": "Collected 12 items.",
  "timeZone": "America/Toronto"
}
```

`schedule` 是一个在 `timeZone`（服务器的 IANA 时区）中运行的 cron 表达式，所以位于其他时区的客户端在用户编辑时预览下一次运行，要用这个时区而不是自己的；`nextRun` 已经是绝对时间。定时任务把 `model` 和 `effort` 留给 bot 决定时，它们为 `null`。`nextRun` 是 ISO 时间，定时任务被暂停或两年内没有下一次运行时为 `null`。`lastResult` 是 `done`、`nothing to report` 或 `failed`，在第一次运行之前或有运行正在进行时为 `null`；`lastSummary` 是回复的简短摘要。对内置的梦境整理，`builtin` 为 `true`，没有 `prompt`、`model` 和 `effort`。

页面的 section 是 `routine`（提示、时间安排和上一次结果），以及最近 30 天内每次运行一个 `run-<id>`，最新的在前，各自带有那次运行的过程和结果。action 是定时任务上的 `bot:edit`（可选的 `schedule`、`prompt`、`model`、`effort`）、`bot:pause`、`bot:resume`、`bot:run-now` 和 `bot:remove`，以及 bot 上的 `bot:schedule-add`，它接受 `name`、`schedule`、`prompt` 和可选的字段；较早的 `bot:schedule-edit`、`bot:schedule-pause`、`bot:schedule-resume`、`bot:schedule-run-now` 和 `bot:schedule-remove` 仍然在 bot 上，接受 `name`。`bot:run-now` 立即运行定时任务一次，不改变它的下一次按时运行；未知的定时任务，或上一次运行仍在回复的定时任务，会以 `422` 和原因被拒绝。bot 行不再带有 `data.scheduled`；它仍然带有 `data.timeZone` 和 `data.followUps`。

bot 行的 `data.followUps` 是该 bot 尚未到期的 follow-up 组成的数组，最早到期的在前，涵盖它所有的 chat。客户端通过匹配 `chatId` 显示某个 chat 自己的 follow-up。每一项是：

```json
{
  "id": "F-1a2b3c4d",
  "chatId": "C-0042",
  "due": "2026-01-02T08:00:00.000Z",
  "text": "Check whether the build passed."
}
```

`due` 是 ISO 时间。用户用 bot 上的 action `bot:follow-up-cancel` 取消一个，参数为 `id`。bot 没有 follow-up 时数组为空。

定时任务的运行不是 chat。它的记录有一个 `R-` id，`state` 为 `run`，所以它既不在打开的 chat 列表中，也不在已关闭的 chat 列表中，客户端只把它显示为定时任务页面的一个 section。这条记录带有 `data.scheduled`（指明它的 bot 和定时任务）以及 `data.run`。人拥有的每个 chat 都没有这两者。

绑定了渠道的 chat 带有 `data.channels`，即渠道名称组成的字符串列表（例如 `telegram:<id>`）；其中有一个以 `telegram:` 开头时，客户端显示 Telegram 徽标。没有绑定的 chat 没有 `data.channels`。

有消息尚未被任何 run 接收的 chat 带有 `data.queued`（按发送顺序）和 `data.queuedCount`；没有排队的消息时两者都没有。每一项是：

```json
{
  "id": "m-6c1f",
  "text": "and then run the tests",
  "at": 1763540000000,
  "attachments": []
}
```

`transcript` section 在每次读取时都带有同样的 `data.queued` 和 `data.queuedCount`。消息在某个 run 以它开始或 agent 在 run 中途接收它之前一直排队；`chat:withdraw` 和 `chat:edit` 只更改排队中的消息，会拒绝已被 run 接收的消息。

## 链接 {#links}

对象链接是 `operad://objects/<id>`，其中 `<id>` 是 `get` 所接受的对象形式，即 `<type>:<id>` 并做 URL 编码：`item:a b/c` 是 `operad://objects/item%3Aa%20b%2Fc`。`GET /v1/objects/<id>` 和每个 pending 项都以 `link` 带有它，通知命令则以 `OPERAD_LINK` 得到它。在 app 中打开它会显示该对象。顺着链接的路径（`/v1/objects/<the part after objects/>`）能找到同一个对象。

## 事件 {#events}

`GET /v1/events` 以 server-sent events 流式发送。每个变更事件是一个发生了变化的对象：

```text
id: 3f9c2a1b7d4e5f60-7
data: {"id":"T-0019-http-api"}

```

插件会推送其变化部分的 live section，还会在同一个流上发送 `tail` 事件，带有与 section 读取返回的相同的 `tail`、`status`、`retry` 和 `data`；chat 的事件在 `data.replies` 中带有它正在运行的回复：

```text
event: tail
data: {"id":"C-0042","type":"chat","section":"transcript","tail":"**Operad Bot:** I am writing","status":{"text":"Thinking","since":1767225600000},"data":{"replies":[{"runId":"run-1","input":[],"process":[]}]}}

```

agent 正在等待的重试也在同样的事件中：

```text
event: tail
data: {"id":"C-0042","type":"chat","section":"transcript","tail":"Retrying the model request (2 of 3): the provider is overloaded","retry":{"attempt":2,"maxAttempts":3,"until":1767225604000,"reason":"the provider is overloaded"}}

```

`tail` 事件没有 `id:`，重连时不会补发：客户端重新读取已打开的 live section，包括它当前的 `tail`、`retry` 和 `data`。不认识 `tail` 的客户端会忽略它，并像以前一样在每个变更事件之后继续读取该 section。客户端按 `runId` 把正在运行的回复合并到它的回复中。

这个流的一行最多可以有 `MAX_SSE_EVENT_BYTES` 个字节，即 65536（64 KiB），包括 `data: ` 前缀。iOS app 本来就会丢弃超过 64 KiB 的行，所以恰好在上限的事件是它能接受的；终端客户端使用同样的行长上限。服务器绝不写出更长的行。`data:` 行会超长的 live 部分既不截断也不推送：改为发送该对象的普通变更事件，带通常的 `id:` 和 `data: {"id":"<id>"}`，按增长窗口发送，即每个对象每 250 毫秒最多一次，客户端在它之后重新读取已打开的 live section。那次 section 读取不是事件，可以带有比一个事件行更长的 `tail`；`full=true` 跳过 section 的大小上限。`packages/engine/test/fixtures/sse/` 中的原始流是客户端测试共用的样本：一个恰好在上限的事件、一个超出一个字节而服务器绝不会发送的事件、一个没有换行的行、一个被拆到多个 chunk 中的帧，以及一次重连后的 reset。

`id:` 是不透明的字符串。它在每个变更事件上都会变化，并以进程在启动时选定的一个值开头，因此来自更早 `serve` 的 id 不可恢复。带着 `Last-Event-ID` 重新连接的客户端会收到它错过的事件。当该 id 比服务器仍保留的更旧，或来自更早的 `serve` 时，服务器改发一个 `reset` 事件；客户端随后重新获取列表和已打开的 section。没有变化时，注释行让流保持打开。停止读取的客户端，在其积压达到恢复窗口的大小时会被断开；它重新连接后会得到 `reset`。

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
| `405` | endpoint 存在，但不支持该 method；消息体为 `this endpoint takes GET` 或 `this endpoint takes POST`。 |
| `409` | action 现在不可用、需要确认，或它的插件未加载。 |
| `413` | 请求体大于 1 MiB，或上传大于 20 MB。 |
| `422` | action 的插件拒绝了它，或 schema 拒绝了某项设置的值；`message` 是插件自己的原因或 schema 的原因。 |
| `504` | section 没有在规定时间内加载。 |
| `500` | 其他情况；消息体不带 stack trace。 |

---
description: 手机 app：配对、tab、通知、chat、附件、model 和 effort，以及 always allow。
---

# 手机 app {#the-phone-app}

app 通过 [HTTP 接口](http.md)连到 `operad serve`，显示的对象、pending 项和 history 与命令行相同。它不认识任何插件：插件的类型提供一个 tab、一个对象页和若干 action，由 app 渲染它们。

## 配对 app {#pairing-the-app}

`operad pair` 显示 app 连到这个 `serve` 所需的信息：

```text
url http://192.168.1.20:7480
token <the token>

Scan this in the operad app:

<a QR code>
```

URL 是 `http://<address>:<port>`，其中地址取 `http.listen` 中第一个非 loopback 的条目。传入 `--url <base url>` 可以指定另一个地址，例如 Tailscale 的 HTTPS 名称（`operad pair --url https://mac.tail1234.ts.net`）；它必须是不带凭据和 query 的 `http` 或 `https` URL。QR 码编码的是 `operad://pair?url=<url>&token=<token>`。它要求 `http.enabled` 为 true，没有 `--url` 时还要求 `http.listen` 中有非 loopback 的地址。在默认的 `http` 值下，`pair` 会指出 `http.listen` 只有 loopback 地址，并要求提供一个地址或 `--url`；只有它为 false 时才会提到 `http.enabled`。

`pair` 是唯一会打印 token 的命令。当它的输出不是终端时它会拒绝，因此管道或日志永远收不到 token；`--show-token` 会覆盖这一点，把 `url`、`token` 和配对的 `link` 作为普通行打印，不带 QR 码。如果你把 token 粘贴到了任何地方，请用 `operad http token rotate` 轮换它；运行中的 `serve` 会立即拒绝旧 token，并关闭用它打开的流。

app 只能连到 `serve` 可以监听的地址：loopback、私有地址（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）、link-local 或 Tailscale 地址。同一网络中的手机使用私有地址；在别处的手机使用 Tailscale 或 `--url`。每个请求都需要 token；缺少或过期的 token 会得到 `401`，app 会提示 token 已被轮换。

## Tab {#tabs}

底部的 tab 栏是：

- **Pending**：所有在等待用户的内容。
- **Running**：每一个进行中的 run。
- 每个插件的顶层对象类型各有一个 tab：`dev` 是 **Repo**，`chat` 是 **Chat**。
- **Settings**：服务器设置，以及插件放在 settings 之下的对象。

顶层以下的类型（计划、任务）没有 tab；它从父对象的页面、Pending 或 Running 中打开。`bot` 插件没有 tab：bot 页就是该 bot 的设置页，bot 出现在 **Settings** 下名为 **Bots** 的 section 中。

对象页依次是：行（id、title、state、note、badge 和 mark）、对象有下一级时的进度条、子对象列表，然后是 section 的 tab。History 始终是最后一个 section；没有单独的 History tab。live section 会跟随它的末尾并显示新内容；chat 的 transcript 就是一个 live section。底部的 action 栏把第一个可用的 action 作为主按钮，其余放在 `⋯` 菜单中；需要 note 的 action 会打开输入框，`confirm: true` 的 action 用红色询问。打开某个对象的 action（`opens`）会把 app 带到那个对象。

## Pending 和通知 {#pending-and-notifications}

Pending 就是 `GET /v1/pending`：与 `operad pending` 相同的列表。每一项显示对象的标题和行、提示、选项以及它提供的 action。回答问题是 `POST /v1/answer`；运行 action 是 `POST /v1/act`。同时也是对象上 action 的选项会运行该 action，因此适用它的 note 和确认。已关闭的问题是 `409`，不会被应用；app 会显示原因并刷新。

有东西开始等待用户时，app 会收到推送；`notify` 命令是这一时刻在命令行上的对应物。点按它会打开 `OPERAD_LINK`，即 `operad://objects/<id>`，并打开该对象的页面。app 不会为每次状态变化推送；那些变化请打开对象，或下拉刷新。插件自动回答的 wait 不会被通知，因此手机不会为一个即将自行得到答复的问题而震动。

## Running {#running}

Running 就是 `GET /v1/running`：对象、它的标题、flow 和 step、该 step 已运行多久、该 run 已运行多久，以及是否在排队。它通过事件流实时更新。没有对象的 run 显示它的 run id；尚未开始的 step 显示 `-`。

## Chat {#chats}

chat 是与 agent 的一段长对话。**Chat** tab 列出已打开的 chat，按它们的父对象（仓库或 bot）分组；`open` filter 是默认的，`closed` 显示已关闭的。

### 开始一个 chat {#starting-a-chat}

新建 chat 的入口在 Chat tab 上，而不在仓库页或 bot 页上。它要求填写父对象（仓库或 bot）、agent、model、effort 和标题；标题可选，省略时取自第一条消息。第一条消息才会创建 chat：打开新建 chat 页后不发消息就离开，不会留下空的 chat。app 用这些参数和第一条消息，一步调用父对象的创建 action（仓库用 `dev:chat`，bot 用 `bot:chat`），然后打开返回的 chat。

- **Agent**：已加载时可选 `claude`、`pi` 或 `radian`。仓库 chat 只提供能在工具调用开始之前拦下它的 agent（`claude` 和 `pi`），因为它默认是只读的；`radian` 只提供给 bot chat。chat 开始后不能更换 agent；要更换就新建一个 chat。
- **Model** 和 **effort**：列表和默认值来自所选的 agent。没有列出这两者的 agent 没有可选的 model 或 effort，该字段不显示。chat 可以随时更改它的 model 或 effort；更改在下一条回复时生效。

chat 的行和页面显示 agent，已知时还显示 model 和 effort。agent 报告累计费用时，页面也会显示。

### transcript 和发送 {#the-transcript-and-sending}

chat 页由 `transcript` section 加上输入框组成。每条用户消息显示它的文本、附件和发送者（`ios`、`telegram`、`cli` 等）。agent 的回复及其过程以 Markdown 行显示：中间文本、`Thinking`、带结果的工具调用、耗时和一小段输出，以及最终回复。transcript 中的工具输出会被截断；agent 可以从 chat 的目录中读取完整文件。仍在回复的 run 把它未完成的文本和思考显示为一个会更新的 tail；已完成的条目已经被记录，因此重新打开 chat 不会丢失它们，`serve` 重启也不会重复它们。

发送是带 `note` 和已上传附件的 `chat:send`。app 发送消息、记录它并开始回复；已关闭的 chat 会拒绝消息并说明原因。关闭 chat 需要确认（`chat:close`），之后 transcript 仍可阅读，但 chat 不再接收消息，也不提供其他 action。

### 仓库 chat 是只读的 {#a-repository-chat-is-read-only}

仓库上的 chat 在主 clone 中以只读方式工作。shell 命令只有在属于那份只读命令的短名单（`git status`、`ls`、`cat`、`grep`、`sed -n`、`bun test` 等）时才会在那里运行；其他所有命令以及每一次写入或编辑，都会变成一个指出该命令或路径的问题。agent 想修改代码时，会询问是否打开一个 worktree。回答否，会告诉 agent 该调用因为 chat 是只读的而被拒绝，它应该在 chat 里回答，或使用只读命令。回答是，`dev` 会打开 `work/chat-<id>`，此后 chat 在那里工作，仅此一次；主 clone 仍然是只读的。worktree 中的改动只能通过指向它的任务，经过正常的 gate 和 integrate 进入 main。

### bot chat {#a-bot-chat}

bot 上的 chat 使用该 bot 的工作目录、skill 和访问 profile；bot 的设置在每次回复时都会重新读取，因此收紧访问权限或添加 skill 无需新建 chat 即可生效。如果 agent 原生支持 MCP 服务器（`claude` 和 `radian` 支持；`pi` 暂不支持），bot chat 可以使用该 bot 列出的本地 MCP 服务器。工具发生变化的服务器，在用户于 Pending 中批准该变化之前不会被挂载。

## 附件 {#attachments}

输入框可以发送照片、相机图像和文件。app 用 `POST /v1/uploads` 上传每一个，然后把返回的 `ref` 放在消息的 `attachments` 中。文件最大 20 MB；更大的会得到 `413` 和该上限。记录消息时，上传的文件会移到 operad home 下该 chat 自己的附件目录，transcript 通过 `GET /v1/attachments/...` 链接它。

agent 回复时，agent 能读取的图像（`claude`、`pi`）作为图像输入给出，每张最大 5 MB；其他所有文件以 agent 可以读取的路径给出。chat 的访问 profile 会获得对该 chat 附件目录的读取权限，除此之外没有别的。一条消息可以只有附件而没有文本。

## Always allow {#always-allow}

当 agent 请求运行访问 profile 不允许的命令或访问不允许的路径时，该问题是 chat 上的一个 pending 项。选项有一次性允许、一次性拒绝，以及在该 step 提供时的 `allow_always`。选择 `allow_always` 会在 `$OPERAD_HOME/access-user.json` 中写入一个条目：

| 键 | 类型 | 值 |
|---|---|---|
| `kind` | 字符串 | `command` 或 `path` |
| `value` | 字符串 | 确切的命令文本，或调用中写的路径；工具调用写作 `mcp <server>.<tool>` |
| `cwd` | 字符串 | 该调用被允许时所在的工作目录 |
| `tool` | 字符串 | 对 `path` 条目，它所允许的工具，例如 `write` 或 `edit` |

只有下一次调用的 kind、value 和工作目录都完全一致时，才不会再次询问。不是由用户的消息启动的 run 看不到 always-allowed 条目（见[访问](access.md)）。要撤销某一条，从 `access-user.json` 中删掉它那一行；不存在的文件视为空列表，无法读取的文件会被报告并视为空。

## 设置 {#settings}

Settings tab 列出 `GET /v1/settings` 返回的服务器设置，附带当前值、默认值，以及是否可编辑。修改一项会调用 `POST /v1/settings`；要求确认的设置会在 app 中询问，被拒绝的值会显示服务器给出的原因，并且不写入任何内容。属于某个仓库的设置，在该仓库是当前打开的 scope 时显示。

bot 在 Settings 之下，每个一页。bot 页显示它的工作目录、默认 agent、speaker、skill 和 MCP 服务器；它的设置通过提案来编辑，提案出现在 Pending 中，只有用户批准后才会应用。MCP 服务器用 `operad bot mcp` 添加，并在 Pending 中批准。

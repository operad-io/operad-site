---
description: 与 agent 的 chat、bot、它们的命令、设置、MCP server 和 proposal。
---

# chat 和 bot {#chats-and-bots}

chat 是与 agent 的一段长对话。bot 由一个工作目录、一个默认 agent、skill、一个 speaker 和一个访问 profile 组成；bot 上的 chat 使用这些，仓库上的 chat 则做该仓库的工作。两者都是来自插件的对象：`chat` 拥有所有 chat，`dev` 在仓库上打开 chat，`bot` 在 bot 上打开 chat。

## 为什么需要它 {#why-it-exists}

与 agent 合作通常是一段很长的交流，而不是一条命令。chat 把这段交流保存在 operad 里：你可以从命令行、终端 UI、iOS 或 Telegram（见 [Telegram](telegram.md)）发消息，每一条都落在同一份 transcript 中。operad 自己保存消息的记录，所以 chat 的 history 不依赖 agent 的会话文件；会话被清理或压缩，也不会抹掉它。

bot 用于与仓库无关的 chat。它把这类 chat 使用的工作目录、默认 agent、skill、speaker 和访问 profile 固定在一处，因此你可以保留几个权限不同的 bot，例如一个只读的。由于 chat 在每次回复时都会重新读取它的 bot，收紧 bot 的权限或加一个 skill 都不需要新建 chat。

bot 的目录是 `$OPERAD_HOME/bot/<name>`；默认 bot 是 `$OPERAD_HOME/bot/default`，与其他 bot 并列，而不是在它们的上一层。它的 `memory/` 目录缺失时会被创建；`memory` 插件给它一份 git 历史，并为每个 bot 挂载 `memory` skill，共享的 wiki 在 bot 的目录之外，所以所有 bot 用的是同一个。见 [memory 和 wiki](memory.md)。bot 可以读写自己的目录和自己的 memory，其他每个 bot 的目录则拒绝读取和写入。默认 bot 原来的 home `$OPERAD_HOME/bot` 不会被清空：只有 operad 在那里创建的 `skills/` 和 `memory/` 目录会移到 `$OPERAD_HOME/bot/default`。人或 bot 放在旧 home 里的其他每个文件和目录都留在原处，默认 bot 仍然可以在那里读、写和运行；只有其他 bot 的目录会被拒绝。`access-user.json` 中工作目录恰好是旧 home 的授权会被改写一次，改为 `$OPERAD_HOME/bot/default`；其他目录的授权不变。写明了 `cwd` 的 bot 保留它。

这两个插件刻意保持谨慎。仓库上的 chat 在你同意打开 worktree 之前是只读的（除非仓库把 `workIn` 设为 `branch`：那样 chat 在 main clone 中按它的访问级别工作）。bot 不能自己修改自己的 skill、设置或 MCP server；它只能提出修改，在人批准之前磁盘上的内容不会改变。

## 它如何工作 {#how-it-works}

1. chat 由一个插件打开：仓库上用 `dev:chat`，bot 上用 `bot:chat`。agent 在此时选定，之后不再更换；模型、effort 和访问级别之后可以用 `chat:model`、`chat:effort` 和 `chat:access` 修改。
2. `chat:send` 记录一条消息。消息是一个事件，来源为 `ios`、`telegram`、`cli`、`tui` 或 `other`，`chat` 插件自带的规则会为它启动 `chat:reply`（见 [chat](#chats)）。
3. `chat:reply` 从 chat 自己的记录中取出还没有被任何回复回答的消息，继续 agent 的会话，并记录回复。回复正在写的时候发来的消息，如果 chat 的 agent 能在运行中途接收消息（`claude`、`pi`、`codex`），就在这同一次回复里交给 agent；否则，或者它带有附件时，它作为一条**排队**的消息等下一轮。如果还有消息在等，就再来一轮，最多 20 轮。没有 `operad serve` 时消息只是被记录下来，等 `serve` 运行时再回答。正在写的回复可以停止；它写了一半的文本留在 transcript 中，回复失败或被停止之后，`/retry` 会重新回答最后一条消息。`pi` chat 会按 pi 有上限的退避自己重试失败的模型请求；实时 transcript 显示这是第几次尝试、下一次重试的时间和原因，重试成功后不留下任何一行。
4. agent 工作期间，`transcript` 部分显示消息、工具调用和当前回复尚未完成的文本。
5. 每次工具调用都会对照 chat 的访问 profile 检查，chat 的访问级别已合入其中（见[访问](access.md)和[访问级别](#access-level)）。bot chat 的 profile 是默认 profile 加上 bot 自己的 `access` 设置；bot 的设置在每次回复时重新读取（见 [bot](#bots)）。
6. 仓库上的 chat 在 main clone 中以只读开始。写入，或不确定只读的命令，会变成 worktree 问题，它提供 Allow once、Always allow、Deny 和打开 worktree；选择打开 worktree 后，`dev` 打开 `work/chat-<id>`，结束发问的那次回复，并在那里重新回答同一条消息，于是 agent 带着写权限继续。
7. 当 bot 提出一个 skill、一项设置修改、一个 MCP server 或一个定时任务（`operad bot skill`、`bot setting`、`bot mcp`、`bot schedule`）时，一个 `bot-proposal` 对象会在 Pending 中等待。`bot:approve` 使它生效，`bot:reject` 放弃它（见 [bot 对象和 proposal](#bot-objects-and-proposals)）。
8. `chat:close` 记录 `chat.closed`；transcript 仍然可读，`chat:send` 会被拒绝。

## chat {#chats}

chat 属于打开它的插件。`dev` 在仓库上打开 chat：

```sh
operad dev:chat --repo operad --title "The build" [--agent pi]
operad chat:send C-0001 --note "why does the gate fail on main?"
operad show C-0001 --section transcript
```

`dev:chat` 提供 `claude` 和 `pi` 作为 agent（省略 `--agent` 时用第一个已加载的）：它们可以在工具调用开始前拦下它，只读 chat 需要这一点。`radian` 在这里不能作为 agent，只用于 bot chat。仓库 chat 从 `plan` 开始；bot chat 从 bot 的 `bot.bots.<name>.accessLevel` 开始（未设置时为 `ask`），定时任务打开的 chat 除外，它从 `full` 开始。访问级别在 chat 中用 `/access <level>` 更改（见[访问级别](#access-level)）。`bot:chat` 提供所有已加载的 agent；它的默认值是 bot 的 `harness`，否则是第一个已加载的。

chat 有这些 action：

| Action | Arguments | What it does |
|---|---|---|
| `chat:send` | `note`、`attachments`（已上传文件的引用）、`ref` | 记录一条消息并开始回复。消息可以只有附件。输出 `sent <message id>`；没有 `serve` 时输出 `recorded <id>; it is answered when operad serve runs`。已关闭的 chat 会拒绝它。 |
| `chat:withdraw` | `message` | 在任何运行取走之前撤回一条排队的消息。这条消息从 transcript 中消失，不会发给 agent，并有一条 history 记录说明它被撤回。已被某次运行取走的消息会被拒绝。输出 `withdrew message <id>`。 |
| `chat:edit` | `message`、`text` | 在任何运行取走之前修改一条排队消息的文本；它的附件保留。已被某次运行取走的消息会被拒绝。输出 `changed message <id>`。 |
| `chat:model` | `model` | 更改下一次回复使用的模型。该模型必须是 chat 的 agent 所列出的；输出 `chat <id> now uses <model>; the next reply uses it`。 |
| `chat:effort` | `effort` | 从 agent 的列表中更改下一次回复使用的 effort；输出 `chat <id> now uses effort <effort>; the next reply uses it`。 |
| `chat:access` | `level`（`plan`、`ask`、`edits` 或 `full`） | 更改 chat 的访问级别；此后每次工具调用都使用它，包括已经在写的回复。输出 `chat <id> now uses access level <level>; replies follow it`。见[访问级别](#access-level)。 |
| `chat:stop` | 无 | 停止正在写的回复。已经写出的内容留在 transcript 中，标记为已停止。期间到达的消息保持未回答，也不会自动开始新的回复；输出会说明这一点并指向 `/retry`。没有回复在运行时，它会说明这一点，不做任何改动。客户端按钮上的词是 **Stop**。 |
| `chat:retry` | 无 | 在回复失败、被停止或被中断之后，重新回答最后一条消息。它只在确实会回答时出现：chat 是打开的，有消息在等回复，并且没有回复正在写。失败或被停止的那次尝试留在记录中，agent 的会话继续。其他情况下输入它会说明原因，不启动任何东西。 |
| `chat:status` | 无 | 显示 agent、当前生效的模型和 effort、是否有回复正在写以及从何时开始、有多少条消息在等、会话的费用和 token 用量，以及上一次回复的用量和到首次输出的时间。它只读取，不花费 token，回复正在写时也能用。不报告费用的 agent 会让费用显示为 `unknown`。 |
| `chat:close` | 无；要求确认 | 记录 `chat.closed` 并结束 chat。输出 `closed <id>`。transcript 仍可读取；不再出现其他 action。 |

一条消息从发出到被某次运行取走之前都在排队：一次运行第一个提示中的消息在它开始时被取走，运行中途交给 agent 的消息在交出时被取走。chat 的行和它的 `transcript` 部分在 `data.queued` 中按发送顺序带着排队的消息，并带有 `data.queuedCount`；没有排队消息时，行和部分都没有这两个字段。客户端在输入框上方显示“N queued”，并在每条排队消息上提供 `chat:withdraw` 和 `chat:edit`。已被运行取走的消息不再改变，这两个 action 都会拒绝它，并用一行指明是哪条消息。

以 `/` 开头并写出 chat 某个 action 名称的一行，会运行该 action，而不是发给 agent：`/model sonnet`、`/effort high`、`/access edits`、`/stop`、`/retry`、`/status`、`/close`、`/help`。`chat:withdraw` 和 `chat:edit` 是排队消息的 action，不是 chat 命令。这一行余下的部分是 action 的参数，按它的字段声明的顺序排列；只有一个字段时它取余下的全部，多于一个时最后一个字段取剩下的部分。不对应任何 action 的 `/xxx`，或者出现在行中靠后位置的斜杠，都是普通消息。`/close` 要求 action 的确认：单独的 `/close` 什么也不做，并提示发送 `/close yes`。`/help` 列出这个 chat 接受的 action，每个带一行描述，然后列出可以按名称输入的 skill。每次尝试都在 transcript 中留下一条记录，写明是谁输入的、这一行的内容，以及发生了什么或为什么被拒绝；这条记录不是消息，所以 agent 永远看不到它。回复正在写的时候，命令也会立即运行，并且不会自己开始一次回复。命令在每个客户端上都可用，因为处理它的是 `chat:send`。

chat 的 skill 也以 `/name rest` 的形式输入。bot chat 可以输入它的 bot 的 skill；仓库 chat 可以输入它的 `dev.json` 给它的 skill。当这个名称不是 operad 的命令时，这一行是发给 agent 的普通消息：自己加载 skill 的 agent 会原样收到 `/name rest`，其他 agent 则在提示中收到该 skill 的 `SKILL.md` 正文，位于一行指明 skill 名称的文字之后、`rest` 之前。transcript 保留输入时的原样。名称与 operad 命令相同的 skill 让位于命令。chat 的视图在它的 action 旁边带有 `skills: [{ name, description? }]`，所以客户端通过一次 `GET /v1/objects/<id>`（或 MCP 的 `show`）就能显示 skill 和命令；每条描述来自 `SKILL.md`。

消息是一个事件：来源为 `ios`、`telegram`、`cli`、`tui` 或 `other`，key 是消息 id，对象是 chat。定时任务的第一条消息来源是 `bot`，bot 插件自己的规则会为它启动 `chat:reply`。`chat` 插件自己的规则会为客户端来源自动启动 `chat:reply`；你在 `triggers.json` 中写的、来源和类型相同的规则会替换它。回复从 chat 自己的记录中读取尚未被任何回复回答的消息，继续 agent 会话，记录回复，并且在仍有新消息等待时再来一轮（最多 20 轮）。回复期间发来的普通消息，会在同一次回复里交给能在运行中途接收消息的 agent；命令仍然立即运行，永远不会到达 agent。重启之后，已经记录的回复不会再给一次。

`transcript` 部分是实时的：它显示用户消息、agent 的中间文本、`Thinking`、带结果的工具调用、耗时和简短输出，以及最终回复。它按发生的顺序显示一次回复的各行和回复期间取走的消息：agent 在这条消息之前做的事留在它上方，之后做的事留在它下方，而启动这次回复的消息留在所有这些的上方。回复没有取走的消息等下一轮，显示在已完成的回复下方。较早的 chat 如果各行记录时没有时间，就保持记录时的顺序。它还带有 agent 的上下文有多满（`used`、已知时模型的 `window`，以及 `model`），取自上一次完成的回复；chat 的对象视图带有同样的 `context`。新会话在下一次回复之前不带它。客户端用已批准的词 **Context used** 和 **上下文用量** 标注它。失败的回复会留下一行，说明它失败了以及原因，这样失败不会被误认为是回复慢。工具输出在 transcript 中会被截断；完整输出在 chat 目录下的一个文件中。仍在写的回复会把它尚未完成的文本和 thinking 显示为 `tail`；`mark` 和 `after` 让客户端只追加已完成的部分（见[读取一个部分](http.md#reading-a-section)）。`pi` chat 等待重试失败的模型请求时，实时部分还带有 `retry`：第几次尝试、一共几次、下一次何时开始以及提供方给出的原因，这样客户端可以倒计时。这些记录不依赖 agent 自己的会话文件，所以被清理或压缩的会话不会抹掉 chat 的 history；agent 的上下文仍然属于 agent，它继续自己的会话。

chat 的过滤器是 `open`（默认）和 `closed`；内核再加上 `all`，所以 `operad list chat --filter all` 仍然显示已关闭的 chat。`workIn` 为 `worktree` 的仓库上的 chat 在主 clone 中只读地工作（`workIn` 为 `branch` 时它在那里按它的访问级别工作，见下文）：只有当 shell 命令在只读命令的短名单（`git status`、`ls`、`cat`、`grep`、`sed -n`、`bun test` 等）上时才会在那里运行；其他每条命令，以及每次写入或编辑，都会变成 worktree 问题，其中写明命令或路径。这个问题提供 Allow once（只限这一次调用）、Always allow（这次调用和工作目录原样写入 `access-user.json`，之后在任何 chat 中都不再询问）、Deny 和打开 worktree。选 Deny，agent 会被告知调用因 chat 只读而被拒绝，应当在 chat 中回答或使用只读命令。选择打开 worktree，`dev` 会打开 `work/chat-<id>`，此后 chat 一直在那里工作，只此一次；除此之外主 clone 保持只读。发问的那次回复结束，同一条消息在 worktree 中重新回答，于是 agent 带着写权限在那里继续。回复结束之后才给出的同意会打开 worktree，但不会开始第二次回复。transcript 会说一次 `This chat now works in a worktree.`。worktree 中的修改只能通过指向它的任务，经过正常的 gate 和 integrate 进入 main。

附件是客户端上传的文件（`POST /v1/uploads`），存放在 operad home 中该 chat 的附件目录下。一条消息可以只有文件。transcript 把每个附件显示为一行，带有它的名称（图片显示为图片，其他文件显示为 `Attachment:` 链接）。回复会把图片作为图像输入交给 `claude` 和 `pi`（每张最大 5 MB），并把每个文件以路径的形式放进提示交给 agent；chat 的访问 profile 获得该 chat 附件目录的读取权限，除此之外没有别的。MCP 工具无法传递文件；文件由客户端上传。

agent 通过它的工具（`list`、`show`、`section`、`pending`、`answer`、`running`、`history`、`command`、`act`，使用与 `operad mcp` 相同的允许列表）访问 operad，从不在 shell 中运行 `operad`。

### 访问级别 {#access-level}

每个 chat 都有一个访问级别：`plan`、`ask`、`edits` 或 `full`。`/access <level>` 更改它，也可以用 `operad chat:access <chat> --level <level>`；级别记录在 chat 上，此后每次工具调用都使用它，包括已经在写的回复，重启和换客户端之后也一样。级别变化时还开着的问题会按新级别重新检查。仓库 chat 从 `plan`（只读）开始，bot chat 从 bot 的 `accessLevel` 设置开始（未设置时为 `ask`；取值为 `plan`、`ask`、`edits`、`full` 之一），定时任务打开的 chat 除外，它从 `full` 开始。没有人运行过 `/access` 的 chat 在下一次回复时跟随该设置，所以改设置会改变它；人选定的级别保持不变。级别不是 chat 的起始级别时，行上会显示它。在 `workIn` 为 `branch`（“A branch in this folder”）的仓库中，仓库 chat 在 main clone 中、在当前检出的分支上按它的级别工作：`edits` 和 `full` 在那里写入，不提供 worktree，也不创建 `work/chat-<id>` 分支，`plan` 保持只读。设为 `worktree`（“A separate worktree”，默认值）时，本段余下的内容适用。仍在 main clone 中工作的仓库 chat 被提升到 `edits` 或 `full` 时，会先打开 `work/chat-<id>` 并移到那里；如果 worktree 无法打开，级别保持原样，命令会说明原因。已经在自己 worktree 中的 chat 就在那里应用该级别。`plan` 和 `ask` 从不打开 worktree，main clone 中的 `ask` 对写入仍然提出 worktree 问题。bot chat 在任何级别下都在 bot 自己的目录中工作，没有 worktree。

| Level | What runs without asking |
|---|---|
| `plan` | 读取，以及确定只读的命令；写入会询问。 |
| `ask` | 读取；每次写入和每条不确定只读的命令都会询问。 |
| `edits` | 在工作目录中读写文件；不确定只读的命令会询问。 |
| `full` | 一切，但以下除外：被 deny 拒绝的调用、只读工作目录会询问的写入或命令，以及 `readPaths` 之下的写入；这个级别不增加任何询问，ask 命令、ask 路径、未列出的 MCP 工具和对外写入的问题都不再询问。匹配器无法跟踪的命令（内联代码、shell 展开、它无法跟踪的目录切换之后的路径）也会运行，除非某条 deny 明确匹配。 |

profile 的 deny 列表在每个级别下仍然有效，`readOnly` 和 `readPaths` 之下的写入仍然会询问。低于 `full` 时，profile 自己的 `askCommands` 和 `askPaths` 规则仍然会询问。在 `full` 下它们不询问，后台运行在对外写入之前也不询问：只有 deny、`readOnly` 或 `readPaths` 之下的写入能拦下一次调用。界面中已批准的词是：菜单用 **Access**，各级别用 **Plan only**、**Ask each time**、**Accept edits** 和 **Full access**。`claude` 和 `pi` 支持每个级别；agent 无法支持某个级别的 chat 会拒绝回复，并给出一条指明该级别的消息，而不是忽略它。profile 本身见[访问](access.md)。

## bot {#bots}

`bot` 插件没有 tab。它的对象在 Settings 之下：bot 页面就是该 bot 的设置页面，所有 bot 列在名为 Bots 的部分中。bot 写在 `config.json` 的 `plugins.bot.settings` 中；即使没有写，`default` bot 也存在。这一部分在每次使用时读取，所以修改会在下一次回复时生效，无需重启。

bot 由某个已有 bot 上的 `bot:create` action 创建。它接受新 bot 的 `name` 和 `agent`，可选的 `model`、`effort` 和 `speaker`，以及要给它的 skill 和 MCP server。可选的 skill 是其他 bot 已经挂载的那些，以及 `~/.agents/skills` 存在时其中的 skill；也可以改为给出一个路径。可选的 MCP server 是人已经在其他 bot 上批准过的那些：每个都连同它固定的版本、工具、digest 和 secret 名称一起复制，不会再询问一次。新 bot 拥有的恰好就是所选的内容；不从 `default` 继承任何东西，什么都不选的 bot 没有 skill 也没有 server。名称按任何 bot 名称的规则检查，已存在的名称会被拒绝。结果会打开新 bot，并列出复制来的 server 启动前需要的 secret。新 bot 的页面按名称显示它的 skill，并显示它的 MCP server。

| Key | Type | Default | Allowed values | When it takes effect |
|---|---|---|---|---|
| `bot.bots` | 对象 | `{ "default": {} }` | 每个 bot 名称一个条目 | 解析 bot 时读取，每次回复都读。从 map 中移除的 bot 被标记为 removed，它的 chat 不再回答。 |
| `bot.bots.<name>` | 对象 | `{}` | 下面的 key | 一个 bot。名称由小写字母、数字、`-` 和 `_` 组成，并以字母或数字开头；其他名称会得到 `bot "<name>": a name is lowercase letters, digits, "-" and "_", and starts with a letter or digit`。 |
| `bot.bots.<name>.cwd` | 字符串 | `$OPERAD_HOME/bot/<name>`，所以 `default` 为 `$OPERAD_HOME/bot/default` | 路径 | bot 的 chat 的工作目录。它必须在 `$OPERAD_HOME/bot` 之内，或在 operad home 之外；其他路径在解析 bot 时被拒绝。bot 目录有一个 `memory/` 目录，缺失时会被创建。 |
| `bot.bots.<name>.harness` | 字符串 | 第一个已加载的 agent | 已加载的 agent 名称 | 新 chat 未指定 agent 时使用的 agent。未加载的名称在打开 chat 时被拒绝：`agent "<name>" is not loaded; the loaded ones are: …`。 |
| `bot.bots.<name>.useOwnSettings` | 布尔值 | `false` | `true`、`false` | 每次回复：为 `true` 时，bot 的 agent 读取你自己对该 agent 的配置（见[使用你自己的 agent 设置](#using-your-own-agent-settings)）。bot 的访问 profile 拒绝的东西仍然被拒绝。 |
| `bot.bots.<name>.skills` | 字符串数组 | `[]` | 含有 `SKILL.md` 的目录，直接子目录各含一个这种文件的目录（例如 `~/.agents/skills`），或 `.agents` 目录（例如 `~/.agents`），其 `skills` 目录按同样方式读取；相对路径位于工作目录之下 | 每次回复；所列目录中直接包含的每个 skill 都会交给 agent，包括之后添加的，agent 可以读取但不能修改它。缺失或无法读取的 skill 在回复时报告。 |
| `bot.bots.<name>.model` | 字符串 | agent 的默认值 | chat 的 agent 所列出的模型 | 新 chat 开始时；未列出的模型按名称被拒绝。chat 之后可以用 `chat:model` 更改。 |
| `bot.bots.<name>.effort` | 字符串 | agent 的默认值 | chat 的 agent 所列出的 effort | 新 chat 开始时；未列出的 effort 按名称被拒绝。chat 之后可以用 `chat:effort` 更改。 |
| `bot.bots.<name>.speaker` | 字符串 | `chat.speaker` | 任何非空字符串 | 每次回复：transcript 如何标注模型的消息。 |
| `bot.bots.<name>.mcpServers` | 对象 | `{}` | 每个本地 MCP server 名称一个条目 | 在原生接受 MCP server 的 agent（`claude`、`radian`）上的 chat，每次回复时；只有设置了 `digest` 的 server 才会挂载。`pi` 目前不挂载它们。 |
| `bot.bots.<name>.mcpServers.<name>` | 对象 | 无 | 下面的 key | 一个本地 server。名称由小写字母、数字和 `-` 组成，各部分之间可以有单个 `_`；`operad` 是保留名称。 |
| `bot.bots.<name>.mcpServers.<name>.command` | 字符串 | 必填 | 启动 server 的程序 | 提议该 server 时，以及 chat 启动它时。 |
| `bot.bots.<name>.mcpServers.<name>.args` | 字符串数组 | `[]` | server 的参数 | 提议该 server 时，以及 chat 启动它时。 |
| `bot.bots.<name>.mcpServers.<name>.package` | 字符串 | 缺省 | 包名 | 命令所运行的包（如果它运行一个包）；根据固定了版本的包命令（`npx`、`bunx`、`uvx`、`pipx`）记录。 |
| `bot.bots.<name>.mcpServers.<name>.version` | 字符串 | 缺省 | 确切的版本 | 该包被固定的版本。tag 或范围在 server 启动之前被拒绝。 |
| `bot.bots.<name>.mcpServers.<name>.secrets` | 字符串数组 | `[]` | 环境变量名 | server 只在启动时，才从 bot 插件的 secret store 中以 `<server>.<variable>` 的形式收到每个值。 |
| `bot.bots.<name>.mcpServers.<name>.tools` | 对象数组 | 缺省 | `{ "name", "description" }` 条目 | 人批准该 server 时它提供的工具；启动时与它当前提供的工具比较。 |
| `bot.bots.<name>.mcpServers.<name>.tools.name` | 字符串 | 必填 | 工具名 | 一个已批准的工具。 |
| `bot.bots.<name>.mcpServers.<name>.tools.description` | 字符串 | 必填 | 工具的描述 | 与名称一起被批准的描述；两者共同构成 digest。 |
| `bot.bots.<name>.mcpServers.<name>.digest` | 字符串 | 缺省 | 已批准工具的 digest | chat 启动 server 时：不同的工具列表不会被挂载，工具变更的 proposal 在 Pending 中等待。 |
| `bot.bots.<name>.mcpAllow` | 字符串数组 | `[]` | `<server>.<tool>` 或 `<server>.*` | bot 的 chat 的每次 MCP 工具调用：已列出的工具无需询问即可运行；未列出的算作写入，会先询问。 |
| `bot.bots.<name>.access` | 对象 | `{}` | 下面的 key | 每次回复：它会加到默认访问 profile 上。bot 可以收紧默认值，但不能放宽。 |
| `bot.bots.<name>.access.denyPaths` | 字符串数组 | `[]` | 路径 | 追加到默认 deny 列表之后。 |
| `bot.bots.<name>.access.denyCommands` | 字符串数组 | `[]` | 命令模式 | 追加到默认 deny 列表之后。 |
| `bot.bots.<name>.access.askCommands` | 字符串数组 | `[]` | 命令模式 | 追加到默认 ask 列表之后；匹配时运行前会询问。 |
| `bot.bots.<name>.access.askPaths` | 字符串数组 | `[]` | 路径 | 追加到默认 ask 列表之后。 |
| `bot.bots.<name>.access.readOnly` | 布尔值 | `false` | `true`、`false` | 每次回复：`true` 会拒绝每次写入，以及每条不确定只读的命令。 |
| `bot.bots.<name>.accessLevel` | 字符串 | `ask` | `plan`、`ask`、`edits`、`full` | 该 bot 上新 chat 开始时所用的级别。对没有选定级别的 chat 在下一次回复生效，对每个新 chat 也一样。与 `access` 不同，它可以放宽 profile：`full` 除 deny 规则外什么都不问。定时任务打开的 chat 从 `full` 开始；用 `/access` 选定了级别的 chat 保持该级别。见[访问级别](#access-level)。 |
| `bot.bots.<name>.writeWiki` | 布尔值 | `default` 为 `true`，其他每个 bot 为 `false` | `true`、`false` | 下一次回复：`true` 让 bot 写共享的 wiki；读取权限始终都有。见[记忆和 wiki](memory.md)。 |
| `bot.bots.<name>.tidyTime` | 字符串 | `03:30` | `HH:MM`，从 `00:00` 到 `23:59`，按本机本地时区 | bot 的下一次夜间记忆检查。 |
| `bot.bots.<name>.runWithoutAsking` | 布尔值 | `false` | `true`、`false` | 下一次夜间检查：`true` 会运行 bot 的记忆整理，不产生 pending 条目；`false` 等待 Run 或 Skip。 |
| `chat.speaker` | 字符串 | `"Operad Bot"` | 任何非空字符串 | 每次不使用 bot 的 `speaker` 的 chat 的回复；可用 `operad settings set chat.speaker <value>` 编辑。 |

默认访问 profile 拒绝凭据和秘密（`~/.ssh`、`~/.gnupg`、`~/.aws`、`~/.config/gh`、钥匙串和浏览器 profile）、operad home（bot 自己的目录除外）、`.git/config`、`.git/hooks`，以及 `sudo`、`operad`、`mkfs`、`dd`、`shutdown`、`pkill` 和 `killall` 之类的命令；在 `git push`、`brew install`、`npm install -g`、`pip install`、`osascript` 和 `open` 之前会询问。`access-user.json` 和 always allow 见[访问](access.md)。

### 使用你自己的 agent 设置 {#using-your-own-agent-settings}

bot 有 `useOwnSettings`，标题是 **Use my own agent settings**，默认关闭。打开时，bot 的 agent 读取你自己对该 agent 的配置。这个开关在每次回复时读取，包括从 Telegram 这样的渠道到达的消息；关闭时，`claude` 和 `pi` 没有任何变化。

**claude。** 来自 `~/.claude/settings.json` 的设置、项目和本地的 Claude 设置、`CLAUDE.md` 指令文件、自动记忆、allow 和 deny 规则、hook、skill、命令、subagent、插件和 MCP server。遥测、错误报告和后台任务保持关闭，一次回复仍然是一个前台回合。在你设置中的任何 allow 规则能够批准一次工具调用之前，这次调用先在 claude harness 本来就运行的 `PreToolUse` hook 中接受判断：profile 的路径、命令或只读拒绝会否决它。profile 允许、你的设置也允许的调用不经询问就运行；profile 说要询问的调用仍像以前一样通过 operad 询问。operad 自己的工具、bot 列出的 skill、bot 列出的 MCP server 和它的日志 hook 都保留；当两边都定义了某个 skill 或 MCP server 时，用的是 operad 的那个。你自己 Claude 配置中的 MCP server 对 bot 可用，无需经过 bot 的 MCP 批准。开关打开后，你设置中的 hook 会在 bot 的工具调用上运行，而 bot 的访问 profile 先被判断。

**pi。** 你的 pi 设置和资源，来自你的 pi 目录（`~/.pi/agent`，或 pi 的 `PI_CODING_AGENT_DIR` 所指的目录）：设置、上下文文件（pi 的全局 `AGENTS.md`，以及 pi 从工作目录找到的那些）、skill、提示模板和扩展。不会有任何东西被复制到 operad 的目录。会话仍然是 operad 的，位于 operad home 之下，所以 chat 仍然能找到它；模型和登录像以前一样是你的。operad 的内联扩展和工具都保留，bot 列出的 skill 优先于你的 pi 中同名的 skill。每次工具调用，包括来自你的扩展所添加工具的调用，在运行之前都在 `tool_call` hook 中由访问 profile 判断；profile 有规则而又无法检查的工具会被拒绝。扩展还会在 worker 进程中运行它自己的代码：它在加载时运行的代码、它自己的子进程和它自己的网络调用不是工具调用，profile 拦不住。你的 pi 的压缩设置保持关闭。chat 回复会打开 pi 的自动重试，你的 pi 设置写明了尝试次数和延迟时就用它们，否则用 pi 的默认值；任务则保持关闭。

**codex。** 无论开关是开还是关，Codex 都读取你自己的 Codex 配置，因为 bot 启动的是你自己的 `codex app-server`：`~/.codex/config.toml` 及其模型默认值、hook、规则和 MCP server，Codex 读取的 `AGENTS.md` 指令文件，以及它在那里应用的项目设置。operad 加上它的线程沙箱、批准策略和 MCP server。这个开关在这里不改变任何东西。访问 profile 回答 Codex 向 operad 询问的批准；留在 Codex 自己沙箱内的命令受该沙箱约束，而不受 profile 约束。

**radian。** 无论开关是开还是关，Radian 都读取你自己的 radian 配置，因为 bot 运行的是你的 `radian exec`：`RADIAN_CONFIG` 或 `~/.radian/config/config.toml` 及其模型、权限、skill、hook 和 MCP server，它发现的全局和项目上下文文件（`AGENTS.md` 和它读取的其他名称），以及受信任的项目资源。operad 给它一份该配置的副本，其中带有 operad 的 `PreToolUse` hook 和 operad 自己的 MCP 配置。这个开关在这里不改变任何东西。

### bot 对象和 proposal {#bot-objects-and-proposals}

bot 页面有 `bot` 部分。无法使用的 bot 会保存它的问题，它的行也会这样显示；此时 `bot:chat` 会带着该问题拒绝。从设置中取出的 bot 被标记为 removed；新的 bot 在下一次使用时出现。

bot 向自己提出的变更是一个 `bot-proposal` 对象。在人批准或拒绝它之前它一直是 pending；在此之前磁盘上不会有任何变化。proposal 是以下之一：

- skill（`bot skill`）：修改前后的文件，应用到 skill 目录，并加入 bot 的 `skills`；
- 设置变更（`bot setting`）：bot 修改前后的设置；
- MCP server（`bot mcp`）：新的 server、升级，或工具发生变化的 server；
- 定时任务（`bot schedule`）：添加、修改或移除一个条目，显示它的名称、用文字和 cron 写出的时间安排、提示、模型和 effort。

`bot:approve` 应用一个 pending 的 proposal，`bot:reject` 拒绝它。不是 pending 的 proposal 仍然显示它的状态。`bot-proposal` 的过滤器是 `pending`（默认）、`applied` 和 `rejected`；每个 pending 的 proposal 同时也是其 bot 的一个 pending 项，所以它出现在 Pending 和 app 中。

### bot 命令 {#bot-commands}

`operad bot skill <bot> <name> [--from <dir>]` 提议新的或修改后的 skill。不带 `--from` 时，stdin 是一个含有 `skill_md` 和 `files` 的 JSON 对象；带该选项时，读取该目录的文件。skill 需要有 `SKILL.md`。它输出 `proposed skill "<name>" for bot <bot>; review it in pending`。

`operad bot mcp <bot> <name> <command> [args…]` 启动一次本地 MCP server，读取它的工具列表，并提议注册它。没有 command 时，stdin 是粘贴进来的 `mcpServers` 条目。只能注册本地 server（带参数的命令）；地址（`url`、`type: "http"`、`type: "sse"`、`headers`）会被拒绝。包命令必须写明确切的版本：`npx -y pkg@1.2.3` 被接受；`pkg@latest` 或范围会被拒绝，并指出所需的版本。server 在 bot 的工作目录中，以 bot 的访问 profile 和它的 secret 启动。它输出 `proposed MCP server "<name>" for bot <bot> (<n> tools); review it in pending`。

`operad bot setting <bot>` 从 stdin 读取一个 JSON 对象并提议该变更。它不能添加或修改 `mcpServers`；那是 `bot mcp` 的用途。它输出 `proposed settings for bot <bot>; review it in pending`。

`operad bot schedule <bot> add|edit|remove <name>` 提议对 bot 的定时任务的一项变更。`add` 需要 `--schedule <cron>`、`--words <schedule in words>` 和 `--prompt <text>`；`edit` 需要 `--schedule`、`--prompt`、`--model` 和 `--effort` 中的至少一个，并带上 `--words`；`remove` 接受名称和 `--words`。可选的 `--model` 和 `--effort` 设置或清除这两个字段。它输出 `proposed scheduled prompt "<name>" for bot <bot>; review it in pending`。chat 的 agent 通过 operad 的 `command` 工具调用这条命令；它写的时间安排是一个 proposal，从不直接成为条目。

### 定时任务 {#scheduled-prompts}

bot 可以持有定时任务。面向用户的词是 **Scheduled**（中文为定时任务）。一个条目有名称、按本机本地时区的五字段 cron 时间安排、提示、可选的模型和 effort，以及是否暂停。bot 页面列出这些条目，带有它们的下一次运行，以及上一次运行的结果和 chat id。

要在 chat 中安排一件事，用话说出来（“每天早上 8 点，收集当天的新闻”）。bot 会写一个 proposal，其中有名称、用文字和五字段 cron 表达式写出的时间安排、提示，以及模型和 effort。它在 Pending 中等待：`bot:approve` 添加它，`bot:reject` 放弃它，在此之前不存在任何条目。从 chat 中修改或移除已有条目也是 proposal；通过下面的 action 做的变更是你自己的修改，立即生效。

```sh
operad bot:schedule-add default --name Morning --schedule "0 8 * * *" --prompt "Collect the day's news."
operad bot:schedule-edit default --name Morning --schedule "0 9 * * *"
operad bot:schedule-pause default --name Morning
operad bot:schedule-resume default --name Morning
operad bot:schedule-remove default --name Morning
```

| Action | Arguments | What it does |
|---|---|---|
| `bot:schedule-add` | `name`、`schedule`、`prompt`，可选的 `model`、`effort`、`paused` | 添加一个条目。名称在该 bot 上唯一；时间安排是按本地时间的五字段 cron 表达式。 |
| `bot:schedule-edit` | `name`，可选的 `schedule`、`prompt`、`model`、`effort` | 修改一个条目。修改后的时间安排重新开始，所以旧安排下错过的时间不会补跑。 |
| `bot:schedule-pause` | `name` | 让它停止触发；暂停的条目不累积错过的时间。 |
| `bot:schedule-resume` | `name` | 让它在下一个计划时间再次触发。 |
| `bot:schedule-remove` | `name` | 删除它。 |

条目触发时，bot 在自己之下打开一个新 chat，标题是条目的名称加日期，并把提示作为第一条消息发出。这个 chat 以该 bot 的身份运行，带着它的 skill、MCP server 和访问 profile，并从 `full` 开始：只有 profile 的 deny 规则、`readOnly` 和 `readPaths` 之下的写入能拦下一次调用；ask 规则和对外写入都不询问。之后人可以用 `/access` 更改级别。它的第一条消息没有人的来源，所以那次回复是后台运行：在低于 `full` 的级别（可用 `/access` 设置）下，其中的对外写入会询问。你可以在这个新 chat 里继续对话。

`serve` 停过或机器休眠过之后，最近七天内最新的一次错过的运行会触发一次；更早的被跳过。补跑的运行会在提示中加一行，说明它原定的时间和晚了多久。

回复结束时，条目的上一次结果是这次回复的简短摘要，`notify` 命令会以该摘要作为 `OPERAD_REASON` 运行（见[通知](notifications.md)）。失败的回复则记录并通知它的失败行。

每个定时任务的提示都以一行结尾，告诉 agent 如何安静地结束：回复恰好是 `NOTHING_TO_REPORT`（忽略前后的空白）表示没有新内容。这次触发不运行 `notify` 命令；条目的上一次结果显示为“Nothing to report.”，chat 保持打开。其他任何回复，以及每次失败，都按上面的方式通知。

每次触发的提示还带有同一条目最近三次的结果（每条截到 120 个字符，安静的那些也算在内），并要求 agent 不要重复人已经看过的内容。

### 跟进 {#follow-ups}

**Follow-up**（中文为跟进）是 agent 在 chat 中给自己定的一次性期限：“两小时后再看一眼这个”。它有一个到期时间、一句说明要做什么的话，以及设定它的那个 chat。定时任务是你的，会重复；跟进是 agent 自己的，只发生一次。

agent 用 `bot follow-up` 命令（`operad bot follow-up <chat> --at <time> --do <sentence>`）设定跟进，chat 第一次会话的那一行会告诉它有这条命令。时间可以是绝对的（`2026-12-01 09:00`，本地时间，或 ISO 时间），也可以是相对的（`+30m`、`+2h`、`+3d`）。它立即生效，不会先问你。限制：一个 chat 中尚未到期的跟进最多 5 个，到期时间最多在 30 天之后；被拒绝时会指明是哪个限制拦下了它。

到期时，那句话被发进同一个 chat，所以回复接着该 chat 的会话继续。这条消息不是来自人，所以回复是后台运行：访问级别低于 `full` 时，对外写入仍然会询问（见[访问](access.md)）。如果到期时 `serve` 没有运行，跟进会在它启动之后发送一次，并带一行说明它原定的时间和晚了多久。chat 已关闭的跟进会被丢弃。

bot 的页面列出尚未到期的跟进，bot 的行在 `data.followUps` 中带着它们（见 [HTTP](http.md#row-data)）。`bot:follow-up-cancel <bot> --id <id>` 取消一个；agent 用 `operad bot follow-ups <chat> [--cancel <id>]` 列出和取消它自己 chat 的跟进。取消不是 proposal。

---
description: 与 agent 的 chat、bot、它们的命令、设置、MCP server 和 proposal。
---

# chat 和 bot {#chats-and-bots}

chat 是与 agent 的一段长对话。bot 由一个工作目录、一个默认 agent、skill、一个 speaker 和一个访问 profile 组成；bot 上的 chat 使用这些，仓库上的 chat 则做该仓库的工作。两者都是来自插件的对象：`chat` 拥有所有 chat，`dev` 在仓库上打开 chat，`bot` 在 bot 上打开 chat。

## 为什么需要它 {#why-it-exists}

与 agent 合作通常是一段很长的交流，而不是一条命令。chat 把这段交流保存在 operad 里：你可以从命令行、终端 UI、iOS 或 Telegram（见 [Telegram](telegram.md)）发消息，每一条都落在同一份 transcript 中。operad 自己保存消息的记录，所以 chat 的 history 不依赖 agent 的会话文件；会话被清理或压缩，也不会抹掉它。

bot 用于与仓库无关的 chat。它把这类 chat 使用的工作目录、默认 agent、skill、speaker 和访问 profile 固定在一处，因此你可以保留几个权限不同的 bot，例如一个只读的。由于 chat 在每次回复时都会重新读取它的 bot，收紧 bot 的权限或加一个 skill 都不需要新建 chat。

这两个插件刻意保持谨慎。仓库上的 chat 在你同意打开 worktree 之前是只读的。bot 不能自己修改自己的 skill、设置或 MCP server；它只能提出修改，在人批准之前磁盘上的内容不会改变。

## 它如何工作 {#how-it-works}

1. chat 由一个插件打开：仓库上用 `dev:chat`，bot 上用 `bot:chat`。agent 在此时选定，之后不再更换；模型和 effort 之后可以用 `chat:model` 和 `chat:effort` 修改。
2. `chat:send` 记录一条消息。消息是一个事件，来源为 `ios`、`telegram`、`cli`、`tui` 或 `other`，`chat` 插件自带的规则会为它启动 `chat:reply`（见 [chat](#chats)）。
3. `chat:reply` 从 chat 自己的记录中取出还没有被任何回复回答的消息，继续 agent 的会话，并记录回复。如果期间又来了新消息，就再来一轮，最多 20 轮。没有 `operad serve` 时消息只是被记录下来，等 `serve` 运行时再回答。
4. agent 工作期间，`transcript` 部分显示消息、工具调用和当前回复尚未完成的文本。
5. 每次工具调用都会对照 chat 的访问 profile 检查（见[访问](access.md)）。bot chat 的 profile 是默认 profile 加上 bot 自己的 `access` 设置；bot 的设置在每次回复时重新读取（见 [bot](#bots)）。
6. 仓库上的 chat 在 main clone 中以只读开始。写入，或不确定只读的命令，会变成 worktree 问题；答应后，`dev` 打开 `work/chat-<id>`，chat 此后在那里工作。
7. 当 bot 提出一个 skill、一项设置修改或一个 MCP server（`operad bot skill`、`bot setting`、`bot mcp`）时，一个 `bot-proposal` 对象会在 Pending 中等待。`bot:approve` 使它生效，`bot:reject` 放弃它（见 [bot 对象和 proposal](#bot-objects-and-proposals)）。
8. `chat:close` 记录 `chat.closed`；transcript 仍然可读，`chat:send` 会被拒绝。

## chat {#chats}

chat 属于打开它的插件。`dev` 在仓库上打开 chat：

```sh
operad dev:chat --repo operad --title "The build" [--agent pi]
operad chat:send C-0001 --note "why does the gate fail on main?"
operad show C-0001 --section transcript
```

`dev:chat` 提供 `claude` 和 `pi` 作为 agent（省略 `--agent` 时用第一个已加载的）：它们可以在工具调用开始前拦下它，只读 chat 需要这一点。`radian` 在这里不能作为 agent，只用于 bot chat。`bot:chat` 提供所有已加载的 agent；它的默认值是 bot 的 `harness`，否则是第一个已加载的。

chat 有这些 action：

| Action | Arguments | What it does |
|---|---|---|
| `chat:send` | `note`、`attachments`（已上传文件的引用）、`ref` | 记录一条消息并开始回复。消息可以只有附件。输出 `sent <message id>`；没有 `serve` 时输出 `recorded <id>; it is answered when operad serve runs`。已关闭的 chat 会拒绝它。 |
| `chat:model` | `model` | 更改下一次回复使用的模型。该模型必须是 chat 的 agent 所列出的；输出 `chat <id> now uses <model>; the next reply uses it`。 |
| `chat:effort` | `effort` | 从 agent 的列表中更改下一次回复使用的 effort；输出 `chat <id> now uses effort <effort>; the next reply uses it`。 |
| `chat:close` | 无；要求确认 | 记录 `chat.closed` 并结束 chat。输出 `closed <id>`。transcript 仍可读取；不再出现其他 action。 |

消息是一个事件：来源为 `ios`、`telegram`、`cli`、`tui` 或 `other`，key 是消息 id，对象是 chat。`chat` 插件自己的规则会为这些来源自动启动 `chat:reply`；你在 `triggers.json` 中写的、来源和类型相同的规则会替换它。回复从 chat 自己的记录中读取尚未被任何回复回答的消息，继续 agent 会话，记录回复，并且在此期间又有新消息进来时再来一轮（最多 20 轮）。重启之后，已经记录的回复不会再给一次。

`transcript` 部分是实时的：它显示用户消息、agent 的中间文本、`Thinking`、带结果的工具调用、耗时和简短输出，以及最终回复。工具输出在 transcript 中会被截断；完整输出在 chat 目录下的一个文件中。仍在回复的运行会把它尚未完成的文本和 thinking 显示为 `tail`；`mark` 和 `after` 让客户端只追加已完成的部分（见[读取一个部分](http.md#reading-a-section)）。这些记录不依赖 agent 自己的会话文件，所以被清理或压缩的会话不会抹掉 chat 的 history；agent 的上下文仍然属于 agent，它继续自己的会话。

chat 的过滤器是 `open`（默认）和 `closed`；内核再加上 `all`，所以 `operad list chat --filter all` 仍然显示已关闭的 chat。仓库上的 chat 在主 clone 中只读地工作：只有当 shell 命令在只读命令的短名单（`git status`、`ls`、`cat`、`grep`、`sed -n`、`bun test` 等）上时才会在那里运行；其他每条命令，以及每次写入或编辑，都会变成 worktree 问题，其中写明命令或路径。当 agent 想要修改代码时，它会询问是否打开 worktree。回答否，agent 会被告知调用因 chat 只读而被拒绝，应当在 chat 中回答或使用只读命令。回答是，`dev` 会打开 `work/chat-<id>`，此后 chat 一直在那里工作，只此一次；主 clone 保持只读。worktree 中的修改只能通过指向它的任务，经过正常的 gate 和 integrate 进入 main。

附件是客户端上传的文件（`POST /v1/uploads`），存放在 operad home 中该 chat 的附件目录下。一条消息可以只有文件。transcript 把每个附件显示为一行，带有它的名称（图片显示为图片，其他文件显示为 `Attachment:` 链接）。回复会把图片作为图像输入交给 `claude` 和 `pi`（每张最大 5 MB），并把每个文件以路径的形式放进提示交给 agent；chat 的访问 profile 获得该 chat 附件目录的读取权限，除此之外没有别的。MCP 工具无法传递文件；文件由客户端上传。

agent 通过它的工具（`list`、`show`、`section`、`pending`、`answer`、`running`、`history`、`command`、`act`，使用与 `operad mcp` 相同的允许列表）访问 operad，从不在 shell 中运行 `operad`。

## bot {#bots}

`bot` 插件没有 tab。它的对象在 Settings 之下：bot 页面就是该 bot 的设置页面，所有 bot 列在名为 Bots 的部分中。bot 写在 `config.json` 的 `plugins.bot.settings` 中；即使没有写，`default` bot 也存在。这一部分在每次使用时读取，所以修改会在下一次回复时生效，无需重启。

| Key | Type | Default | Allowed values | When it takes effect |
|---|---|---|---|---|
| `bot.bots` | 对象 | `{ "default": {} }` | 每个 bot 名称一个条目 | 解析 bot 时读取，每次回复都读。从 map 中移除的 bot 被标记为 removed，它的 chat 不再回答。 |
| `bot.bots.<name>` | 对象 | `{}` | 下面的 key | 一个 bot。名称由小写字母、数字、`-` 和 `_` 组成，并以字母或数字开头；其他名称会得到 `bot "<name>": a name is lowercase letters, digits, "-" and "_", and starts with a letter or digit`。 |
| `bot.bots.<name>.cwd` | 字符串 | `default` 为 `$OPERAD_HOME/bot`，其他为 `$OPERAD_HOME/bot/<name>` | 路径 | bot 的 chat 的工作目录。它必须在 `$OPERAD_HOME/bot` 之内，或在 operad home 之外；其他路径在解析 bot 时被拒绝。 |
| `bot.bots.<name>.harness` | 字符串 | 第一个已加载的 agent | 已加载的 agent 名称 | 新 chat 未指定 agent 时使用的 agent。未加载的名称在打开 chat 时被拒绝：`agent "<name>" is not loaded; the loaded ones are: …`。 |
| `bot.bots.<name>.skills` | 字符串数组 | `[]` | 含有 `SKILL.md` 的目录；相对路径位于工作目录之下 | 每次回复；这些目录会交给 agent。缺失或无法读取的 skill 在回复时报告。 |
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
| `chat.speaker` | 字符串 | `"Operad Bot"` | 任何非空字符串 | 每次不使用 bot 的 `speaker` 的 chat 的回复；可用 `operad settings set chat.speaker <value>` 编辑。 |

默认访问 profile 拒绝凭据和秘密（`~/.ssh`、`~/.gnupg`、`~/.aws`、`~/.config/gh`、钥匙串和浏览器 profile）、operad home（bot 自己的目录除外）、`.git/config`、`.git/hooks`，以及 `sudo`、`operad`、`mkfs`、`dd`、`shutdown`、`pkill` 和 `killall` 之类的命令；在 `git push`、`brew install`、`npm install -g`、`pip install`、`osascript` 和 `open` 之前会询问。`access-user.json` 和 always allow 见[访问](access.md)。

### bot 对象和 proposal {#bot-objects-and-proposals}

bot 页面有 `bot` 部分。无法使用的 bot 会保存它的问题，它的行也会这样显示；此时 `bot:chat` 会带着该问题拒绝。从设置中取出的 bot 被标记为 removed；新的 bot 在下一次使用时出现。

bot 向自己提出的变更是一个 `bot-proposal` 对象。在人批准或拒绝它之前它一直是 pending；在此之前磁盘上不会有任何变化。proposal 是以下之一：

- skill（`bot skill`）：修改前后的文件，应用到 skill 目录，并加入 bot 的 `skills`；
- 设置变更（`bot setting`）：bot 修改前后的设置；
- MCP server（`bot mcp`）：新的 server、升级，或工具发生变化的 server。

`bot:approve` 应用一个 pending 的 proposal，`bot:reject` 拒绝它。不是 pending 的 proposal 仍然显示它的状态。`bot-proposal` 的过滤器是 `pending`（默认）、`applied` 和 `rejected`；每个 pending 的 proposal 同时也是其 bot 的一个 pending 项，所以它出现在 Pending 和 app 中。

### bot 命令 {#bot-commands}

`operad bot skill <bot> <name> [--from <dir>]` 提议新的或修改后的 skill。不带 `--from` 时，stdin 是一个含有 `skill_md` 和 `files` 的 JSON 对象；带该选项时，读取该目录的文件。skill 需要有 `SKILL.md`。它输出 `proposed skill "<name>" for bot <bot>; review it in pending`。

`operad bot mcp <bot> <name> <command> [args…]` 启动一次本地 MCP server，读取它的工具列表，并提议注册它。没有 command 时，stdin 是粘贴进来的 `mcpServers` 条目。只能注册本地 server（带参数的命令）；地址（`url`、`type: "http"`、`type: "sse"`、`headers`）会被拒绝。包命令必须写明确切的版本：`npx -y pkg@1.2.3` 被接受；`pkg@latest` 或范围会被拒绝，并指出所需的版本。server 在 bot 的工作目录中，以 bot 的访问 profile 和它的 secret 启动。它输出 `proposed MCP server "<name>" for bot <bot> (<n> tools); review it in pending`。

`operad bot setting <bot>` 从 stdin 读取一个 JSON 对象并提议该变更。它不能添加或修改 `mcpServers`；那是 `bot mcp` 的用途。它输出 `proposed settings for bot <bot>; review it in pending`。

---
description: 访问 profile、默认 profile、access-user.json、always allow、目标 grant、MCP 工具和后台运行。
---

# 访问 {#access}

当 agent 要运行的命令或要访问的路径不在其访问 profile 允许的范围内时，它会先询问。人用一个操作回答这个问题；`allow_always` 会记录这次调用，以后不再询问。profile 是护栏，不是边界：它匹配的是调用的文本，如果程序用别的方式构造路径或命令，就超出了它能看到的范围。

## 为什么需要它 {#why-it-exists}

agent 能运行 shell 命令、编辑文件，而你不会在每次调用运行前都去读它。访问 profile 让你事先写明：哪些路径和命令被拒绝，哪些要先问人，哪些可以直接运行。默认 profile 覆盖常见情形：凭据、破坏性命令，以及少数会改动本机的命令；bot 还会加上它的 operad home。

profile 是护栏，不是边界。它匹配的是调用的文本，看不到程序运行起来之后做了什么，所以它并不声称能拦住一切。对于 `bash -c` 这类隐藏所运行内容的命令，它会询问或拒绝，而不是去猜；只有处于 Full access 的 chat 例外，这样的命令在那里会运行，除非明确匹配某条 deny。

## 它如何工作 {#how-it-works}

1. agent 运行工具之前，harness 把这次调用连同 profile 交给 `packages/access-match` 中的匹配器。一次调用由工具名、它的输入和工作目录组成。
2. 匹配器按 **deny、然后 ask、然后 allow** 的顺序处理。匹配 `denyPaths` 或 `denyCommands` 的调用被拒绝。匹配 `askPaths` 或 `askCommands`，或在 `readOnly` 工作目录中写入的调用，会询问人。其余调用直接运行。见 [profile](#the-profile)。
3. 路径会先规范化：`~` 视为用户的 home，相对路径接在调用的工作目录之后。命令会被拆成管道的各个部分，逐部分匹配。内联代码会被拒绝或询问，因为看不到它的内容；在 Full access 下它会运行，除非明确匹配某条 deny。
4. 对于 MCP 调用，只要有 `allowMcp` 字段，匹配器就会检查它：列出的工具直接运行，未列出的工具算作写入并先询问（见 [MCP 工具条目](#mcp-tool-entries)）。
5. 问题交给人，人回答 `allow_once`、`allow_always` 或 `reject_once`。`allow_always` 把确切的命令或路径以及工作目录追加到 `access-user.json`，该目录中下一次相同的调用就不再询问直接放行（见 [`allow_always`](#allow_always)）。它不会解除 deny。问题会显示它所针对的命令，即使是日志会因无法阅读而隐藏的命令：换行保留，超过 500 个字符处截断，已知的秘密值和开头的赋值的值会被遮盖。
6. 在[后台运行](#background-runs)中，没有人发起这次运行，所以 `alwaysAllow` 条目被忽略，每个问题都会重新询问。

## profile {#the-profile}

profile 是一个 JSON 对象。每个 chat 和每个生成的 step 都从下面的内置默认值开始。bot 的[设置](config.md#bot)、仓库 chat 和 flow 的 profile 在它之上追加；谁也不能去掉默认的 deny 或 ask。匹配器按这个顺序处理：**deny 优先于 ask，ask 优先于 allow**。匹配 deny 的调用无论 ask 规则怎么写都会被拒绝；只匹配 ask 规则的调用会询问人；其余调用一律允许。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `denyPaths` | 字符串数组 | 下面的默认列表 | 路径；`*` 只在单个路径段内匹配 | step 判断一次调用时 | 读取器拒绝：`denyPaths must be an array of strings` |
| `denyCommands` | 字符串数组 | 下面的默认列表 | 命令规则；带 `*` 的单词模式，管道各部分之间用 `\|` | step 判断一条命令时 | 读取器拒绝：`denyCommands must be an array of strings` |
| `askCommands` | 字符串数组 | 下面的默认列表 | 与 `denyCommands` 形式相同的命令规则 | step 判断一条未被任何 deny 拒绝的命令时 | 读取器拒绝：`askCommands must be an array of strings` |
| `askPaths` | 字符串数组 | 下面的默认列表 | 写入时需要询问的路径；`*` 只在单个路径段内匹配 | step 判断一次写入或编辑，或一次 `bash` 重定向时 | 读取器拒绝：`askPaths must be an array of strings` |
| `readOnly` | 布尔值 | `false` | `true` 或 `false` | step 判断发生在 profile 的工作目录中的调用时 | 读取器拒绝：`readOnly must be true or false` |
| `level` | 字符串 | 缺省 | `plan`、`ask`、`edits` 或 `full` | chat 为一次回复组合它的 profile 时；用 `/access` 更改 | 读取器拒绝：`level must be one of plan, ask, edits, full` |
| `readPaths` | 字符串数组 | `[]` | 在被拒绝的上级目录之下仍可读取的目录 | step 判断一次读取，或一条只读的 `bash` 命令时 | 读取器拒绝：`readPaths must be an array of strings` |
| `allowMcp` | 字符串数组 | 缺省：MCP 工具不受 profile 管辖 | `<server>.<tool>` 或 `<server>.*` | step 判断一次 MCP 调用时；只要有这个字段，即使为空，MCP 工具就受 profile 管辖 | 读取器拒绝：`allowMcp must be an array of strings` |
| `outwardCommands` | 字符串数组 | 下面的默认列表 | 与 `askCommands` 形式相同的命令规则 | 在后台运行中，一条向 operad 之外写入的命令运行之前 | 读取器拒绝：`outwardCommands must be an array of strings` |
| `outwardAllow` | 字符串数组 | `["owner"]` | 渠道和会话、地址、仓库和分支，或服务这几类目标；`owner` 是owner 自己的渠道 | 在后台运行中，让某个目标无需询问即可写入 | 读取器拒绝：`outwardAllow must be an array of strings` |
| `alwaysAllow` | 条目对象数组 | 对于由人发起的运行，是 [access-user.json](#access-userjson) 中的条目；后台运行中为空 | 下面的条目 | step 判断一次原本会询问的调用时 | 读取器拒绝：`alwaysAllow must be an array`，或某个条目自己的消息 |
| `grants` | grant 对象数组 | `[]` | step 为某一次确切调用携带的一次性权限 | 一直在等待的 step 继续时 | 读取器拒绝：`grants must be an array`，或某个 grant 自己的消息 |

匹配器不读取 `cwd`、`outside` 和 `network` 这几个字段。MCP 条目说明本地或远程 MCP 工具可以做什么；见 [MCP 工具条目](#mcp-tool-entries)。

`denyPaths` 和 `askPaths` 与调用所写的路径进行匹配，匹配前会做规范化：`~` 视为用户的 home，相对路径接在调用的工作目录之后。位于 `denyPaths` 条目之下的路径会被拒绝。位于 `askPaths` 条目之下的写入或编辑会询问；重定向到这样的路径的 `bash` 命令会连同整条命令一起询问。

`readOnly` 使调用的工作目录变为只读：在那里的写入或编辑会询问，`bash` 命令也会询问，除非它在只读命令的短名单上。读取命令可以以 `cd <dir>` 开头，不写入任何地方的重定向（`2>/dev/null`、`2>&1`）是允许的；重定向到文件仍会询问。deny 仍然优先。

`level` 是 chat 的访问级别。`plan` 是只读的；`ask` 对每次写入和每条不确定只读的命令都询问；`edits` 放行工作目录内的写入，而工作目录外的写入和不确定只读的命令会询问；`full` 什么都不问。在 `full` 下，匹配器跟不上的命令（内联代码、shell 展开、切换目录后它跟不上的路径）会运行，除非明确匹配某条 deny，而 `plan`、`ask` 和 `edits` 仍会就它询问。在 `full` 下只剩 `denyPaths`、`denyCommands`、`readOnly` 和 `readPaths` 之下的写入还起作用：deny 会拒绝，只读的工作目录会就写入或不确定只读的命令询问，`readPaths` 之下的写入会询问。`askCommands`、`askPaths` 和未列出的 MCP 工具在 `full` 下不询问；它们在 `plan`、`ask` 和 `edits` 下仍然适用。对外写入的问题在 `full` 下不适用，在低于它的级别的后台运行中仍会询问。chat 在仓库上从 `plan` 开始，在 bot 上从 bot 的 `accessLevel` 设置开始（未设置时为 `ask`；`full` 除 deny 规则外什么都不问），但定时 prompt 打开的 chat 例外，它从 `full` 开始；`/access <level>` 可以更改它；见 [chat 和 bot](chats-and-bots.md#access-level)。

`readPaths` 允许读取位于 `denyPaths` 某个上级条目之下的目录。它不允许写入：在那里写入会询问。

## 默认 profile {#the-default-profile}

默认 profile 在 `@operad-io/access-match` 中，每个 chat 和每个普通的生成 step 都从它开始。bot、仓库或 flow 可以往它的列表里追加，也可以打开 `readOnly`，但不能去掉任何一项。访问级别在这些追加之后才组合进来，所以 `full` 也保留这些 deny 规则；低于 `full` 的 chat 还保留 ask 规则。

dev 的 task worker 是例外：它只从默认值的 deny 规则开始，不带 ask 规则，因为它在自己 task 的 worktree 中工作，它的改动只有经过检查、review 和合并才会进入 main。chat 和其他生成的 step 在低于 `full` 的级别保留默认值，包括 ask；在 `full` 下只有它的 deny 规则和 `readOnly` 适用。

| List | Entries |
|---|---|
| `denyPaths` | `~/.ssh`、`~/.gnupg`、`~/.aws`、`~/.config/gh`、`~/.radian`、`~/Library/Keychains`、`~/Library/Application Support/Google/Chrome`、`~/Library/Application Support/Firefox`、`~/Library/Safari`、`.git/config`、`.git/hooks` |
| `denyCommands` | `sudo`、`su`、`rm -rf /`、`rm -rf ~`、`mkfs`、`dd`、`diskutil`、`shutdown`、`reboot`、`launchctl`、`crontab -r`、`git push --force*`、`git push --delete`、`curl … \| sh`、`wget … \| sh`、`pkill`、`killall` |
| `askCommands` | `git push`、`brew install`、`npm install -g`、`pip install`、`osascript`、`open` |
| `askPaths` | `~/.zshrc`、`~/.*profile` |
| `outwardCommands` | `git push`、`gh pr create`、`gh pr comment`、`gh issue create`、`gh issue comment`、`gh release create`、`curl`、`wget`、`mail`、`mailx`、`sendmail` |
| `outwardAllow` | `owner` |
| `readPaths`、`readOnly`、`allowMcp`、`level` | 缺省 |

bot 会加上 operad home 和 `operad` 命令：home 中除 bot 自己的目录之外的每一项都被拒绝（目前那里的名称，以及 `store`、`secrets`、`config.json` 和 MCP 报告目录），所以不是 `~/.operad` 的 home 也被覆盖。`~/.operad/bot` 之下 bot 自己的工作目录，是 home 中唯一允许 agent 使用的部分，包括其中的 `memory/` 目录。对默认 bot 来说，`~/.operad/bot` 的其余部分也是允许的，其他 bot 的目录除外：人或 bot 放在旧 home 里的文件和目录留在原处，仍然可读可写。其他 bot 则拒绝 `~/.operad/bot` 中不属于自己的条目。`dev` 已知的仓库的路径，以及 bot 的 skill 目录的路径，会加入 `denyPaths`：agent 通过 `dev` 的 action 访问仓库，而不是直接操作其中的文件。skill 目录同时也在 `readPaths` 中，所以 agent 可以读取它们；在那里写入仍然被拒绝。bot 自己的 `access` 列表会追加到这些列表之后，它的 `access.readOnly` 可以把工作目录变为只读。

仓库 chat 会把 `operad` 加入 `denyCommands`，并在主 clone 中以只读开始，它的 skill 目录在那里也是只读的。没有指定 profile 的生成 step 得到未经改动的默认值；指定了 profile 的 flow 在它之上追加。

规则是由单词组成的模式；`*` 匹配单词中的任意字符。`-rf` 匹配相同的单短横字母，顺序不限，`…` 不增加任何条件。因此 `git push --force*` 能匹配 `git -C x push --force`。内联命令（例如 `bash -c`、`python -c`、`bun -e`、`osascript -e`、`find -exec`、`xargs`、`eval`、反引号或 `$()`）在设置了 `denyCommands` 而没有设置 `askCommands` 时被拒绝；设置了 `askCommands` 时则改为询问，因为匹配器看不到它运行的内容。处于 `full` 的 chat 则会运行它，除非明确匹配某条 deny；`plan`、`ask` 和 `edits` 保留拒绝或询问。完整的规则表见 `packages/access-match/REFERENCE.md`。

## `access-user.json` {#access-userjson}

`$OPERAD_HOME/access-user.json`（见 [home](config.md#the-home)）保存人回答过 `allow_always` 的调用。文件不存在时视为空列表。无法读取的文件由读取它的 step 报告，并视为空。默认 bot 从旧的 `$OPERAD_HOME/bot` 移到 `$OPERAD_HOME/bot/default` 时，`cwd` 恰好是旧 home 的条目会被改写一次，指向新目录；其他条目保持原样。人通过回答 `allow_always` 添加条目；删除条目就是从数组中删掉它的对象。文件在加锁的情况下写入并整体替换，所以崩溃不会留下写了一半的文件。

<!-- schema: access-user.schema.json -->
```json
[
  { "kind": "command", "value": "git status --short", "cwd": "/Users/you/Code/example" },
  { "kind": "path", "value": "notes/todo.md", "cwd": "/Users/you/Code/example", "tool": "edit" }
]
```

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `kind` | 字符串 | 必填 | `command`、`path` | step 询问一次调用时：条目只匹配同种类的调用 | 没有 `command` 或 `path` 的条目会使整个文件被视为空；step 报告 `entry <i> is not a command or path entry with a value and a working directory` |
| `value` | 字符串 | 必填 | 与允许时完全一致的命令文本（MCP 工具则为 `mcp <server>.<tool>`），或调用所写的路径 | step 询问一次调用时：调用必须与它完全匹配 | 没有非空 value 的条目会使整个文件被视为空 |
| `cwd` | 字符串 | 必填 | 调用被允许时所在的工作目录 | step 询问一次调用时：调用必须在该目录中；换一个目录就是新的询问 | 没有非空工作目录的条目会使整个文件被视为空 |
| `tool` | 字符串 | `path` 必填 | 工具名，例如 `write` 或 `edit` | path 条目只允许该工具，同一路径上的其他工具不在内 | 没有 tool 的 path 条目，或带有 tool 的 command 条目，会使整个文件被视为空 |

无效的文件被视为空列表，step 会记录 `the user access file "<path>" ...; it is treated as empty`。只有当调用被允许了一次，`allow_always` 的回答才会写入条目；含有秘密值的调用从不询问，也从不写入。

## Always for this flow and target {#always-for-this-flow-and-target}

在后台运行中，对外写入的问题还提供 **Always for this flow and target**。选择它会记录一条 grant：同一个 flow，定义不变，向同一个目标写入时不再询问。换一个目标会询问，flow 的定义改动后也会重新询问，即使之后把改动撤销。grant 不与发送的内容绑定，所以每天文本都不同、发往同一个 chat 的每日摘要一直是允许的。chat 中针对确切调用的 `allow_always` 仍然不会解除后台的问题。

这些 grant 保存在 `$OPERAD_HOME/access-grants.json`。文件不存在时视为空列表。无法读取的文件由读取它的 step 报告，并视为空。人在仓库上用 `operad dev:allow` 列出和删除它们；`--target <target>` 删除某个目标的 grant，`--flow <name>` 把范围缩小到一个 flow。同一个 `allow` action 也可以通过 HTTP 和 MCP 使用，所以客户端可以显示这个列表。被删除的 grant 在下一次写入时会重新询问。

<!-- schema: access-grants.schema.json -->
```json
{
  "flows": [
    { "flow": "daily:send", "digest": "b3f1…", "id": "6a8e…" }
  ],
  "grants": [
    {
      "flow": "daily:send",
      "definition": "6a8e…",
      "kind": "channel",
      "target": "telegram:999",
      "by": { "via": "ios", "id": "owner" },
      "at": 1700000000000
    }
  ]
}
```

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `flows` | flow 身份数组 | `[]` | 最近一次见到的各个 flow 定义 | 每次判断一次后台对外写入时：digest 与上一次不同就生成新的 id | 缺少 flow、digest 或 id 的条目会使整个文件被视为空 |
| `flows.flow` | 字符串 | 必填 | flow 的名称 | 指明这个身份属于哪个 flow | 空值会使整个文件被视为空 |
| `flows.digest` | 字符串 | 必填 | 最近一次见到的定义的 digest | 用来区分定义被改过还是没变 | 空值会使整个文件被视为空 |
| `flows.id` | 字符串 | 必填 | 生成的身份，从不重复使用 | grant 只与带有这个身份的 grant 匹配 | 空值会使整个文件被视为空 |
| `grants` | 目标 grant 数组 | `[]` | 人允许过的目标 | 向匹配的目标进行的后台对外写入不询问 | 有字段缺失或错误的条目会使整个文件被视为空 |
| `grants.flow` | 字符串 | 必填 | flow 的名称 | grant 只解除这个 flow 的问题 | 空值会使整个文件被视为空 |
| `grants.definition` | 字符串 | 必填 | 人回答时所针对的定义身份 | 定义改动后不再匹配 | 空值会使整个文件被视为空 |
| `grants.kind` | 字符串 | 必填 | `channel`、`mail`、`post`、`repository`、`service`、`command` | 记录这个目标接受的是哪一类写入 | 其他任何值都会使整个文件被视为空 |
| `grants.target` | 字符串 | 必填 | 与问题中所写完全一致的目标 | 写入必须指向同一个目标 | 空值会使整个文件被视为空 |
| `grants.by` | 对象 | 必填 | `{ "via", "id" }`，即谁回答的 | 显示在列表中，并为owner 记录下来 | 字段缺失或为空会使整个文件被视为空 |
| `grants.by.via` | 字符串 | 必填 | 人回答时所用的客户端 | 显示在列表中 | 空值会使整个文件被视为空 |
| `grants.by.id` | 字符串 | 必填 | 谁回答的，按客户端对其的称呼 | 显示在列表中 | 空值会使整个文件被视为空 |
| `grants.at` | 数字 | 必填 | 人回答的时间，epoch 毫秒 | 显示在列表中 | 缺失或不是数字的值会使整个文件被视为空 |

## `allow_always` {#allow_always}

当一次调用需要询问时，在由人发起的运行中，人会看到三个选项（`allow_once`、`allow_always`、`reject_once`）。`allow_always` 让这次调用运行，并把它的确切值和工作目录追加到 `access-user.json`；之后在同一目录中文本相同的调用就不再询问直接运行。它不会解除 `denyPaths` 或 `denyCommands` 的匹配，也不涵盖不同的命令、不同写法的路径，或另一个目录中的同一命令。迟到的回答也可能带有写入；如果文件无法写入，step 会记录这一点，并让这次调用运行一次。

## MCP 工具条目 {#mcp-tool-entries}

profile 中的 `allowMcp`（或 bot 设置中的 `mcpAllow`）以 `<server>.<tool>` 或 `<server>.*` 的形式，列出无需询问即可运行的 MCP 工具。只要有这个字段，即使是空列表，MCP 工具就受 profile 管辖：未列出的工具算作写入，会先询问。已列出的工具无需询问即可运行；如果 deny 路径或命令覆盖了这次调用，deny 仍然优先。

被回答的 MCP 问题和其他命令一样被记录：`kind` 是 `command`，`value` 是 `mcp <server>.<tool>`，`cwd` 是工作目录。条目只与该 server 和该工具完全匹配。

## 后台运行 {#background-runs}

当没有任何人的消息启动一次运行时，它就是**后台运行**：计划任务、webhook、来自其他来源的传入消息，或某次运行发出的事件。按这条规则，只有来自 chat 自己的客户端来源（`ios`、`telegram`、`cli`、`tui`、`other`）的消息才算人的消息。

在后台运行中，现有的 `alwaysAllow` 条目不被使用，也不提供 `allow_always`：每次询问都会重新问。这是有意为之：计划运行或传入运行要重新受 profile 约束，而不是继承某个人在先前对话中给出的权限。

低于 `full` 时，**对外写入**也会先询问：一条消息、一封邮件或一个帖子；一次 `git push`；或对外部服务的一次写入调用。问题会写明目标（chat、地址、仓库和分支，或服务）并带上全部内容；它的选项是 `Send once`、`Always for this flow and target` 和 `Reject`。向owner 自己的某个渠道，或向 `outwardAllow` 中的目标写入，不会询问。plugin 的 step 或 action 会声明这样的写入；shell step 使用 `outwardCommands`。chat 中针对确切调用的 `alwaysAllow` 不会解除这个问题；只有上面那一节的目标 grant 可以。处于 `full` 的 chat 对外什么都不问：见[访问级别](chats-and-bots.md#access-level)。

---
description: 访问 profile、默认 profile、access-user.json、always allow、MCP 工具和后台运行。
---

# 访问 {#access}

当 agent 要运行的命令或要访问的路径不在其访问 profile 允许的范围内时，它会先询问。人用一个操作回答这个问题；`allow_always` 会记录这次调用，以后不再询问。profile 是护栏，不是边界：它匹配的是调用的文本，如果程序用别的方式构造路径或命令，就超出了它能看到的范围。

## 为什么需要它 {#why-it-exists}

agent 能运行 shell 命令、编辑文件，而你不会在每次调用运行前都去读它。访问 profile 让你事先写明：哪些路径和命令被拒绝，哪些要先问人，哪些可以直接运行。默认 profile 覆盖常见情形：凭据、operad home、破坏性命令，以及少数会改动本机的命令。

profile 是护栏，不是边界。它匹配的是调用的文本，看不到程序运行起来之后做了什么，所以它并不声称能拦住一切。对于 `bash -c` 这类隐藏所运行内容的命令，它会询问或拒绝，而不是去猜。

## 它如何工作 {#how-it-works}

1. agent 运行工具之前，harness 把这次调用连同 profile 交给 `packages/access-match` 中的匹配器。一次调用由工具名、它的输入和工作目录组成。
2. 匹配器按 **deny、然后 ask、然后 allow** 的顺序处理。匹配 `denyPaths` 或 `denyCommands` 的调用被拒绝。匹配 `askPaths` 或 `askCommands`，或在 `readOnly` 工作目录中写入的调用，会询问人。其余调用直接运行。见 [profile](#the-profile)。
3. 路径会先规范化：`~` 视为用户的 home，相对路径接在调用的工作目录之后。命令会被拆成管道的各个部分，逐部分匹配。内联代码会被拒绝或询问，因为看不到它的内容。
4. 对于 MCP 调用，只要有 `allowMcp` 字段，匹配器就会检查它：列出的工具直接运行，未列出的工具算作写入并先询问（见 [MCP 工具条目](#mcp-tool-entries)）。
5. 问题交给人，人回答 `allow_once`、`allow_always` 或 `reject_once`。`allow_always` 把确切的命令或路径以及工作目录追加到 `access-user.json`，该目录中下一次相同的调用就不再询问直接放行（见 [`allow_always`](#allow_always)）。它不会解除 deny。
6. 在[后台运行](#background-runs)中，没有人发起这次运行，所以 `alwaysAllow` 条目被忽略，每个问题都会重新询问。

## profile {#the-profile}

profile 是一个 JSON 对象。bot 的 profile 是它的 [bot 设置](config.md#bot)与下面的默认值合并的结果；flow 的 profile 会交给声明要强制执行其字段的 step。匹配器按这个顺序处理：**deny 优先于 ask，ask 优先于 allow**。匹配 deny 的调用无论 ask 规则怎么写都会被拒绝；只匹配 ask 规则的调用会询问人；其余调用一律允许。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `denyPaths` | 字符串数组 | 下面的默认列表 | 路径；`*` 只在单个路径段内匹配 | step 判断一次调用时 | 读取器拒绝：`denyPaths must be an array of strings` |
| `denyCommands` | 字符串数组 | 下面的默认列表 | 命令规则；带 `*` 的单词模式，管道各部分之间用 `\|` | step 判断一条命令时 | 读取器拒绝：`denyCommands must be an array of strings` |
| `askCommands` | 字符串数组 | 下面的默认列表 | 与 `denyCommands` 形式相同的命令规则 | step 判断一条未被任何 deny 拒绝的命令时 | 读取器拒绝：`askCommands must be an array of strings` |
| `askPaths` | 字符串数组 | 下面的默认列表 | 写入时需要询问的路径；`*` 只在单个路径段内匹配 | step 判断一次写入或编辑，或一次 `bash` 重定向时 | 读取器拒绝：`askPaths must be an array of strings` |
| `readOnly` | 布尔值 | `false` | `true` 或 `false` | step 判断发生在 profile 的工作目录中的调用时 | 读取器拒绝：`readOnly must be true or false` |
| `readPaths` | 字符串数组 | `[]` | 在被拒绝的上级目录之下仍可读取的目录 | step 判断一次读取，或一条只读的 `bash` 命令时 | 读取器拒绝：`readPaths must be an array of strings` |
| `allowMcp` | 字符串数组 | 缺省：MCP 工具不受 profile 管辖 | `<server>.<tool>` 或 `<server>.*` | step 判断一次 MCP 调用时；只要有这个字段，即使为空，MCP 工具就受 profile 管辖 | 读取器拒绝：`allowMcp must be an array of strings` |
| `alwaysAllow` | 条目对象数组 | 对于由人发起的运行，是 [access-user.json](#access-userjson) 中的条目；后台运行中为空 | 下面的条目 | step 判断一次原本会询问的调用时 | 读取器拒绝：`alwaysAllow must be an array`，或某个条目自己的消息 |
| `grants` | grant 对象数组 | `[]` | step 为某一次确切调用携带的一次性权限 | 一直在等待的 step 继续时 | 读取器拒绝：`grants must be an array`，或某个 grant 自己的消息 |

匹配器不读取 `cwd`、`outside` 和 `network` 这几个字段。MCP 条目说明本地或远程 MCP 工具可以做什么；见 [MCP 工具条目](#mcp-tool-entries)。

`denyPaths` 和 `askPaths` 与调用所写的路径进行匹配，匹配前会做规范化：`~` 视为用户的 home，相对路径接在调用的工作目录之后。位于 `denyPaths` 条目之下的路径会被拒绝。位于 `askPaths` 条目之下的写入或编辑会询问；重定向到这样的路径的 `bash` 命令会连同整条命令一起询问。

`readOnly` 使调用的工作目录变为只读：在那里的写入或编辑会询问，`bash` 命令也会询问，除非它在只读命令的短名单上。deny 仍然优先。

`readPaths` 允许读取位于 `denyPaths` 某个上级条目之下的目录。它不允许写入：在那里写入会询问。

## 默认 profile {#the-default-profile}

默认 profile 是 bot 的起点。它的列表会加到 bot 自己写的列表上；bot 可以收紧，但不能放宽。

| List | Entries |
|---|---|
| `denyPaths` | `~/.ssh`、`~/.gnupg`、`~/.aws`、`~/.config/gh`、`~/.radian`、`~/Library/Keychains`、`~/Library/Application Support/Google/Chrome`、`~/Library/Application Support/Firefox`、`~/Library/Safari`、`.git/config`、`.git/hooks`，以及 operad home 中除 bot 自己的目录之外的每一项（目前那里的名称，以及 `store`、`secrets`、`config.json` 和 MCP 报告目录） |
| `denyCommands` | `operad`、`sudo`、`su`、`rm -rf /`、`rm -rf ~`、`mkfs`、`dd`、`diskutil`、`shutdown`、`reboot`、`launchctl`、`crontab -r`、`git push --force*`、`git push --delete`、`curl … \| sh`、`wget … \| sh`、`pkill`、`killall` |
| `askCommands` | `git push`、`brew install`、`npm install -g`、`pip install`、`osascript`、`open` |
| `askPaths` | `~/.zshrc`、`~/.*profile` |
| `readPaths`、`readOnly`、`allowMcp` | 缺省 |

home 中的条目是绝对路径，所以不是 `~/.operad` 的 home 也被覆盖。`~/.operad/bot` 之下 bot 自己的工作目录，是 home 中唯一允许 agent 使用的部分。`dev` 已知的仓库的路径，以及 bot 的 skill 目录的路径，会加入 `denyPaths`：agent 通过 `dev` 的 action 访问仓库，而不是直接操作其中的文件。bot 自己的 `access` 列表会追加到这些列表之后，它的 `access.readOnly` 可以把工作目录变为只读。

规则是由单词组成的模式；`*` 匹配单词中的任意字符。`-rf` 匹配相同的单短横字母，顺序不限，`…` 不增加任何条件。因此 `git push --force*` 能匹配 `git -C x push --force`。内联命令（例如 `bash -c`、`python -c`、`bun -e`、`osascript -e`、`find -exec`、`xargs`、`eval`、反引号或 `$()`）在设置了 `denyCommands` 时被拒绝，只设置了 `askCommands` 时会询问，因为匹配器看不到它运行的内容。完整的规则表见 `packages/access-match/REFERENCE.md`。

## `access-user.json` {#access-userjson}

`$OPERAD_HOME/access-user.json`（见 [home](config.md#the-home)）保存人回答过 `allow_always` 的调用。文件不存在时视为空列表。无法读取的文件由读取它的 step 报告，并视为空。人通过回答 `allow_always` 添加条目；删除条目就是从数组中删掉它的对象。文件在加锁的情况下写入并整体替换，所以崩溃不会留下写了一半的文件。

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

## `allow_always` {#allow_always}

当一次调用需要询问时，在由人发起的运行中，人会看到三个选项（`allow_once`、`allow_always`、`reject_once`）。`allow_always` 让这次调用运行，并把它的确切值和工作目录追加到 `access-user.json`；之后在同一目录中文本相同的调用就不再询问直接运行。它不会解除 `denyPaths` 或 `denyCommands` 的匹配，也不涵盖不同的命令、不同写法的路径，或另一个目录中的同一命令。迟到的回答也可能带有写入；如果文件无法写入，step 会记录这一点，并让这次调用运行一次。

## MCP 工具条目 {#mcp-tool-entries}

profile 中的 `allowMcp`（或 bot 设置中的 `mcpAllow`）以 `<server>.<tool>` 或 `<server>.*` 的形式，列出无需询问即可运行的 MCP 工具。只要有这个字段，即使是空列表，MCP 工具就受 profile 管辖：未列出的工具算作写入，会先询问。已列出的工具无需询问即可运行；如果 deny 路径或命令覆盖了这次调用，deny 仍然优先。

被回答的 MCP 问题和其他命令一样被记录：`kind` 是 `command`，`value` 是 `mcp <server>.<tool>`，`cwd` 是工作目录。条目只与该 server 和该工具完全匹配。

## 后台运行 {#background-runs}

当没有任何人的消息启动一次运行时，它就是**后台运行**：计划任务、webhook、来自其他来源的传入消息，或某次运行发出的事件。按这条规则，只有来自 chat 自己的客户端来源（`ios`、`telegram`、`cli`、`tui`、`other`）的消息才算人的消息。

在后台运行中，现有的 `alwaysAllow` 条目不被使用，也不提供 `allow_always`：每次询问都会重新问，只有 `allow_once` 和 `reject_once`。这是有意为之：计划运行或传入运行要重新受 profile 约束，而不是继承某个人在先前对话中给出的权限。

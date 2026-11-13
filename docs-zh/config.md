---
description: config.json 文件：home 在哪里、每个部分和每个键，以及每个插件的设置。
---

# config.json {#configjson}

`config.json` 配置 `operad`。本页说明 home 在哪里、该文件的每个键，以及每个插件的设置部分。`http` 的键也在 [HTTP 页](http.md#the-http-section)中，`notify` 的键在 [notifications](notifications.md) 中，`mcp` 的键在 [MCP 页](mcp.md)中，`dev` 的仓库设置在 [dev 页](dev.md)中。

## home {#the-home}

`operad` 把它的状态保存在一个目录中：设置了 `$OPERAD_HOME` 时用它，否则用 `~/.operad`。home 中有 `config.json`、store、secrets 目录、`access-user.json`、`keys.json`、`triggers.json`、`tui.json` 和 themes 目录。secret 文件的权限是 `0600`，位于权限为 `0700` 的目录内；本手册中没有任何地方会打印 secret。

## 示例 {#an-example}

<!-- schema: config.schema.json -->
```json
{
  "plugins": {
    "shell": { "module": "@operad-io/shell", "enabled": true },
    "cron": { "module": "@operad-io/source-cron", "enabled": true },
    "chat": { "module": "@operad-io/chat", "settings": { "speaker": "Operad Bot" } },
    "dev": { "module": "@operad-io/dev", "settings": { "checks": 2 } },
    "pool": { "module": "@operad-io/pool", "settings": { "harnesses": { "pi": 2 } } },
    "bot": {
      "module": "@operad-io/bot",
      "settings": {
        "bots": {
          "default": {
            "harness": "pi",
            "model": "opencode-go/deepseek-v4.1-flash",
            "effort": "medium",
            "cwd": "~/work/assistant",
            "skills": ["~/work/assistant/skills"],
            "speaker": "Assistant",
            "mcpAllow": ["notes.search"],
            "access": { "readOnly": true, "askCommands": ["git push"] }
          }
        }
      }
    },
    "claude": {
      "module": "@operad-io/harness-claude",
      "settings": {
        "model": "sonnet",
        "effort": "high",
        "command": "claude",
        "maxTurns": 40,
        "budgetUsd": 10,
        "bashTimeoutSecs": 1800,
        "wallTimeSecs": 3600,
        "stallSecs": 600,
        "concurrency": { "sonnet": 2 }
      }
    },
    "pi": {
      "module": "@operad-io/harness-pi",
      "settings": {
        "model": "opencode-go/deepseek-v4.1-flash",
        "models": ["opencode-go/deepseek-v4.1-flash", "openai/gpt-5"],
        "thinkingLevel": "medium",
        "command": "pi",
        "authPath": "~/.pi/agent/auth.json",
        "modelsPath": "~/.pi/agent/models.json",
        "wallTimeSecs": 3600,
        "stallSecs": 600,
        "bashTimeoutSecs": 1800,
        "concurrency": { "opencode-go/deepseek-v4.1-flash": 2 }
      }
    },
    "radian": {
      "module": "@operad-io/harness-radian",
      "settings": {
        "command": "radian",
        "wallTimeSecs": 300,
        "stallSecs": 600,
        "concurrency": { "anthropic/claude-sonnet-4": 1 }
      }
    }
  },
  "store": { "backend": "sqlite", "path": "store/log.sqlite" },
  "http": { "enabled": true, "port": 7480, "listen": ["127.0.0.1"] },
  "notify": { "command": "sh ~/.operad/notify.sh", "on": ["waiting"] },
  "mcp": {
    "channel": { "notify": ["waiting", "ended", "loop"], "loopAfter": 3 },
    "actions": ["dev:rework", "dev:reverify", "dev:reject", "dev:priority", "dev:concurrency", "chat:close"],
    "confirmActions": ["chat:close"]
  },
  "ask": { "graceSecs": 600 }
}
```

当 home 中没有 `config.json` 时，`operad init` 会写入一个：安装了 `shell`、`radian`、`chat` 和 `dev`，store 位于 `store/log.sqlite`，`http` 在 `127.0.0.1:7480` 上开启，通知关闭，写入上面的 `mcp.actions` 和 `mcp.confirmActions` 列表，以及 600 秒的 ask grace。这些全部写入文件；其中没有任何隐藏的默认值。完全没有 `config.json` 的 home 没有插件，也不允许任何 lead action。

已有的 home 不会被重写。在已有 `config.json` 的 home 上运行 `operad init` 会保持该文件不变；唯一的例外是没有 `plugins` 键的文件，它会被加上默认插件，其他什么都不改。没有 `mcp.actions` 的 `config.json` 不允许任何 lead action。在这次变更之前创建的 home 已经列出了它的插件，但可能没有 `mcp.actions`；要保留 lead 的 action，请把下面几行加入它的 `mcp` 部分，然后重启 `operad mcp`：

```json
"mcp": {
  "actions": ["dev:rework", "dev:reverify", "dev:reject", "dev:priority", "dev:concurrency", "chat:close"],
  "confirmActions": ["chat:close"]
}
```

之后启用某个插件不会把它的 action 加入 `mcp.actions`；请手动添加。

每个顶层部分都是可选的。内核只读取它点名的键：顶层、引擎部分（`store`、`http`、`notify`、`mcp`、`ask`）内部，或 `plugins` 条目内部的未知键都会被忽略。唯一会拒绝拼写错误的地方是 `plugins.<name>.settings`，它由该插件自己的 schema 检查；那里的未知键会使该插件被拒绝，并给出一行指明插件和字段的信息。

## 各个部分 {#the-sections}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `plugins` | object，或模块名数组 | `operad init` 安装的四个插件 | 插件名对应模块名、路径或选项对象 | 每次命令启动时，以及运行中的 `serve` 在变更后重新加载时 | 被拒绝：`plugins: must be an object of plugin options or an array of module names` |
| `store` | object | 位于 `<home>/store/log.sqlite` 的 sqlite | 下面的键 | 每次命令启动时 | 被拒绝：`store: must be an object` |
| `http` | object | 开启，端口 `7480`，`127.0.0.1` | [HTTP 页](http.md#the-http-section)中的键 | `operad serve` 启动时；新配置加载时重新加载 | 被拒绝：`http: must be an object`，或该字段自己的信息 |
| `notify` | object | command 为 `null`，`on` 为 `["waiting"]` | [notifications](notifications.md) 中的键 | `operad serve` 启动时；新配置加载时重新加载 | 被拒绝：`notify: must be an object`，或该字段自己的信息 |
| `mcp` | object | 下面的列表 | 下面的键 | `operad mcp` 启动时 | 被拒绝：`mcp: must be an object`，或该字段自己的信息 |
| `ask` | object | `{ "graceSecs": 600 }` | 下面的键 | 当某个 step 向人提问时 | 被拒绝：`ask: must be an object`，或 `ask.graceSecs: ...` |

内核在命令启动时读取 `config.json`。运行中的 `serve` 会监视该文件，并在新文件加载成功时重新加载；加载失败时，旧配置继续运行，并把问题记入日志。一次性命令在下次运行时重新读取该文件。

### `plugins` {#plugins}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `plugins` | object 或数组 | 没有 `plugins` 部分的文件中为 `[]` | 插件名对应模块或选项对象；数组条目是模块名 | 加载插件时 | 被拒绝：`plugins: must be an object of plugin options or an array of module names` |
| `plugins.<name>` | string 或 object | 无 | 非空的模块名或路径，或带有下列键的对象 | 加载插件时 | 被拒绝：`plugins.<name>: must be a module name or an object of options` |
| `plugins.<name>.module` | string | 键 `<name>` 本身 | 模块名、相对于 home 的路径，或 `file:` URL；随附的包是 `@operad-io/<name>`，`claude`、`pi` 和 `radian` 则是 `@operad-io/harness-<name>` | 加载插件时 | 被拒绝：`plugins.<name>.module: must be a non-empty string` |
| `plugins.<name>.enabled` | boolean | `true` | `true` 或 `false` | 加载插件时；被禁用插件已存储的对象会保留 | 被拒绝：`plugins.<name>.enabled: must be a boolean` |
| `plugins.<name>.settings` | object | `{}` | 该插件自己的设置 schema 接受的部分；见下文 | 加载插件时 | 该插件被拒绝，并给出一行指明字段的 `plugin "<name>": ...`；需要它的插件也会被拒绝 |

如果某个插件条目的模块导入失败、设置无效，或它声明的名称与它的键不匹配，它就不会加载。文件的其余部分仍会加载，`serve` 和 `operad plugin check` 会打印说明原因的那一行。`operad plugin list`、`operad plugin enable`、`operad plugin disable` 和 `operad plugin check` 见 [CLI 页](cli.md)。

`operad init` 安装 `shell`、`radian`、`chat` 和 `dev`。`pi`、`claude`、`codex`、`pool` 和 `bot` 随附但未安装；用 `operad plugin enable <name>` 启用。

### `store` {#store}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `store.backend` | string | `"sqlite"` | 只有 `"sqlite"` | 每次命令启动时 | 被拒绝：`store.backend: must be "sqlite"` |
| `store.path` | string | `<home>/store/log.sqlite` | 非空路径；相对路径相对于 home 解析 | 每次命令启动时 | 被拒绝：`store.path: must be a non-empty string` |

store 是 history 和 pending 视图读取的内容。更改路径会让新进程读取另一份 history；它不会移动旧文件。

### `mcp` {#mcp}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `mcp.channel` | object | `{ "notify": ["waiting", "ended", "loop"], "loopAfter": 3 }` | 下面的键 | `operad mcp` 启动时 | 被拒绝：`mcp.channel: must be an object` |
| `mcp.channel.notify` | 字符串数组 | `["waiting", "ended", "loop"]` | `waiting`、`ended`、`loop`、`changes` | `operad mcp` 启动时 | 被拒绝：`mcp.channel.notify: unknown entry <value>; use "waiting", "ended", "loop", "changes"` |
| `mcp.channel.loopAfter` | integer | `3` | `2` 或更大 | `operad mcp` 启动时 | 被拒绝：`mcp.channel.loopAfter: must be an integer of 2 or more` |
| `mcp.actions` | 字符串数组 | `[]`（`operad init` 会在新文件中写入五个 `dev` lead action 和 `chat:close`） | `<plugin>:<action>` 名称 | `operad mcp` 启动时 | 被拒绝：`mcp.actions: must be an array of "<plugin>:<action>" names` |
| `mcp.confirmActions` | 字符串数组 | `[]`（`operad init` 会在新文件中写入 `["chat:close"]`） | 同时在 `mcp.actions` 中、且需要确认的 `<plugin>:<action>` 名称 | `operad mcp` 启动时 | 被拒绝：`mcp.confirmActions: must be an array of "<plugin>:<action>" names` |

`mcp.actions` 是 MCP server 可以替 lead 运行的列表。其他所有 action 都会被拒绝，留给 owner 运行。`mcp.confirmActions` 是允许的 action 中更小的一个列表，这些 action 还需要 `confirm: true`；在 `actions` 中但不在这里的 action，即使 MCP 调用已确认也会被拒绝。channel 的键在 [MCP 页](mcp.md#claude-code-channel)中说明。

### `ask` {#ask}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `ask.graceSecs` | number | `600` | `0` 到 `2147483` 秒；`0` 表示不等待 | 当某个 step 调用 `ctx.ask` 且没有更窄的 grace 时 | 被拒绝：`ask.graceSecs: must be a number of seconds from 0 to 2147483` |

step 自己的 `askGraceSecs` 参数，或该调用自己的 grace，可以更窄。没有无限值；当人可能在很长时间之后才回答时，请使用允许的最大数值。提问的方式在 [Asking a person from a step](../plugins/asking.md) 中说明。

## 插件设置 {#plugin-settings}

插件设置位于 `plugins.<name>.settings` 之下。没有设置 schema 的插件没有键：`shell` 和 cron 来源（`cron`，即 `@operad-io/source-cron` 包）完全由它们的 flow step 和 `triggers.json` 配置。`review-grading` 是一个读取 `<repository>/.operad/review.json` 的库，记录在 [dev 页](dev.md#reviewjson)中。MCP server、终端客户端、HTTP 接口和通知由上面的部分配置，而不是由插件设置配置。

每项设置都在插件加载时读取。运行中的 `serve` 在 `config.json` 变更且新文件加载成功时重新加载；已经启动的 step 保留它启动时的设置。例外情况在各表中说明。

### `bot` {#bot}

`bot` 部分描述属于某个 bot 的 chat。默认 bot `default` 即使没有写出也存在。名称由小写字母、数字、`-` 和 `_` 组成，且以字母或数字开头；任何其他名称都会使该 bot 被拒绝，信息为 `bot "<name>": a name is lowercase letters, digits, "-" and "_", and starts with a letter or digit`。bot 在每次回复时都会重新读取，所以修改会应用到下一次回复。见 [Chats and bots](chats-and-bots.md)。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `bot.bots` | object | `{ "default": {} }` | bot 名称对应 bot 对象 | 下一次回复 | 被 schema 拒绝；错误的名称会使该 bot 被拒绝 |
| `bot.bots.<name>` | object | `{}` | 下面的键 | 下一次回复 | 被拒绝：`bot "<name>": ...` 或 schema 的字段信息 |
| `bot.bots.<name>.cwd` | string | `default` 为 `~/.operad/bot`，其他 bot 为 `~/.operad/bot/<name>` | `~/.operad/bot` 内的目录，或完全在 operad home 之外的目录 | 下一次回复和下一次 chat 启动 | 被拒绝：`bot "<name>": the working directory <path> is inside the operad home but outside <bot dir>` 或 `... is the operad home or holds it` |
| `bot.bots.<name>.harness` | string | chat 提供的第一个已加载的 agent | 已加载的 agent 插件名，例如 `claude` 或 `pi` | 新 chat 启动时 | chat 启动时，不是 agent 的名称会被拒绝 |
| `bot.bots.<name>.skills` | 字符串数组 | `[]` | 包含 `SKILL.md` 的目录；相对路径位于工作目录之下 | 下一次回复 | 被拒绝：`skill "<path>": there is no SKILL.md in <path>` |
| `bot.bots.<name>.model` | string | agent 的默认值 | chat 的 agent 所列出的 model | 新 chat 启动时 | agent 没有列出它时，在 chat 启动时被拒绝 |
| `bot.bots.<name>.effort` | string | agent 的默认值 | chat 的 agent 所列出的 effort | 新 chat 启动时 | agent 没有列出它时，在 chat 启动时被拒绝 |
| `bot.bots.<name>.speaker` | string | `chat.speaker` 的值 | 非空文本 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers` | object | `{}` | server 名称对应 server 对象；用 `operad bot mcp` 添加，需由人批准 | 下一次回复 | 被 schema 拒绝；工具发生变化的 server 不会被挂载 |
| `bot.bots.<name>.mcpServers.<name>` | object | 无 | 下面的键 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.command` | string | 无 | 启动该 server 的程序 | 下一次回复 | 被 schema 拒绝；缺少 command 表示该 server 无法启动 |
| `bot.bots.<name>.mcpServers.<name>.args` | 字符串数组 | `[]` | 该程序的参数 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.package` | string | 无 | command 所运行的包（当它运行某个包时） | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.version` | string | 无 | 该包固定的版本 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.secrets` | 字符串数组 | `[]` | 变量名；每个值是 bot 插件的 secret `<server>.<variable>` | server 启动时 | 被 schema 拒绝；缺失的 secret 以空值给出 |
| `bot.bots.<name>.mcpServers.<name>.tools` | 对象数组 | `[]` | 人批准过的工具 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.tools.name` | string | 必填 | 工具名 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.tools.description` | string | `""` | 工具的描述 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.mcpServers.<name>.digest` | string | 无 | 工具名和描述的摘要 | 下一次回复 | 发现其他工具的 chat 不会挂载该 server |
| `bot.bots.<name>.mcpAllow` | 字符串数组 | `[]` | `<server>.<tool>` 或 `<server>.*` | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.access` | object | `{}` | 下面的键；叠加到默认 access profile 上 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.access.denyPaths` | 字符串数组 | `[]` | 路径；追加到默认列表之后 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.access.denyCommands` | 字符串数组 | `[]` | 命令规则；追加到默认列表之后 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.access.askCommands` | 字符串数组 | `[]` | 命令规则；追加到默认列表之后 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.access.askPaths` | 字符串数组 | `[]` | 路径；追加到默认列表之后 | 下一次回复 | 被 schema 拒绝 |
| `bot.bots.<name>.access.readOnly` | boolean | `false` | `true` 使 bot 的工作目录变为只读；bot 只能收紧默认值，不能放宽 | 下一次回复 | 被 schema 拒绝 |

默认 profile 和各个 access 字段的含义见 [access 页](access.md)。`mcpAllow` 的含义与 profile 的 `allowMcp` 相同；未列出的 MCP 工具会先询问。

### `chat` {#chat}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `chat.speaker` | string | `"Operad Bot"` | 非空文本 | 渲染 chat 记录时 | 被 schema 拒绝 |

bot chat 使用它的 bot 的 `speaker`。见 [Chats and bots](chats-and-bots.md)。

### `dev` {#dev}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `dev.checks` | integer | `2` | `1` 或更大 | 下一次检查占用名额时；已经在等待或运行的检查保留它们的名额 | 被 schema 拒绝；该插件被拒绝，日志指明 `settings.checks` |

`dev.checks` 是这个 home 中同时运行的检查（任务的 verify，以及 merge 之前的检查）的最大数量，跨所有仓库计算。仓库可以用[它的 dev.json](dev.md#the-gate-and-its-checks) 中的 `gate.places` 降低自己的份额。

### `pool` {#pool}

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `pool.harnesses` | object | `{}` | harness 插件名对应数量 | 下一个 `pool/agent` step 启动时；已经在运行的 step 保留它们的名额 | 被 schema 拒绝；该插件被拒绝，日志指明 `settings.harnesses` |
| `pool.harnesses.<name>` | integer | 该 harness 没有上限 | `1` 或更大 | 下一个 `pool/agent` step 启动时 | 被 schema 拒绝 |

该数量涵盖这个 home 中通过 `pool/agent` 对该 harness 发起的每一次 run，跨仓库和 flow。直接调用 harness step 的 flow 不计入，但该 harness 自己的 `concurrency` 仍然适用。见 [Sharing agents between flows](dev.md#sharing-agents-between-flows-the-pool-plugin)。

### `claude` {#claude}

`claude` 插件运行 Claude Code。它的 step 是 `claude/agent`；见 [dev 页](dev.md#long-commands-under-claude)。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `claude.model` | string | claude 的默认值，新 chat 为 `sonnet` | claude 接受的 model 名，例如 `opus` 或 `sonnet` | agent step 或新 chat 启动时 | 被 schema 拒绝 |
| `claude.effort` | string | claude 的默认值 | `low`、`medium`、`high`、`xhigh`、`max` | agent step 或新 chat 启动时 | 被 schema 拒绝 |
| `claude.command` | string | `"claude"` | 命令名或路径 | agent step 启动时 | 被 schema 拒绝；不是 claude 的命令会使插件检查失败 |
| `claude.maxTurns` | integer | 无限制 | `1` 或更大 | agent step 启动时 | 被 schema 拒绝 |
| `claude.budgetUsd` | number | 无限制 | `0.01` 或更大 | agent step 启动时 | 被 schema 拒绝 |
| `claude.bashTimeoutSecs` | integer | `1800` | `1` 或更多秒 | agent step 启动时 | 被 schema 拒绝 |
| `claude.wallTimeSecs` | number | `3600` | `1` 到 `28500` 秒 | agent step 启动时 | 被 schema 拒绝；更大的值还会使该 step 失败，信息为 `must be at most 28500` |
| `claude.stallSecs` | number | `600` | `1` 或更多秒 | agent step 启动时 | 被 schema 拒绝 |
| `claude.concurrency` | object | `{}` | model 名对应 `1` 或更大的数量 | 随下一个启动的 agent step，该 model 最多不超过此数量 | 被 schema 拒绝；会指明该数量的键 |
| `claude.concurrency.<name>` | integer | 该 model 没有限制 | `1` 或更大 | 随该 model 的下一个 agent step | 被 schema 拒绝 |

`maxTurns` 和 `budgetUsd` 是针对单次 run 的限制；未设置表示没有限制。`budgetUsd` 用于 API key 登录。`bashTimeoutSecs` 是一次 Bash 调用在前台最长可以运行的时间。`concurrency` 统计这个 home 中的每一次 run，包括 `dev` 启动的那些；更改不会停止已经在运行的 run。

### `codex` {#codex}

`codex` 插件通过 `codex-acp` 运行用户自己的 Codex。它的 step 是 `codex/agent`；设置方法和这些设置见 [dev 页](dev.md#the-codex-settings)。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `codex.model` | string | Codex 的默认值 | codex-acp 提供的 model 名 | agent step 启动时 | 被 schema 拒绝；codex-acp 不提供的 model 会使该 step 失败 |
| `codex.effort` | string | Codex 的默认值 | `minimal`、`low`、`medium`、`high`、`xhigh` | agent step 启动时 | 被 schema 拒绝 |
| `codex.command` | 字符串数组 | `PATH` 中的 `bun` 和 `codex-acp` | 程序及其参数 | agent step 启动时 | 被 schema 拒绝；无法启动的命令会使插件检查失败 |
| `codex.wallTimeSecs` | number | `3600` | `1` 到 `28500` 秒 | agent step 启动时 | 被 schema 拒绝 |
| `codex.stallSecs` | number | `600` | `1` 或更多秒 | agent step 启动时 | 被 schema 拒绝 |
| `codex.concurrency` | object | `{}` | model 名对应 `1` 或更大的数量 | 随下一个启动的 agent step | 被 schema 拒绝；会指明该数量的键 |
| `codex.concurrency.<name>` | integer | 该 model 没有限制 | `1` 或更大 | 随该 model 的下一个 agent step | 被 schema 拒绝 |

### `pi` {#pi}

`pi` 插件运行 pi。它的 step 是 `pi/agent`；见 [Long commands under pi](dev.md#long-commands-under-pi)。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `pi.model` | string | pi 的默认 model | `provider/id` | agent step 或新 chat 启动时 | 被 schema 拒绝 |
| `pi.models` | 字符串数组 | `pi --list-models` 打印的每个 model | `provider/id` 值 | 新 chat 列出它的 model 时 | 被 schema 拒绝 |
| `pi.thinkingLevel` | string | pi 的默认值 | `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` | agent step 或新 chat 启动时 | 被 schema 拒绝 |
| `pi.command` | string | `"pi"` | 指向已安装的 `@earendil-works/pi-coding-agent` 的命令名或路径 | 插件加载时和 agent step 启动时 | 被 schema 拒绝；缺失或过旧的安装会使插件检查失败 |
| `pi.authPath` | string | `"~/.pi/agent/auth.json"` | pi 的凭据文件 | agent step 启动时 | 被 schema 拒绝 |
| `pi.modelsPath` | string | `"~/.pi/agent/models.json"` | pi 的自定义 model 文件 | agent step 启动时 | 被 schema 拒绝 |
| `pi.wallTimeSecs` | number | `3600` | `1` 到 `28500` 秒 | agent step 启动时 | 被 schema 拒绝；更大的值还会使该 step 失败，信息为 `must be at most 28500` |
| `pi.stallSecs` | number | `600` | `1` 或更多秒 | agent step 启动时 | 被 schema 拒绝 |
| `pi.bashTimeoutSecs` | integer | `1800` | `1` 或更多秒 | agent step 启动时 | 被 schema 拒绝 |
| `pi.concurrency` | object | `{}` | model 名对应 `1` 或更大的数量 | 随下一个启动的 agent step，该 model 最多不超过此数量 | 被 schema 拒绝；会指明该数量的键 |
| `pi.concurrency.<name>` | integer | 该 model 没有限制 | `1` 或更大 | 随该 model 的下一个 agent step | 被 schema 拒绝 |

`authPath` 和 `modelsPath` 由 pi 读取；`~` 是用户的 home。对 `concurrency` 的更改会应用到下一个启动的 step；已经在运行的 step 保留它们的名额。

### `radian` {#radian}

`radian` 插件运行 radian。它的 step 是 `radian/agent`。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `radian.command` | string | `"radian"` | radian 可执行文件：`PATH` 中的名称或路径 | agent step 启动时 | 被 schema 拒绝；找不到的命令会使该 step 失败 |
| `radian.wallTimeSecs` | number | `300` | 正数秒 | agent step 启动时 | 被 schema 拒绝 |
| `radian.stallSecs` | number | `600` | 正数秒 | agent step 启动时 | 被 schema 拒绝 |
| `radian.concurrency` | object | `{}` | model 名对应 `1` 或更大的数量 | 随下一个启动的 agent step，该 model 最多不超过此数量 | 被 schema 拒绝；会指明该数量的键 |
| `radian.concurrency.<name>` | integer | 该 model 没有限制 | `1` 或更大 | 随该 model 的下一个 agent step | 被 schema 拒绝 |

Radian 没有 `model` 设置；一个 step 受其自身参数中的 `--provider` 和 `--model` 限制。没有 `--model` 的 step 不受 `concurrency` 限制。

## `triggers.json` {#triggersjson}

home 中的 `triggers.json` 保存规则，规定哪个事件启动哪个 flow。它是一个 JSON 数组；文件缺失表示没有你自己的规则。你的规则会替换具有相同 `source` 和 `type` 的插件规则；该组合的插件规则随后不再使用。

<!-- schema: triggers.schema.json -->
```json
[
  {
    "source": "operad",
    "type": "dev.waiting",
    "start": { "flow": "dev", "params": {} },
    "object": "$event.object",
    "mode": "observe"
  },
  {
    "source": "cron",
    "type": "tick",
    "start": { "flow": "nightly" },
    "object": "flow:nightly",
    "mode": "auto",
    "schedule": "0 3 * * *"
  }
]
```

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `source` | string | 必填 | 发送事件的来源，例如 `cron` 或 `operad` | 读取文件时 | 被拒绝：`rule <n>: source: must be a non-empty string` |
| `type` | string | 必填 | 事件类型，例如 `tick` 或 `run.done` | 读取文件时 | 被拒绝：`rule <n>: type: must be a non-empty string` |
| `start` | object | 必填 | 下面的键 | 读取文件时 | 被拒绝：`rule <n>: start: must be an object` |
| `start.flow` | string | 必填 | 已加载的 flow 名称 | 读取文件时；未知的 flow 会被拒绝 | 被拒绝：`rule <n>: start.flow: unknown flow "<name>"` |
| `start.params` | 任意 JSON 值 | 缺省 | flow 的固定参数 | 规则启动 flow 时 | 不是纯 JSON 时被拒绝：`rule <n>: ... is not JSON` |
| `object` | string | 必填 | 固定的对象 id，或 `$event.object` | 规则启动 run 时 | 被拒绝：`rule <n>: object: must be a non-empty string` |
| `mode` | string | 必填 | `observe`、`candidate`、`auto` | 规则启动 run 时 | 被拒绝：`rule <n>: mode: must be "observe", "candidate", "auto"` |
| `schedule` | string | 缺省 | 使用本地时区的五字段 cron 表达式 | 加载 cron 规则时；只有 source 为 `cron` 的规则使用它 | 被拒绝：`rule <n>: schedule: <why the cron expression is not valid>` |

cron 来源是来自 `@operad-io/source-cron`、名为 `cron` 的插件。对每条 `source` 为 `cron` 且带有 `schedule` 的规则，它在每个到期的分钟发出一个 `tick`；其他规则忽略 `schedule`。通过命令添加规则时，规则不能使用保留的来源 `operad`。

如果 `triggers.json` 无效，整个文件会被拒绝，信息中包含规则和字段。`operad serve` 会记录日志，并在文件修复之前不带来源运行；需要规则的命令会报告这一点。运行中的 `serve` 会监视该文件，并在新文件加载成功时重新加载。

## 从客户端修改设置 {#settings-from-a-client}

`operad settings` 列出人可以调整的设置，`operad settings set
<name> <value>` 修改其中一项；`--repo <name>` 指定一个已注册的仓库。全局设置是 `<plugin>.<path>`。文件名与其插件名相同的项目文件只使用插件名，所以 `.operad/dev.json` 对应 `dev.concurrency`、`dev.autoDefault`、`dev.gate.commands`、`dev.gate.commandTimeoutSecs`、`dev.reviewer.use`、`dev.reviewer.args`、`dev.reviewer.timeoutSecs` 和 `dev.reviewer.fixLevel`。其他文件会加上它的名称：`.operad/review.json` 对应 `dev.review.default.levels`、`dev.review.default.rules` 和 `dev.review.default.fixLevel`。更改会影响 merge 的内容（`autoDefault`、`fixLevel`、levels 和 rules）时需要 `--yes`。

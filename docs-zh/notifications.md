---
description: notify 命令：何时运行、能拿到什么，以及一个示例脚本。
---

# 通知 {#notifications}

`config.json` 中的 `notify` 指定一个命令，当有事项开始等待人处理时，由 `serve` 运行它：

```json
{ "notify": { "command": "sh ~/.operad/notify.sh", "on": ["waiting"] } }
```

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `notify` | object | `{ "command": null, "on": ["waiting"] }` | 一个带有下列键的对象；缺少该部分表示通知关闭 | `operad serve` 启动时；新配置加载时重新加载 | 被拒绝：`notify: must be an object` |
| `notify.command` | string or `null` | `null` | 一个非空的 shell 命令行，在 operad home 中用 `sh -c` 运行；`null` 关闭通知 | `serve` 启动或重新加载时；该命令对每次新的等待运行 | 被拒绝：`notify.command: must be a non-empty string or null` |
| `notify.on` | array of strings | `["waiting"]` | 只有 `waiting`：一个对象现在在等待人处理 | `serve` 启动或重新加载时；它决定哪些新的等待会通知 | 被拒绝：`notify.on: must be an array of "waiting"`；重复的 `waiting` 只保留一个 |

`notify` 内的未知键会被忽略；只读取上面的键。该命令对每个事项和每次等待运行一次，环境中有以下变量：

| Variable | Value |
|---|---|
| `OPERAD_ID` | 对象，格式为 `<type>:<id>`。 |
| `OPERAD_TITLE` | 对象的标题；读不到标题时为它的 id。 |
| `OPERAD_REASON` | 它在等待什么：`operad pending` 中显示的提示。 |
| `OPERAD_LINK` | 对象链接，`operad://objects/<id>`。 |

对于 `dev` 插件的任务，提示会写明它停在哪个 step；具体原因（`ready to merge`、`review findings` 等）在该任务的 `dev.waiting` 通知中，[Running operad on operad](../dogfood.md) 列出了这些通知。

token 从不在环境中。一个命令最多运行 30 秒，之后会被停止。任何不为 0 的退出、超时，或无法启动的命令，都会由 `serve` 连同退出码和输出的最后几行记入日志，并且不会重试。

每次等待只通知一次。一次等待指的是一个 run 一次到达一个 step：同一个事项在你回答之后再次等待，是一次新的等待，会再次通知。重启 `serve` 不会对已经通知过的等待再次通知。通知是在命令结束之后才记录的，所以如果 `serve` 恰好在这两者之间被终止，下一个 `serve` 会对该等待再运行一次命令：最多多一次通知，绝不会丢失。停止 `serve` 会取消仍在运行的命令，下一个 `serve` 会再次运行它。

使用 [ntfy](https://ntfy.sh) 的示例：向你的手机推送一条通知，点按后在 app 中打开该事项。

```sh
#!/bin/sh
# ~/.operad/notify.sh
curl -s \
  -H "Title: $OPERAD_TITLE" \
  -H "Click: $OPERAD_LINK" \
  -d "$OPERAD_REASON" \
  https://ntfy.sh/my-operad-topic
```

配合 `"command": "sh ~/.operad/notify.sh"` 使用。topic 名称对任何猜到它的人来说就是密码；请选一个很长的随机名称，或使用自建服务器。

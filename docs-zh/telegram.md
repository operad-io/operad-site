---
description: Telegram 插件：从 Telegram 与 bot 的 chat 对话，并在那里回答等待你的事项。
---

# Telegram {#telegram}

`telegram` 插件让你从 Telegram 给 bot 写消息，并在那里回答等待人处理的事项。你发的消息会在某个 bot 上打开一个 [chat](chats-and-bots.md)；bot 的回复回到 Telegram；agent 提出的问题会作为一条消息送达，每个选项对应一个按钮。它是可选的，只在 `operad serve` 运行时工作。

## 为什么需要它 {#why-it-exists}

手机 app 和终端不一定随手可用，而 Telegram 总是在手边。这个插件把同样的 chat 和同样的 pending 项放进你本来就开着的对话里。没有任何东西是副本：chat 就是 app 里显示的那个 chat，在 Telegram 里回答的事项，在所有地方都算已回答。

## 设置 {#set-it-up}

1. 在 Telegram 里与 BotFather 对话，为 operad 创建一个**新的 bot**。不要复用其他程序已经在用的 bot：Telegram 只允许一个客户端为某个 token 拉取更新，所以两个程序共用一个 token 会互相抢走消息，其中一个会停止工作。
2. 查到你自己的数字 Telegram user id。报告它的 bot（例如 `userinfobot`）由第三方运行，对方能看到你发给它的内容；这个 id 也在你自己的 bot 通过 Bot API 收到的任何更新的 `from` 字段里。
3. 启用插件，并把 token 存为插件的密钥：

   ```sh
   operad plugin enable telegram
   operad secret set telegram token
   ```

   token 不会进入 history、日志行或错误信息。
4. 把你的 user id 写进 `config.json`（见[设置](#settings)），然后启动 `operad serve`。
5. 在私聊中给 bot 发一条消息。chat 会在 `telegram.bot` 指定的 bot（默认是 `default`）上打开，回复会到达同一个 Telegram 对话。

```json
{
  "plugins": {
    "telegram": {
      "settings": {
        "users": [123456789],
        "bot": "default",
        "pending": ["dev"]
      }
    }
  }
}
```

## 设置项 {#settings}

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `telegram.users` | integer 数组 | `[]` | Telegram user id | `operad serve` 启动时 | 被 schema 拒绝；未列出的用户会被记录，且不会启动任何东西 |
| `telegram.bot` | string | `"default"` | `bot` 部分中的 bot 名称 | `operad serve` 启动时；在已列出的用户首次写消息时使用，其 chat 关闭后再次使用 | 被 schema 拒绝；未写出的 bot 会在消息打开 chat 时被拒绝 |
| `telegram.pending` | string 数组 | `[]` | 插件名称，例如 `dev` | `operad serve` 启动时 | 被 schema 拒绝 |

密钥是 `token`，用 `operad secret set telegram token` 设置。

## 已列出的用户能做什么 {#what-a-listed-user-can-do}

id 在 `telegram.users` 中的用户，在与 bot 的私聊中：

- 向 chat 写消息。第一条消息在 `telegram.bot` 指定的 bot 上打开一个 chat，并把它绑定到该 Telegram 对话；之后的消息进入同一个 chat。每个已列出的用户都有自己的 chat。chat 关闭后，下一条消息会打开新的 chat。这条消息是你的：它算作由你写出，发送者是你的 Telegram user id，run 的 history 会注明是哪条 Telegram 消息启动了它。
- 点按钮回答问题。一次点按算作你的回答，以你的 Telegram user id 给出；当 action 要求确认时，它也算作确认。
- 通过回复消息来回答需要文字的事项，例如 reject 或没有选项的问题。如果有多个这样的 action，回复以 action 的名称加冒号开头，例如 `reject:`。不是对这类事项的回复的文字，是发给 chat 的普通消息。
- 回答 `telegram.pending` 中列出的插件的事项。设为 `["dev"]` 时，`dev` 插件的 merge 和 confirm 事项可以从 Telegram 回答。

其他人什么都做不了。未列出的用户发来的消息，以及群组中的每一条消息，都会被记录，但不作任何回应：不会打开 chat，也不会启动任何东西。未列出的用户的点按不算数。

## 会发送什么 {#what-is-sent}

- 绑定到 Telegram 的 chat 的每条回复。Markdown 会被精简为 Telegram 能显示的内容（粗体、斜体、代码、链接；标题和列表变为普通行），较长的回复会分成多条消息发出。发送失败会以逐渐变长的等待重试。插件第一次运行之前写出的回复不会发送。
- 绑定到 Telegram 的 chat 中每个等待的事项，以及 `telegram.pending` 中列出的插件的每个事项（发给每个已列出的用户）。它是一条消息，每个选项一个按钮。从任何地方（Telegram、app、命令行）回答之后，按钮消失，消息以 `answered: X` 结尾，X 是所选的选项。点按一个已被回答的事项会提示这一点，不做任何改动。

工具调用和回复的实时文字不会发送。chat 在 app 中显示它们。

## 重启 {#restarting}

插件把它已读取和已发送的内容保存在 `<home>/telegram/` 下。`serve` 停止后再启动，不会有消息被写两次，不会有回复被发两次，也不会有遗漏。

## 无法工作时 {#when-it-does-not-work}

- `the telegram plugin has no token`：运行 `operad secret set telegram token`。
- bot 不回应任何人：该 id 不在 `telegram.users` 中，或消息是在群组里发的。
- 来自 bot 的消息不再到达，而另一个程序使用同一个 token：为 operad 单独做一个 bot。

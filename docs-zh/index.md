---
description: operad 用户手册：operad 是什么，以及每个主题对应的页面。
---

# operad {#operad}

operad 是面向编码 agent 的开放编排层。它让 agent（radian、Claude Code、pi 等）按经过验证的 flow 运行，把发生过的事保留为 history，并在工作需要人的地方联系到人：终端客户端、手机 app、通知、chat。你会看到三类内容：flow、等待人处理的事项（pending）、以及每个 step 做了什么和原因（history）。其余功能由插件提供，例如 `dev` 插件的计划和任务。

## 页面 {#pages}

- [quickstart](quickstart.md)：创建 home，启动 `serve`，打开客户端。
- [setup-prompt](setup-prompt.md)：让你的 agent 编写 `.operad/dev.json` 的 prompt。
- [config](config.md)：home 以及 `config.json` 的每个部分。
- [dev](dev.md)：`dev.json` 和 `dev` 插件的命令、reviewer、worker 与 pool。
- [access](access.md)：访问 profile、`access-user.json` 和 always allow。
- [cli](cli.md)：每个命令和选项。
- [tui](tui.md)：终端客户端、它的主题和按键。
- [app](app.md)：配对与手机 app。
- [http](http.md)：`/v1` 端点、事件和错误。
- [mcp](mcp.md)：供 lead agent 使用的 MCP server。
- [chats-and-bots](chats-and-bots.md)：与 agent 的 chat，以及 bot。
- [telegram](telegram.md)：从 Telegram 给 bot 写消息，并回答等待你的事项。
- [notifications](notifications.md)：notify 命令。
- [checks](checks.md)：检查一项变更，以及复现不稳定的测试。
- [environment](environment.md)：每个环境变量。
- [troubleshooting](troubleshooting.md)：出问题时怎么办。

插件作者从 [Writing a plugin](../plugins/index.md) 开始。

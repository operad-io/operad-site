---
description: 开始使用 operad：创建 home，启动 serve，打开客户端。
---

# 快速上手 {#quickstart}

`operad init` 创建 home 并检查插件。`operad serve` 为该 home 运行循环；`operad tui` 打开[终端客户端](tui.md)，并在没有 `serve` 应答时启动它。`operad pending` 列出等待人处理的事项，`operad list <type>` 列出对象。

要让你的编码 agent 为某个仓库编写 `.operad/dev.json`，请使用 [the setup prompt](setup-prompt.md)。设置见 [config.json](config.md)，命令见[命令行](cli.md)，出问题时怎么办见 [troubleshooting](troubleshooting.md)。

## 非 JavaScript 的仓库 {#a-repository-that-is-not-javascript}

仓库不需要 `package.json`、不需要 `scripts/` 目录，也不需要任何特定语言的工具。它的 `.operad/dev.json` 写明 dev 运行的 shell 命令行，dev 不使用仓库的其他任何内容。下面是一个小型 shell 项目：`sh check.sh` 运行它的测试，失败的测试会打印 `FAIL: <name>`，`sh check.sh <name>` 运行单个测试。

<!-- schema: dev.schema.json -->
```json
{
  "name": "greeter",
  "prepare": ["sh prepare.sh"],
  "gate": {
    "commands": [
      {
        "run": "sh check.sh",
        "failed": {
          "match": "^FAIL: (.+)$",
          "rerun": "sh check.sh {name}",
          "stress": "sh check.sh --repeat 20 {name}",
          "rule": "docs/flaky-rule.md"
        }
      }
    ],
    "commandTimeoutSecs": 60
  }
}
```

`prepare` 在 dev 创建的每个 checkout 中运行，也在 merge 使主 clone 前进之后在主 clone 中运行。`run` 是检查。`failed.match` 在日志中找出失败测试的名称（一个捕获组），`failed.rerun` 单独运行该测试；在这里先失败后通过的测试不算检查失败，而是不稳定（flaky）。对于不稳定的测试，dev 会提出一个任务，其 brief 包含 `failed.stress` 命令和 `failed.rule` 文件的文本；没有它们时，brief 中没有命令，只有一句不指明任何工具的话。这些设置在 [dev](dev.md) 中说明。

---
description: 所有 OPERAD_ 环境变量，以及 operad 读取的其他变量，附默认值和各自何时生效。
---

# 环境变量 {#environment-variables}

`operad` 或它的脚本读取的、或它启动的命令会收到的每个 `OPERAD_*` 变量，以及 `operad` 读取的其他变量。适合放进文件的设置在 [config.json](config.md) 中；对于每个 shell 或每台检查主机各不相同的值，请使用环境变量。

表中给出类型、默认值、接受的值以及值何时被读取。超出允许范围的值要么被忽略，要么被拒绝，并给出该行所指明的消息。

## 你设置的变量 {#what-you-set}

| 变量 | 类型 | 默认值 | 允许的值 | 何时生效 |
|---|---|---|---|---|
| `OPERAD_HOME` | path | `~/.operad` | 目录路径 | 每个命令：存放 `config.json`、store、secrets 目录、`tui.json`、`keys.json`、`serve.lock` 和 `access-user.json` 的 home。相对路径从当前目录解析。 |
| `OPERAD_SERVE_INTERVAL_MS` | integer | `1000` | 毫秒，大于 0 | `operad serve` 启动时：loop 两次之间的间隔。不是有限正数的值会回退到 1000。 |
| `OPERAD_BIND_RETRY_MS` | integer | `10000` | 毫秒，大于 0 | 接替另一个 serve 的 `serve` 打开它的地址时：持续重试多久。第一次启动会立即失败。不是正数的值会回退到 10000。 |
| `OPERAD_BIND_RETRY_STEP_MS` | integer | `250` | 毫秒，大于 0 | 同一次重试中两次尝试之间的等待。不是正数的值会回退到 250。 |
| `OPERAD_RELOAD_QUIET_MS` | integer | `1000` | 毫秒，大于 0 | 文件需要保持多久不变，`serve` 才检查变更后的代码能否加载（见 [Changed code](cli.md#changed-code)）。不是正数的值会回退到 1000。 |
| `OPERAD_RELOAD_POLL_MS` | integer | `5000` | 毫秒，大于 0 | `serve` 多久查看一次文件是否有变化，以及 run 的进程多久等待一次无法加载的代码。不是正数的值会回退到 5000。 |
| `OPERAD_CHECK_BASE` | commit | `HEAD` 与 `origin/main` 的 merge base | commit 名称 | `check-changed.sh` 选取一项变更涉及的包时：用来比较的 commit。git 无法解析的名称会使脚本停止。 |
| `OPERAD_CHECK_HOST` | ssh destination | 未设置：检查在本机运行 | `user@host` | `remote-check.sh` 运行命令时：设置后，命令在该主机上运行。为空表示在本机。 |
| `OPERAD_CHECK_SLOTS` | integer | `1` | 整数，1 或更大 | 主机上同时运行多少个任务检查；每个 slot 有自己的锁和 tree。其他任何值都会使脚本停止，并给出指明该变量的消息。 |
| `OPERAD_CHECK_LANE` | string | 未设置 | `integration` | `integration` 占用唯一的 integration slot，而不是任务 slot；其他任何值都会使脚本停止，并给出指明该变量的消息。 |
| `OPERAD_CHECK_TREE` | path | `Code/operad` | 相对于主机 home 的路径 | 主机上运行检查所用的 clone；其他每个 slot 使用它的一个 worktree。 |
| `OPERAD_CHECK_PATH` | 目录列表 | `$HOME/.bun-operad/bin:$HOME/.bun/bin` | 用 `:` 分隔的目录 | 在检查行运行之前放到主机 `PATH` 的最前面，在主机上展开。 |
| `OPERAD_CHECK_SSH` | command | `ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4` | ssh 命令行 | 检查连接它的主机时。 |
| `OPERAD_CHECK_SCP` | command | `scp -q -o BatchMode=yes` | scp 命令行 | 检查把 bundle 复制到它的主机时。 |
| `OPERAD_TEST_PARALLEL` | integer | `2` | 整数，1 或更大 | `run-tests.sh` 启动时：有多少个 worker 进程运行测试文件。其他任何值都会使脚本停止，并输出 `run-tests: OPERAD_TEST_PARALLEL must be a whole number of 1 or more, not '<value>'`。 |
| `OPERAD_TEST_HEAVY_PARALLEL` | integer | `8` | 整数，1 或更大 | `run-tests.sh` 启动时：有多少个 worker 进程运行 heavy 测试文件（位于 `test/heavy/` 下）。其他任何值都会使脚本停止，并给出指明该变量的消息。 |
| `OPERAD_TEST_OVERLAP` | integer | `1` | `1` 让 heavy step 与 light step 同时运行；`0` 让它在 light step 之后运行 | `run-tests.sh` 启动时。 |
| `OPERAD_TEST_TIMES` | path | `~/.operad-test-times` | 文件路径 | 每次完整的测试运行在此追加一行耗时记录（`run-tests.sh` 和 `test-times.ts`）。 |

## operad 设置的变量 {#what-operad-sets}

这些变量是为 operad 启动的命令设置的。不要自己设置；你设置的值会被替换或移除。

| 变量 | 类型 | 默认值 | 允许的值 | 何时生效 |
|---|---|---|---|---|
| `OPERAD_ID` | string | 总是设置 | 处于等待的对象的 id，形式为 `<type>:<id>` | 在 [notify command](notifications.md) 的环境中。 |
| `OPERAD_TITLE` | string | 总是设置 | 对象的 title，读不到 title 时为它的 id | 在 notify command 的环境中。 |
| `OPERAD_REASON` | string | 总是设置 | 问题或等待的原因 | 在 notify command 的环境中。 |
| `OPERAD_LINK` | string | 总是设置 | `operad://objects/<id>` 链接 | 在 notify command 的环境中（见 [Links](http.md#links)）。 |
| `OPERAD_TASK` | string | 总是设置 | 任务 id | 在 `dev` cleanup 或 integration 命令的环境中。 |
| `OPERAD_WORKTREE` | path | 总是设置 | 任务的 worktree | 在 `dev` cleanup 或 integration 命令的环境中。 |
| `OPERAD_REMOTE` | string | 总是设置 | remote 的名称 | 在 `dev` cleanup 或 integration 命令的环境中。 |
| `OPERAD_RUN` | string | 总是设置 | `<run id>:<step>` | 在 step 的进程的环境中：它指明 run 和 step，使 `serve` 能找到 step 留下的仍在运行的东西。移除它的子进程不会被回收。 |
| `OPERAD_RUN_HOME` | path | 总是设置 | home 路径 | 在 step 的进程的环境中，使两个 home 永不相遇。 |
| `OPERAD_SERVE_SUPERVISED` | flag | 未设置 | `1` | 由因代码变更而重启 `serve` 的进程设置；在子进程看到自己的环境之前被移除。不要自己设置。 |
| `OPERAD_SERVE_REPLACES` | flag | 未设置 | `1` | 设置在由卡住的 serve 启动来取代它的那个 `serve` 上；在子进程看到自己的环境之前被移除。不要自己设置。 |

## operad 读取的其他变量 {#other-variables-operad-reads}

| 变量 | 类型 | 默认值 | 允许的值 | 何时生效 |
|---|---|---|---|---|
| `EDITOR` | command | 未设置 | 编辑器命令行 | `operad dev task edit`，当 stdin 是终端或没有带来 brief 时：编辑器打开当前的 brief。它通过 `/bin/sh -c '<editor> "$1"'` 运行。非零退出会使命令失败，并给出 `"<editor>" exited with code <n>`。 |
| `VISUAL` | command | 未设置 | 编辑器命令行 | 仅在 `EDITOR` 未设置时使用。`EDITOR` 设为空值或空白值时不会回退到 `VISUAL`；命令会报告没有设置编辑器。 |
| `HOME` | path | 该账户的 home | 目录路径 | 默认的 home（`~/.operad`）、`~` 展开以及 radian 配置路径。 |
| `PATH` | 目录列表 | 该账户的 `PATH` | 用 `:` 分隔的目录 | 查找 `radian`、`pi`、`claude`、git 以及命令启动的其他程序。不带 `/` 的命令名必须在 `PATH` 中。 |
| `RADIAN_CONFIG` | path | `$HOME/.radian/config/config.toml` | 文件路径 | radian harness 从该文件读取它自己的 provider 设置。 |
| `BASH_ENV` | path | 未设置 | 文件路径 | pi worker 在启动之前把它从自己的环境中删除，因此 shell 启动文件不能改变工具调用。 |
| `ENV` | path | 未设置 | 文件路径 | 出于同样的原因被 pi worker 删除。 |
| `TMPDIR` | path | 系统临时目录 | 目录路径 | 传给 bot 的 MCP server，使该 server 能找到临时文件。 |
| `LANG` | string | 未设置 | locale 名称 | 传给 bot 的 MCP server。 |
| `STRESS_LOCK` | path | `$HOME/.operad-stress.lock` | 目录路径 | `scripts/stress.sh`：本机上所有 stress 运行共用的锁。只有知道自己是唯一一个的运行才传 `--no-lock`。 |
| `NODE_ENV` | string | 未设置 | `test` | 内部使用：当它为 `test` 时，插件注册表会省略仅用于测试的检查。正常使用时不要设置。 |

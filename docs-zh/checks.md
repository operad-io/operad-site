---
description: 检查一项变更，以及复现不稳定的测试。
---

# 检查 {#checks}

一项变更在合并之前如何被检查，以及不稳定的测试如何复现。同样的检查也是 `dev` 插件任务的 gate（见[它的页面](dev.md)）。

## 检查一项变更 {#checking-a-change}

```sh
bash scripts/verify.sh
bash scripts/check-changed.sh
bash scripts/remote-check.sh '<command>'
bash scripts/remote-check.sh -- <word>...
```

`verify.sh` 按 lockfile 安装、做类型检查，并用 `scripts/run-tests.sh` 运行整个测试套件。该脚本在并行的 worker 进程中运行测试文件（`bun test --parallel`），之后再依次运行 `tui` 包的测试，一个文件接一个文件，因为它的终端库无法在并行 worker 中加载。`OPERAD_TEST_PARALLEL`（1 或更大的整数，默认 `2`）是 worker 进程的数量；其他任何值都会使脚本停止，并给出指明该变量的消息。会启动真实进程、构建真实 git 仓库、打开端口或占用大量内存的测试放在其包的 `test/heavy/` 下，在它们自己的 step 中运行，与 light step 同时进行，使用 `OPERAD_TEST_HEAVY_PARALLEL` 个 worker（默认 `8`；`OPERAD_TEST_OVERLAP=0` 让该 step 在 light step 之后运行）。给定包名时（`bash scripts/run-tests.sh dev
shell`），它只运行这些包的测试。`check-changed.sh` 以同样的方式安装和做类型检查，然后只测试一项变更涉及的包：自 `HEAD` 与 `origin/main` 的 merge base 以来有文件改动的每个包（已提交、已暂存、未暂存或未跟踪），以及代码直接或经由其他包加载了其中某个包的每个包。测试（而非代码）加载了已改动包的包，它的测试也会运行；到此为止，不再向外扩展。`packages/` 之外的变更（lockfile、根 manifest、`scripts/`、`docs/`、`.operad/`）会测试每个包。它在测试之前打印所选的包（`all`、`none` 或名称）。`OPERAD_CHECK_BASE`（一个 commit，默认是 merge base）改变它的比较对象。本仓库的任务检查运行 `check-changed.sh`，它的 integration 运行 `verify.sh`。

`remote-check.sh` 在本机或（设置了 `OPERAD_CHECK_HOST` 时）在检查主机上、于同一个 commit 运行一条命令。它接受作为一个参数的命令（一条 shell 命令行），或在 `--` 之后作为分开的 word，这些 word 原样传递：途中没有 shell 把它们当作代码读取，因此 word 中可以含有引号、反引号或 `$`。失败测试的 rerun（`.operad/dev.json` 中的 `failed.rerun`）使用 `--` 形式，因此它在检查运行的地方运行。

`remote-check.sh` 把一条命令（一条 shell 行）作为检查运行。`OPERAD_CHECK_HOST` 未设置或为空时，它在仓库根目录于本机运行该行。设为 ssh destination（`user@host`）时，它把 `HEAD` 作为 git bundle 复制到该主机，并在那里占用 `OPERAD_CHECK_SLOTS` 个 slot 中的一个（锁为 `~/.operad-check-<i>.lock`；只有全部被占用时才等待），获取 `origin` 和该 bundle，以 detached 方式检出 `HEAD` 的 commit，除 `node_modules` 外移除未跟踪的文件，然后运行该行。每个 slot 有自己的 tree，因此在一个 slot 中的 checkout 或 clean 绝不会碰到另一个：slot 1 使用 clone `OPERAD_CHECK_TREE`（`~/Code/operad`），其他每个 slot 使用该 clone 在首次使用时创建的 git worktree，`<tree>-slot<i>`（例如 `~/Code/operad-slot2`），在该行安装之后拥有自己的 `node_modules`。带 `OPERAD_CHECK_LANE=integration` 时，检查改为占用唯一的 integration slot（锁 `~/.operad-check-integration.lock`，worktree `<tree>-integration`）：integration 从不等待任务检查，任务检查也从不占用该 slot。该行在主机上能看到 `OPERAD_CHECK_SLOTS`，因此检查可以使用 `cores / (N + 1)` 个测试 worker。输出在写出时即返回，退出码是该行的退出码；该行运行之前发生的失败（bundle、复制、连接、fetch、checkout）以 1 退出，并输出一行指明出错 step 的消息。主机需要有仓库的 clone 和 Bun。

| 变量 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `OPERAD_CHECK_HOST` | ssh destination | 空 | 检查在哪里运行；为空则在本机运行。 |
| `OPERAD_CHECK_TREE` | path | `Code/operad` | 主机上的 clone，相对于它的 home 目录。 |
| `OPERAD_CHECK_SLOTS` | 整数，1 或更大 | `1` | 主机上同时运行多少个任务检查；其他任何值会使脚本停止。 |
| `OPERAD_CHECK_LANE` | `integration` | 未设置 | `integration` 占用 integration slot，而不是任务 slot；其他任何值会使脚本停止。 |
| `OPERAD_CHECK_PATH` | 目录 | `$HOME/.bun-operad/bin:$HOME/.bun/bin` | 在该行运行之前放到主机 `PATH` 的最前面，在主机上展开。 |
| `OPERAD_CHECK_SSH` | command | `ssh -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4` | ssh 命令。 |
| `OPERAD_CHECK_SCP` | command | `scp -q -o BatchMode=yes` | scp 命令。 |

每个变量都在脚本启动时读取。

## 检查失败时 {#when-a-check-fails}

该行运行之前发生的失败（缺少 clone、bundle 或复制失败、连接、fetch 或 checkout 失败）以 1 退出，并输出一行指明出错 step 的消息；修复该 step 后再次运行检查。已运行的行以它自己的退出码退出，输出在写出时即返回。`dev` 插件的任务会记录失败的行、它的退出码和最后的输出；消息和处理办法见 [Troubleshooting](troubleshooting.md#checks-and-tests)。

一个失败后在 rerun 时通过的测试，在证明并非如此之前就是一个 bug。不要提高它的超时，也不要在测试内部加重试。brief 是修复不稳定测试的任务会运行两次 `scripts/stress.sh`：一次在修复之前复现，一次在修复之后确认，并在最终答复中说明命令、运行次数和结果。本仓库通过 `.operad/dev.json` 中的 `failed.rule`（`.operad/flaky.md`）和 `failed.stress` 把这条规则和命令交给 `dev`；见 [dev settings](dev.md)。其他每个任务的检查都是 `bash scripts/check-changed.sh`；完整的 `bash scripts/verify.sh` 在合并之前的 integration 时再运行一次。

## 复现不稳定的测试 {#reproducing-a-flaky-test}

```sh
bash scripts/stress.sh [--runs N] [--load K] [-t <name pattern>] <test files...>
```

该脚本用 `--rerun-each N`（默认 50）和 `--timeout 30000` 对这些文件运行 `bun test`。`-t` 把运行限制在名称匹配该模式的测试上。`--load K` 在运行期间启动 K 个忙碌的后台进程（一个循环 fork 短进程，其余空转），数量绝不超过 CPU 数，用来模拟负载下的 gate；脚本退出时它们都会停止，无论以何种方式退出。

它打印运行次数、通过数和失败数、每个失败的测试名称及其次数，以及完整日志的路径；当有任何失败、没有测试运行或 bun 本身失败时，以 1 退出。不稳定测试的修复在以下情况下算完成：带 `--load 2` 的 stress 运行通过，并且其 `--runs` 取值使运行约需十分钟（至少 20，至多 200）；一次只运行一个 stress 运行。

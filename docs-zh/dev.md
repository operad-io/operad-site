---
description: dev.json 和 dev 插件：它的命令、reviewer、worker 与 pool、用量和结束结果。
---

# dev.json 和 dev 插件 {#devjson-and-the-dev-plugin}

`dev` 插件在仓库上运行计划和任务。它的项目设置在 `.operad/dev.json` 中；它的命令及作用见下面各节。客户端可以修改的设置见 [config.json](config.md#settings-from-a-client)。

## 一个任务如何从需求走到合并 {#how-a-task-goes-from-request-to-merge}

一个需求变成一个计划，计划里有若干任务，每个任务都走同一条路径。你在两处参与：确认计划时，以及合并时。

```text
plan -> tasks (draft) -> confirm -> ready -> work -> check -> review -> you merge -> main
                                               ^       |        |
                                               +-------+--------+  rework
```

1. **计划和任务。** 计划是一个需求（`operad plan add`）。其中每个任务有一份 brief，也就是给 worker 的说明（`operad task add`）。任务可以用 `--after` 等另一个任务。`operad dev:confirm <plan>` 把计划里处于草稿的任务变成 ready；`operad serve` 调度的就是已确认的计划。
2. **启动。** `serve` 启动 ready 的任务，数量受仓库的 `concurrency` 和各个 pool 的上限限制。每个任务有自己的 git worktree 和分支，所以任务之间、任务与你自己的检出之间互不影响。
3. **开发。** 一个 worker 通过 pool 从 `workers` 中选出，带着 brief 在任务的 worktree 里运行并提交。worker 的模型不可用时，可以把工作交给它的 `fallback`。
4. **检查。** `gate.commands` 里的命令在这次提交上运行。失败的测试会先单独再跑一次，用来区分不稳定的测试和真正的失败。
5. **评审。** reviewer 读改动并写一份报告。达到 `reviewer.fixLevel`（默认 `major`）的意见会让评审不通过。
6. **返工。** 检查失败或评审不通过，任务会被退回给 worker，最多 `maxAutoRework` 次（默认 `2`）。超过之后任务就等你处理。
7. **等你处理。** 通过检查和评审的任务会在 `operad pending` 里以 `ready to merge` 等待，可用的操作有 `dev:merge`、`dev:reject`、`dev:rework`、`dev:reverify` 和 `dev:cancel`。需要人介入的情况下任务也会等待：评审有意见、gate 失败、达到返工上限、worker 没有新增提交。
8. **合并和清理。** `dev:merge` 把验证过的提交放到 main 上（按 `integration.style`），运行 `integration.keyCommands`，然后推送到 remote。接着清理会删除任务的 worktree 和分支。同一个仓库的任务一次只集成一个。如果 remote 拒绝推送，什么都不会写入，任务带着一条说明继续等待。

每一步都有记录：`operad history <task>` 显示运行了什么、检查或评审发现了什么、你选了什么。进程已死的运行会从它最后记录的步骤重新开始。计划可以在没有你的情况下走得更远：`operad dev:auto <plan> --level merge` 会在检查通过后合并已评审的工作，`--level run` 不需要你就会启动计划里的任务，但每个任务在合并时仍然会停下来等你，`--level off` 则在每次启动和合并时都等你。`autoDefault` 为新计划设置这个级别。

各部分的键见下面几节：[仓库和它的 worker](#the-repository-and-its-workers)、[gate 和它的检查](#the-gate-and-its-checks)、[开发、评审、集成和清理](#work-review-integration-and-cleanup)，以及 [flow 和它们的 stage](#flows-and-their-stages)。

## `.operad/dev.json` 的所有键 {#every-operaddevjson-key}

仓库的 `dev.json` 是 JSON；schema 是 `packages/dev/dev.schema.json`。
文件缺失时使用下面的默认值。每个 step 和每次 scheduler 轮询都会重新读取该文件；当文件变得无效时，最后一份有效的设置继续生效，`operad pending` 会为该仓库显示一项（见 [当 `dev.json` 无效时](#when-devjson-is-not-valid)）。错误的值会被拒绝，并在前面带上字段路径，例如 `workers.claude.fallback: ...`。

### 仓库和它的 worker {#the-repository-and-its-workers}

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `dev.$schema` | string | 不存在 | `https://operad.io/schemas/dev.schema.json` 或其他 schema URL | 只有编辑器会读取 | 忽略 |
| `dev.name` | string | 未设置 | 非空文本 | 读取文件时；它与设置一起保存，但不会为已注册的仓库改名 | 拒绝：`name: must be a non-empty string` |
| `dev.remote` | string | `"origin"` | 一个 git remote 名称 | 抓取、推送或清理任务分支时 | 拒绝：`remote: must be a non-empty string` |
| `dev.mainBranch` | string | `"main"` | 一个分支名 | 任务分支开始以及合并 main 时 | 拒绝：`mainBranch: must be a non-empty string` |
| `dev.worktreeRoot` | string | `".operad-worktrees"` | 仓库内的相对路径 | 创建或读取 worktree 时 | 拒绝：`worktreeRoot: must be relative to the repository` 或 `worktreeRoot: must stay inside the repository` |
| `dev.worktrees` | string | 未设置 | `worktreeRoot` 的旧名称；`worktreeRoot` 不存在时读取 | 读取文件时 | 拒绝，使用相同的两条消息，其中指明 `worktrees` |
| `dev.concurrency` | integer | 未设置：只由各 pool 的数量决定其上限 | `1` 或更大 | 下一次 scheduler 轮询；正在运行的任务不会被停止 | 拒绝：`concurrency: must be a positive integer` |
| `dev.sandbox` | string | 未设置 | 任意字符串；保留它是为了让旧文件仍然有效 | 从不；该值被忽略 | 忽略 |
| `dev.worker` | object | 既没有写 `worker` 也没有写 `workers` 时为 `{ "use": "radian/agent", "args": [] }` | 下面的键；不允许与 `workers` 同时出现 | 读取文件时 | 拒绝：`worker: cannot be set together with workers; use one or the other` |
| `dev.worker.use` | string | `"radian/agent"` | step 名称 `<plugin>/<step>` | worker step 开始时 | 拒绝：`worker.use: must be a non-empty string` |
| `dev.worker.args` | array of strings | `[]` | 传给该 step 的参数 | worker step 开始时 | 拒绝：`worker.args: must be an array of strings` |
| `dev.worker.wallTimeSecs` | number | 未设置 | 大于 `0` | worker step 开始时 | 拒绝：`worker.wallTimeSecs: must be a positive number of seconds` |
| `dev.worker.stallSecs` | number | 未设置 | 大于 `0` | worker step 开始时 | 拒绝：`worker.stallSecs: must be a positive number of seconds` |
| `dev.workers` | object | 不存在：即上面的那一个 `worker` | worker 名称到 worker 对象；至少一个 | 读取文件时 | 拒绝：`workers: must be an object`、`workers: must define at least one worker`，或该 worker 自己的字段错误 |
| `dev.workers.<name>` | object | 无 | 下面的键；`use` 必填 | worker step 开始时 | 拒绝：`workers.<name>: must be an object` 或 `workers.<name>: is not a worker field` |
| `dev.workers.<name>.use` | string | 必填 | `<plugin>/<step>`，例如 `claude/agent` | worker step 开始时 | 拒绝：`workers.<name>.use: must be a step name such as claude/agent` |
| `dev.workers.<name>.args` | array of strings | `[]` | 传给该 step 的参数 | worker step 开始时 | 拒绝：`workers.<name>.args: must be an array of strings` |
| `dev.workers.<name>.count` | integer | `1` | `1` 或更大 | 下一次 scheduler 轮询；正在运行的任务保留它们的位置 | 拒绝：`workers.<name>.count: must be an integer of 1 or more` |
| `dev.workers.<name>.wallTimeSecs` | number | 未设置：harness 自己的限制 | 大于 `0` | worker step 开始时 | 拒绝：`workers.<name>.wallTimeSecs: must be a positive number of seconds` |
| `dev.workers.<name>.stallSecs` | number | 未设置：harness 自己的限制 | 大于 `0` | worker step 开始时 | 拒绝：`workers.<name>.stallSecs: must be a positive number of seconds` |
| `dev.workers.<name>.fallback` | string | 未设置 | `workers` 中的另一个 worker；不能是它自己，也不能是已有自己 fallback 的 worker | worker 的模型不可用时 | 拒绝：`workers.<name>.fallback: "<name>" cannot fall back to itself`、`... is not a worker in workers` 或 `... already has a fallback` |
| `dev.pools` | object | 一个名为 `default` 的 pool，按书写顺序包含所有 worker | pool 名称到非空的 worker 名称列表 | 读取文件时；`dev` 需要名为 `default` 的 pool | 拒绝：`pools: must be an object`、`pools: must define at least one pool`、`pools.<name>: must be a non-empty list of worker names` 或 `pools: needs a pool named "default", the one the dev flow uses` |
| `dev.pools.<name>` | array of strings，或 object | `pools` 不存在时为一个 `default` pool | worker 名称；每个都必须存在于 `workers`；或 `{ "workers": [...], "concurrency": n }` | 下一次 scheduler 轮询 | 拒绝：`pools.<name>[<i>]: "<worker>" is not a worker in workers`、`pools.<name>.workers[<i>]: ...`、`pools.<name>.concurrency: must be an integer of at least 1` 或 `pools.<name>.<key>: is not a pool setting` |
| `dev.pools.<name>.workers` | array of strings | 对象形式下必填 | worker 名称，按选取空闲 worker 的顺序排列 | 下一次 scheduler 轮询 | 拒绝：`pools.<name>.workers: must be a non-empty list of worker names` |
| `dev.pools.<name>.concurrency` | integer | 未设置：各 worker 的 `count` 之和 | `1` 或更大；把该 pool 正在运行的任务数限制在该总和以下 | 下一次 scheduler 轮询 | 拒绝：`pools.<name>.concurrency: must be an integer of at least 1` |
| `dev.workerBrief` | string | `".operad/worker-brief.md"` | 一个 Markdown 文件的路径；文件缺失时使用内置的四行 brief | work step 构建 worker 提示时 | 拒绝：`workerBrief: must be a non-empty string` |
| `dev.prepare` | array of strings | `[]` | shell 行，在每个 checkout 创建或移到新提交之后、step 使用它之前运行，并在合并移动了主克隆之后于主克隆中运行 | 创建或移动 checkout 时 | 拒绝：`prepare: must be an array of command lines` 或 `prepare[<i>]: must be a non-empty string`；失败的行会让该 step 以 `prepare failed` 失败（在主克隆中则记录在任务的 Changes 里，合并保持有效） |

### gate 和它的检查 {#the-gate-and-its-checks}

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `dev.gate` | object | `{ "commands": [], "commandTimeoutSecs": 1800 }` | 下面的键 | 检查开始时 | 拒绝：`gate: must be an object` 或 `gate.<key>: is not a gate setting` |
| `dev.gate.commands` | array | `[]`：不运行任何检查 | 一行 shell，或一个检查命令对象 | 检查 step 开始时 | 拒绝：`gate.commands: must be an array of commands` 或该命令自己的错误 |
| `dev.gate.commandTimeoutSecs` | number | `1800` | 大于 `0` 秒 | gate 命令开始时 | 拒绝：`gate.commandTimeoutSecs: must be a positive number of seconds` |
| `dev.gate.places` | integer | 未设置：该仓库没有限制 | `1` 或更大 | 检查寻找位置时 | 拒绝：`gate.places: must be an integer of 1 or more` |
| `dev.check` | object | `{ "rerun": 1, "flakyTask": 2 }` | 下面的键 | 判定失败的检查时 | 拒绝：`check: must be an object` 或 `check.<key>: is not a check setting` |
| `dev.check.rerun` | integer | `1` | `0` 或更大；`0` 表示关闭 rerun | 检查行列表失败时；超时从不 rerun | 拒绝：`check.rerun: must be zero or a positive integer` |
| `dev.check.flakyTask` | integer | `2` | `0` 或更大；`0` 表示关闭该提议 | 某个测试仅在 rerun 时通过时 | 拒绝：`check.flakyTask: must be zero or a positive integer` |
| `dev.check.flakyPlan` | string | 未设置：dev 使用计划 `flaky-tests`（标题 `Flaky tests`） | 一个计划 id | 提议 flaky-test 任务时 | 拒绝：`check.flakyPlan: must be a plan id`；已完成或已取消的计划会让 dev 改用 `flaky-tests` |
| `dev.check.loadLimit` | number | 未设置：核心数 | 大于 `0`，一个 1 分钟平均负载 | 检查超时或被外部杀掉时 | 拒绝：`check.loadLimit: must be a positive number` |
| `dev.check.flakyLoadLimit` | number | 未设置：核心数的两倍 | 大于 `0`，一个 1 分钟平均负载 | 某个测试失败后在 rerun 时通过时 | 拒绝：`check.flakyLoadLimit: must be a positive number` |

### 检查命令 {#a-check-command}

同样的对象可以出现在 `gate.commands`、`integration.keyCommands` 和 flow 的 `check` stage 中。

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `gate.commands`, `integration.keyCommands`, `flows.<name>.stages.commands` | string 或 object | 写出的地方必填 | 一行 shell，或带有 `run` 和可选 `failed` 的对象 | 该检查运行时 | 拒绝：`<path>[<i>]: must be a string or an object` 或 `<path>[<i>].<key>: is not a command setting` |
| `gate.commands.run`, `integration.keyCommands.run`, `flows.<name>.stages.commands.run` | string | 必填 | 非空的 shell 行 | 该检查运行时 | 拒绝：`<path>[<i>].run: must be a non-empty string` |
| `gate.commands.failed`, `integration.keyCommands.failed`, `flows.<name>.stages.commands.failed` | object | 不存在：适用顶层的 `check.rerun` | 下面的键 | 仅当该行以非零状态退出时 | 拒绝：`<path>[<i>].failed: must be an object` |
| `gate.commands.failed.match`, `integration.keyCommands.failed.match`, `flows.<name>.stages.commands.failed.match` | string | 在 `failed` 中必填 | 恰好带一个捕获组的正则表达式，逐条日志行匹配 | 该检查行失败时 | 拒绝：`<path>[<i>].failed.match: must be a valid regular expression` 或 `... must have exactly one capture group` |
| `gate.commands.failed.rerun`, `integration.keyCommands.failed.rerun`, `flows.<name>.stages.commands.failed.rerun` | string | 在 `failed` 中必填 | 含有 `{name}` 或 `{pattern}` 的命令 | 该检查行失败时 | 拒绝：`<path>[<i>].failed.rerun: must contain {name} or {pattern}` |
| `gate.commands.failed.max`, `integration.keyCommands.failed.max`, `flows.<name>.stages.commands.failed.max` | integer | `10` | `1` 或更大 | 该检查行失败时 | 拒绝：`<path>[<i>].failed.max: must be a positive integer`；失败数超过 `max` 时，检查不经 rerun 直接失败 |
| `gate.commands.failed.stress`, `integration.keyCommands.failed.stress`, `flows.<name>.stages.commands.failed.stress` | string | 不存在：flaky-test 任务的 brief 中没有命令 | 一个命令；`{name}`、`{pattern}` 和 `{file}` 会被替换 | dev 为仅在 rerun 时通过的测试提议任务时 | 拒绝：`<path>[<i>].failed.stress: must be a non-empty string` |
| `gate.commands.failed.rule`, `integration.keyCommands.failed.rule`, `flows.<name>.stages.commands.failed.rule` | string | 不存在：使用 dev 自己的那句话 | 仓库内一个文本文件的路径 | dev 为仅在 rerun 时通过的测试提议任务时 | 拒绝：`<path>[<i>].failed.rule: must be a path inside the repository` |

`{name}` 会被替换为经 shell 引用的测试名，`{pattern}` 会被替换为它的经 shell 引用的锚定正则表达式。在 `stress` 中，`{file}` 是经 shell 引用的测试文件，dev 不知道时则为空。使用 `failed` 的检查，对那一行不使用 `check.rerun`。

当某个测试仅在 rerun 时通过的次数足够多（`check.flakyTask`）时，dev 提议的任务的 brief 使用其 `match` 找到该失败的那一行的 `failed` 设置：摘录是 `match` 找到的那一行以及它之前的行（日志中的第一处匹配）；`stress` 给出“Reproduce it”命令，brief 还会要求给出运行次数来代替 `<N>`；`rule` 指向一个文件，其文本就是仓库对 flaky 测试的规则。没有 `stress` 时，brief 中没有命令。没有 `rule`，或文件缺失或为空时，brief 写的是："A test that failed and then passed on rerun is a bug until shown otherwise. Do not raise a timeout or add a retry inside a test to make it pass."。该任务没有 area。见 [Checking a change](checks.md)。

仅因测试运行到超时而失败的检查，通常会等待机器空闲，再次运行，如果发生两次就等待人处理。有一个例外：当失败的测试单独运行（它的 `failed.rerun` 命令）时再次超时，并且该次运行期间的负载低于 `check.flakyLoadLimit`（默认是核心数的两倍），责任就不在机器。改动会作为失败退回给 worker，其说明中写明该测试，说它 "timed out at 30 s when run alone under load 3 on 10 cores"，并给出日志路径。只在高于该限制的负载下出现的超时，或单独运行时能通过的测试，仍按原来的方式处理。

### work、review、integration 和清理 {#work-review-integration-and-cleanup}

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `dev.work` | object | `{ "wrapUpAt": 0.85 }` | 下面的键 | work step 开始时 | 拒绝：`work: must be an object` 或 `work.<key>: is not a work setting` |
| `dev.work.wrapUpAt` | number | `0.85` | 大于 `0` 且小于 `1` | work step 用掉其时间限制的这一比例时 | 拒绝：`work.wrapUpAt: must be a number above 0 and below 1` |
| `dev.reviewer` | object | 下面的 reviewer 默认值 | 下面的键 | review step 开始时 | 拒绝：`reviewer: must be an object` 或 `reviewer.<key>: is not a reviewer setting` |
| `dev.reviewer.use` | string | `"radian/agent"` | step 名称 `<plugin>/<step>` | 评审开始时 | 拒绝：`reviewer.use: must be a non-empty string` |
| `dev.reviewer.args` | array of strings | `[]` | 传给该 step 的参数 | 评审开始时 | 拒绝：`reviewer.args: must be an array of strings` |
| `dev.reviewer.firstArgs` | array of strings | 未设置 | 一次 attempt 的首次评审的参数 | 一次 attempt 的首次评审开始时 | 拒绝：`reviewer.firstArgs: must be an array of strings` |
| `dev.reviewer.first` | object | 未设置 | 下面的键；设置的值在首次评审中取代 reviewer 自己的值 | 一次 attempt 的首次评审开始时 | 拒绝：`reviewer.first: must be an object` 或 `reviewer.first.<key>: is not a first review setting` |
| `dev.reviewer.first.use` | string | `reviewer.use` | 一个 step 名称 | 首次评审开始时 | 拒绝：`reviewer.first.use: must be a non-empty string` |
| `dev.reviewer.first.args` | array of strings | `reviewer.args` | 传给该 step 的参数 | 首次评审开始时 | 拒绝：`reviewer.first.args: must be an array of strings` |
| `dev.reviewer.first.timeoutSecs` | number | `reviewer.timeoutSecs` | 大于 `0` 秒 | 首次评审开始时 | 拒绝：`reviewer.first.timeoutSecs: must be a positive number of seconds` |
| `dev.reviewer.first.stallSecs` | number | `reviewer.stallSecs` | 大于 `0` 秒 | 首次评审开始时 | 拒绝：`reviewer.first.stallSecs: must be a positive number of seconds` |
| `dev.reviewer.fallback` | object | 未设置 | `use` 和可选的 `args`；主 reviewer 不可用时使用 | 评审发现主 reviewer 不可用时 | 拒绝：`reviewer.fallback: must be an object`、`reviewer.fallback.use: must be a non-empty string` 或 `reviewer.fallback.<key>: is not a fallback setting` |
| `dev.reviewer.fallback.use` | string | 必填 | 一个 step 名称 | fallback 评审开始时 | 拒绝：`reviewer.fallback.use: must be a non-empty string` |
| `dev.reviewer.fallback.args` | array of strings | `[]` | 传给该 step 的参数 | fallback 评审开始时 | 拒绝：`reviewer.fallback.args: must be an array of strings` |
| `dev.reviewer.timeoutSecs` | number | `600` | 大于 `0` 秒 | 评审开始时 | 拒绝：`reviewer.timeoutSecs: must be a positive number of seconds` |
| `dev.reviewer.stallSecs` | number | 未设置：harness 自己的限制 | 大于 `0` 秒 | 评审开始时 | 拒绝：`reviewer.stallSecs: must be a positive number of seconds` |
| `dev.reviewer.fixLevel` | string | `"major"` | `critical`, `major`, `minor` | 评审被评级时 | 拒绝：`reviewer.fixLevel: must be "critical", "major" or "minor"`；`review.json` 中的值优先 |
| `dev.reviewer.followups` | boolean | `true` | `true` 或 `false` | 评审通过但带有未使其失败的发现时 | 拒绝：`reviewer.followups: must be true or false` |
| `dev.reviewer.retrySecs` | number | `120` | 大于 `0` 秒 | 模型不可用后，评审等待再次运行时 | 拒绝：`reviewer.retrySecs: must be a positive number of seconds` |
| `dev.reviewer.maxFileDiffBytes` | integer | `200000` | `1` 或更大 | 构建评审提示时 | 拒绝：`reviewer.maxFileDiffBytes: must be a positive integer`；更大的文件会被省略并列出 |
| `dev.reviewer.maxDiffBytes` | integer | `1000000` | `1` 或更大 | 构建评审提示时 | 拒绝：`reviewer.maxDiffBytes: must be a positive integer`；更大的改动会在 reviewer 启动之前使评审失败 |
| `dev.integration` | object | `{ "style": "merge", "keyCommands": [], "batch": 1 }` | 下面的键 | integrate step 开始时 | 拒绝：`integration: must be an object` 或 `integration.<key>: is not an integration setting` |
| `dev.integration.style` | string | `"merge"` | `merge`, `squash` | 已验证的提交被放到 main 上时 | 拒绝：`integration.style: must be "merge" or "squash"` |
| `dev.integration.keyCommands` | array | `[]` | 检查命令 | 构建 integration 候选时 | 拒绝：`integration.keyCommands: must be an array of commands` 或该命令自己的错误；失败会把任务退回给 worker |
| `dev.integration.batch` | integer | `1`：一次一个任务 | `1` 或更大 | 下一个 integration 轮次开始时 | 拒绝：`integration.batch: must be a positive integer` |
| `dev.hooks` | object | 下面的清理命令 | 下面的键 | 清理运行时 | 拒绝：`hooks: must be an object` 或 `hooks.<key>: is not a hook setting` |
| `dev.hooks.afterMerge` | array of strings | 五条命令：移除 worktree、prune、删除本地分支、删除远程分支 | 在仓库根目录运行的 shell 行，已设置 `OPERAD_TASK` 和 `OPERAD_WORKTREE` | 合并之后运行清理时 | 拒绝：`hooks.afterMerge: must be an array of strings` 或 `hooks.afterMerge[<i>]: must be a non-empty string`；失败会被记录，但不会让任务失败 |
| `dev.maxAutoRework` | integer | `2` | `0` 或更大 | 自动 rework 即将开始时 | 拒绝：`maxAutoRework: must be zero or a positive integer`；超过则等待人处理 |
| `dev.autoDefault` | string | `"off"` | `off`, `run`, `merge` | 新建计划时 | 拒绝：`autoDefault: must be "off", "run" or "merge"` |
| `dev.retry` | object | `{ "environmentWaitMinutes": 60 }` | 下面的键 | 某个 step 因任务自身工作之外的原因失败时 | 拒绝：`retry: must be an object` 或 `retry.<key>: is not a retry setting` |
| `dev.retry.environmentWaitMinutes` | integer | `60` | `1` 或更大的分钟数 | step 等待缺少的东西时 | 拒绝：`retry.environmentWaitMinutes: must be a positive integer` |

### flow 和它们的 stage {#flows-and-their-stages}

仓库自己的 flow 在 [flow 和它们的 stage](#flows-and-their-stages) 中说明。`flows` 不存在时使用内置的 `default` flow。

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `dev.flows` | object | 不存在：内置的 `default` flow | flow 名称到 flow 对象 | 计划或任务开始该 flow 的一次 run 时 | 拒绝：`flows: must be a JSON object`、`flows: a flow needs a non-empty name` 或该 flow 自己的错误 |
| `dev.flows.<name>` | object | 无 | 只有 `stages` | 该 flow 的任务开始时 | 拒绝：`flows.<name>: must be a JSON object` 或 `flows.<name>.<key>: is not a flow setting` |
| `dev.flows.<name>.stages` | array | 必填 | 至少一个 stage；其中至少一个必须是 `check`、`review` 或 `human` | 该 flow 的任务开始时 | 拒绝：`flows.<name>.stages: must be an array of stages` 或 `flows.<name>.stages: needs at least one check, review or human stage` |
| `dev.flows.<name>.stages.stage` | string | 必填 | `work`, `check`, `review`, `human` | 到达该 stage 时 | 拒绝：`flows.<name>.stages[<i>].stage: must be "work", "check", "review" or "human"` |
| `dev.flows.<name>.stages.use` | string | `work` 用仓库的 worker，`review` 用 `reviewer.use` | 一个 step 名称 | 该 stage 开始时 | 拒绝：`flows.<name>.stages[<i>].use: must be a non-empty string` |
| `dev.flows.<name>.stages.args` | array of strings | worker 或 reviewer 自己的参数 | 传给该 step 的参数 | 该 stage 开始时 | 拒绝：`flows.<name>.stages[<i>].args: must be an array of strings` |
| `dev.flows.<name>.stages.pool` | string | `default` | `pools` 中的一个 pool 名称（仅限 `work` stage） | work stage 开始时，以及用于运行中任务的上限 | 拒绝：`flows.<name>.stages[<i>].pool: no pool named "<pool>" in pools` |
| `dev.flows.<name>.stages.workerBrief` | string | 未设置：仓库的 `workerBrief` | 相对于仓库的文件路径（绝对路径或仓库之外的路径会被拒绝），从主克隆读取；其文本为该 stage 取代仓库的 worker brief（`brief` 仍会追加） | work stage 开始时 | 文件缺失时拒绝：`flows.<name>.stages[<i>].workerBrief: <path> does not exist` |
| `dev.flows.<name>.stages.commit` | boolean | `false`：worker 自己提交 | `true`：worker 以 done 结束后，dev 把 worktree 中留下的所有改动（已跟踪和未跟踪的，遵守 `.gitignore`）提交到任务分支，提交信息为 `<task id>: <task title>`；没有可提交的内容也没关系。它在检查之前运行。用于其 sandbox 不能写 `.git` 的 worker | work stage 结束时 | 拒绝：`flows.<name>.stages[<i>].commit: must be true or false` |
| `dev.flows.<name>.stages.brief` | string | 未设置 | 追加到 worker 提示之后的额外指示 | work stage 开始时 | 拒绝：`flows.<name>.stages[<i>].brief: must be a non-empty string` |
| `dev.flows.<name>.stages.beforeAttempt` | string | 未设置：worktree step 的 merge 继续有效 | `merge-main`, `none` | work stage 运行之前 | 拒绝：`flows.<name>.stages[<i>].beforeAttempt: must be "merge-main" or "none"` |
| `dev.flows.<name>.stages.commands` | array | `gate.commands` | 检查命令 | check stage 开始时 | 拒绝：`flows.<name>.stages[<i>].commands: must be an array of commands` 或该命令自己的错误 |
| `dev.flows.<name>.stages.rerun` | integer | `check.rerun` | `0` 或更大 | 检查行列表失败时 | 拒绝：`flows.<name>.stages[<i>].rerun: must be zero or a positive integer` |
| `dev.flows.<name>.stages.later` | array of strings | 未设置：`reviewer` 的参数 | 一次 attempt 中首次之后每次评审的参数 | 之后的评审开始时 | 拒绝：`flows.<name>.stages[<i>].later: must be an array of strings` |
| `dev.flows.<name>.stages.grading` | string | 未设置：该 flow 自己的名称 | `.operad/review.json` 中的一项 | 评审被评级时 | 拒绝：`flows.<name>.stages[<i>].grading: must be a non-empty string`；缺失的项回退到 `default` |

一个 image flow：使用另一个 worker pool，有自己的 brief，由 dev 替它们提交，有一次检查，没有 review stage。

```json
{
  "flows": {
    "image": {
      "stages": [
        { "stage": "work", "pool": "image", "workerBrief": ".operad/image-brief.md", "commit": true },
        { "stage": "check" },
        { "stage": "human" }
      ]
    }
  }
}
```

某种 stage 不允许的字段会被拒绝，消息为 `flows.<name>.stages[<i>].<key>: is not a stage setting`。`human` stage 除 `stage` 之外没有其他字段。

## `review.json` {#reviewjson}

### 为什么需要 `review.json` {#why-reviewjson-exists}

reviewer 会报告发现，每条发现有一个严重程度：`critical`、`major` 或 `minor`。当某条发现达到所选级别时，评审失败。`review.json` 是仓库写下这些内容的地方：三个级别各自的含义、reviewer 评级时遵循的额外规则，以及使评审失败的最低级别，可以针对某一个 flow，也可以针对全部 flow。它不改变 reviewer 被要求查看的内容，也不会启动评审；`dev` 插件在评审需要时读取它。没有该文件的仓库不会得到评级文本，级别由 `dev.reviewer.fixLevel`（默认 `major`）设定。

### `review.json` 的评级如何工作 {#how-reviewjson-grading-works}

1. review stage 用 `grading` 指定自己的条目；没有指定时，条目就是该 flow 自己的名字。该条目逐字段合并到 `default` 之上：`levels` 按级别合并，`rules` 整体替换。
2. `dev` 读取仓库中的 `.operad/review.json` 并检查它。无效的文件会使 review step 失败，并指明该文件；不会去猜一个评级。
3. 评审 prompt 带有一个 "Grading" 部分，逐字包含 `levels` 的文本和 `rules`，让 reviewer 用仓库自己的说法评级。
4. reviewer 把报告写到 gate worktree 中 `.operad/review/` 下的一个新文件（见 [reviewer 在哪里写它的报告](#where-the-reviewer-writes-its-report)）。`dev` 检查该报告，并在 store 中保留自己的副本。
5. 报告中的每条发现都有一个严重程度。修复级别是该 flow 条目的 `fixLevel`，没有则取 `default` 的。两者都没有设置时，取 `dev.reviewer.fixLevel` 与 `review.json` 中为任何 flow 设置的每一个 `fixLevel` 之中最严格的那个，这样评审的评级绝不会比仓库在任何地方提出的要求更宽松。
6. 当一条发现的严重程度等于或高于修复级别时，它才计数，顺序为 `critical`、`major`、`minor`。
7. 没有计数发现的评审通过。有计数发现的评审失败，失败信息把每一条列为 `<file>:<line> <severity>: <summary>`；任务回到 worker 或进入等待，如[从需求到合并的路径](#how-a-task-goes-from-request-to-merge)中所述。
8. 低于修复级别的发现不会使评审失败；它作为一条备注保留在任务上。

`.operad/review.json` 保存 reviewer 读取的评级，以及使评审失败的最低级别的发现。它逐字段回退到 `default`。该文件在 review step 需要时读取；[评审一节](#reviewjson)说明 reviewer 如何使用它。

<!-- schema: review.schema.json -->
```json
{
  "default": {
    "levels": {
      "critical": "A wrong result, data loss, a security hole or a broken build.",
      "major": "A defect a person would notice, or a missed requirement.",
      "minor": "A style or naming problem."
    },
    "rules": ["Do not ask for changes the task did not ask for."],
    "fixLevel": "major"
  },
  "flows": {
    "quick": { "fixLevel": "critical" }
  }
}
```

| 键 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `review.$schema` | string | 不存在 | 一个 schema URL | 只有编辑器会读取 | 不是 string 时拒绝：`review.json: invalid <path>: $schema must be a string` |
| `review.default` | object | `{}` | 下面的键 | 评审没有 flow 条目时 | 拒绝：`review.json: invalid <path>: default must be a JSON object` |
| `review.default.levels` | object | `{}` | `critical`、`major`、`minor` 到给 reviewer 的文本 | 构建评审提示时 | 拒绝：`review.json: invalid <path>: default.levels must be a JSON object` 或 `default.levels.<level> must be a string` |
| `review.default.levels.critical` | string | 未设置 | critical 发现的含义 | 构建评审提示时 | 拒绝：`... default.levels.critical must be a string` |
| `review.default.levels.major` | string | 未设置 | major 发现的含义 | 构建评审提示时 | 拒绝：`... default.levels.major must be a string` |
| `review.default.levels.minor` | string | 未设置 | minor 发现的含义 | 构建评审提示时 | 拒绝：`... default.levels.minor must be a string` |
| `review.default.rules` | array of strings | 未设置 | 额外的评级规则 | 构建评审提示时 | 拒绝：`... default.rules must be an array of strings` 或 `default.rules[<i>] must be a string` |
| `review.default.fixLevel` | string | 未设置：`dev.reviewer.fixLevel` | `critical`, `major`, `minor` | 评审被评级时 | 拒绝：`... default.fixLevel must be "critical", "major" or "minor"` |
| `review.flows` | object | `{}` | flow 名称到评级对象 | 该 flow 的评审被评级时 | 拒绝：`... flows must be a JSON object` |
| `review.flows.<name>` | object | 未设置：`default` | 下面的键 | 该 flow 的评审被评级时 | 拒绝：`... flows.<name> must be a JSON object` 或 `flows.<name>.<key> is not a known field` |
| `review.flows.<name>.levels` | object | `review.default.levels` | `critical`、`major`、`minor` 到文本 | 该 flow 的评审被评级时；按级别合并 | 拒绝：`... flows.<name>.levels must be a JSON object` |
| `review.flows.<name>.levels.critical` | string | `review.default.levels.critical` | critical 发现对该 flow 意味着什么 | 该 flow 的评审被评级时 | 拒绝：`... flows.<name>.levels.critical must be a string` |
| `review.flows.<name>.levels.major` | string | `review.default.levels.major` | major 发现对该 flow 意味着什么 | 该 flow 的评审被评级时 | 拒绝：`... flows.<name>.levels.major must be a string` |
| `review.flows.<name>.levels.minor` | string | `review.default.levels.minor` | minor 发现对该 flow 意味着什么 | 该 flow 的评审被评级时 | 拒绝：`... flows.<name>.levels.minor must be a string` |
| `review.flows.<name>.rules` | array of strings | `review.default.rules` | 该 flow 的额外评级规则 | 该 flow 的评审被评级时 | 拒绝：`... flows.<name>.rules must be an array of strings` |
| `review.flows.<name>.fixLevel` | string | `review.default.fixLevel`，否则 `dev.reviewer.fixLevel` | `critical`, `major`, `minor` | 该 flow 的评审被评级时；优先于 `dev.reviewer.fixLevel` | 拒绝：`... flows.<name>.fixLevel must be "critical", "major" or "minor"` |

schema 没有列出的字段会被拒绝，消息为 `... <path> is not a known
field`。无效的文件会整个被拒绝，并指明该文件；review step 随后失败，而不是去猜一个评级。

## reverify 和没有新增提交的 attempt {#reverify-and-an-attempt-that-adds-no-commit}

`dev:reverify` 先把当前的 main 合并到任务分支，然后在没有 worker 的情况下再次运行 verify 和评审。干净的合并直接进入 verify；main 有冲突时，任务交给 worker。

当 worker 没有新增提交时，如果分支上没有超出 main 的内容，或它的最新提交已经通过了 verify，任务就以 `work did nothing` 等待。如果分支上已有不在 main 上的提交，而它的最新提交没有通过 verify（较早的一次 run 在 verify 结束之前就停止了），任务不会等待：history 写 `the branch already has unchecked work; checking it`，任务继续进入 verify。

## `dev` 命令在哪里运行 {#where-dev-commands-run}

`dev` 命令从所在目录、从 `--repo <name>`，或从限定 id（例如 `operad/T-0045-shell-hang-guards`）确定它的仓库；在仓库之外，裸 id 只在只有一个仓库拥有它时有效。规则见 [packages/dev/REFERENCE.md](../../packages/dev/REFERENCE.md#where-a-command-runs-and-ids)。

## reviewer 在哪里写它的报告 {#where-the-reviewer-writes-its-report}

reviewer 在任务的 gate worktree 中运行，而有些 agent（例如 radian）不能写到它们所运行的文件夹之外。因此每次 reviewer 调用都被告知，把报告写到该 worktree 内的 `.operad/review/<run>-attempt-<n>-review-<round>-try-<k>.json`，这个路径在每次调用中都是新的（`k` 是这一轮中在它之前的调用次数）。`dev` 在那里读取报告并检查它，在 store 的 `dev/reviews/<run>/` 下保留自己的副本；那份副本才是记录。`dev` 从不删除、截断或覆盖 review 工作区中的文件：它在 `.operad/review` 缺失时创建它，并拒绝通过链接或覆盖已有文件来写入，而是让评审失败并给出该路径。gate worktree 是可丢弃的，会被下一个 gate step 替换，报告随之被移除。没有写报告就结束的 reviewer 显示为 `could not write the report` 及其最后一条消息；没有通过检查的文件显示为 `wrote an invalid report`。

## harness 插件：claude、codex、pi 和 radian {#the-harness-plugins-claude-codex-pi-and-radian}

### 为什么需要它们 {#why-they-exist}

operad 不自带 agent。它驱动你已经安装的那些：你的 `claude`、`codex`、`pi` 和 `radian`。每个 agent 的登录、更新和额度都留在你自己的安装里：operad 不下载任何 agent，也不替你登录。harness 插件让 flow 能用同一种方式启动其中任何一个，即名为 `<plugin>/agent` 的 step，并读取同一种结果，不论运行的是哪个 agent。任务用哪个 agent 不由 harness 选择，而是由 flow 的 worker 和 pool 决定。

### 它们如何工作 {#how-they-work}

一个 `<plugin>/agent` step 依次：

1. 在 step 的工作目录中启动你的 agent（`dev` 任务的工作目录是它的 worktree），启动方式见下面的说明。
2. 把 prompt 交给它，模型取自 step 的 `--model` 参数（或插件的 `model` 设置，如果有的话）。
3. 监视这次 run：当达到 wall time（`wallTimeSecs`）或静默上限（`stallSecs`），或 step 被停止时，run 结束。
4. 在 agent 让 harness 看到调用的地方，按这次 run 拿到的 access profile 判断每次工具调用（见 [access](access.md)）。
5. 把工具调用和消息写入 step 日志。
6. 读取 agent 的最终结果，并以 `done`、`failed` 或 `interrupted` 结束。
7. 把这次 run 的用量记录在 `usage` 中（见[用量和结束结果](#usage-and-end-results)）。

这四个的不同之处：

- `claude`：通过 Claude Agent SDK 运行你自己的 `claude`，使用 `claude` 已有的登录。一个 step 是一个前台回合。
- `pi`：从 `PATH` 上的 `pi` 找到你安装的 pi 库，并在子进程中加载它。它需要 1.5.0 或更新版本的 pi。
- `radian`：在该目录中运行 `radian exec`。radian 不能放行一次性权限，所以带有一次性权限的 profile 对它会被拒绝。它是 `dev.reviewer.use` 的默认值。
- `codex`：启动你的 `codex-acp`，并通过 ACP 与它对话，使用你的 Codex 登录。在执行 `operad plugin enable codex` 之前它是关闭的。Codex 自己的 sandbox 保持开启，只允许写入 worktree，access profile 只会被问到离开 sandbox 的操作。订阅登录给不出费用，所以 `costMicros` 是 `null`。

时间上限和按模型的上限见后面的几节。

## 限制同一模型的 run {#limiting-runs-of-one-model}

当多个 run 同时使用同一个模型时，provider 可能返回 HTTP 429。`radian`、`pi`、`claude` 和 `codex` 插件可以对此加以限制。在插件的 `settings` 中设置 `concurrency`：

```json
{
  "plugins": {
    "pi": {
      "module": "@operad-io/harness-pi",
      "settings": { "concurrency": { "opencode-go/deepseek-v4.1-flash": 2 } }
    }
  }
}
```

| 设置 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `concurrency` | object，模型名到 integer | `{}` | 在这个 home 中，所有 run 合计，该模型的 agent run 可以同时进行多少个。每个数必须是 1 或更大的整数；`0`、字符串或小数会使 `config.json` 加载时该插件被拒绝，日志会指明 `settings.concurrency`。未列出的模型没有限制。 |

这个数量涵盖 home 中的每个 agent run，包括 `dev` 启动的那些。改动随下一个启动的 agent step 生效；已经在运行的 step 保留它们的位置。

限制作用在一个键上，插件根据 step 的 `args` 构造它：

| 插件 | 键 | 模型的来源 |
|---|---|---|
| `pi` | `pi:<model>` | `--model` 参数，否则是插件的 `model` 设置；两者都没有时，该 step 不受限制 |
| `claude` | `claude:<model>` | `--model` 参数，否则是插件的 `model` 设置；两者都没有时，该 step 不受限制 |
| `codex` | `codex:<model>` | `--model` 参数，否则是插件的 `model` 设置；两者都没有时，该 step 不受限制 |
| `radian` | `radian:<provider>/<model>` | 仅来自 `--provider` 和 `--model` 参数（没有 `--provider` 时只用模型）；radian 没有 `model` 设置，没有 `--model` 的 step 不受限制 |

模型从 step 自己的 `args` 中读取，`--model value` 或 `--model=value` 两种形式都可以；标志重复时以最后一个为准。只在 flow 的 `args` 中指明的模型不会被看到。

超过限制的 step 在队列中等待，先到先得，`operad running` 每个 run 打印一行：对象 id（没有时用 run id）、step、step 时间、标题，以及末尾的 `run <age>`，例如 `operad/T-0048-type-filters  review  3m 10s  Object type filters  run 4h 09m`。它（以及 `GET /v1/running`）把该 step 显示为 `<step> queued (<key>, <n> ahead)`，其中 `<n>` 是排在它前面的等待 step 的数量。`operad history` 显示 `<step> is queued`。如果该 step 在等待时被停止（run 被取消），它会离开队列，从不运行，并以 failed 结束，原因是它被取消了。

### `codex` 的设置 {#the-codex-settings}

`codex` 通过 `codex-acp` 运行用户自己的 Codex。它不在默认 config 里：用 `operad plugin enable codex` 启用它。operad 自己不带 `codex-acp`：把 `codex-acp`（`bun add -g @agentclientprotocol/codex-acp`）和 `bun` 放进 `PATH`，再运行一次 `codex login`；operad 使用你自己的 Codex 登录。`operad plugin check codex` 会报告版本和登录方式，并在 `codex-acp` 无法启动或 Codex 没有登录时说明该怎么做。它的设置在 `config.json` 的 `codex` 一节中：

| 设置 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `codex.model` | string | Codex 自己的 | 模型；step 的 `--model` 优先。 |
| `codex.effort` | `minimal`, `low`, `medium`, `high`, `xhigh` | Codex 自己的 | 推理强度；step 的 `--effort` 优先。 |
| `codex.command` | array of strings | `PATH` 中的 `bun` 和 `codex-acp` | 启动 codex-acp 的程序和参数。 |
| `codex.wallTimeSecs` | number，1 到 28500 | `3600` | 一次 run 最长可以用多久。 |
| `codex.stallSecs` | number，1 或更大 | `600` | 没有打开的 tool call 时，一次 run 可以沉默多久。图像生成算作打开的 tool call。 |
| `codex.concurrency` | object，模型名到 integer | `{}` | 上面描述的限制。 |
| `codex.concurrency.<name>` | integer，1 或更大 | 无 | 模型 `<name>` 的 run 可以同时进行多少个。 |

### claude 下的长命令 {#long-commands-under-claude}

`claude` 把每个 step 作为一个前台 turn 运行。没有任何东西移到后台，只等待后台工作的工具也被关闭，所以像 gate 这样的长命令会在该 turn 内一直运行到结束。设置 `bashTimeoutSecs`（integer，1 或更大，默认 `1800`）是一次 Bash 调用最长可以运行的秒数。如果 claude 在给出结果之后仍然启动了第二个 session，该 step 以 `failed` 结束，并附带说明此事的消息。

### pi 下的长命令 {#long-commands-under-pi}

`pi` 为 pi 的 bash 工具的每次调用设置时间限制，这样永不结束的命令（例如读取一个没人写入的 FIFO）就不能把 run 一直占到它的 wall time。设置 `bashTimeoutSecs`（integer，1 或更大，默认 `1800`）是一次 bash 调用最长可以运行的秒数。它既是默认值也是最大值：模型没有给出 timeout 的调用在它之下运行，模型请求的高于它的 timeout 会被降到它。调用达到限制时，pi 会停止该命令及其子进程，模型得到一个说明命令超时的错误；run 继续，所以模型可以尝试别的办法。不是 1 或更大整数的值（0、负数、字符串）会在插件加载时被拒绝，并附带字段路径。该设置在 step 开始时读取，所以改动随下一个 agent step 生效。

默认值是 1800 s（30 分钟），与 `claude` 相同，因为像 `bash scripts/verify.sh`（安装、类型检查和整个测试套件）这样的 gate 在一次调用内于前台运行，不能被中途截断。gate 更快的项目可以设置较低的值，以便更早发现卡住的命令。

`stallSecs` 没有变化：它衡量的是没有打开的 tool call 时的沉默，打开的 tool call 不算停滞（见 `packages/harness/pi/REFERENCE.md`）。上面的时间限制是约束单次 tool call 的。

### agent 的 shell 和用户的 alias {#the-agents-shell-and-the-users-aliases}

用户自己 shell 配置中的 alias 或函数，例如把 `ls` 定义为 `eza --git --hyperlink`，不得改变 agent run 中命令的行为。

- `pi`：pi 以 `bash -c` 运行每条命令（非交互式 shell，没有 rc 文件，因此没有 alias 或函数）。worker 还会从其环境中移除 `BASH_ENV` 和 `ENV`，这两个变量会让非交互式 shell 读取一个文件。
- `radian`：radian 运行 `/bin/sh -c`，它不读取用户的配置。
- `claude`：claude 的 Bash 工具在每条命令之前 source 用户的 `~/.zshrc` 或 `~/.bashrc` 的一份快照，而 claude 没有受支持的开关（环境变量或设置）可以关闭该快照。`CLAUDE_CODE_SHELL` 只决定使用 zsh 还是 bash；快照是从主目录读取的。operad 不绕过这一点：如果用户的 rc 文件定义了会卡住（或改变输出）常用命令的 alias，应当在那里加以防护，例如在 alias 外面加 `[[ -o interactive ]]`，或者只在 agent 不读取的文件中定义它。上面的 `bashTimeoutSecs` 限制仍会在时间到后停止被卡住的命令。

## 在 flow 之间共享 agent：`pool` 插件 {#sharing-agents-between-flows-the-pool-plugin}

### 为什么需要 pool 插件 {#why-the-pool-plugin-exists}

agent run 花的是账号的钱，而不是仓库的：一个 Claude 或 Codex 登录服务于机器上的每个仓库。两个仓库各自允许同时三个 Claude run，就没有任何东西限制总数；而 harness 按模型的 `concurrency`（见[限制同一模型的 run](#limiting-runs-of-one-model)）限制的是一个模型，不是机器上同一个 harness 的 run 数。`pool` 插件给每个仓库和 flow 一组命名的 worker，并给 home 为每个 harness 定一个总上限。它不统计直接调用 harness step 的 run，也不由 `operad init` 安装。

### pool 插件如何工作 {#how-the-pool-plugin-works}

1. home 设置 `settings.harnesses`，即一个 harness 在所有仓库和 flow 中同时最多有多少个 run。
2. flow 的设置定义 `workers`（一个 harness step、它的 `args` 和一个 `count`），并可以把它们分组为 `pools`；使用 `pool/agent` 的 flow（`dev` flow 就是）为每次 agent run 调用它。
3. 调用方按顺序传入该 pool 的 worker，以及一个键 `<repository>/<pool>`，flow 的计数就记在这个键下。
4. `pool/agent` 取第一个 worker：它在该键下自己的 `count` 有空位，且它的 harness 在 home 的上限也有空位。
5. 占用的位置保存在 home 下的一个文件 `pool/places.json` 中，在锁文件的保护下修改，所以 home 里每个线程和进程看到的计数都相同。
6. 没有 worker 有空位时，step 等待，并对每种原因各发送一次 `pool.waiting`：flow 的计数已满，或某个 harness 的 home 上限已满。
7. 它用 params 以及该 worker 的 `args`、`wallTimeSecs` 和 `stallSecs` 运行该 worker 的 harness step。
8. 它原样返回 harness 的结果，并在 `data` 中加上 `worker` 和 `harness`。
9. 当模型不可用或其用量上限已到，或 harness 无法启动，并且该 worker 有 `fallback` 时，它只运行那个 worker 一次。超时从不触发 fallback。

下面是各部分的参考。

agent run 花的是账号的钱，而不是仓库的：一个 Claude 或 Codex 登录服务于机器上的每个仓库。`pool` 插件有一个 step，`pool/agent`，它选取一个有空位的 worker，运行该 worker 的 harness step，并把结果交回。使用它的 flow（`dev` flow 就是）描述自己的 worker；home 规定一个 harness 总共可以有多少个 run。

该插件随产品提供，但 `operad init` 不安装它；`operad plugin enable
pool` 会添加它。

### home：`settings.harnesses` {#home-settingsharnesses}

```json
{
  "plugins": {
    "pool": {
      "module": "@operad-io/pool",
      "settings": { "harnesses": { "pi": 2, "claude": 1 } }
    }
  }
}
```

| 设置 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `harnesses` | object，harness 插件名到 integer | `{}` | 在这个 home 中，所有仓库和 flow 合计，通过 `pool/agent` 的该 harness 的 run 可以同时进行多少个。`claude/agent` 的一次 run 计入 `claude`。每个数必须是 1 或更大的整数；`0`、字符串或小数会使 `config.json` 加载时该插件被拒绝，日志会指明 `settings.harnesses`。未列出的 harness 没有上限。 |

改动随下一个启动的 `pool/agent` step 生效；已经在运行的 step 保留它们的位置。只有通过 `pool/agent` 的 run 才会计数：直接调用 harness step 的 flow 不计，而 harness 的按模型 `concurrency` 限制仍然适用于每个 run。

### flow：`workers` 和 `pools` {#a-flow-workers-and-pools}

flow 的设置，在它可以设置的每一层，都可以定义 worker 并把它们分成 pool。这些是相应的字段；其背后的解析器是共享的，所以每个 flow 都会用相同的话拒绝相同的错误。

| 字段 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `workers` | object，worker 名称到 worker | 必填 | 这个 flow 运行 agent 的各种方式。至少一个 worker。 |
| `pools` | object，pool 名称到 worker 名称列表 | 一个名为 `default` 的 pool，按书写顺序包含所有 worker | step 从中选取的 worker 组。每个列表非空，并且只写 `workers` 中的 worker。 |

worker 有这些字段；任何其他字段都会被拒绝。

| 字段 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `use` | string | 必填 | 要运行的 harness step，写作 `<plugin>/<step>`，例如 `claude/agent`。 |
| `args` | array of strings | `[]` | 传给该 step 的参数，例如 `["--model", "sonnet"]`。 |
| `count` | integer，1 或更大 | `1` | 这个 worker 为该 flow 可以同时进行多少个 run。 |
| `wallTimeSecs` | number，大于 0 | 未设置 | 传给 harness step 的 wall-time 限制。 |
| `stallSecs` | number，大于 0 | 未设置 | 传给 harness step 的 stall 限制。 |
| `fallback` | string | 未设置 | 当这个 worker 的模型不可用时，运行一次的 `workers` 中的另一个 worker。 |

两个 worker 可以用同一个 harness 但参数不同（`pi-flash` 和 `pi-pro`）；它们合起来计入该 harness 的 home 上限。

每个拒绝都会指明错误值的路径，例如 `workers.claude.fallback`：

- `workers` 或 `pools` 不是 object，`workers` 为空，`pools` 为空。
- worker 不是 object，有表中没有的字段，`use` 不是 `<plugin>/<step>`，`args` 不是字符串列表，`count` 不是 1 或更大的整数，或者 `wallTimeSecs` 或 `stallSecs` 不大于 0。
- pool 不是非空列表，或者写了 `workers` 中没有的 worker（`pools.default[1]`）。
- `fallback` 指向未知的 worker、worker 自己、自己已有 `fallback` 的 worker（链只有一步；两个互相指名的 worker 构成环），或者不是 string。

### step `pool/agent` {#the-step-poolagent}

它的参数是 `prompt`、`cwd`、`prefix`（flow 的计数所用的键；调用方传入 `<repository>/<pool>`）、`workers`（pool 的定义，按顺序，每个带有它的 `name`），可选的 `fallbacks`（成员的 `fallback` 所指名的、不在 pool 内的 worker）和 `worker`（调用方要求使用的 worker，例如完成首次 attempt 的那一个），以及 harness step 接受的其他任何参数。

1. 它按顺序选取第一个这样的 worker：它在 `prefix` 下自己的计数还有空位，并且它的 harness 在 `settings.harnesses` 下还有空位。设置了 `worker` 时，只有该 worker 可以运行；不在 `workers` 中的名称会让该 step 以 `failed` 结束，`data.reason` 为 `unknown_worker`。
2. 没有任何一个有空位时，它等待，不报错，直到某个 run 结束。每种原因它发送一次事件 `pool.waiting`：flow 的计数满时 `data.full` 是 `flow`，某个 harness 的 home 上限满时是 `home`。被停止的 step 离开队列并以 `interrupted` 结束。
3. 它用这些参数、该 worker 的 `args`、`wallTimeSecs` 和 `stallSecs` 运行该 worker 的 `use`，原样返回结果，并向 `data` 添加：`worker`、`harness`，以及在 fallback 之后的 `fallbackFrom`（失败的那个 worker）。
4. 当结果的 `data.modelError.kind` 是 `unavailable` 或 `usage_limit`，或者 harness step 无法启动（抛出了异常，或以 `failed` 结束且 `data.reason` 为 `missing` 或 `spawn`），并且该 worker 有 `fallback` 时，它在交还第一个 worker 的位置并等待 fallback 自己的空位之后，把那个 worker 运行一次。超时（wall time 或 stall）从不 fallback，fallback 自己的失败原样返回。

计数存放在哪里：每个 step 都在自己的 worker 线程中运行，所以位置保存在 home 下的一个文件 `pool/places.json` 中，通过锁文件来修改。home 中任何线程或进程里的 step 看到的是同样的计数。一个位置记录持有它的进程；当该进程不在了（崩溃的 serve），该位置会在下一次 `pool/agent` step 查看时被丢弃。

## `dev.json`：workers 和 pools {#devjson-workers-and-pools}

`dev` 插件的 work step 通过 `pool/agent` 运行每个任务，所以 `dev` 需要启用 `pool` 插件（`operad plugin enable pool`）。仓库在 `<repository>/.operad/dev.json` 中选择它的 worker；`dev` 读取已注册仓库的主克隆中的该文件，从不读取任务 worktree 中的副本，后者带的是任务分支开始时的内容。

| 字段 | 类型 | 作用 |
|---|---|---|
| `workers` | object | 仓库的 worker。字段与 [flow：`workers` 和 `pools`](#a-flow-workers-and-pools) 中相同；那张表是列出 worker 字段、默认值和拒绝情形的唯一位置。 |
| `pools` | object | pool 分组。pool 是 worker 名称的列表，或对象 `{ "workers": [...], "concurrency": n }`。work stage 从它的 `pool` 字段所指名的 pool 中取 worker；没有指名时使用 `default`，所以 `pools` 设置必须定义 `default`。没有 `pools` 时，`default` 按书写顺序包含所有 worker。 |
| `concurrency` | integer，1 或更大 | 对运行中任务的额外上限；见下文。 |

<!-- schema: dev.schema.json -->
```json
{
  "name": "operad",
  "remote": "origin",
  "mainBranch": "main",
  "concurrency": 2,
  "workers": {
    "claude": { "use": "claude/agent", "args": ["--model", "sonnet"], "fallback": "pi" },
    "pi": { "use": "pi/agent", "args": ["--model", "opencode-go/deepseek-v4.1-flash"] }
  },
  "pools": { "default": ["claude", "pi"] },
  "gate": { "commands": ["bash scripts/verify.sh"], "commandTimeoutSecs": 1800 },
  "check": { "rerun": 1, "flakyTask": 2 },
  "reviewer": { "use": "radian/agent", "fixLevel": "major" },
  "integration": { "style": "merge", "batch": 1 },
  "maxAutoRework": 2,
  "autoDefault": "off"
}
```

`workers` 和 `pools` 中的错误会指明字段路径，例如 `workers.claude.fallback` 或 `pools.default[1]`。

**旧的 `worker` 形式。** `worker`（`use`、`args`、`wallTimeSecs`、`stallSecs`）仍然有效，表示一个以其 harness 插件命名的 worker（`radian/agent` 对应 `radian`），其 `count` 等于 `concurrency`，单独在 pool `default` 中。它的 run 像任何 worker 的一样计入其 harness 的 home 上限。同时有 `worker` 和 `workers` 的文件，或有 `pools` 而没有 `workers` 的文件，在读取时会被拒绝。

**同时运行多少个任务。** 每个 pool 有自己的上限：其 worker 的 `count` 之和，或在更小时取它的 `concurrency`。任务计入它所运行的 flow 的 pool：它的第一个 `work` stage 的 `pool`，或 `default`。已满的代码 pool 不会阻止使用另一个 pool 的 flow 的任务启动，反之亦然。文件设置了 `concurrency` 时，它为所有 pool 合计设上限，并且从不提高某个 pool 的上限。计划自己的 `concurrency` 仍然在此之上适用。超过上限的任务等待空位，当仓库有多个 pool 时，它的行会说明哪个 pool 满了（`waiting for the image pool's slot (T-0007)`）；超过某个 worker 自己的 `count` 或 home 上限的任务在 `pool/agent` 中等待。

出现在两个 pool 中的 worker 只有一个 `count`：它的位置由两个 pool 共享。任务始终计入它开始时所在 flow 的 pool，即使 `dev.json` 在它运行期间发生了变化。

worker 没有 `fallback` 的 pool 从不把它的工作交给另一个 pool 的 worker：当模型不可用或达到其使用上限时，工作会等待并重试，在用完允许的等待次数之后交给人处理。用 `task add --flow <name>`（MCP 的 `command` 工具像 CLI 一样传递它）或 `task update <id> --flow <name>` 选择任务的 flow；任务一旦开始了它的第一次 attempt，该更新就会被拒绝。

**用哪个 worker。** work step 把该 stage 的 pool（`default`，除非该 stage 指名了另一个）和键 `<repository>/<pool>` 传给 `pool/agent`。attempt 记录运行的 `worker`（fallback 之后，是 fallback 的 worker，`fallbackFrom` 指名失败的那个），work 结果写 `work: claude` 或 `work: pi (fallback from claude)`。在 rework 或 reject 之后，下一次 work attempt 请求上一次 attempt 的 worker，所以在 harness 支持时它会恢复该 worker 的 session。如果那个 worker 忙，work 会等它；不会由另一个 worker 接手。如果该 worker 已不在该 stage 的 pool 中，pool 会选任何有空位的 worker，结果写 `work: pi; claude is no longer in the pool`。

### 一次只有一个 integration {#one-integration-at-a-time}

同一个仓库的任务一次只 integrate 一个，按它们的 merge 被选定的顺序。等待轮到自己的任务在 `operad running` 和它的 step 日志中显示 `waiting to integrate: T-0025 is integrating`；它不占用检查位置，并且等待没有时间限制。integration 以任何方式结束时，包括它的进程死亡，轮次都会交还。

`dev.json` 中的 `integration.batch`（默认 `1`，一次一个）让一个轮次合并排在它后面的任务：最多这么多个已验证的提交按队列顺序作为一个候选放到 main 上，key commands 运行一次，一次 push 让它们落地。每个任务保留自己的 merge 提交，它的 history 写 `integrated in a batch with <tasks>`。它们之间的冲突或失败的 key command 会回退为逐个处理，这样只有出错的任务退回给它的 worker。

### 当 `dev.json` 无效时 {#when-devjson-is-not-valid}

仓库的 `dev.json` 由每个 step 和每次 scheduler 轮询重新读取。当文件变得无效（拼写错误，或者正在运行的 `serve` 尚不认识的形状，例如某次合并改变了 `dev.json` 可以包含的内容之后）：

- 该仓库最后一份有效的设置继续生效。正在运行的 step 带着它们完成，run 的下一个 step 也读取它们，scheduler 继续在该仓库中启动和修复任务。在文件无效时启动的 `serve` 或 step，读取保存在 `$OPERAD_HOME/dev/settings/` 中的最后一份有效设置的副本。其他仓库不受影响。
- 文件每次变为一个不同的无效状态时，`serve` 向它的日志写一行 `dev: repository "<name>": <reason>`，而不是每次轮询写一次。
- `operad pending` 和 `GET /v1/pending` 为该仓库显示一项（它的 id 是 `dev:settings:<name>`，没有操作）：`the repository settings are not valid: <reason>; the last valid settings are in use`。文件再次有效时该项消失，下一次出错会再次记入日志。
- 从未有过有效设置的仓库没有可回退的内容：该项会这样说明，并且在文件修好之前，该仓库中不会启动任何任务。它正在运行的 step 同样不受影响。

### 当合并改变了 `serve` 运行的代码时 {#when-a-merge-changes-the-code-serve-runs}

主克隆在可能时会跟随合并（干净克隆上的 fast-forward），但已经在运行的 `serve` 会保持它加载的代码，直到它重新加载。这是内核自己的监视，不是 `dev` 的：见命令行指南中的 Changed code。当磁盘上的代码与 `serve` 运行的不同，而它尚未采用时，`operad pending` 显示 `serve runs older code than the files on disk`，无论改动来自哪个插件或仓库。

`dev` 还需要它的 step 所经过的插件。当 home 没有加载 `pool` 时，`operad pending` 显示 `plugin pool is not loaded and dev runs its
workers through it: run `operad plugin enable pool` and restart serve; until
then no new work starts`，就绪的任务保持就绪，而不是失败。`pool` 加载之后该项消失。

### 视图中关于 worker 的内容 {#what-the-views-say-about-the-worker}

- `operad list task` 和 `operad show` 的前几行，在该行的备注末尾给出该任务最后一次 attempt 的 worker，只有名称。超过 16 个字符的名称用 `…` 截断；Metrics 中有完整名称。
- `operad history` 有上面的 work 行：`work: claude` 或 `work: pi (fallback from claude)`。
- 任务的 Metrics 一节在 attempt 之下增加一张表，每个 worker 一行，对该 worker 运行过的 attempt 求和：attempt 数、成本、时间和 first pass（首轮评审通过的 attempt，相对于被评审的 attempt）。
- 在有 pool 之前的任务没有 worker：该行显示 none，Metrics 中没有 worker 表。`dev` 没有仓库级的 metrics，所以那里没有可拆分的东西。

```
$ operad list task
T-0044-views   Worker views   running   $0.35  pi
$ operad section T-0044-views metrics
| worker | attempts | cost | time | first pass |
| --- | --- | --- | --- | --- |
| claude | 2 | $0.30 | 4m10s | 1/2 |
| pi | 1 | $0.05 | 1m02s | 0/1 |
```

## 用量和结束结果 {#usage-and-end-results}

每个 agent step 在它数据的一个字段 `usage` 中记录该 run 用了什么，并以一组固定结果之一结束。成本、metrics 和预算读取的都是这一种形式，无论哪个 harness 运行。

`usage` 有这些字段：

| 字段 | 类型 | 含义 |
|---|---|---|
| `harness` | string | 运行的 harness 插件，例如 `pi`。 |
| `model` | string 或 `null` | step 指名了模型时，为 `provider/id` 形式的模型；没有指名时为 `null`。 |
| `tokens.input` | integer，0 或更大 | 输入 token。 |
| `tokens.output` | integer，0 或更大 | 输出 token。 |
| `tokens.cacheread` | integer，0 或更大 | 从 provider 缓存读取的 token。 |
| `tokens.cachewrite` | integer，0 或更大 | 写入 provider 缓存的 token。 |
| `costMicros` | integer，0 或更大，或 `null` | 成本，单位是百万分之一美元。`null` 表示成本未知；`0` 表示该 run 是免费的。 |
| `costQuality` | `exact`、`estimated`、`incomplete` 或 `null` | `costMicros` 可以信任到什么程度。`exact` 是 provider 计费的价格；`estimated` 是根据价目表算出的；`incomplete` 只给 run 的一部分定了价（某些消息没有价格），所以实际成本更高。恰在 `costMicros` 为 `null` 时为 `null`。 |

harness 不报告的计数为 `0`。在这个字段出现之前写下的记录保留它们的旧字段（`usage` 带 `input`、`output`、`cache_read` 和 `cache_write`，`cost` 带 `micros`、`incomplete` 和 `estimated`）；它们仍会被读取，但不再有任何东西写入它们。形状不标准的 `usage` 会被忽略，run 的日志里会有一行，指明该 run 和该字段。

`dev` 用一个符号在任务的行和它的 metrics 中显示成本的质量：`$0.31` 是 exact，`~$0.31` 是 estimated，`≥$0.31` 是 incomplete（至少这么多）。

计划的行备注读作 `1/8 · ~$4.20 · P2 // 2`：已合并的任务数除以任务数（已取消的不计），计划的任务的总成本，取其中最弱的质量（没有任务有成本时省略），优先级，以及 `//` 之后该计划的任务可以同时运行多少个。计划的徽章带有它的 auto 级别。任务的备注读作 `$0.31 · claude · area: app-core`：成本（在还没有时为 `$0.00`）、worker、area（或 `waiting for area
app-core (T-0023-action-numbers)`），最后是被拒绝的 push 的消息。仓库的备注读作 `plans: 1 · tasks: 4`，统计未关闭的。

step 以下列结果之一结束：

| 结果 | 含义 |
|---|---|
| `done` | 工作完成了。 |
| `nothing` | 没有可做的事。 |
| `failed` | 该 step 无法完成它的工作。 |
| `needs_decision` | 该 step 需要人来选择。 |
| `waiting` | 该 step 停下来等待，之后会继续。 |
| `interrupted` | 该 step 在完成之前被停止。 |

结束结果适用于 `harness` 类型的插件：它们运行 agent，flow 以同样的方式读取任何 agent。`operad plugin check` 会拒绝声明了其他名称的 harness step，并指明该名称。`radian`、`pi`、`claude` 和 `codex` 的 agent step 声明 `done`、`failed` 和 `interrupted`。其他类型的插件自己命名其结果。`shell` 是 `stage`，不是 harness：它的 step 运行一个命令或一次检查并给出结论，所以它们以 `pass` 和 `fail`（检查还有 `ready` 或 `waiting`）结束，结束结果不适用于它们。

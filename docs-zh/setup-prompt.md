---
description: 一个 prompt，让你的编码 agent 为某个仓库编写并检查 .operad/dev.json。
---

# 用 agent 设置 operad {#set-up-operad-with-an-agent}

在你希望 operad 处理的仓库的根目录，把下面的 prompt 粘贴到你的编码 agent（Claude Code、pi、radian 或其他）中。agent 会读取仓库的 CI 和脚本，写入 `.operad/dev.json`，注册该仓库，并告诉你它的选择。它不会修改源代码，也不会 commit、push 或启动 `operad serve`。

需要先安装 operad：`bun add -g @operad-io/cli`（见 [quickstart](quickstart.md)）。agent 可能写入的每个键都在 [dev](dev.md) 中说明。

```text
Set up operad for this repository. operad is an orchestration layer that runs coding
agents through verified flows (plan, work, verify, review, merge). Your job is to write
a correct `.operad/dev.json` for this repo and register it. Do not change source code.
Reply in the language I write to you in.

Reference, if you need a key's details: https://operad.io/docs/dev/ (the full key table)
and https://operad.io/llms.txt.

1. Check what is installed. Run `operad --help` (if it is missing, tell me to run
   `bun add -g @operad-io/cli` and stop). Check which agents are on PATH: `claude`,
   `pi`, `radian`. Check `git remote -v` and the main branch name. The repository
   needs a git remote; if it has none, say so and stop.

2. Find this repo's checks. Read CI config (.github/workflows, .gitlab-ci.yml, ...),
   the Makefile, package.json scripts, pyproject, Cargo.toml or whatever applies.
   Choose the commands that CI runs to judge whether a change is good: tests, typecheck,
   lint, build. Each must exit non-zero on failure. Order them fast to slow. Run each
   once on the current checkout; if one already fails on main, tell me instead of
   hiding it. If the repo has no checks, say so and leave `gate.commands` empty.

3. Find what a fresh checkout needs. Each task runs in its own git worktree, so
   dependencies are not there. Put the install step in `prepare` (for example
   `bun install --frozen-lockfile` or `npm ci`), only if the repo needs one.

4. Write `.operad/dev.json`. Use only keys that matter; keep it small. Use the
   `workers` form, never the old `worker` form:

   {
     "name": "<repo name>",
     "remote": "<remote>",
     "mainBranch": "<main branch>",
     "workers": { "<agent>": { "use": "<agent>/agent", "args": [] } },
     "prepare": [ ... ],
     "gate": { "commands": [ ... ], "commandTimeoutSecs": 1800 },
     "reviewer": { "use": "<agent>/agent", "args": [] },
     "autoDefault": "off"
   }

   - Workers and reviewer: use agents that are actually installed. If two or more are
     installed, use a different one for the reviewer than for the worker. `use` is
     `<plugin>/<step>`, such as `claude/agent`, `pi/agent`, `radian/agent`.
   - Leave `autoDefault` at "off": nothing merges without me.
   - Do not invent model names or flags. Leave `args` empty unless I give you some.

5. Register and verify. Run `operad plugin enable pool` (the dev flow needs it), then
   `operad init` and `operad repo add .`. Read every line they print. If a command
   refuses a field, fix the file using the field path in the message and run it again.
   `operad pending` must not show an invalid-settings item for this repo.

6. Report. Show me the final `.operad/dev.json`, say in one line why you chose each
   check command, worker and reviewer, and list anything you were unsure about. Tell
   me to commit `.operad/dev.json` (operad reads it from the main clone). Do not
   commit, push, start `operad serve` or create plans yourself.

When I am ready, the next steps are `operad serve`, then
`operad plan add --slug <slug> --title "<title>" < request.md`.
```

请先检查 agent 写下的内容，再 commit。`gate.commands` 中的检查用来判断一项变更是否好到可以进入评审，所以它们应当是你信任的那些。

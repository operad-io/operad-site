---
description: Setup Dev：让你的 bot 读取一个仓库，并提议为它打开 dev 的设置。
---

# Setup Dev {#setup-dev}

Setup Dev（配置开发流程）为一个仓库打开 operad 的 dev。新 home 一开始是个人助理，`dev`、`shell` 和 `pool` 都是关闭的；Setup Dev 让你的 bot 读取仓库的 CI 和脚本，并提议要打开什么。在你批准之前什么都不会改变。

可以用下面任意一种方式启动它：

- 在 bot chat 中说出来："set up dev for ~/code/myrepo"。bot 的 agent 知道如何提议。
- 在 bot chat 中输入 `/setup dev ~/code/myrepo`。每个带有设置指南的插件都以这种方式拥有自己的 Setup <name>；`dev` 是第一个。
- 从新建对象的入口运行 bot 的 Setup Dev action，并给出仓库的目录，这会打开一个 bot chat，它的第一条消息只显示标题 `Setup Dev (<folder>)`；agent 随这条消息收到下面准备好的 prompt。在命令行上：`operad bot:setup-dev <bot> --path <repository directory>`。

bot 在 chat 的访问级别之下读取仓库并运行它的检查，所以它和任何 chat 一样会询问（见 [access](access.md)）；Setup Dev 不给它额外的权限。它自己不写 `.operad/dev.json`。它提出提议，你会看到该仓库的一个 pending 项。`Review` 显示将要打开的插件（`dev`、`shell` 和 `pool` 中处于关闭状态的那些）、将要写入的 `.operad/dev.json`，以及它所替换的文件（如果有的话）。`approve` 打开这些插件、写入文件并注册仓库，所以稍后在 `serve` reload 之后，`operad dev repo list` 就会显示它。`reject` 不改变任何东西。

在写文件之前，bot 会用你的语言、用平实的话问你想怎样工作：agent 在你的文件夹里新建一个分支，在那里一次做一件事（期间最好不要编辑这个文件夹）；或者每项工作都有自己单独的文件夹，这样可以同时进行几项，你的文件夹保持不动。如果你拿不准，它选第一种。你的回答会成为所提议文件中的 `workIn`（见 [dev](dev.md#where-a-task-works)）。

文件夹不需要 git：没有 git，或者在没有 git 程序的机器上，它按原样设置，就地工作，也不会被问到 git；只有在创建任务时才需要 git。它可以是没有 remote 的 git 仓库：那样 merge 留在本地的 main 分支中。位于另一个 git 仓库内的文件夹会被拒绝，回答中会指出应改用的那个仓库的文件夹。bot 可能写入的每个键都在 [dev](dev.md) 中说明。批准之前请先阅读它的提议：`gate.commands` 中的检查用来判断一项变更是否好到可以进入评审，所以它们应当是你信任的那些。之后请 commit `.operad/dev.json`；operad 从主 clone 读取它。

这是交给 bot 的 prompt，其中的 bot 和目录已经填好：

```text
Set up operad's dev for the repository at <repository directory>. dev is operad's way of running coding
agents through verified flows (plan, work, verify, review, merge). Your job is to write a
correct `.operad/dev.json` for this repo and propose it. Do not change source code, do not
write the file yourself, do not commit, push or start anything. Reply in the language I write
to you in.

Reference, if you need a key's details: https://operad.io/docs/dev/ (the full key table)
and https://operad.io/llms.txt.

1. Look at the folder. If <repository directory> has a `.git` entry, run `git remote -v` and find the
   main branch name there. A folder with no git, a machine without the git program, and a
   repository with no git remote are all fine: do not run `git` in a folder that is not a
   repository, do not ask me about git, and leave `remote` out of the file. If <repository directory> is
   inside another git repository, tell me that repository's folder and stop. Check which
   agents are on PATH: `claude`, `pi`, `radian`. When none is, operad's own pi is the agent.

2. Find this repo's checks. Read CI config (.github/workflows, .gitlab-ci.yml, ...), the
   Makefile, package.json scripts, pyproject, Cargo.toml or whatever applies. Choose the
   commands that CI runs to judge whether a change is good: tests, typecheck, lint, build.
   Each must exit non-zero on failure. Order them fast to slow. Run each once on the
   current checkout; if one already fails on main, tell me instead of hiding it. If the
   repo has no checks, say so and leave `gate.commands` empty.

3. Find what a fresh checkout needs. Each task runs in a fresh checkout, so dependencies
   are not there. Put the install step in `prepare` (for example
   `bun install --frozen-lockfile` or `npm ci`), only if the repo needs one.

4. Ask me which way to work, before you write the file. Skip this question when <repository directory> is
   not a git repository: choose the first way without asking. Say it in my language and in plain
   words, about what changes for me; do not use the words clone, worktree or concurrency, and
   do not ask me to know them. Offer two ways:
   - In my folder: the agent makes a new branch in this folder and works there, one thing at
     a time. It is best for me not to edit the folder while it works.
   - Separately: each piece of work gets its own separate folder, so several can go at once
     and my own folder stays untouched.
   If I am not sure, or do not answer, choose the first (a new branch in my folder).

5. Write the `.operad/dev.json` text. Use only keys that matter; keep it small. Use the
   `workers` form, never the old `worker` form:

   {
     "name": "<repo name>",
     "remote": "<remote, left out when the repository has none>",
     "mainBranch": "<main branch>",
     "workIn": "<branch or worktree, from my answer>",
     "workers": { "<agent>": { "use": "<agent>/agent", "args": [] } },
     "prepare": [ ... ],
     "gate": { "commands": [ ... ], "commandTimeoutSecs": 1800 },
     "reviewer": { "use": "<agent>/agent", "args": [] },
     "autoDefault": "off"
   }

   - Workers and reviewer: use agents that are actually installed. If two or more are
     installed, use a different one for the reviewer than for the worker. `use` is
     `<plugin>/<step>`, such as `claude/agent`, `pi/agent`, `radian/agent`.
   - `workIn` is `"branch"` for the first way and `"worktree"` for the second. Never write
     those two words to me; they belong only in the file. With `"branch"`, leave out
     `concurrency` (it is one at a time).
   - Leave `autoDefault` at "off": nothing merges without me.
   - Do not invent model names or flags. Leave `args` empty unless I give you some.

6. Propose it. Call the operad `command` tool with plugin `bot`, verb `setup-dev`,
   arguments `default` and `<repository directory>`, and the `.operad/dev.json` text as its input. It makes
   a pending item; nothing is turned on or written until I approve it in Pending. If it
   refuses, fix what it names and call it again.

7. Report. Show me the `.operad/dev.json` you proposed, say in one line why you chose each
   check command, worker and reviewer, and say which way of working I chose and what it means for me in a sentence, and list anything you were unsure about. Tell me
   to commit `.operad/dev.json` after I approve it (operad reads it from the main clone).
```

准备好之后，接下来的步骤是 `operad serve`，然后是 `operad dev plan add --slug <slug> --title "<title>" < request.md`。

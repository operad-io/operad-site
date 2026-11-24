---
description: memory 插件：共享的 wiki、bot 的 memory，以及 bot 所写内容的 git 历史。
---

# memory 和 wiki {#memory-and-the-wiki}

`memory` 插件给 bot 两个地方保存它知道的东西：

- **wiki**，一个共享的知识库，每个 bot 都能读，部分 bot 能写；
- bot 的 **memory**，它工作目录里属于它自己的一个目录。

新建的 home 会启用它；之前建的 home 需要运行 `operad plugin enable memory`：

```sh
operad plugin enable memory
```

这个插件拥有一项设置、一个 skill 和一个索引。wiki 是一个带 git 历史的 Markdown 目录；bot 的 memory 有同样的历史，每个 bot 一个仓库。

## wiki {#the-wiki}

wiki 是每个 bot 共享的一个保留目录。它用来放那些关于外部世界、比一次 chat 活得更久的笔记：人可以把它指向自己的笔记库，例如一个 Obsidian vault，并在那里编辑它。

| 设置 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `memory.wikiDir` | 字符串 | operad home 中的 `wiki`，所以通常的 home 下是 `~/.operad/wiki` | 一个目录；`~` 是你的 home 目录，相对路径位于 operad home 之下 | 下一次 bot 回复时，以及下一次 `serve` 启动时 | 被设置调用拒绝，并给出 schema 的原因 |

目录缺失时会被创建。电脑上有 git 时，它不是 git 仓库就会被做成 git 仓库，不会询问；没有 git 时它保持为普通文件夹，wiki 照样工作，只是不保留历史，并在装上 git 之后某个 bot 下一次使用它时成为仓库。已经是 git 仓库的目录按原样使用：它不会被再次初始化，它的文件也不会被重新组织。所以把这项设置指向一个已有的 vault，会保留该 vault 的历史、分支和布局。

谁可以写 wiki，由每个 bot 的访问 profile 决定，而不是一个全局开关（见[访问](access.md)）。默认情况下 `default` bot 可以写它，其他每个 bot 只能读它。bot 自己的一项设置可以改变这一点：

| 设置 | 类型 | 默认值 | 允许的值 | 何时生效 | 错误的值 |
|---|---|---|---|---|---|
| `bot.bots.<name>.writeWiki` | 布尔值 | `default` 为 `true`，其他每个 bot 为 `false` | `true` 或 `false` | 下一次 bot 回复时 | 被 schema 拒绝 |

读取权限始终存在。不能写 wiki 的 bot，对这个目录的写入是被拒绝，而不只是被询问，所以一次误读不会意外改动人的笔记。

## bot 的 memory {#a-bots-memory}

bot 的 memory 位于它工作目录里的 `memory/`，所以 `default` 的是 `~/.operad/bot/default/memory/`。它不共享：其他 bot 读不到它。这个目录缺失时会被创建，电脑上有 git 时它是一个独立的 git 仓库，所以一个 bot 的历史与其他每个 bot 的历史分开。没有 git 时，它是一个没有历史的普通文件夹，直到 git 出现，然后它不经询问就成为仓库。工作目录本来就在某个仓库里时，保留那个仓库：插件只提交 `memory/` 这一部分。

布局有三层和一个文件：

| 路径 | 里面有什么 |
|---|---|
| `memory/index.md` | 索引：每个条目一行，一个链接加几个词。它保持很小；细节属于主题笔记 |
| `memory/log/YYYY-MM-DD.md` | 只追加的每日日志，记录发生了什么 |
| `memory/topics/<name>.md` | 主题笔记，从索引链接过去 |
| `memory/instructions.md` | 人给这个 bot 的长期指示 |

`index.md`、`instructions.md` 和 `log/` 缺失时由插件创建，插件从不覆盖它们。

## 一次回复带着什么 {#what-a-reply-carries}

bot chat 把 memory 索引和人的指示放在它的消息上，而不是放在 agent 的系统提示里。新会话的第一条消息，以及 agent 压缩上下文之后的第一条消息，会完整带上这两个文件。此后，每次回复把每个文件与会话上次看到的内容比较：在别处被改动的文件（同一个 bot 的另一个 chat、一次定时运行、一次整理）会再完整发一次，而 chat 自己的运行写下的改动不会重复。索引在大约 8,000 个字符处截断，并有一行说明它被截断了；把细节移到主题笔记里，让这个文件保持在这个长度以内。这些附注不是 transcript 的一部分，也不会改变你发出的消息。

## 夜间整理 {#the-nightly-tidy}

每晚一次，在 bot 的 `bot.bots.<name>.tidyTime`（默认 `03:30`），bot 检查自上次整理以来它的 memory 有没有变化，以及 `index.md` 是否超过了上限。这次检查不花费任何模型调用。没有事可做的夜晚到此为止。

有工作要做时，bot 有一个 pending 项，写明有多少笔记和 chat 需要检查，以及索引是否超过上限。Run（运行）开始整理；Skip（跳过）关闭它，直到下一次检查发现有工作为止。打开 `bot.bots.<name>.runWithoutAsking` 时，整理不经过这个 pending 项直接运行。bot 的任何 chat 正在写回复时，整理会等待。

从 Run 开始的整理完成后不留下 pending 项。和自动运行一样，它通过配置的 [`notify` 命令](notifications.md)发送一行。这一行写明是哪个 bot、它改动的文件和行数（或者 memory 没有变化）、费用，以及当一次重写丢掉了索引中太多内容时只保留了新增部分。bot 的回复不在这一行里；完整结果留在梦境整理的页面上。失败的整理保留一个 pending 项，带有 Run 和 Skip，以及简短的一行说明失败原因。

## memory skill {#the-memory-skill}

插件启用期间，每个 bot 都会在它列出的 skill 旁边挂载 `memory` skill（`SKILL.md`）。这个 skill 告诉 bot memory 是用来做什么的：记它查不到的东西，例如某个人的偏好、他们做过的一次纠正，以及他们核实过的一条规则。它指向 operad 自己的 history 和 wiki，而不是复制它们。它还说明，bot 必须遵守的规则不属于 memory：它们在 bot 的指示和它的访问 profile 里，修改其中一条是交给人的 proposal。

这个 skill 要求 bot 在回答之前读它的 memory，写入时不必询问，并保持索引简短。人事后在 git 历史里查看改了什么，而不是逐次批准每次写入。

## 搜索 {#search}

插件为 wiki、每个 bot 的 memory 和 chat 记录维护一个全文索引。它位于 `~/.operad/store/search.sqlite`。这个索引是缓存：它保存的任何内容都能从 Markdown 文件和 chat 重建，所以删除这个文件的代价是一次重建，不会丢任何笔记。

bot 用 `search` 工具搜索它，这个工具和其他 operad 工具一起提供。一次搜索可以覆盖 wiki、bot 自己的 memory 或 bot 自己的 chat；wiki 是共享的，memory 和 chat 不是。一条结果写明文档、它的行范围和一段摘录。`read` 工具返回文档，或结果所指的行范围。frontmatter 字段可以缩小搜索范围，目录的 `_about.md` 会随该目录内找到的命中一起返回。

读取还会显示链接到你所读笔记的那些笔记。有这样的笔记时，结果以 `Backlinks` 部分结尾：每条写明链接过来的笔记的路径、链接所在的行，以及它周围的一小段摘录。frontmatter 写着 `untrusted: true` 的链接笔记会被标记，和搜索结果一样。笔记自己向外的链接已经在它的正文里，所以不再列一次。没有反向链接时，这个部分被省略。`read` 命令打印这段文本；`--json` 则把同一个列表作为 `backlinks` 数组给出。

索引使用 SQLite FTS5 的 `trigram` 分词器，它对中文和英文都有效：句子中两个字的中文词由子串回退找到，因为 trigram 需要三个字符。FTS5 的默认分词器 `unicode61` 把一整串连续的汉字当作一个词。在仓库的 fixture 上，`unicode61` 找到了 9 篇相关文档中的 3 篇，`trigram` 找到了 9 篇中的 9 篇。

人在自己的编辑器里改过的笔记，在下一次搜索时就能找到。长时间运行的 `serve` 还会监视 wiki 和 memory 目录以及 store，所以它的索引在两次搜索之间也会跟上。

## app 中的 wiki {#the-wiki-in-the-app}

app 通过与其他每个插件相同的对象接口读取 wiki，所以 wiki 有列表页和对象页，不需要单独的文件 API。有两种只读的对象类型：wiki **folder** 和 wiki **note**。它们没有 action。只显示 `memory.wikiDir` 中的目录；bot 自己的 memory 目录不显示。

顶层是 wiki 的根：没有父级的列表显示直接位于根下的 folder 和 note。打开一个 folder 会列出它的子 folder 和 note，note 打开后显示它的内容。

| 对象 | 行 |
|---|---|
| folder | 以它的名称为标题，以及它之下有多少 note，包括它的子 folder 中的 |
| note | 以第一个标题为标题，否则用去掉 `.md` 的文件名，以及修改时间 |

folder 的标题是它的目录名。frontmatter 写着 `untrusted: true` 的 note 和其他 note 一样列出，带有搜索结果所带的同一个 `(untrusted)` 标记。行没有状态标记。

note 的页面有一个 **Note** 部分，里面是它的 Markdown 内容；有其他 note 链接到它时，还有一个 **Backlinks** 部分。反向链接遵循与读取的 Backlinks 相同的规则（见[搜索](#search)）：每一条都打开链接过来的 note 的对象。没有反向链接时，Backlinks 部分被省略。超过一页的内容用部分的游标分页，和其他任何长的部分一样。

内容部分还会写明其中的链接指向哪些 note，所以客户端可以跟随 `[[links]]` 和相对的 Markdown 链接。指向还没有人写的页面的链接保持未解析；Markdown 本身不会被改写。

## bot 写了什么都记录在 git 中 {#what-a-bot-wrote-is-recorded-in-git}

bot 的一次回复改动了它的 memory 目录或 wiki 之后，插件在这次回复改动过的每个仓库中各做一次提交。提交信息写明 bot 和它当时对话所在的 chat，例如：

```
memory: bot default, chat C-12
wiki: bot default, chat C-12
```

什么都没写的回复不做提交，在没有 git 的电脑上的回复也不做。这些提交是普通仓库中的普通提交：用 `git log` 查看，或在能显示它们的编辑器里查看，并像其他任何提交一样 revert 其中一个。不会有任何东西被 push 到任何地方。

插件分不清你自己未提交的修改和 bot 的修改：一次回复结束时，那一刻 wiki 之下的每一处改动都会被提交，提交信息里写着该 bot 和该 chat。请在 bot 写入之前提交你自己的修改，或者事后单独提交它们。

## bot 在外部找到的笔记 {#notes-a-bot-found-outside}

bot 读过网页、邮件或某个来源插件取回的条目之后写下的笔记，可能来自别人控制的内容。skill 要求 bot 在这种笔记的 frontmatter 里做标记：

```md
---
untrusted: true
---
```

这样标记的笔记永远不会从 `memory/index.md` 链接过去：插件在提交之前会移除指向它的索引行，笔记本身留在写下它的地方。夜间整理也会把这样的笔记排除在它的链接列表之外，所以它永远不会被建议用来链接。bot 被要求从一开始就不把它放进索引。

operad 目前还不能自己判断一次 bot 运行读过这样的内容：agent 的读取和本地 MCP server 返回的文本没有按运行记录下来。在做到这一点之前，这个标记取决于 bot 写不写它，bot 没有标记的笔记保持原样。

## 还没有的东西 {#not-here-yet}

目前还没有捕获或审阅流程。向量搜索尚未构建；索引的构建方式让另一个搜索引擎可以替换它，而不必改动工具。wiki、memory 布局和夜间整理现在已经可用。

## 回归集 {#the-regression-set}

一个用例是一次 bot 答错了、或被你更正的交流（更正算作一次 miss）。每个用例是一个文件 `~/.operad/memory-cases/<id>.json`；用例中有你的 chat 文本，所以它们留在你的 home 里。`memory propose` 把它在你的 chat 中找到的更正变成 pending 项；带着正确答案应当说出的短语批准其中一项，就会添加这个用例。`memory score` 对 bot 当前的 memory 运行这个集合，并把分数追加到 home 中的 `memory-scores.jsonl`。当每个短语都被说出（忽略大小写、空格和标点），且没有说出任何 `avoid` 短语时，用例通过。

| Key | Type | Default | Allowed values | When it takes effect | Wrong value |
|---|---|---|---|---|---|
| `id` | string | 无，必填 | 小写字母、数字、`-` 和 `_`，最多 64 个；文件名为 `<id>.json` | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `kind` | string | 无，必填 | `miss` 或 `correction` | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `context` | list | 无 | 更早的消息，最旧的在前 | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `context.role` | string | 无，消息中必填 | `user` 或 `assistant` | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `context.text` | string | 无，消息中必填 | 任何文本 | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `question` | string | 无，必填 | 非空文本 | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `answer` | object | 无，必填 | `include`，以及可选的 `avoid` | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `answer.include` | list | 无，必填 | 正确答案应当说出的一个或多个短语 | 下一次 `memory score` 时 | 拒绝，并指出文件名 |
| `answer.avoid` | list | 无 | 错误答案中的短语；说出其中任何一个的答案不通过 | 下一次 `memory score` 时 | 拒绝，并指出文件名 |

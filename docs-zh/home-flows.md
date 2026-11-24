---
description: 你自己在 home 中的 flow，每个写成一个文件，不需要插件。
---

# home 中的 flow {#flows-in-the-home}

flow 不一定来自插件。默认导出是一个 `defineFlow` 值的文件 `<home>/flows/<name>.flow.ts`，就是一个名为 `home:<name>` 的 flow。它可以调用每个已加载插件的 step。

例如，`~/.operad/flows/nightly.flow.ts` 就是 flow `home:nightly`：

```ts
import { defineFlow } from "@operad-io/engine";

export default defineFlow({
  name: "nightly",
  entry: "run",
  steps: [
    {
      id: "run",
      kind: "plugin",
      params: { use: "shell/command", params: { line: "date" } },
      replay: "safe",
      next: { pass: "end_done", fail: "end_failed", interrupted: "end_failed" },
    },
    { id: "end_done", kind: "end", params: { status: "done" }, replay: "safe" },
    { id: "end_failed", kind: "end", params: { status: "failed" }, replay: "safe" },
  ],
});
```

像上面那样从 `@operad-io/engine` 导入 `defineFlow`：它就是 operad 自己运行的那个引擎，无论 operad 是全局安装的，还是从源码检出运行的。为此 operad 在 `<home>/node_modules/@operad-io/engine` 保留一个链接，并在安装位置移动时更新它；你放在那里的真实文件夹不会被动。其他 `@operad-io` 包不会被链接。插件的 step 用它的字符串 `"<plugin>/<step>"` 指明，不需要导入。

文件在 `defineFlow` 内部给出的名称无关紧要；起作用的是文件名。文件名使用字母、数字、`.`、`_` 和 `-`，并以字母或数字开头。

## 使用它们 {#using-them}

- `operad flows` 列出它们，插件一栏为 `home`。
- `operad routines add --flow home:nightly --schedule "0 3 * * *"` 按 schedule 启动其中一个。

- `operad routines to-flow <id>` 把一个运行单条命令的定时任务变成这样一个文件，可以直接编辑，并让该定时任务指向它。

## 加载 {#loading}

这些文件在 operad 启动时加载；`<home>/flows` 中的文件改动时，`serve` 会重新加载，就像对插件的代码那样（见 [cli](cli.md)）。无法加载的文件会被拒绝：原因会指出该文件，并写到错误输出。其他文件和 `serve` 不受影响。已被另一个 flow 使用的名称也以同样的方式被拒绝。

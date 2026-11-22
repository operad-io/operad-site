---
description: 通过 Tailscale 网络访问 operad：HTTPS 名称、配对手机 app，以及哪些做法行不通。
---

# Tailscale {#tailscale}

[Tailscale](https://tailscale.com) 把你的机器连成一个私有网络，即 tailnet。本页说明如何从手机 app 或另一台电脑通过这个网络访问 `operad serve`。

## app 需要 HTTPS 名称 {#the-app-needs-the-https-name}

iOS app 连不到纯 `http://100.x.y.z:<port>` 形式的 Tailscale 地址，即使该地址在 `http.listen` 中，并且 `serve` 在它上面监听。app 会显示 `the server cannot be reached at http://100.x.y.z:<port>`。同一部手机上的 Safari 能访问该地址并得到 `401` 的 JSON，所以网络没有问题：是 app 拒绝向该地址使用纯 HTTP。iOS 很可能不把 `100.64.0.0/10` 算作本地网络。请使用 `tailscale serve` 给出的 `https://<machine>.<tailnet>.ts.net` 名称，设置方法见下一节。

## 在 tailnet 上提供 HTTPS {#serve-https-on-the-tailnet}

在运行 `operad serve` 的机器上执行这些步骤。

1. 在 Tailscale 管理控制台的 DNS 下，为 tailnet 启用 HTTPS 证书。这一步只需做一次。启用之前，`tailscale status
   --json` 显示 `"CertDomains": null`；启用之后，列表中会有这台机器的名称。
2. 把 `serve` 监听的端口提供出去：

   ```sh
   tailscale serve --bg 8765
   ```

   `8765` 是默认值；如果你设置过端口，请使用 `config.json` 中的 `http.port`。`--bg` 让代理在命令返回之后继续运行。它会打印 HTTPS 名称和它代理到的地址：

   ```text
   https://mac.tail1234.ts.net/
   |-- proxy http://127.0.0.1:8765
   ```

   `http.listen` 不需要改动：Tailscale 代理到 `127.0.0.1`，默认配置就在它上面监听。
3. 用这个名称配对 app：

   ```sh
   operad pair --url https://mac.tail1234.ts.net
   ```

   在 app 中扫描二维码。配对的细节见[应用页面](app.md#pairing-the-app)；它需要 `http.enabled` 为 true。
4. 要停止提供 HTTPS，运行 `tailscale serve --https=443 off`。

## 配对时始终传入 `--url` {#always-pass---url-to-pair}

不带 `--url` 的 `operad pair` 会打印 `http.listen` 中第一个非 loopback 的条目，有局域网地址时就是它，所以排在它后面的 Tailscale 地址永远不会显示。每次通过 Tailscale 配对时，都请用 `--url` 传入 `https://<machine>.<tailnet>.ts.net` 名称。

## 终端客户端 {#the-terminal-client}

另一台电脑上的终端客户端可以直接使用 Tailscale 地址：把它写进 `http.listen`，并连同 token 一起传入。

```sh
operad tui --url http://100.x.y.z:<port> --token <token>
```

`operad pair --show-token` 会打印可供复制的 URL 和 token。纯 HTTP 在这里没有 app 那样的限制，所以这条路径预计可以工作，但没有测试过。`--url`、`--token` 及其他选项见[终端客户端](tui.md)。

## 检查过什么 {#what-was-checked}

2026-11-15 在 macOS 上用 iOS app 检查过：上面的 HTTPS 步骤、用 `https://<machine>.<tailnet>.ts.net` 名称配对，以及在 app 中扫描二维码。还检查过：app 在纯 `http://100.x.y.z:<port>` 地址上失败，而同一部手机上的 Safari 能访问它。

没有检查过：从另一台电脑运行 `operad tui --url http://100.x.y.z:<port> --token <token>`，按上一节所说它预计可以工作；以及用 Linux 或 Windows 作为运行 `serve` 的机器。本页描述的是 macOS。

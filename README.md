# FairDrop | CoDrop 一起买

## 项目介绍

大家好，我们是 FairDrop 小组，成员包括 Leila、Kiira 和 JZ。今天在黑客松现场，我们从 0 到 1 完成了 FairDrop。

FairDrop 基于 Monad 构建，是一套面向生态限量数字权益的链上发行与交付基础设施。游戏资格、活动名额和社区身份，都可以通过 Pass 完成发行、分配与验证。

FairDrop 当前已接入 Monad Testnet。用户连接钱包后，一次可以提交最多 5 个接收地址。CoDropPass 合约会在同一笔交易中完成付款校验、库存扣减和 ERC-721 Pass 铸造。条件不满足时，整笔交易会回滚，保证购买结果完整。交易确认后，用户可在 MonadVision 查看合约、交易与 Pass 铸造记录，付款到到账全流程均可链上验证，保障交易透明、结果可追溯。

前端使用 wagmi 和 viem 连接钱包，通过 JSON-RPC 读取价格、库存、合约余额、角色地址和交易回执。项目方与平台的成交收入由合约按 99% 和 1% 记录，关键状态均可在链上核验。

这是我们今天完成的第一个版本，项目还有许多可以继续完善的地方。欢迎大家体验页面、查看合约，也欢迎提出建议。也感谢组委会和 Monad 社区提供这次黑客松机会，让我们有机会把想法真正做出来，并和大家交流。期待和大家一起在 Monad 生态中探索更多真实、有用的链上应用！

公网地址：[http://34.92.119.122:5173/](http://34.92.119.122:5173/)

GitHub：[https://github.com/zhongjef/FairDrop](https://github.com/zhongjef/FairDrop)

测试网合约：[MonadVision 合约地址](https://testnet.monadvision.com/address/0xb4fdc79f2540da2541fa74f4361b916b6b98c374) · Monad Testnet

FairDrop 仓库中的 CoDrop POC：一个钱包为多个地址购买 ERC-721 Pass，主办方和平台分别提取 99% / 1% 收入。当前部署在 Monad Testnet。

- [产品规格](docs/product-spec.md)
- [开发任务与验收](docs/implementation-tasks.md)
- [测试网验收记录](docs/acceptance.md)

## 工具与依赖

- Node `22.22.3`：见 `.nvmrc`。
- pnpm `11.21.0`：见 `package.json` 的 `packageManager`。
- 官方 Foundry `v1.8.0`：见 `contracts/.foundry-version`，该文件用于记录版本，安装时需显式指定。
- Solidity `0.8.30`，EVM 编译目标 `cancun`，优化器开启、200 runs。
- OpenZeppelin Contracts `5.6.1` 与 forge-std `1.16.2`：固定在 `contracts/lib`。
- 前端依赖使用精确版本，完整依赖树由 `pnpm-lock.yaml` 固定。

## 安装和运行

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@11.21.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

若已安装对应版本的 Node 和 pnpm，可直接执行 `pnpm install --frozen-lockfile`。复制 `.env.example` 后默认连接当前测试网合约。

按照 [Monad 官方 Foundry 指南](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry) 安装官方 `foundryup`，随后执行：

```sh
foundryup --install v1.8.0
export PATH="$HOME/.foundry/bin:$PATH"
forge --version
```

确保 Foundry 的 bin 目录在 PATH 中。不要使用旧版本忽略未知配置后返回的成功结果来验收 Monad 配置。

## 检查

在仓库根目录运行：

```sh
pnpm typecheck
pnpm build
forge build --root contracts
forge test --root contracts
```

前端输出目录为 `dist/`。Foundry 的 Solar lint 在从仓库根目录解析 vendored relative imports 时有已知路径问题；需要 lint 时进入 `contracts/` 后执行 `forge lint`。

## 配置与密钥

`.env.example` 声明公开的 Monad RPC 和当前测试网合约地址。

`VITE_*` 会暴露给浏览器，不能放私钥、助记词或私密 API 凭据。签名使用本地加密 keystore；`.env.local`、构建产物和 Foundry 输出不进入 Git。

当前目标是 Monad Testnet `10143`。浏览器钱包负责签名，私钥不会进入前端或仓库。

## 当前测试网部署

- 合约：[`0xB4Fdc79F2540DA2541FA74F4361B916b6B98c374`](https://testnet.monadvision.com/address/0xB4Fdc79F2540DA2541FA74F4361B916b6B98c374)
- 单价：`0.01 MON`
- 测试库存：`1000` 张（产品规格默认值仍为 5）
- 源码：MonadVision 与 Monadscan 已验证
- 本地合约测试：`9 passed, 0 failed`

GitHub Pages 发布由 `.github/workflows/pages.yml` 完成，生产构建固定使用上述公开合约地址。

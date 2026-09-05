# CoDrop 一起买

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

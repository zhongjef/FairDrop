# CoDrop 一起买

FairDrop 仓库中的 CoDrop POC。当前仅实现 T01 工程骨架：React 页面和 Foundry 配置。尚无购买、NFT、钱包连接、提款或部署功能。

- [产品规格](docs/product-spec.md)
- [开发任务与验收](docs/implementation-tasks.md)

## 工具与依赖

- Node `22.22.3`：见 `.nvmrc`。
- pnpm `11.21.0`：见 `package.json` 的 `packageManager`。
- 官方 Foundry `v1.8.0`：见 `contracts/.foundry-version`，该文件用于记录版本，安装时需显式指定。
- Solidity `0.8.30`，EVM 编译目标 `cancun`，优化器开启、200 runs。
- OpenZeppelin Contracts `5.6.1`：通过 pnpm 安装，Foundry remapping 指向根目录依赖。
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

若已安装对应版本的 Node 和 pnpm，可直接执行 `pnpm install --frozen-lockfile`。前端目前只是静态占位页面，不连接钱包或调用 RPC。

按照 [Monad 官方 Foundry 指南](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry) 安装官方 `foundryup`，随后执行：

```sh
foundryup --install v1.8.0
export PATH="$HOME/.foundry/bin:$PATH"
forge --version
```

确保 Foundry 的 bin 目录在 PATH 中。不要使用旧版本忽略未知配置后返回的成功结果来验收 Monad 配置。

## T01 检查

在仓库根目录运行：

```sh
pnpm typecheck
pnpm build
forge build --root contracts
forge config --root contracts
```

前端输出目录为 `dist/`。Foundry 配置必须包含 `network = "monad"` 和 `hardfork = "monad:MonadNine"`；编译器及优化设置也应与上文一致。

`contracts/src/Dependencies.sol` 只导入 ERC721 和 ReentrancyGuard，用于确认编译器与依赖解析可用，不包含业务合约。T01 没有业务测试，编译成功不代表资金、库存或 NFT 功能已经验收。

## 配置与密钥

`.env.example` 仅声明公开的 `VITE_MONAD_RPC_URL` 和未来部署后的 `VITE_CONTRACT_ADDRESS`。当前合约地址留空，这些变量将在后续任务中接入。

`VITE_*` 会暴露给浏览器，不能放私钥、助记词或私密 API 凭据。签名使用本地加密 keystore；`.env.local`、构建产物和 Foundry 输出不进入 Git。

当前目标是 Monad Testnet `10143`。hardfork 依据任务文档固定为 MonadNine，实际部署前必须复核 [测试网配置](https://docs.monad.xyz/developer-essentials/testnet)。部署脚本、静态资源发布和测试网验收属于后续任务，本阶段没有部署命令。

## 本次验证记录

2026-09-05：在项目目录和独立临时目录（Node 22.22.3）完成 `pnpm install --frozen-lockfile`、类型检查、Vite 构建和 Forge 依赖编译；临时目录复用本机 pnpm 缓存并通过在线策略校验，未验证空缓存下载。开发服务器 HTML 与 TSX 转换检查通过。

Foundry 1.8.0 编译成功，但附带 Solar 无法 lint 的提示；本阶段只验收依赖编译与配置，不宣称 lint 或业务测试通过。

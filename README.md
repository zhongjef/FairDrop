# CoDrop 一起买

CoDrop 是一个 Monad Testnet 上的限量 ERC-721 Pass 发售 POC：一个钱包一次付款，最多为 5 个地址领取 Pass；成交金额按 99% / 1% 分别记入主办方与平台待提款余额。

## 已实现

- React + TypeScript + Vite 单页 Demo
- Monad Testnet chain 配置（Chain ID `10143`）
- injected 钱包连接、断开与错链切换；首次连接或错链时按 Monad 官方参数自动添加/切换测试网
- 单笔 1–5 个接收地址，格式、零地址和重复地址校验
- Solidity `CoDropPass`：固定库存、精确付款、原子 `_safeMint`、1% 平台费、双方独立提款、防重入
- 购买前 `simulateContract`，购买/提款状态展示到 finalized 查询结果
- 合约地址与 bytecode 检查，区分未配置、格式错误、无代码、RPC 失败和可用状态
- 交易拒签、取消、替换、回执超时、finalized 查询失败的明确反馈；账户/网络切换会清除旧交易状态
- 链上单价、剩余库存、当前钱包 Pass 数量和双方待提款读取
- 静态 Pass 图片与元数据：`public/pass.svg`、`public/metadata.json`
- Foundry 部署脚本、ABI 导出脚本和本地测试源码（覆盖规格中的原子性、提款失败、转让和重入场景）

合约地址未配置时页面仍可浏览，但购买、提款和链上读数会保持禁用，并明确显示配置提示。

## 安装与运行

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

`.env.local` 只放公开配置：

```dotenv
VITE_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
VITE_CONTRACT_ADDRESS=0xYourDeployedContract
```

不要把私钥、助记词、Webhook 或其他签名凭据写入 `VITE_*` 变量。前端配置会进入浏览器构建产物。

## 前端检查

```sh
pnpm typecheck
pnpm build
```

## 合约检查

机器上安装 Foundry `v1.8.0` 后运行：

```sh
forge build --root contracts
forge test --root contracts
forge config --root contracts
```

Foundry 编译成功后，从编译产物同步前端 ABI：

```sh
pnpm abi:export
```

该命令读取 `contracts/out/CoDropPass.sol/CoDropPass.json`，生成 `src/abi.ts`；没有编译产物时会直接报错，不会静默写入一份不完整 ABI。

`contracts/foundry.toml` 已固定 Solidity `0.8.30`、EVM `cancun`、优化器 200 runs、`network = "monad"` 和 `hardfork = "monad:MonadNine"`。

## 测试网部署

部署前准备部署者、主办方和平台三个公开地址，并通过本地 keystore 或环境变量提供签名密钥。部署脚本会检查 Chain ID `10143`，固定默认参数为：单价 `1 MON`、库存 `5`、平台费 `1%`。

```sh
export ORGANIZER_ADDRESS=0x...
export PLATFORM_ADDRESS=0x...
export PASS_METADATA_URI=https://your-static-host.example/metadata.json
forge script contracts/script/Deploy.s.sol:DeployCoDropPass \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast --verify
```

部署完成后，把合约地址写入 `.env.local`，重新启动 Vite。真实测试网购买、两方提款和浏览器源码验证需要可用的测试 MON、钱包和公开静态托管地址，本仓库没有伪造这些外部证据。

## 目录

```text
src/main.tsx                # 单页 UI、表单校验、链上读写状态
src/chain.ts                # Monad Testnet 与 wagmi 配置
src/abi.ts                  # CoDropPass 前端 ABI
scripts/export-abi.mjs     # 从 Foundry artifact 同步 ABI
contracts/src/CoDropPass.sol
contracts/test/CoDropPass.t.sol
contracts/script/Deploy.s.sol
public/pass.svg
public/metadata.json
docs/product-spec.md
docs/implementation-tasks.md
```

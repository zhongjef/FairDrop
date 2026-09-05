# CoDrop 验收记录

记录日期：2026-09-05

## 本地验证

| 项目 | 结果 | 证据 |
|---|---|---|
| 前端类型检查 | 通过 | `pnpm typecheck` |
| 前端生产构建 | 通过 | `pnpm build`，输出 `dist/` |
| 本地页面 | 通过 | `http://127.0.0.1:5174/` 可打开；已检查配置提示、地址错误、添加地址行 |
| 钱包连接入口 | 代码完成，真实钱包验收待完成 | 已接入 injected connector、Monad Testnet 自动添加/切换；当前内置浏览器没有 injected provider |
| Solidity 0.8.30 语法编译 | 通过（非 Foundry 验收） | `npx solc@0.8.30` 编译合约、测试辅助合约和部署脚本；测试文件有 `selfdestruct` 弃用及测试合约代码体积提示 |
| Foundry 编译/测试 | 通过 | 官方 Foundry `forge 1.8.1`；`forge build --root contracts` 成功；`forge test --root contracts`：21 passed、0 failed |
| Monad Testnet RPC | 通过 | `eth_chainId` 返回 `0x279f`（10143） |
| NFT 元数据与图片 | 通过 | `metadata.json` 与 `pass.svg` 已发布到 GitHub Raw HTTPS 地址并返回 200 |
| ABI 导出 | 通过 | `pnpm abi:export` 已成功执行，使用 `contracts/out/CoDropPass.sol/CoDropPass.json` 重新生成 `src/abi.ts` |
| 测试网部署 | 未执行 | 已有部署钱包和公开元数据地址；仍缺部署私钥与合约广播结果 |

## P01–P05

- **P01 多人购买：未执行。** 需要全新库存 5 的 Monad Testnet 合约和付款钱包。
- **P02 佣金闭环：未执行。** 需要 P01 成功交易，以及主办方、平台各自的钱包。
- **P03 整单失败：通过。** Foundry 测试覆盖库存不足整单回滚，`forge test` 全部通过。
- **P04 基础保护：通过。** Foundry 测试覆盖 1/5 人、售罄、跨订单重复、转让、部分铸造回滚、错误金额、提款失败、直接/强制入金和重入，21/21 通过。
- **P05 可验证性：未执行。** 需要测试网交易、公开合约地址、Verified 源码和静态资源 URL。

本记录没有把前端构建结果、合约源码或 mock 数据写成测试网成功证据。

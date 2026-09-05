# CoDrop Monad Testnet 验收记录

日期：2026-09-05
网络：Monad Testnet（Chain ID `10143`）

## 当前部署

- 合约：[`0xB4Fdc79F2540DA2541FA74F4361B916b6B98c374`](https://testnet.monadvision.com/address/0xB4Fdc79F2540DA2541FA74F4361B916b6B98c374)
- 部署交易：[`0x1f3ec20f64be68ba4d361735644a4d4b4eb8f0d097eeb661745d15b7cf233351`](https://testnet.monadvision.com/tx/0x1f3ec20f64be68ba4d361735644a4d4b4eb8f0d097eeb661745d15b7cf233351)
- 单价：`0.01 MON`
- 测试库存：`1000`（为重复测试临时扩大，产品规格默认值仍为 5）
- 主办方：`0xCd94d3e5bcBeb4Ae245aaf3Bc099fbc6d8B22178`
- 平台：`0x8AEE596b6B13CcD28dd5955001e291a004e12621`
- 源码：MonadVision 与 Monadscan 均为 perfect match / verified。

## 先前 5 张合约的单人烟雾测试

- 合约：[`0xF96E3040989d94833D031a8d7a91393EBc6f4021`](https://testnet.monadvision.com/address/0xF96E3040989d94833D031a8d7a91393EBc6f4021)

- 购买交易：[`0xff47f7cbc995a5ba5c235a1a46c9a27da5f7491eae739715191912f8f9eb3f7a`](https://testnet.monadvision.com/tx/0xff47f7cbc995a5ba5c235a1a46c9a27da5f7491eae739715191912f8f9eb3f7a)
- 付款：`0.01 MON`
- Token #1 持有人：`0xdb7727e7a90a7949e43ddAaC8E43EC13E1893d9b`
- 购买后状态：已售 `1`，剩余 `4`
- 主办方待提款：`0.0099 MON`
- 平台待提款：`0.0001 MON`
- 合约余额：`0.01 MON`

购买回执成功，页面等待到 finalized 后才显示成功；上述数值另通过 Monad Testnet RPC 独立读取确认。

## 尚未完成

- P01 三个不同地址的同笔购买。
- 主办方和平台提款；两个账户当前需要测试 MON 支付 Gas。
- 库存不足及其他保护项只完成本地 Foundry 测试。
- 正式五项验收仍需继续执行，单人烟雾测试不能替代完整验收。

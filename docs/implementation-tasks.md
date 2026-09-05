# CoDrop POC：开发任务与验收条件

依据：[产品规格 POC v0.1](./product-spec.md)。官方文档核对日期：2026-09-05。

工程文件与 T01–T05、T07–T09 的实现源码已落盘；前端检查、Foundry 编译与本地合约测试已通过，T06/T10 的测试网证据仍待外部钱包、测试币和托管条件。README 与 `docs/acceptance.md` 记录了当前可验证范围。仓库名保留 FairDrop，对外产品名和合约名沿用 CoDrop / CoDropPass。

## 1. 技术栈定案

| 层级 | 本次选型 | 实现边界 |
|---|---|---|
| 应用 | React + TypeScript + Vite | 根目录一个单页项目，不引入路由或服务端 |
| 样式 | 普通 CSS | 原生表单、可键盘操作、有标签和错误提示 |
| 包管理 | pnpm | 提交锁文件，在 packageManager 中锁定实际版本 |
| 钱包 | wagmi，injected connector | 浏览器扩展钱包，至少完成 MetaMask 人工验收；扫码连接和嵌入式钱包不做 |
| 链读写 | viem 2.x，最低 2.40.0 | 使用 Monad Testnet chain 定义，金额全程 bigint / wei |
| 请求状态 | TanStack Query | 配合 wagmi 读取、刷新和展示错误，不另加状态库 |
| 合约 | Solidity 0.8.x + OpenZeppelin Contracts 5.x | 一个 CoDropPass，复用 ERC721 与 ReentrancyGuard |
| 合约工具 | 官方 Foundry >= 1.8.0 | Forge 测试/部署/验证，Cast 核查；不再加 Hardhat |
| 网络 | Monad Testnet，测试 MON | 仅测试网，不接稳定币、AA、分摊付款 |
| NFT 内容 | 一份静态 JSON + 一张静态图片 | 随前端发布，所有 token 共用 URL，无上传系统 |
| 托管 | Vite dist 静态托管 | 服务商在发布任务中记录，业务不依赖其 API |

这是一套项目选择，不是 Monad 强制要求。Monad 的 EVM 兼容性允许沿用 Solidity 工具链；官方支持 Foundry 和 viem。[部署概览](https://docs.monad.xyz/developer-essentials/summary)；wagmi 官方给出的依赖组合包含 viem 和 TanStack Query。[wagmi 入门](https://wagmi.sh/react/getting-started)

版本策略：T01 安装时选取满足上述约束且 peer dependencies 兼容的稳定版本，记录精确版本。Solidity 编译器、优化设置和 OpenZeppelin tag/commit 一起固定；此文不把尚未安装验证的 patch 版本写成已锁定。

不增加数据库、后端 API、索引器、Redis、代理升级、多活动后台、通用组件库、全量 E2E 框架。

## 2. Monad 必须落实的配置

| 项目 | 本项目约定 |
|---|---|
| Chain ID | `10143`，部署脚本广播前强制检查 |
| RPC | `https://testnet-rpc.monad.xyz`，允许通过环境变量更换 |
| 浏览器 | `https://testnet.monadvision.com`，交易与合约链接统一使用该网络 |
| 领水入口 | [Monad Faucet](https://faucet.monad.xyz) |
| Foundry | `network = "monad"`；当前测试网文档为 `MONAD_NINE`，本地配置 `hardfork = "monad:MonadNine"`；部署前复核 |
| 交易成功 | 成功回执 + 所属区块已 finalized，再刷新库存、持有数量和待提款 |
| Gas | 使用目标 RPC 估算，不复制以太坊估算值或设置极大固定 gas limit |

网络参数来自 [Monad 测试网配置](https://docs.monad.xyz/developer-essentials/testnet)。官方 Foundry 指南指出工具的最新默认 hardfork 可能比测试网新，因此要显式对齐。[Foundry 配置](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry)

Monad 按 gas limit 计费，超大的估算余量会增加费用；付款金额和网络费分开展示。官方区分早期回执与 finalized；等待 finalized 是本 POC 的确认策略，不按固定秒数判断成功。[Gas 与交易时序](https://docs.monad.xyz/developer-essentials/summary)

公共 RPC 有请求限制；本版不逐块高频刷新，也不扫描历史订单。正常状态在页面加载、钱包切换、交易完成和手动刷新时读取；等待交易时有限轮询。RPC 超时保留“未知”状态，不能解释成交易失败后自动重发。

## 3. 执行顺序

T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10。

T05 的静态资源发布要先于合约部署，以便构造参数写入真实可访问的元数据 URL。正式验收使用一份全新库存 5 的部署，避免联调消耗库存影响 P01。

### T01 — 初始化工程与版本锁定

- [x] 建立根目录 Vite React TS 应用和 `contracts/` Foundry 项目。
- [x] 安装选定前端依赖并记录 Node、pnpm、Foundry、Solidity 与 OpenZeppelin 版本要求；保留锁文件和 Foundry 配置。
- [x] 提供 `dev`、`build`、`typecheck` 命令；删除模板示例业务。
- [x] 提供 `.env.example` 与 `.gitignore`。前端只接收公开的 RPC、合约地址；签名密钥使用本地 keystore，不能进入 `VITE_*`、源码或构建产物。

**验收：**干净检出后按 README 可安装；`pnpm build`、`pnpm typecheck`、`forge build --root contracts` 成功；`forge config --root contracts` 显示 Monad network 和明确 hardfork。

**产物：**应用骨架、`contracts/foundry.toml`、依赖锁、环境变量示例、README 初稿。依赖：无。

**T01 验收记录（2026-09-05）：**项目目录的依赖、类型检查、前端构建、Foundry 配置读取和合约编译已通过；使用官方 Foundry `forge 1.8.1` 验证 `network = "monad"` 与 `hardfork = "monad:MonadNine"`。文件已落盘，尚未 Git 提交或推送。

### T02 — 实现 Pass 与原子购买

**实现状态：源码已完成，Foundry 编译与正向/边界测试通过。** 见 `contracts/src/CoDropPass.sol`。

- [x] 实现 `contracts/src/CoDropPass.sol`，使用标准 ERC721，连续 tokenId 从 1 开始。
- [x] 构造参数固定单价、库存、主办方、平台和元数据 URL；拒绝零收款地址、零单价、零库存、空元数据 URL。演示部署使用不同的主办方与平台地址。
- [x] 实现 `buy(address[] recipients)`：人数 1–5、非零、不重复、库存足够、`msg.value` 精确相等。
- [x] 先校验并更新库存/双方账本，再逐个 `_safeMint`；购买入口防重入；外部回调失败整单回滚。
- [x] 平台费固定为 `amount * 100 / 10_000`，主办方获得差额；不存在跨订单限购。
- [x] 购买事件记录 payer、recipients、startTokenId、amount、platformFee；公开必要的库存/价格/账本读取。
- [x] `tokenURI` 对存在的 token 返回统一静态 JSON URL，对不存在的 token 报错；保留标准转让。无需 Enumerable 或逐 token URI 存储。

**验收：**本地 3 MON 为三个地址购票，每人余额 +1，ownerOf 正确，sold=3，剩余=2，主办方账本=2.97 MON，平台账本=0.03 MON；付款人可不在名单。同一地址在后续订单仍可收票。事件可还原本笔订单。

**产物：**业务合约购买部分及 T04 同一测试文件中的正向用例。依赖：T01。对应 P01。

### T03 — 实现双方独立提款

**实现状态：源码已完成，Foundry 编译与提款/权限/失败路径测试通过。** 见 `contracts/src/CoDropPass.sol`。

- [x] 实现 `withdrawOrganizer()`、`withdrawPlatform()`，仅对应收款地址可调用。
- [x] 待提款为零时报错；一次提取全部，先清账再转账，转账失败 revert；两个入口均防重入。
- [x] 事件记录收款人和金额；不提供 owner 提走全款、修改参数或任意增发入口。
- [x] 普通直接转入 MON 不作为订单；即使合约被强制转入资金，也不增加双方账本。

**验收：**双方各自提走准确账面金额，一方提款不改变另一方权益；重复/越权提款失败；收款合约拒绝转账时账本与余额回滚。

**产物：**完整合约及提款用例。依赖：T02。对应 P02、P04。

### T04 — 完成合约保护与原子性测试

**实现状态：Foundry 测试通过（21/21）。** 见 `contracts/test/CoDropPass.t.sol`；当前文件覆盖 1/5 人、售罄、跨订单重复、转让、错误输入、完整回滚、双向提款失败、直接/强制入金和购买/提款回调重入。

- [x] 所有测试集中于 `contracts/test/CoDropPass.t.sol`，测试辅助接收合约也放在此文件。
- [x] 覆盖 1 人、5 人、售罄、跨订单重复接收、标准转让后 ownerOf/balanceOf 更新。
- [x] 覆盖空名单、6 人、零地址、重复地址、少付、多付、库存不足；失败前后比较库存、NFT、双方账本与合约余额。
- [x] 第二或第三个接收合约拒收时，验证之前已执行的铸造也全部回滚。
- [x] 覆盖购买回调及提款回调尝试重入三个业务入口，不能超售或重复提款；回调捕获重入错误后继续完成外层交易时，最终账目也正确。
- [x] 覆盖双方转账失败、未授权提款、零余额提款、强制转入额外资金不增加权益。
- [x] 用非整 MON 价格验证 1% 向下取整与收入守恒。

**验收：**`forge test --root contracts` 已全部通过（21/21）；无额外入金时，合约余额等于两方待提款之和；额外入金只允许余额大于账本总额；sold 不超库存。测试使用 Monad 执行配置，不拿默认 Ethereum Gas 作为 Monad 证明。

**产物：**测试文件、可复跑命令和结果摘要。依赖：T03。对应 P03、P04；正式演示部署仍依赖 T05、T06。

### T05 — 发布元数据并准备演示参数

**实现状态：静态资源已发布到公开 HTTPS 地址；部署/付款钱包地址已确认，主办方与平台账户余额待核实。** 见 `public/pass.svg`、`public/metadata.json`。

- [x] 在 `public/` 放置静态 Pass 图片和 JSON，包含 name、description、image。
- [x] 发布静态资源到选定 HTTPS 地址；JSON 中 image 使用可公开访问的绝对 URL。
- [x] 准备普通未委托 EOA 测试钱包：付款人、三个不同接收地址、主办方、平台；部署者可复用付款人。
- [ ] 付款人准备 3 MON 票款和额外 Gas；部署者、主办方、平台分别有足够操作 Gas。当前已确认部署/付款账户有 120 MON，其他角色余额待核实。

**验收：**浏览器可直接获取 JSON 和图片；所有公开地址与角色已记录；固定参数为库存 5、单价 1 MON、费率 1%。不要求钱包自动展示图片。

**产物：**静态资产、公开 URL、部署参数清单（不含私钥）。依赖：T01；执行正式部署前还须 T04 通过。

### T06 — 测试网部署、源码验证与 ABI 同步

**实现状态：部署脚本与前端 ABI 接入已完成；`scripts/export-abi.mjs` 负责从 Foundry artifact 同步 ABI，尚未广播部署或完成源码验证。**

- [x] 编写 `contracts/script/Deploy.s.sol`，广播前检查 Chain ID=10143、构造参数和付款余额。
- [ ] 使用 Foundry script 部署 CoDropPass，记录交易哈希、合约地址、区块、构造参数、源码 commit、编译设置。
- [ ] 按 [Monad Foundry 验证指南](https://docs.monad.xyz/guides/verify-smart-contract/foundry) 验证源码，保留浏览器 Verified 链接。
- [x] 从编译产物导出 ABI 给前端，不能手写一份不完整 ABI；读取链上价格、库存与收款人核对配置。

**验收：**RPC 返回正确链 ID，目标地址存在代码；浏览器显示已验证源码；部署后 sold=0，库存=5，双方账本=0，所有参数符合清单。只获得部署哈希或提交源码验证申请不算完成。

**产物：**部署脚本、ABI、公开部署记录。依赖：T04、T05。

### T07 — 单页只读展示与钱包连接

**实现状态：前端实现已完成；需要配置部署地址后进行真实钱包验收。**

- [ ] 展示活动、测试网提示、链上单价和库存；钱包连接后展示当前钱包 Pass 数量、双方待提款。
- [ ] 接入 injected 钱包，处理未安装、未连接、拒绝连接、断开和切换账户；首次连接以 Monad Testnet 为目标链。
- [ ] 错链时引导切换 Monad Testnet；若钱包返回 `4902`，请求添加 Chain ID `10143`（`0x279f`）及官方 RPC/浏览器参数；添加或切换被拒绝时显示错误并继续禁止购买/提款；合约地址未配置或无代码时显示配置错误。
- [ ] 将 loading、RPC error 和真实零值分开；支持手动刷新。

**验收：**未连接也可看活动；换钱包后持有量与权限正确刷新；断网不显示假零值；原购买接收者转出后页面按当前 balanceOf 展示。表单有 label，状态提示可被辅助技术读取，窄屏不横向溢出。

**产物：**可运行单页与链配置。依赖：T06。

### T08 — 地址表单与购买交易

**实现状态：前端实现已完成；需要测试网合约和钱包完成 P01/P03/P05 人工验收。**

- [ ] 每行一个地址，trim 并忽略空行；校验格式、零地址、大小写归一后的重复地址、人数和当前库存。
- [ ] 显示完整接收名单、人数、链上价格计算的总金额与不可撤销提醒；不静默去重。
- [ ] 使用 bigint 计算 value，先模拟再请求签名；模拟成功仍需处理发送时库存被抢占。
- [ ] 签名前固定本笔 recipients/amount 快照，等待过程中禁止重复提交，结果展示该笔实际名单。
- [ ] 处理拒签、revert、替换/取消交易及等待超时；有哈希后提供链接，成功回执所属区块 finalized 后才显示成功。查询异常不得自动重新购买。
- [ ] 交易完成后刷新链上库存、当前钱包持有量及双方账本。

**验收：**付款钱包只确认一次，三个接收者无需操作；处理中不提前成功；库存不足或收件人错误有明确反馈；原生测试 MON 支付，不出现代币 approve 步骤。

**产物：**完整购买流程及人工检查记录。依赖：T07。对应 P01、P03、P05。

### T09 — 收入区与提款交易

**实现状态：前端实现已完成；需要测试网合约和收款钱包完成 P02/P05 人工验收。**

- [ ] 始终展示双方待提款；只有对应账户能看到可用提款按钮，零余额时禁用。
- [ ] 使用和购买一致的签名、链上处理中、finalized 成功、失败/未知反馈。
- [ ] 成功后重新读取账本，切换账户不复用前一个钱包的提款权限或交易结果。

**验收：**主办方和平台分别使用各自钱包提款，各一笔交易；一方不能代另一方提款；金额正确，待提款归零。收到哈希不等于提款成功。

**产物：**提款 UI 和人工检查记录。依赖：T08。对应 P02、P05。

### T10 — 完成真实测试网验收与交付

**实现状态：文档与验收模板已完成；真实测试网证据仍待外部条件。**

- [x] `pnpm typecheck`、`pnpm build`、`forge test --root contracts` 通过，记录对应工具版本；真实部署 commit 记录仍待 T06。
- [ ] 发布最终静态 Demo，确认网页、NFT 资源和前端合约配置一致。
- [ ] 使用库存 5 的新合约依次完成下表 P01、P02、P05；若 T06 合约已被联调消耗，重新部署并更新全部地址记录。
- [ ] 新建 `docs/acceptance.md`，填写结果、交易链接、区块号、前后读数和已知限制；缺项标记未通过/阻塞。
- [ ] 完成 README 的安装、配置、测试、部署、验证和演示步骤。

**验收：**五项都有证据且通过；他人能按 README 重现本地检查，并通过公开 Demo、合约和交易链接核查演示。部署、源码验证、网页发布、真实购买、真实提款分别确认，不能相互替代。

**产物：**Demo URL、README、验收报告、最终部署记录。依赖：T09。

## 4. 最终验收矩阵

| 编号 | 环境与操作 | 必须观察到的结果 | 留存证据 |
|---|---|---|---|
| P01 | 测试网全新库存 5，A 向 B/C/D 买 3 张，支付 3 MON | B/C/D 各持有一枚，tokenId 连续，库存=2，双方账本=2.97/0.03 MON | 成功且 finalized 的交易、购买事件、ownerOf/balanceOf/库存读数 |
| P02 | 紧接 P01，主办方和平台各自提款 | 转账=2.97/0.03 MON，双方账本=0；无额外入金时合约余额=0 | 两笔成功且 finalized 的提款、事件、合约及钱包余额变化、实际手续费 |
| P03 | 本地库存剩 2，再买 3 张 | revert；库存、NFT、双方账本、合约余额均不变 | T04 的库存不足测试输出与断言 |
| P04 | 本地执行全部非法输入、权限、回调、重入及取整场景 | 非法操作拒绝；不存在部分发证、超售、重复提款或收入计算丢失 | T04 测试文件、命令、通过摘要 |
| P05 | 测试网刷新页面、切换到接收钱包，核查合约/购买/提款链接 | 页面读数与当前链上状态一致；元数据可访问；浏览器源码已验证 | Demo URL、截图/读数、合约及三笔业务交易链接 |

**P02 对账口径：**在验收窗口内没有其他收支时，收款钱包余额变化 = 合约转入金额 − 该钱包支付的实际网络费。不要要求提款钱包净增额正好等于 2.97/0.03 MON；记录网络实际扣费，不把以太坊的费用假设硬套到 Monad。提款事件还需与成功回执、余额变化共同核查。

## 5. 完成规则

只有对应验收满足且证据可定位，才把 TODO 改成 `[x]`。本地测试通过不等于测试网通过；测试网闭环通过也不代表具备主网商业售票能力。

需要外部条件的节点：T05 的测试币、公开静态资源地址和钱包；T06 的签名与验证服务可用性；T10 的发布环境。任何条件缺失只阻塞对应节点，不能用 mock 结果替代链上证据。

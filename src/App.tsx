import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  useBlock,
  useConnect,
  useConnection,
  useConnectors,
  useDeployContract,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { type Abi, type Address, type Hex, BaseError, encodeDeployData, formatEther, isAddress, parseEther, zeroAddress } from 'viem'
import { monadTestnet } from 'wagmi/chains'
import artifact from './generated/CoDropPass.json'

const abi = artifact.abi as Abi
const bytecode = artifact.bytecode as Hex
const explorer = 'https://testnet.monadvision.com'
const storageKey = 'codrop-contract-address'

function storedContract(): Address | undefined {
  const candidate = import.meta.env.VITE_CONTRACT_ADDRESS || localStorage.getItem(storageKey)
  if (!candidate) return undefined
  try {
    return parseAddress(candidate)
  } catch {
    return undefined
  }
}

function parseAddress(value: string): Address {
  const address = value.trim()
  if (!isAddress(address, { strict: false })) throw new Error('钱包地址格式有误')
  return address.toLowerCase() as Address
}

function short(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'
}

function errorMessage(error: unknown) {
  return error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : '操作失败'
}

function parseRecipients(input: string): Address[] {
  const recipients = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseAddress)

  if (recipients.length === 0 || recipients.length > 5) throw new Error('请输入 1–5 个接收地址')
  if (recipients.some((address) => address === zeroAddress)) throw new Error('接收地址不能是零地址')
  if (new Set(recipients.map((address) => address.toLowerCase())).size !== recipients.length) {
    throw new Error('同一订单不能包含重复地址')
  }
  return recipients
}

export function App() {
  const connection = useConnection()
  const connectors = useConnectors()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const switchChain = useSwitchChain()
  const publicClient = usePublicClient({ chainId: monadTestnet.id })
  const deploy = useDeployContract()
  const write = useWriteContract()

  const [contractAddress, setContractAddress] = useState<Address | undefined>(storedContract)
  const [contractInput, setContractInput] = useState('')
  const [organizerInput, setOrganizerInput] = useState('')
  const [platformInput, setPlatformInput] = useState('')
  const [metadataInput, setMetadataInput] = useState('https://zhongjef.github.io/FairDrop/pass.json')
  const [recipientsInput, setRecipientsInput] = useState('')
  const [submittedRecipients, setSubmittedRecipients] = useState<Address[]>([])
  const [pendingHash, setPendingHash] = useState<Hex>()
  const [pendingAction, setPendingAction] = useState<'deploy' | 'buy' | 'organizer' | 'platform'>()
  const [localError, setLocalError] = useState('')
  const handledHash = useRef<Hex | undefined>(undefined)
  const actionLock = useRef(false)
  const [preparing, setPreparing] = useState(false)

  const enabled = Boolean(contractAddress)
  const contract = { address: contractAddress, abi, chainId: monadTestnet.id } as const
  const price = useReadContract({ ...contract, functionName: 'price', query: { enabled } })
  const maxSupply = useReadContract({ ...contract, functionName: 'maxSupply', query: { enabled } })
  const sold = useReadContract({ ...contract, functionName: 'sold', query: { enabled } })
  const remaining = useReadContract({ ...contract, functionName: 'remainingSupply', query: { enabled } })
  const organizer = useReadContract({ ...contract, functionName: 'organizer', query: { enabled } })
  const platform = useReadContract({ ...contract, functionName: 'platform', query: { enabled } })
  const organizerPending = useReadContract({ ...contract, functionName: 'organizerPending', query: { enabled } })
  const platformPending = useReadContract({ ...contract, functionName: 'platformPending', query: { enabled } })
  const walletPasses = useReadContract({
    ...contract,
    functionName: 'balanceOf',
    args: [connection.address || zeroAddress],
    query: { enabled: enabled && Boolean(connection.address) },
  })

  const receipt = useWaitForTransactionReceipt({
    hash: pendingHash,
    chainId: monadTestnet.id,
    query: { enabled: Boolean(pendingHash) },
  })
  const finalizedBlock = useBlock({
    chainId: monadTestnet.id,
    blockTag: 'finalized',
    watch: true,
    query: { enabled: Boolean(receipt.data) },
  })
  const finalized = Boolean(
    receipt.data?.status === 'success'
      && receipt.data.transactionHash === pendingHash
      && finalizedBlock.data?.number !== undefined
      && finalizedBlock.data.number >= receipt.data.blockNumber,
  )

  const parsedPreview = useMemo(() => {
    try {
      return parseRecipients(recipientsInput)
    } catch {
      return []
    }
  }, [recipientsInput])
  const total = typeof price.data === 'bigint' ? price.data * BigInt(parsedPreview.length) : 0n
  const wrongChain = connection.status === 'connected' && connection.chainId !== monadTestnet.id
  const busy = preparing || deploy.isPending || write.isPending || Boolean(pendingHash && !finalized && !receipt.isError)
  const soldOut = remaining.data === 0n
  const canBuy = connection.status === 'connected'
    && !wrongChain
    && !busy
    && parsedPreview.length > 0
    && typeof remaining.data === 'bigint'
    && BigInt(parsedPreview.length) <= remaining.data
  const readError = [price, maxSupply, sold, remaining, organizer, platform, organizerPending, platformPending]
    .find((query) => query.error)?.error

  async function refresh() {
    await Promise.all([
      price.refetch(), maxSupply.refetch(), sold.refetch(), remaining.refetch(), organizer.refetch(),
      platform.refetch(), organizerPending.refetch(), platformPending.refetch(), walletPasses.refetch(),
    ])
  }

  useEffect(() => {
    if (!finalized || !pendingHash || handledHash.current === pendingHash) return
    handledHash.current = pendingHash
    releaseAction()
    if (pendingAction === 'deploy' && receipt.data?.contractAddress) {
      const deployedAddress = parseAddress(receipt.data.contractAddress)
      localStorage.setItem(storageKey, deployedAddress)
      setContractAddress(deployedAddress)
      setContractInput(deployedAddress)
    }
    if (pendingAction === 'buy') setRecipientsInput('')
    void refresh()
  }, [finalized, pendingAction, pendingHash, receipt.data?.contractAddress])

  useEffect(() => {
    if (receipt.isError || receipt.data?.status === 'reverted') releaseAction()
  }, [receipt.data?.status, receipt.isError])

  function beginAction(action: 'deploy' | 'buy' | 'organizer' | 'platform') {
    if (actionLock.current) return false
    actionLock.current = true
    setPreparing(true)
    setPendingAction(action)
    setPendingHash(undefined)
    setLocalError('')
    return true
  }

  function releaseAction() {
    actionLock.current = false
    setPreparing(false)
  }

  function requireWallet() {
    if (!connection.address) throw new Error('请先连接 MetaMask')
    if (wrongChain) throw new Error('请先切换到 Monad Testnet')
    if (!publicClient) throw new Error('RPC 暂时不可用')
    return connection.address
  }

  async function handleDeploy(event: FormEvent) {
    event.preventDefault()
    if (!beginAction('deploy')) return
    try {
      const account = requireWallet()
      const organizerAddress = parseAddress(organizerInput)
      const platformAddress = parseAddress(platformInput)
      if (organizerAddress === platformAddress) throw new Error('主办方和平台必须使用不同地址')
      if (!metadataInput.startsWith('https://')) throw new Error('Metadata 必须使用 HTTPS 地址')
      const args = [parseEther('0.01'), 1000n, organizerAddress, platformAddress, metadataInput] as const
      const estimate = await publicClient!.estimateGas({ account, data: encodeDeployData({ abi, bytecode, args }) })
      const hash = await deploy.mutateAsync({ abi, bytecode, args, chainId: monadTestnet.id, gas: estimate + estimate / 10n })
      handledHash.current = undefined
      setPreparing(false)
      setPendingHash(hash)
    } catch (error) {
      setLocalError(errorMessage(error))
      releaseAction()
    }
  }

  function handleUseContract(event: FormEvent) {
    event.preventDefault()
    setLocalError('')
    try {
      const address = parseAddress(contractInput)
      localStorage.setItem(storageKey, address)
      setContractAddress(address)
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  async function handleBuy(event: FormEvent) {
    event.preventDefault()
    if (!beginAction('buy')) return
    try {
      const account = requireWallet()
      if (!contractAddress || typeof price.data !== 'bigint') throw new Error('合约数据尚未加载')
      const recipients = parseRecipients(recipientsInput)
      if (typeof remaining.data === 'bigint' && BigInt(recipients.length) > remaining.data) {
        throw new Error('剩余库存不足，整单不会成交')
      }
      const value = price.data * BigInt(recipients.length)
      const request = { address: contractAddress, abi, functionName: 'buy', args: [recipients], value, account } as const
      await publicClient!.simulateContract(request)
      const estimate = await publicClient!.estimateContractGas(request)
      const hash = await write.mutateAsync({
        address: contractAddress, abi, functionName: 'buy', args: [recipients], value,
        chainId: monadTestnet.id, gas: estimate + estimate / 10n,
      })
      handledHash.current = undefined
      setSubmittedRecipients(recipients)
      setPreparing(false)
      setPendingHash(hash)
    } catch (error) {
      setLocalError(errorMessage(error))
      releaseAction()
    }
  }

  async function handleWithdraw(kind: 'organizer' | 'platform') {
    if (!beginAction(kind)) return
    try {
      const account = requireWallet()
      if (!contractAddress) throw new Error('合约地址未配置')
      const functionName = kind === 'organizer' ? 'withdrawOrganizer' : 'withdrawPlatform'
      const request = { address: contractAddress, abi, functionName, account } as const
      await publicClient!.simulateContract(request)
      const estimate = await publicClient!.estimateContractGas(request)
      const hash = await write.mutateAsync({
        address: contractAddress, abi, functionName, chainId: monadTestnet.id,
        gas: estimate + estimate / 10n,
      })
      handledHash.current = undefined
      setPreparing(false)
      setPendingHash(hash)
    } catch (error) {
      setLocalError(errorMessage(error))
      releaseAction()
    }
  }

  const waitingForWallet = !pendingHash && (deploy.isPending || write.isPending)
  const transactionState = preparing
    ? '正在准备交易'
    : waitingForWallet
      ? '等待 MetaMask 确认'
    : !pendingHash
    ? '待提交'
    : receipt.isError || receipt.data?.status === 'reverted'
      ? '失败'
      : finalized
        ? '成功（已 finalized）'
        : '链上处理中'

  return (
    <div className="page-shell">
      <header className="topbar">
        <a className="brand" href="./">
          <span className="brand-mark">+</span>
          <span>CoDrop<small>一起买</small></span>
        </a>
        <span className="network"><i /> Monad Testnet <b>测试资产</b></span>
        {connection.status === 'connected' ? (
          <button className="wallet" onClick={() => disconnect.mutate()}>{short(connection.address)} · 断开</button>
        ) : (
          <button className="wallet" disabled={!connectors[0] || connect.isPending} onClick={() => connect.mutate({ connector: connectors[0] })}>
            {connect.isPending ? '连接中…' : '连接 MetaMask'}
          </button>
        )}
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">CO-BUY PASS · TESTNET DEMO</p>
            <h1>一次付款，<br />帮朋友一起买好。</h1>
            <p className="lede">名额够就全部成功，不够就整单不成交。每个地址收到一枚可转让 ERC-721 Pass。</p>
            <div className="hero-tags" aria-label="产品特点">
              <span>一笔交易</span><span>整单原子成交</span><span>链上可验证</span>
            </div>
          </div>
          <div className="pass-visual">
            <img src="./codrop-editorial-hero.png" alt="蓝橙双色印刷的 CoDrop 一起买海报" />
            <span>ISSUE 001 · ONCHAIN</span>
          </div>
        </section>

        {wrongChain && (
          <div className="notice warning">当前钱包网络不正确。<button onClick={() => switchChain.mutate({ chainId: monadTestnet.id })}>切换到 Monad Testnet</button></div>
        )}

        {!contractAddress ? (
          <section className="grid deploy-grid">
            <article className="card">
              <p className="step">已有合约</p>
              <h2>连接测试网部署</h2>
              <form onSubmit={handleUseContract}>
                <label htmlFor="contract">CoDropPass 地址</label>
                <input id="contract" value={contractInput} onChange={(event) => setContractInput(event.target.value)} placeholder="0x…" />
                <button type="submit">读取合约</button>
              </form>
            </article>

            <article className="card accent-card">
              <p className="step">首次部署</p>
              <h2>创建 1000 张测试 Pass</h2>
              <p>测试单价 0.01 MON、平台费 1%。部署会触发一笔 MetaMask 交易。</p>
              <form onSubmit={handleDeploy}>
                <label htmlFor="organizer">主办方地址</label>
                <input id="organizer" value={organizerInput} onChange={(event) => setOrganizerInput(event.target.value)} placeholder="Account 2 · 0x…" />
                <label htmlFor="platform">平台地址</label>
                <input id="platform" value={platformInput} onChange={(event) => setPlatformInput(event.target.value)} placeholder="Account 3 · 0x…" />
                <label htmlFor="metadata">Metadata URL</label>
                <input id="metadata" value={metadataInput} onChange={(event) => setMetadataInput(event.target.value)} />
                <button type="submit" disabled={busy || wrongChain || connection.status !== 'connected'}>
                  {preparing && pendingAction === 'deploy' ? '正在准备交易…' : deploy.isPending ? '等待钱包确认…' : '部署 CoDropPass'}
                </button>
              </form>
            </article>
          </section>
        ) : (
          <>
            <section className="metrics" aria-label="链上数据">
              <div><span>每张价格</span><strong>{typeof price.data === 'bigint' ? `${formatEther(price.data)} MON` : '—'}</strong></div>
              <div><span>剩余名额</span><strong>{typeof remaining.data === 'bigint' ? `${remaining.data} / ${String(maxSupply.data ?? '—')}` : '—'}</strong></div>
              <div><span>已售 Pass</span><strong>{String(sold.data ?? '—')}</strong></div>
              <div><span>我的持有</span><strong>{String(walletPasses.data ?? '—')}</strong></div>
            </section>

            <div className="inventory-line" aria-label="库存进度">
              <span style={{ width: typeof sold.data === 'bigint' && typeof maxSupply.data === 'bigint' ? `${Number(sold.data * 100n / maxSupply.data)}%` : '0%' }} />
            </div>

            <section className="grid">
              <article className="card purchase-card">
                <div className="section-heading">
                  <div><p className="step">一起买</p><h2>这次买给谁？</h2></div>
                  <span className="number-badge">01</span>
                </div>
                {pendingAction === 'buy' && pendingHash && (
                  <div className={`purchase-result ${finalized ? 'confirmed' : receipt.isError || receipt.data?.status === 'reverted' ? 'rejected' : ''}`} role="status">
                    <span>{finalized ? 'PURCHASE CONFIRMED' : receipt.isError || receipt.data?.status === 'reverted' ? 'PURCHASE FAILED' : 'TRANSACTION PENDING'}</span>
                    <strong>{finalized ? '购买成功' : receipt.isError || receipt.data?.status === 'reverted' ? '购买失败' : '链上确认中'}</strong>
                    <p>{finalized ? `已向 ${submittedRecipients.length || parsedPreview.length} 个地址发出 Pass。` : '请等待交易完成，不要重复提交。'}</p>
                    <a href={`${explorer}/tx/${pendingHash}`} target="_blank" rel="noreferrer">查看交易回执 →</a>
                  </div>
                )}
                <form onSubmit={handleBuy}>
                  <label htmlFor="recipients">钱包地址，每行一个</label>
                  <textarea id="recipients" rows={7} value={recipientsInput} onChange={(event) => setRecipientsInput(event.target.value)} placeholder={'0x…\n0x…\n0x…'} />
                  {parsedPreview.length > 0 && (
                    <div className="recipient-preview">
                      {parsedPreview.map((address, index) => <span key={address}>{index + 1}. {short(address)}</span>)}
                    </div>
                  )}
                  <div className="order-total"><span>{parsedPreview.length} 人</span><strong>{formatEther(total)} MON</strong></div>
                  <button type="submit" disabled={!canBuy}>
                    {soldOut
                      ? '本场已售罄'
                      : connection.status !== 'connected'
                        ? '请先连接 MetaMask'
                        : wrongChain
                          ? '请切换到 Monad Testnet'
                          : recipientsInput.trim() && parsedPreview.length === 0
                            ? '地址格式有误'
                            : parsedPreview.length === 0
                              ? '请填写接收地址'
                              : preparing && pendingAction === 'buy'
                                ? '正在准备交易…'
                                : write.isPending && pendingAction === 'buy'
                                  ? '请在 MetaMask 确认'
                              : busy
                                ? '链上处理中…'
                                : '确认名单并购买'}
                  </button>
                  <small>交易成功后不可撤销，请付款前核对完整名单。</small>
                </form>
              </article>

              <article className="card">
                <div className="section-heading">
                  <div><p className="step">链上结算</p><h2>收入分配</h2></div>
                  <span className="number-badge">02</span>
                </div>
                <div className="income-row">
                  <div><span><b>99%</b> 主办方<br />{short(organizer.data as string | undefined)}</span><strong>{typeof organizerPending.data === 'bigint' ? formatEther(organizerPending.data) : '—'} MON</strong></div>
                  {connection.address?.toLowerCase() === String(organizer.data).toLowerCase() && <button disabled={busy || organizerPending.data === 0n} onClick={() => handleWithdraw('organizer')}>提取主办方收入</button>}
                </div>
                <div className="income-row">
                  <div><span><b>1%</b> 平台<br />{short(platform.data as string | undefined)}</span><strong>{typeof platformPending.data === 'bigint' ? formatEther(platformPending.data) : '—'} MON</strong></div>
                  {connection.address?.toLowerCase() === String(platform.data).toLowerCase() && <button disabled={busy || platformPending.data === 0n} onClick={() => handleWithdraw('platform')}>提取平台收入</button>}
                </div>
                <button className="secondary" onClick={() => void refresh()}>刷新链上数据</button>
              </article>
            </section>

            <section className="contract-bar">
              <span>合约 {short(contractAddress)}</span>
              <a href={`${explorer}/address/${contractAddress}`} target="_blank" rel="noreferrer">在 MonadVision 查看</a>
              <button onClick={() => { localStorage.removeItem(storageKey); setContractAddress(undefined) }}>更换合约</button>
            </section>
          </>
        )}

        <section className={`status ${finalized ? 'success' : receipt.isError ? 'failed' : ''}`} aria-live="polite">
          <i /><span>交易状态</span><strong>{transactionState}</strong>
          {pendingHash && <a href={`${explorer}/tx/${pendingHash}`} target="_blank" rel="noreferrer">查看交易 {short(pendingHash)}</a>}
          {(localError || readError) && <p className="error">{localError || `暂时无法确认：${errorMessage(readError)}`}</p>}
        </section>
      </main>
    </div>
  )
}

import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Address, Hex, UserRejectedRequestError, WaitForTransactionReceiptTimeoutError, formatEther, getAddress, isAddress, zeroAddress } from 'viem'
import { WagmiProvider, useAccount, useBytecode, useConnect, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { coDropPassAbi } from './abi'
import { monadTestnet, monadTestnetAddEthereumChainParameter, wagmiConfig } from './chain'
import './style.css'

const queryClient = new QueryClient()
const configuredAddress = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || ''
const contractAddress = isAddress(configuredAddress) ? getAddress(configuredAddress) : undefined
const explorerBase = 'https://testnet.monadvision.com/tx/'

type TxPhase = 'idle' | 'wallet' | 'pending' | 'success' | 'error' | 'unknown'
type TxState = { phase: TxPhase; hash?: Hex; message?: string; recipients?: Address[]; operation?: 'buy' | 'organizer' | 'platform' }
type ReplacementReason = 'cancelled' | 'replaced' | 'repriced'

function formatAmount(value: bigint | undefined, fallback = '—') { return value === undefined ? fallback : `${formatEther(value)} MON` }
function shortAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}` }
function isRejected(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return error instanceof UserRejectedRequestError || /user rejected|rejected the request|denied|cancelled by user/i.test(message)
}
function errorMessage(error: unknown, fallback: string) {
  if (isRejected(error)) return '你已在钱包中拒绝这笔交易'
  if (error instanceof WaitForTransactionReceiptTimeoutError || (error instanceof Error && /timeout/i.test(error.name))) return '等待链上回执超时，交易状态暂时未知，请通过哈希核查，不要重复提交'
  const message = error instanceof Error ? error.message : ''
  if (/insufficient.?inventory|库存/i.test(message)) return '库存已被其他交易占用，请刷新后重新核对名单'
  if (/incorrect.?payment|payment/i.test(message)) return '付款金额与当前单价不一致，交易未发送'
  return message ? `交易未执行：${message.slice(0, 160)}` : fallback
}
function isMissingWallet(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /provider not found|no provider|wallet.*not found|未检测到钱包/i.test(message)
}
function networkActionMessage(error: unknown) {
  if (isRejected(error)) return '你已取消添加或切换 Monad Testnet。'
  if (isMissingWallet(error)) return '未检测到浏览器钱包，请安装并解锁 MetaMask、Rabby 等注入钱包。'
  const message = error instanceof Error ? error.message : ''
  return message ? `无法切换到 Monad Testnet：${message.slice(0, 160)}` : '无法切换到 Monad Testnet，请重试。'
}

function App() {
  const { address, chainId, isConnected } = useAccount()
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching, error: switchError, reset: resetSwitch } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: monadTestnet.id })
  const { writeContractAsync } = useWriteContract()
  const client = useQueryClient()
  const [recipients, setRecipients] = useState([''])
  const [txState, setTxState] = useState<TxState>({ phase: 'idle' })
  const txGeneration = useRef(0)

  const bytecodeRead = useBytecode({ address: contractAddress, chainId: monadTestnet.id, query: { enabled: Boolean(contractAddress), retry: false } })
  const hasContractCode = Boolean(bytecodeRead.data && bytecodeRead.data !== '0x')
  const contractStatus: 'missing' | 'invalid' | 'checking' | 'rpc-error' | 'no-code' | 'ready' = !configuredAddress
    ? 'missing'
    : !contractAddress
      ? 'invalid'
      : bytecodeRead.isPending
        ? 'checking'
        : bytecodeRead.isError
          ? 'rpc-error'
          : hasContractCode
            ? 'ready'
            : 'no-code'
  const readsEnabled = contractStatus === 'ready'
  const baseRead = { address: contractAddress ?? zeroAddress, abi: coDropPassAbi, query: { enabled: readsEnabled } } as const
  const priceRead = useReadContract({ ...baseRead, functionName: 'price' })
  const remainingRead = useReadContract({ ...baseRead, functionName: 'remaining' })
  const soldRead = useReadContract({ ...baseRead, functionName: 'sold' })
  const organizerRead = useReadContract({ ...baseRead, functionName: 'organizer' })
  const platformRead = useReadContract({ ...baseRead, functionName: 'platform' })
  const organizerPendingRead = useReadContract({ ...baseRead, functionName: 'organizerPending' })
  const platformPendingRead = useReadContract({ ...baseRead, functionName: 'platformPending' })
  const balanceRead = useReadContract({ ...baseRead, functionName: 'balanceOf', args: [address ?? zeroAddress], query: { enabled: Boolean(readsEnabled && address) } })

  const price = typeof priceRead.data === 'bigint' ? priceRead.data : undefined
  const remaining = typeof remainingRead.data === 'bigint' ? remainingRead.data : undefined
  const sold = typeof soldRead.data === 'bigint' ? soldRead.data : undefined
  const organizer = organizerRead.data
  const platform = platformRead.data
  const organizerPending = typeof organizerPendingRead.data === 'bigint' ? organizerPendingRead.data : undefined
  const platformPending = typeof platformPendingRead.data === 'bigint' ? platformPendingRead.data : undefined
  const passBalance = typeof balanceRead.data === 'bigint' ? balanceRead.data : undefined
  const rpcError = [priceRead, remainingRead, soldRead, organizerRead, platformRead, organizerPendingRead, platformPendingRead, balanceRead].some((item) => item.isError)
  const readsLoading = readsEnabled && [priceRead, remainingRead, soldRead, organizerRead, platformRead, organizerPendingRead, platformPendingRead, balanceRead].some((item) => item.isPending)

  const normalized = useMemo(() => {
    const values: Address[] = []
    const invalid: string[] = []
    const zero: string[] = []
    for (const raw of recipients.map((item) => item.trim()).filter(Boolean)) {
      if (!isAddress(raw)) invalid.push(raw)
      else if (getAddress(raw) === zeroAddress) zero.push(raw)
      else values.push(getAddress(raw))
    }
    return { values, invalid, zero }
  }, [recipients])
  const duplicate = useMemo(() => {
    const seen = new Set<string>()
    return normalized.values.find((item) => { const key = item.toLowerCase(); if (seen.has(key)) return true; seen.add(key); return false })
  }, [normalized.values])
  const unitPrice = price ?? 0n
  const total = price === undefined ? undefined : unitPrice * BigInt(normalized.values.length)
  const wrongNetwork = isConnected && chainId !== monadTestnet.id
  const walletUnavailable = !connectors.length
  const canBuy = Boolean(contractStatus === 'ready' && isConnected && address && !wrongNetwork && !readsLoading && !rpcError && price !== undefined && remaining !== undefined && normalized.values.length > 0 && normalized.values.length <= 5 && !normalized.invalid.length && !normalized.zero.length && !duplicate && BigInt(normalized.values.length) <= remaining && !['wallet', 'pending'].includes(txState.phase))

  useEffect(() => {
    txGeneration.current += 1
    setTxState({ phase: 'idle' })
  }, [address, chainId])

  useEffect(() => {
    if (chainId === monadTestnet.id) resetSwitch()
  }, [chainId, resetSwitch])

  const refreshData = () => { void client.invalidateQueries() }
  function connectToMonad() {
    const connector = connectors[0]
    if (!connector) return
    resetSwitch()
    // The injected connector adds the chain when the wallet returns 4902.
    connect({ connector, chainId: monadTestnet.id })
  }
  function switchToMonad() {
    resetSwitch()
    switchChain({ chainId: monadTestnet.id, addEthereumChainParameter: monadTestnetAddEthereumChainParameter })
  }
  function addRecipient() { if (recipients.length < 5) setRecipients((current) => [...current, '']) }
  function removeRecipient(index: number) { setRecipients((current) => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index)) }
  async function waitFinalized(hash: Hex) {
    if (!publicClient) throw new Error('Monad RPC 暂时不可用')
    let replacement: ReplacementReason | undefined
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 90_000,
      onReplaced: ({ reason }) => { replacement = reason },
    })
    if (replacement) return { receipt, isFinalized: false, replacement }
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      try {
        const finalized = await publicClient.getBlock({ blockTag: 'finalized' })
        if (finalized.number >= receipt.blockNumber) return { receipt, isFinalized: true }
      } catch {
        return { receipt, isFinalized: false, finalityError: true }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    }
    return { receipt, isFinalized: false, finalityTimedOut: true }
  }
  async function handleBuy() {
    if (!contractAddress || !publicClient || !canBuy || !address || remaining === undefined) return
    const snapshot = [...normalized.values]
    const generation = txGeneration.current
    setTxState({ phase: 'wallet', recipients: snapshot, operation: 'buy', message: '请在钱包中确认一次付款交易' })
    try {
      const value = unitPrice * BigInt(snapshot.length)
      await publicClient.simulateContract({ address: contractAddress, abi: coDropPassAbi, functionName: 'buy', args: [snapshot], value, account: address })
      const hash = await writeContractAsync({ address: contractAddress, abi: coDropPassAbi, functionName: 'buy', args: [snapshot], value })
      if (txGeneration.current !== generation) return
      setTxState({ phase: 'pending', hash, recipients: snapshot, operation: 'buy', message: '交易已提交，正在等待链上确认' })
      const { receipt, isFinalized, replacement, finalityError, finalityTimedOut } = await waitFinalized(hash)
      if (txGeneration.current !== generation) return
      if (replacement === 'cancelled') setTxState({ phase: 'error', hash, recipients: snapshot, operation: 'buy', message: '交易已取消，未产生发证' })
      else if (replacement) setTxState({ phase: 'unknown', hash, recipients: snapshot, operation: 'buy', message: '交易已被替换，请通过交易链接核查替代交易' })
      else if (finalityError) setTxState({ phase: 'unknown', hash, recipients: snapshot, operation: 'buy', message: '已收到回执，但 finalized 查询失败，请通过交易链接核查' })
      else if (finalityTimedOut || !isFinalized) setTxState({ phase: 'unknown', hash, recipients: snapshot, operation: 'buy', message: '已收到回执，但等待 finalized 超时，请通过交易链接核查' })
      else if (receipt.status === 'success') { setTxState({ phase: 'success', hash, recipients: snapshot, operation: 'buy', message: '购买成功，Pass 已发放给名单地址' }); refreshData() }
      else setTxState({ phase: 'error', hash, recipients: snapshot, operation: 'buy', message: '交易执行失败，未产生部分发证' })
    } catch (error) {
      if (txGeneration.current !== generation) return
      const replacement = (error as { replacement?: { reason?: ReplacementReason } }).replacement?.reason
      const message = replacement === 'cancelled' ? '交易已取消，未产生发证' : replacement ? '交易已被替换，请通过交易链接核查替代交易' : errorMessage(error, '钱包拒绝或交易失败')
      setTxState({ phase: message.includes('暂时未知') ? 'unknown' : 'error', recipients: snapshot, operation: 'buy', message })
    }
  }
  async function handleWithdraw(kind: 'organizer' | 'platform') {
    if (!contractAddress || !publicClient || contractStatus !== 'ready' || wrongNetwork || txState.phase === 'wallet' || txState.phase === 'pending') return
    const generation = txGeneration.current
    setTxState({ phase: 'wallet', operation: kind, message: '请在钱包中确认一次提款交易' })
    try {
      const hash = await writeContractAsync({ address: contractAddress, abi: coDropPassAbi, functionName: kind === 'organizer' ? 'withdrawOrganizer' : 'withdrawPlatform' })
      if (txGeneration.current !== generation) return
      setTxState({ phase: 'pending', hash, operation: kind, message: '提款交易已提交，等待 finalized' })
      const { receipt, isFinalized, replacement, finalityError, finalityTimedOut } = await waitFinalized(hash)
      if (txGeneration.current !== generation) return
      if (replacement === 'cancelled') { setTxState({ phase: 'error', hash, operation: kind, message: '提款交易已取消，待提款余额仍保留' }); return }
      if (replacement) { setTxState({ phase: 'unknown', hash, operation: kind, message: '提款交易已被替换，请通过交易链接核查替代交易' }); return }
      if (finalityError) { setTxState({ phase: 'unknown', hash, operation: kind, message: '已收到回执，但 finalized 查询失败，请通过交易链接核查' }); return }
      if (finalityTimedOut || !isFinalized) { setTxState({ phase: 'unknown', hash, operation: kind, message: '已收到回执，但等待 finalized 超时，请通过交易链接核查' }); return }
      if (receipt.status !== 'success') { setTxState({ phase: 'error', hash, operation: kind, message: '提款交易失败，余额仍保留在合约中' }); return }
      setTxState({ phase: 'success', hash, operation: kind, message: '提款成功，待提款余额已刷新' }); refreshData()
    } catch (error) {
      if (txGeneration.current !== generation) return
      const replacement = (error as { replacement?: { reason?: ReplacementReason } }).replacement?.reason
      const message = replacement === 'cancelled' ? '提款交易已取消，待提款余额仍保留' : replacement ? '提款交易已被替换，请通过交易链接核查替代交易' : errorMessage(error, '提款失败，待提款余额仍保留')
      setTxState({ phase: message.includes('暂时未知') ? 'unknown' : 'error', operation: kind, message })
    }
  }
  const validationMessage = normalized.invalid.length ? `地址格式无效：${normalized.invalid[0]}` : normalized.zero.length ? `地址不能是零地址：${normalized.zero[0]}` : duplicate ? `同一订单内地址重复：${shortAddress(duplicate)}` : remaining !== undefined && BigInt(normalized.values.length) > remaining ? `当前仅剩 ${remaining.toString()} 张 Pass` : normalized.values.length > 5 ? '单笔最多购买 5 张 Pass' : ''
  const organizerViewer = Boolean(address && organizer && address.toLowerCase() === String(organizer).toLowerCase())
  const platformViewer = Boolean(address && platform && address.toLowerCase() === String(platform).toLowerCase())
  const contractAlert = {
    missing: '尚未配置合约地址。页面可以浏览，链上读取、购买和提款均已禁用。',
    invalid: 'VITE_CONTRACT_ADDRESS 不是有效的 EVM 地址。请修正配置后重启页面。',
    checking: '正在确认合约地址是否存在代码，确认前不会启用购买或提款。',
    'rpc-error': '读取合约代码失败，无法确认目标地址。购买和提款已禁用，请检查 Monad RPC 后重试。',
    'no-code': '配置地址没有可执行合约代码。请检查网络和部署地址。',
    ready: '',
  }[contractStatus]
  const priceLabel = contractStatus !== 'ready' ? '—' : priceRead.isPending ? '读取中' : priceRead.isError ? '暂时无法确认' : formatAmount(price, '—')
  const inventoryLabel = contractStatus !== 'ready' ? '—' : remainingRead.isPending ? '读取中' : remainingRead.isError ? '暂时无法确认' : remaining === undefined ? '—' : `${remaining.toString()} / 5 remaining`
  const passBalanceLabel = contractStatus !== 'ready' ? '—' : !isConnected ? '连接钱包后显示' : balanceRead.isPending ? '读取中' : balanceRead.isError ? '暂时无法确认' : `${(passBalance ?? 0n).toString()} Pass`
  const payoutBusy = txState.phase === 'wallet' || txState.phase === 'pending'

  return <div className="checkout-page">
    <header className="checkout-header"><a className="wordmark" href="#top" aria-label="CoDrop 首页"><span className="wordmark-dot" />CoDrop</a><div className="header-actions"><span className="network-label"><span className="network-dot" />Monad Testnet</span>{isConnected ? <button className="header-wallet connected" onClick={() => disconnect()}>{shortAddress(address!)} <span aria-hidden="true">×</span></button> : <button className="header-wallet" onClick={connectToMonad} disabled={isConnecting || walletUnavailable}>{isConnecting ? '连接中…' : walletUnavailable ? '未检测到钱包' : connectError ? '重试连接' : '连接钱包'}</button>}</div></header>
    <main id="top" className="checkout-main">
      <section className="product-card"><h1>Neon Commons: First Light</h1><p className="product-description">一场面向创作者与朋友的限量现场，Pass 在购买成功时直接发放到名单地址。</p><div className="product-image"><img src="/pass.svg" alt="Neon Commons First Light Pass" /></div><div className="price-row"><span>Price</span><strong>{priceLabel}</strong></div></section>
      <section className="environment-card"><div className="environment-heading"><span className="card-icon">▱</span><strong>Monad Testnet</strong></div><p>这是测试环境，不会收取真实资金。购买使用测试 MON，成功后 Pass 会直接发放到下方地址。</p><div className="environment-rows"><div><span>Network</span><strong>Chain ID 10143</strong></div><div><span>Inventory</span><strong>{inventoryLabel}</strong></div><div><span>Contract</span><strong>{contractAddress ? shortAddress(contractAddress) : 'Not configured'}</strong></div><div><span>Your Passes</span><strong>{passBalanceLabel}</strong></div></div></section>
      {contractStatus !== 'ready' && <div className="inline-alert config-alert" role="alert"><strong>合约配置</strong><span>{contractAlert}</span><button onClick={refreshData} disabled={contractStatus === 'checking'}>{contractStatus === 'checking' ? '检查中' : '重试'}</button></div>}
      {rpcError && contractAddress && <div className="inline-alert" role="alert"><strong>暂时无法确认</strong><span>Monad RPC 查询失败，页面没有把未知状态解释成零库存或零余额。</span><button onClick={refreshData}>重试</button></div>}
      {connectError && <div className="inline-alert" role="alert"><strong>钱包连接失败</strong><span>{isMissingWallet(connectError) ? '未检测到浏览器钱包，请安装并解锁 MetaMask、Rabby 等注入钱包。' : isRejected(connectError) ? '你已取消钱包连接或 Monad Testnet 网络设置。' : '无法连接浏览器钱包，请确认扩展已安装并解锁。'}</span><button onClick={connectToMonad} disabled={isConnecting || walletUnavailable}>{isConnecting ? '连接中…' : '重试'}</button></div>}
      {wrongNetwork && <div className="inline-alert" role="alert"><strong>{switchError ? '网络设置失败' : '请切换网络'}</strong><span>{switchError ? networkActionMessage(switchError) : '当前钱包不在 Monad Testnet。首次切换时钱包会请求添加该网络。'}</span><button onClick={switchToMonad} disabled={isSwitching}>{isSwitching ? '设置中…' : switchError ? '重试' : '添加并切换'}</button></div>}
      <section className="checkout-card"><div className="checkout-card-header"><div><span className="overline">Recipients</span><h2>谁会收到 Pass？</h2></div><span className="count">{normalized.values.length} / 5</span></div><p className="helper-text">每行填写一个钱包地址。接收者不需要连接钱包。</p><div className="recipient-list">{recipients.map((value, index) => <div className="recipient-row" key={index}><span className="recipient-index">{index + 1}</span><label className="sr-only" htmlFor={`recipient-${index}`}>接收地址 {index + 1}</label><input id={`recipient-${index}`} value={value} onChange={(event) => setRecipients((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="0x…" spellCheck={false} autoComplete="off"/><button className="remove-button" onClick={() => removeRecipient(index)} aria-label={`移除接收地址 ${index + 1}`}>×</button></div>)}</div><button className="add-recipient" onClick={addRecipient} disabled={recipients.length >= 5}>＋ 添加地址</button>{validationMessage && <p className="field-error" role="alert">{validationMessage}</p>}<div className="total-row"><span>Total</span><strong>{formatAmount(total, price === undefined ? '读取中' : '0 MON')}</strong></div><p className="confirm-copy">提交前请核对地址。链上交易成功后不支持改址、撤销或退款。</p><button className="pay-button" onClick={handleBuy} disabled={!canBuy}>{txState.phase === 'wallet' ? '等待钱包确认…' : txState.phase === 'pending' ? '链上处理中…' : !isConnected ? '连接钱包后继续' : contractStatus !== 'ready' ? '等待合约配置' : price === undefined || remaining === undefined ? '读取链上价格' : '确认购买'}<span aria-hidden="true">→</span></button>{txState.phase !== 'idle' && <TxStatus state={txState} />}</section>
      <section className="payout-card"><div className="checkout-card-header"><div><span className="overline">Payouts</span><h2>待提款</h2></div><span className="lock-label">仅收款地址</span></div><PayoutRow label="主办方" amount={organizerPending} isViewer={organizerViewer} loading={readsEnabled && organizerPendingRead.isPending} error={readsEnabled && organizerPendingRead.isError} disabled={contractStatus !== 'ready' || wrongNetwork || payoutBusy} onWithdraw={() => handleWithdraw('organizer')} /><PayoutRow label="平台" amount={platformPending} isViewer={platformViewer} loading={readsEnabled && platformPendingRead.isPending} error={readsEnabled && platformPendingRead.isError} disabled={contractStatus !== 'ready' || wrongNetwork || payoutBusy} onWithdraw={() => handleWithdraw('platform')} /><p className="payout-note">成交金额按 99% / 1% 分别记账。网络费由发起交易的钱包承担。</p></section>
      <footer className="checkout-footer"><span>CoDrop / POC v0.1</span><span>{sold === undefined ? 'On Monad Testnet' : `${sold.toString()} sold`}</span>{contractAddress && <a href={`https://testnet.monadvision.com/address/${contractAddress}`} target="_blank" rel="noreferrer">查看合约 ↗</a>}</footer>
    </main>
  </div>
}

function PayoutRow({ label, amount, isViewer, loading, error, disabled, onWithdraw }: { label: string; amount: bigint | undefined; isViewer: boolean; loading: boolean; error: boolean; disabled: boolean; onWithdraw: () => void }) {
  const amountLabel = loading ? '读取中' : error ? '暂时无法确认' : formatAmount(amount)
  const accessLabel = loading || error ? '' : isViewer ? (amount === 0n ? '暂无余额' : '') : '无权限'
  return <div className="payout-row"><div><span>{label}</span><strong>{amountLabel}</strong></div>{isViewer ? <button className="payout-button" onClick={onWithdraw} disabled={disabled || loading || error || amount === undefined || amount === 0n}>提款</button> : <small>{accessLabel}</small>}</div>
}
function TxStatus({ state }: { state: TxState }) {
  const title = { wallet: '等待钱包确认', pending: '链上处理中', success: state.operation === 'buy' ? '购买已完成' : '提款已完成', error: '交易失败', unknown: '暂时无法确认', idle: '' }[state.phase]
  return <div className={`tx-status ${state.phase}`} role="status"><span className="tx-mark">{state.phase === 'success' ? '✓' : state.phase === 'error' ? '!' : '?'}</span><div><strong>{title}</strong><p>{state.message}</p>{state.recipients && state.recipients.length > 0 && <div className="tx-recipients"><span>本笔接收地址</span>{state.recipients.map((recipient) => <code key={recipient}>{recipient}</code>)}</div>}{state.hash && <a href={`${explorerBase}${state.hash}`} target="_blank" rel="noreferrer">查看交易 {shortAddress(state.hash)} ↗</a>}</div></div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}><App /></QueryClientProvider></WagmiProvider></StrictMode>)

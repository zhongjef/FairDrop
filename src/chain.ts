import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
  testnet: true,
})

// Used when an injected wallet has not seen Monad Testnet yet.
export const monadTestnetAddEthereumChainParameter = {
  chainName: monadTestnet.name,
  nativeCurrency: monadTestnet.nativeCurrency,
  rpcUrls: monadTestnet.rpcUrls.default.http,
  blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
}

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [monadTestnet.id]: http(import.meta.env.VITE_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz') },
})

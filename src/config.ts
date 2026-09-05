import { createConfig, http, injected } from 'wagmi'
import { monadTestnet } from 'wagmi/chains'

export const config = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(import.meta.env.VITE_MONAD_RPC_URL || monadTestnet.rpcUrls.default.http[0]),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

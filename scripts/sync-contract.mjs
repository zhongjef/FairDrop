import { mkdir, readFile, writeFile } from 'node:fs/promises'

const artifactPath = new URL('../contracts/out/CoDropPass.sol/CoDropPass.json', import.meta.url)
const outputPath = new URL('../src/generated/CoDropPass.json', import.meta.url)
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'))
const bytecode = artifact.bytecode?.object

if (!Array.isArray(artifact.abi) || typeof bytecode !== 'string' || !bytecode.startsWith('0x')) {
  throw new Error('CoDropPass artifact is missing ABI or creation bytecode')
}

await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true })
await writeFile(outputPath, `${JSON.stringify({ abi: artifact.abi, bytecode }, null, 2)}\n`)
console.log('Synced CoDropPass ABI and bytecode')

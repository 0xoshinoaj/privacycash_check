/**
 * 批量檢查 Privacy Cash 裡尚未提出的私人餘額。
 *
 * 金鑰一行一把，放在 keys/solana.txt、keys/evm.txt。
 * 必須是私鑰。解密在本機完成，不會提款。
 *
 *   npm run check
 *   npm run check -- --chain solana
 *   npm run check -- --chain evm
 *
 * 結束碼：0 沒有未提出餘額，2 有未提出餘額，1 設定或查詢失敗。
 */

import { existsSync, readFileSync } from 'node:fs'
import { PrivacyCash } from 'privacycash'
import { tokens } from 'privacycash/utils'
import {
  BASE_NETWORK,
  BNB_NETWORK,
  ETH_NETWORK,
  ROBINHOOD_NETWORK,
  getBalance,
  setLogger as setEvmLogger,
} from 'privacycash-evm'
import { Wallet } from 'ethers'

const SIGN_MESSAGE = 'Privacy Money account sign in'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let lineOpen = false

const EVM_POOLS = [
  { label: 'Base', network: BASE_NETWORK, tokens: ['eth', 'usdc'] },
  { label: 'ETH', network: ETH_NETWORK, tokens: ['eth', 'usdt'] },
  { label: 'BSC', network: BNB_NETWORK, tokens: ['bnb', 'usdt'] },
  { label: 'Robinhood', network: ROBINHOOD_NETWORK, tokens: ['eth', 'usdg'] },
]

loadEnvFile('.env')
setEvmLogger(() => {})

const args = parseArgs(process.argv.slice(2))
const solanaKeys = loadKeys(args.solanaFile, process.env.SOLANA_PRIVATE_KEY)
const evmKeys = loadKeys(args.evmFile, process.env.EVM_PRIVATE_KEY)
const wantSolana = args.chain === 'all' || args.chain === 'solana'
const wantEvm = args.chain === 'all' || args.chain === 'evm'

if (wantSolana && solanaKeys.length === 0 && wantEvm && evmKeys.length === 0) {
  console.error('請把金鑰一行一把放進 keys/solana.txt 或 keys/evm.txt。')
  console.error('不要把私鑰貼到聊天視窗。')
  process.exit(1)
}
if (args.chain === 'solana' && solanaKeys.length === 0) {
  console.error('沒有 Solana 金鑰。請寫入 keys/solana.txt，一行一把。')
  process.exit(1)
}
if (args.chain === 'evm' && evmKeys.length === 0) {
  console.error('沒有 EVM 金鑰。請寫入 keys/evm.txt，一行一把。')
  process.exit(1)
}

let anyBalance = false
let anyError = false

if (wantSolana && solanaKeys.length > 0) {
  const result = await checkSolanaKeys(solanaKeys)
  anyBalance ||= result.anyBalance
  anyError ||= result.anyError
}
if (wantEvm && evmKeys.length > 0) {
  const result = await checkEvmKeys(evmKeys)
  anyBalance ||= result.anyBalance
  anyError ||= result.anyError
}

endSection()
if (anyError && !anyBalance) process.exit(1)
process.exit(anyBalance ? 2 : 0)

async function checkSolanaKeys(rawKeys) {
  const total = rawKeys.length
  const rpc = process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com'
  let anyBalance = false
  let anyError = false

  const tokenTotal = tokens.length
  for (let index = 0; index < total; index++) {
    const wallet = `${index + 1}/${total}`
    progress(`現在SOL 錢包 ${wallet} 檢查代幣 1/${tokenTotal}`)

    let client
    try {
      client = new PrivacyCash({
        RPC_url: rpc,
        owner: resolveSolanaSecret(rawKeys[index]),
        enableDebug: true,
      })
      client.setLogger(() => {})
    } catch {
      sticky(`現在SOL 錢包 ${wallet}  金鑰格式不正確`)
      anyError = true
      continue
    }

    const address = shortAddress(client.publicKey.toBase58())
    for (let tokenIndex = 0; tokenIndex < tokenTotal; tokenIndex++) {
      const token = tokens[tokenIndex]
      const point = `現在SOL 錢包 ${wallet} 檢查代幣 ${tokenIndex + 1}/${tokenTotal}`
      progress(point)
      try {
        const found = await silence(() => readSolanaToken(client, token))
        if (!isZeroAmount(found.amount)) {
          hit(`SOL 錢包 ${wallet}  代幣 ${tokenIndex + 1}/${tokenTotal}  ${address}  ${found.amount} ${found.asset}`)
          anyBalance = true
        }
      } catch {
        sticky(`${point}  ${address}  ${displayToken(token.name)} 查詢失敗`)
        anyError = true
      }
    }
  }

  return { anyBalance, anyError }
}

async function checkEvmKeys(rawKeys) {
  const total = rawKeys.length
  let anyBalance = false
  let anyError = false

  for (let index = 0; index < total; index++) {
    const mark = `${index + 1}/${total}`
    let wallet
    try {
      wallet = new Wallet(normalizeEvmKey(rawKeys[index]))
    } catch {
      progress(`現在EVM 錢包 ${mark}`)
      sticky(`現在EVM 錢包 ${mark}  金鑰格式不正確`)
      anyError = true
      continue
    }

    const address = shortAddress(wallet.address)
    let signature
    try {
      signature = await wallet.signMessage(SIGN_MESSAGE)
    } catch {
      progress(`現在EVM 錢包 ${mark}`)
      sticky(`現在EVM 錢包 ${mark}  ${address}  查詢失敗`)
      anyError = true
      continue
    }

    for (const pool of EVM_POOLS) {
      const tokenTotal = pool.tokens.length
      for (let tokenIndex = 0; tokenIndex < tokenTotal; tokenIndex++) {
        const token = pool.tokens[tokenIndex]
        const step = `${tokenIndex + 1}/${tokenTotal}`
        const point = `現在EVM 錢包 ${mark} 檢查 ${pool.label} ${step}`
        progress(point)
        try {
          const found = await silence(() => readEvmToken({
            signature,
            address: wallet.address,
            token,
            network: pool.network,
          }))
          if (!isZeroAmount(found.amount)) {
            hit(`EVM 錢包 ${mark}  ${pool.label} ${step}  ${address}  ${found.amount} ${found.asset}`)
            anyBalance = true
          }
        } catch {
          sticky(`${point}  ${address}  ${token.toUpperCase()} 查詢失敗`)
          anyError = true
        }
      }
    }
  }

  return { anyBalance, anyError }
}

async function readSolanaToken(client, token) {
  if (token.name === 'sol') {
    const balance = await client.getPrivateBalance()
    return { asset: 'SOL', amount: fromBaseUnits(balance.lamports, 9) }
  }
  const balance = await client.getPrivateBalanceSpl(token.pubkey)
  const decimals = Math.round(Math.log10(token.units_per_token))
  return { asset: displayToken(token.name), amount: fromBaseUnits(balance.base_units, decimals) }
}

async function readEvmToken({ signature, address, token, network }) {
  const { balance } = await getBalance({ signature, address, token, network })
  return { asset: token.toUpperCase(), amount: trimDecimal(balance) }
}

function loadKeys(filePath, envValue) {
  const fromFile = filePath && existsSync(filePath) ? readKeyLines(filePath) : []
  const fromEnv = envKeyEntries(envValue ?? '')
  const merged = []
  const seen = new Set()
  for (const key of [...fromFile, ...fromEnv]) {
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(key)
  }
  return merged
}

function readKeyLines(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function envKeyEntries(value) {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[') || existsSync(trimmed)) return [trimmed]
  if (trimmed.includes(',')) return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
  return [trimmed]
}

function parseArgs(argv) {
  let chain = 'all'
  let solanaFile = process.env.SOLANA_KEYS_FILE?.trim() || 'keys/solana.txt'
  let evmFile = process.env.EVM_KEYS_FILE?.trim() || 'keys/evm.txt'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--chain') {
      chain = argv[++i]
      if (chain !== 'solana' && chain !== 'evm' && chain !== 'all') {
        console.error('--chain 只能是 solana、evm 或 all')
        process.exit(1)
      }
    } else if (arg === '--solana') {
      solanaFile = argv[++i]
    } else if (arg === '--evm') {
      evmFile = argv[++i]
    } else {
      console.error(`未知參數 ${arg}`)
      process.exit(1)
    }
  }
  return { chain, solanaFile, evmFile }
}

function progress(text) {
  process.stdout.write(`\r\x1b[K${text}`)
  lineOpen = true
}

function sticky(text) {
  process.stdout.write(`\r\x1b[K${text}\n`)
  lineOpen = false
}

function hit(text) {
  process.stdout.write(`\r\x1b[K${YELLOW}${text}${RESET}\n`)
  lineOpen = false
}

function endSection() {
  if (lineOpen) {
    process.stdout.write('\n')
    lineOpen = false
  }
}

function displayToken(name) {
  if (name === 'legacyStore') return 'STORE(舊)'
  if (name === 'store') return 'STORE'
  if (name === 'jlusdc') return 'jlUSDC'
  if (name === 'jlwsol') return 'jlWSOL'
  return name.toUpperCase()
}

function resolveSolanaSecret(raw) {
  if (raw.startsWith('[') || existsSync(raw)) {
    const text = raw.startsWith('[') ? raw : readFileSync(raw, 'utf8')
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed) || parsed.some((n) => !Number.isInteger(n))) {
      throw new Error('Solana 金鑰檔必須是整數陣列')
    }
    return parsed
  }
  return raw
}

function normalizeEvmKey(raw) {
  const key = raw.startsWith('0x') ? raw : `0x${raw}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('EVM 金鑰必須是 32-byte hex')
  }
  return key
}

function fromBaseUnits(amount, decimals) {
  const negative = Number(amount) < 0
  const digits = String(Math.trunc(Math.abs(Number(amount))))
  const padded = digits.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals)
  const fraction = padded.slice(-decimals).replace(/0+$/, '')
  const text = fraction ? `${whole}.${fraction}` : whole
  return negative ? `-${text}` : text
}

function trimDecimal(value) {
  const text = String(value)
  if (!text.includes('.')) return text
  return text.replace(/\.?0+$/, '')
}

function isZeroAmount(value) {
  return /^0*(?:\.0*)?$/.test(String(value))
}

function shortAddress(address) {
  if (address.length <= 12) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

async function silence(fn) {
  const previous = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  }
  console.log = () => {}
  console.error = () => {}
  console.warn = () => {}
  console.info = () => {}
  try {
    return await fn()
  } finally {
    console.log = previous.log
    console.error = previous.error
    console.warn = previous.warn
    console.info = previous.info
  }
}

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

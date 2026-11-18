/**
 * 臨時功能：從 keys/evm.txt 只導出錢包地址，不查餘額。
 *
 *   npm run export-evm
 *   npm run export-evm -- --evm keys/evm.txt
 *
 * 標準輸出一行一個 checksum 地址。格式錯誤寫到 stderr。
 */

import { existsSync, readFileSync } from 'node:fs'
import { Wallet } from 'ethers'

const args = parseArgs(process.argv.slice(2))
const filePath = args.evmFile

if (!existsSync(filePath)) {
  console.error(`找不到 ${filePath}`)
  process.exit(1)
}

const keys = readKeyLines(filePath)
if (keys.length === 0) {
  console.error(`${filePath} 沒有金鑰。`)
  process.exit(1)
}

let failed = 0
for (let index = 0; index < keys.length; index++) {
  try {
    const wallet = new Wallet(normalizeEvmKey(keys[index]))
    console.log(wallet.address)
  } catch {
    console.error(`第 ${index + 1} 把金鑰格式不正確`)
    failed += 1
  }
}

if (failed > 0) process.exit(1)

function parseArgs(argv) {
  let evmFile = 'keys/evm.txt'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--evm') {
      evmFile = argv[++i]
    } else {
      console.error(`未知參數 ${arg}`)
      process.exit(1)
    }
  }
  return { evmFile }
}

function readKeyLines(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function normalizeEvmKey(raw) {
  const key = raw.startsWith('0x') ? raw : `0x${raw}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('EVM 金鑰必須是 32-byte hex')
  }
  return key
}

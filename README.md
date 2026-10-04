# Privacy Cash 未提出餘額檢查

本機批次檢查 [Privacy Cash](https://www.privacycash.org/) 裡已存入、尚未提出的私人餘額。程式只讀餘額，不會發起提款。解密在本機完成。

需要 **私鑰**。公開地址簽不出加密金鑰，放進金鑰檔會被當成格式錯誤。

## 準備

需要 Node.js 20 或以上。

```bash
npm install
cp .env.example .env
cp keys/solana.txt.example keys/solana.txt
cp keys/evm.txt.example keys/evm.txt
```

`keys/solana.txt`、`keys/evm.txt` 一行一把私鑰。`#` 開頭和空白行會略過。

| 檔案 | 格式 |
| --- | --- |
| `keys/solana.txt` | Phantom 匯出的 base58，或單行 JSON 陣列 |
| `keys/evm.txt` | `0x` 開頭的 32-byte hex |

`.env` 只放 Solana RPC。公開 RPC 容易被限流，有自己的 mainnet RPC 時再改 `SOLANA_RPC_URL`。

## 執行

```bash
npm run check
npm run check -- --chain solana
npm run check -- --chain evm
```

餘額是 0 的檢查點會被下一行蓋掉。找到餘額時，該行用黃色留下。

```text
現在SOL 錢包 1/59 檢查代幣 2/9
SOL 錢包 1/59  代幣 2/9  FrnY…p63q  31.083451 USDC

現在EVM 錢包 4/86 檢查 Base 2/2
EVM 錢包 4/86  Base 2/2  0x71c…a91  10 USDC
```

Solana 依序檢查 9 種：SOL、USDC、USDT、ZEC、ORE、STORE、STORE(舊)、jlUSDC、jlWSOL。

EVM 每個錢包會掃四條鏈，每條鏈 2 個代幣：

| 檢查點 | 代幣 |
| --- | --- |
| Base 1/2、2/2 | ETH、USDC |
| ETH 1/2、2/2 | ETH、USDT |
| BSC 1/2、2/2 | BNB、USDT |
| Robinhood 1/2、2/2 | ETH、USDG |

結束碼：`0` 沒有未提出餘額，`2` 有未提出餘額，`1` 設定或查詢失敗。查詢失敗的那一行不能當成餘額是 0。

## 不要提交這些檔案

這個倉庫是公開的。下列內容已在 `.gitignore`，請維持在本機：

- `.env`
- `keys/solana.txt`、`keys/evm.txt`
- `cache/`
- `node_modules/`

# Wallet send corridors

Run corridor probe after setting env:

```bash
cd business && node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-corridors.ts
```

## v1 waves

| Wave | Corridors | Default enabled |
|------|-----------|-----------------|
| W1 | USDC/Sol, EURC/Sol | yes (Turnkey direct) |
| W2 | USDT/Tron, USDC/Base, USDC/Eth | via `WALLET_SEND_ENABLED_CORRIDORS` |
| W3 | Remaining v1 pairs | probe-gated |

Override enabled pairs:

```bash
WALLET_SEND_ENABLED_CORRIDORS=USDC:Solana,EURC:Solana,USDT:Tron
```

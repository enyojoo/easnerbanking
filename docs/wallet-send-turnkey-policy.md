# Turnkey policy — LI.FI wallet send

Wallet sends that route through LI.FI require Turnkey to sign arbitrary Solana transactions produced by LI.FI `/quote`.

## v1 approach

- Source funds: user/org Solana vault (USDC or EURC)
- Signing: `solSendTransaction` with LI.FI `transactionRequest.data`
- Gas: Turnkey sponsorship when `TURNKEY_SOL_SPONSORSHIP_ENABLED=true`

## Policy allowlist (recommended)

Configure Turnkey policy rules to allow:

1. **Program IDs** used by LI.FI routes for enabled corridors (Jupiter, LI.FI router, token programs)
2. **Token mints** from v1 catalog (`business/lib/lifi/token-map.ts`)
3. **Destination addresses** — unbounded external wallets (recipient addresses vary)

Because recipient addresses are user-supplied, v1 relies on:

- Server-side corridor allowlist (`business/lib/wallet-send/corridors.ts`)
- Quote session binding (`formSessionId` + recipient + amounts)
- Execute-time re-quote with floor check (see `lifi-execute.ts`)

## Env

```bash
WALLET_SEND_ENABLED=true
WALLET_SEND_ENABLED_CORRIDORS=USDC:Solana,EURC:Solana,USDT:Tron,USDC:Base,USDC:Ethereum
LIFI_API_KEY=
LIFI_INTEGRATOR=easner
```

## Reconcile

Run periodically for pending LI.FI sends:

```bash
cd business && node --env-file=.env.local --import tsx scripts/reconcile-pending-wallet-sends.ts
```

See also [wallet-send-corridors.md](./wallet-send-corridors.md).

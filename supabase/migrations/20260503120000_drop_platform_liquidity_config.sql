-- Pool config is env-only (PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_USD / _EUR). Drop legacy table if a prior migration created it.

drop table if exists public.platform_liquidity_config;

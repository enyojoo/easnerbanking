-- Remove stablecoin/crypto rows mistakenly synced from YC /rates (CUSD, ETH, SOL, etc.).
-- Safe to re-run; keeps fiat↔USD/USDC legs and fiat cross pairs.

delete from public.yellowcard_rates
where lower(source) <> 'office'
  and (
    upper(from_currency) in (
      'CUSD', 'USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'TRX', 'PYUSD', 'EURC',
      'XAUT', 'DOGE', 'MATIC', 'AVAX', 'CELO', 'CUSDCELO'
    )
    or upper(to_currency) in (
      'CUSD', 'USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'TRX', 'PYUSD', 'EURC',
      'XAUT', 'DOGE', 'MATIC', 'AVAX', 'CELO', 'CUSDCELO'
    )
    or length(trim(from_currency)) <> 3 and upper(from_currency) not in ('USDC')
    or length(trim(to_currency)) <> 3 and upper(to_currency) not in ('USDC')
  );

-- Prune non-canonical yellowcard_rates rows.
-- Safe to re-run. Keeps: USD→fiat, fiat→USDC, fiat→fiat. Preserves source='office'.
--
-- Removes:
--   USDC → * (misleading pay-in math as payout)
--   crypto / stablecoin codes from YC /rates
--   non-3-letter codes (except USDC as to_currency on pay-in legs — those stay)

delete from public.yellowcard_rates
where lower(source) <> 'office'
  and (
    -- Never keep USDC as from_currency
    upper(from_currency) = 'USDC'
    or upper(from_currency) in (
      'CUSD', 'USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'TRX', 'PYUSD', 'EURC',
      'XAUT', 'DOGE', 'MATIC', 'AVAX', 'CELO', 'CUSDCELO',
      'ADA', 'XRP', 'XLM', 'LTC', 'LINK', 'DOT', 'ATOM', 'UNI', 'AAVE',
      'SHIB', 'PEPE', 'TON', 'SUI', 'APT', 'ARB', 'OP', 'WBTC', 'WETH'
    )
    or upper(to_currency) in (
      'CUSD', 'USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'TRX', 'PYUSD', 'EURC',
      'XAUT', 'DOGE', 'MATIC', 'AVAX', 'CELO', 'CUSDCELO',
      'ADA', 'XRP', 'XLM', 'LTC', 'LINK', 'DOT', 'ATOM', 'UNI', 'AAVE',
      'SHIB', 'PEPE', 'TON', 'SUI', 'APT', 'ARB', 'OP', 'WBTC', 'WETH'
    )
    -- Malformed codes (USDC only valid as to_currency)
    or (length(trim(from_currency)) <> 3 and upper(from_currency) <> 'USD')
    or (length(trim(to_currency)) <> 3 and upper(to_currency) <> 'USDC')
  );

-- Failed Grid balance payouts sweep stranded USDC from Grid internal → owner Turnkey vault.

alter table public.grid_transfers
  drop constraint if exists grid_transfers_mode_check;

alter table public.grid_transfers
  add constraint grid_transfers_mode_check
  check (
    mode in (
      'fund_balance',
      'balance_payout',
      'cross_border_send',
      'stripe_settlement',
      'va_turnkey_sweep',
      'payout_refund_turnkey_sweep'
    )
  );

comment on table public.grid_transfers is
  'Grid product orchestration: fund_balance, balance_payout, cross_border_send, stripe_settlement, va_turnkey_sweep, payout_refund_turnkey_sweep.';

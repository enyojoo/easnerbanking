-- SPL associated token account (USDC/EURC) for deposit + indexing; address column remains Turnkey owner.
alter table public.wallet_accounts
  add column if not exists associated_token_account_address text;

comment on column public.wallet_accounts.associated_token_account_address is
  'SPL token account (ATA) for this owner+asset; address column remains Solana owner pubkey.';

create index if not exists wallet_accounts_ata_active_idx
  on public.wallet_accounts (associated_token_account_address)
  where status = 'active' and associated_token_account_address is not null;

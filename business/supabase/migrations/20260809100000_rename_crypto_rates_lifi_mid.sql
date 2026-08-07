-- Rename legacy LI.FI column to Relay bridge mid rate.
ALTER TABLE crypto_rates
  RENAME COLUMN lifi_mid TO bridge_mid;

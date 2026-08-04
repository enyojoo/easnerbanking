-- Retire legacy invoice statuses (quote, uncollectible, failed, credit_note).
UPDATE invoices SET status = 'draft' WHERE status = 'quote';
UPDATE invoices SET status = 'past_due' WHERE status = 'uncollectible';
UPDATE invoices SET status = 'void' WHERE status IN ('failed', 'credit_note');

-- Rename Stripe-style "open" to product-facing "unpaid".
UPDATE invoices SET status = 'unpaid' WHERE status = 'open';

-- Drop quote document markers from metadata (no longer used).
UPDATE invoices
SET metadata = metadata - 'documentType' - 'creditForInvoiceId'
WHERE metadata ? 'documentType' OR metadata ? 'creditForInvoiceId';

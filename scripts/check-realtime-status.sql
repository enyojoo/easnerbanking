-- Check if realtime is enabled for noah_transactions table
-- Run this in Supabase SQL editor to verify

-- Check if table is in realtime publication
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'noah_transactions';

-- Check replica identity
SELECT 
  relname,
  relreplident
FROM pg_class
WHERE relname = 'noah_transactions';

-- relreplident values:
-- 'd' = default (primary key only)
-- 'f' = full (all columns)
-- 'n' = nothing
-- 'i' = index


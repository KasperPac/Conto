ALTER TABLE transaction_links
  ADD CONSTRAINT transaction_links_pair_unique
  UNIQUE (from_transaction_id, to_transaction_id);

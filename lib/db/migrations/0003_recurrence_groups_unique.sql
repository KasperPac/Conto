create unique index if not exists recurrence_groups_user_dedupe
  on recurrence_groups (user_id, coalesce(merchant_id::text, description_pattern));

create policy wfh_entries_per_user on wfh_entries
  using (user_id = current_setting('app.user_id', true)::uuid);

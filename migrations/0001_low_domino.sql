TRUNCATE TABLE "users" CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Custom Trigger Update for Robustness
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
      new.id, 
      new.email, 
      new.raw_user_meta_data->>'full_name', 
      new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;
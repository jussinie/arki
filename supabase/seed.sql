-- Synthetic seed data only. Never place real personal or health data in this file.
-- Local acceptance-test accounts:
--   test@example.com  / Arki-test-password-123!
--   other@example.com / Arki-test-password-123!
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'test@example.com',
    extensions.crypt('Arki-test-password-123!', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000006',
    'authenticated', 'authenticated', 'other@example.com',
    extensions.crypt('Arki-test-password-123!', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000005',
    '{"sub":"00000000-0000-4000-8000-000000000005","email":"test@example.com","email_verified":true}',
    'email', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000006',
    '{"sub":"00000000-0000-4000-8000-000000000006","email":"other@example.com","email_verified":true}',
    'email', now(), now()
  )
on conflict (provider_id, provider) do nothing;

# Admin Bootstrap

WritBase uses an `admin_users` table to gate all dashboard access. Every RLS policy checks `auth.uid() IN (SELECT user_id FROM admin_users)`, which means **no user can access any data until at least one admin row exists**.

## The Bootstrap Problem

The `admin_insert_admin_users` RLS policy requires the inserting user to already be in `admin_users`. This is a deliberate chicken-and-egg constraint — it prevents any authenticated user from self-promoting to admin.

The first admin must be inserted using the **service role** (bypasses RLS).

## Steps

### 1. Create a Supabase Auth user

Sign up via the login page, or create a user in the Supabase Dashboard under **Authentication > Users**.

Note the user's UUID (visible in the dashboard user list).

### 2. Insert the first admin row

Open the Supabase Dashboard **SQL Editor** and run:

```sql
-- Replace with the actual user UUID from step 1
INSERT INTO admin_users (user_id)
VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
```

The SQL Editor runs as the `postgres` role (service role), which bypasses RLS.

Alternatively, use the Supabase CLI:

```bash
supabase db execute --sql \
  "INSERT INTO admin_users (user_id) VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');"
```

### 3. Verify

Log in with that user. You should now see the dashboard with projects, tasks, and agent keys.

## Adding More Admins

Once the first admin exists, they can add others through the SQL Editor or by building an admin management UI. The RLS policy allows any existing admin to insert new rows:

```sql
-- Run as the first admin user (or via SQL Editor)
INSERT INTO admin_users (user_id)
VALUES ('yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy');
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Redirected to `/login` after signing in | User exists in `auth.users` but not in `admin_users` | Insert the admin row (step 2) |
| "permission denied" errors on all tables | RLS policies can't find user in `admin_users` | Same as above |
| Can't insert into `admin_users` from the app | RLS blocks self-promotion by design | Use SQL Editor or CLI (service role) |

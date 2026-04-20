# Deployment Guide — Attendance Web App

A step-by-step guide to go from local → public HTTPS URL using **Supabase** (database) and **Render** (hosting). Both are free.

---

## Step 1 — Set Up Supabase (Database)

1. Go to **[supabase.com](https://supabase.com)** and create a free account.
2. Click **New Project**, name it `attendance-app`, choose any region.
3. Once created, go to the **SQL Editor** tab and run this SQL:

```sql
-- Create the attendance table
create table attendance (
  id          bigserial primary key,
  name        text not null,
  email       text not null,
  department  text default '',
  role        text default '',
  phone       text default '',
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Enable Row Level Security
alter table attendance enable row level security;

-- Allow anyone to INSERT (public form submission)
create policy "Public insert" on attendance
  for insert with check (true);

-- Only service_role (backend) can SELECT/UPDATE/DELETE
-- (This is the default — no extra policy needed for service_role)
```

4. Go to **Settings → API** and copy two values:
   - **Project URL** → this becomes `SUPABASE_URL`
   - **service_role** secret key → this becomes `SUPABASE_SERVICE_KEY`

> ⚠️ Use the `service_role` key (not the `anon` key) — only your backend uses it, it bypasses RLS.

---

## Step 2 — Push to GitHub

1. Create a **new repository** on [github.com](https://github.com) (can be private).
2. Run these commands in your project folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/attendance-app.git
git branch -M main
git push -u origin main
```

> ✅ Your `.gitignore` already excludes `.env` and `.xlsx` files — secrets won't be committed.

---

## Step 3 — Deploy to Render

1. Go to **[render.com](https://render.com)** and sign up for free (use GitHub login).
2. Click **New → Web Service**.
3. Connect your GitHub repo.
4. Configure:
   - **Name:** `attendance-app` (or anything)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free

5. Click **Add Environment Variable** and add all of these:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `ADMIN_PASSWORD` | Your chosen admin password |
| `JWT_SECRET` | Any long random string (run: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |

6. Click **Deploy**. Render will build and give you a URL like:
   ```
   https://attendance-app-xxxx.onrender.com
   ```

---

## Step 4 — Test Your Live App

| URL | Who can access | What they can do |
|-----|---------------|-----------------|
| `https://your-app.onrender.com/` | Anyone | Submit attendance (name, email, dept…) — cannot view other entries |
| `https://your-app.onrender.com/admin` | Admin only (password protected) | View all entries, edit, delete, download Excel |

---

## Generate a JWT Secret (run this once locally)

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output and paste it as `JWT_SECRET` in Render's environment variables.

---

## Local Development

Create a `.env` file (copied from `.env.example`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
ADMIN_PASSWORD=your_password
JWT_SECRET=your_long_secret
PORT=3000
```

Then run:
```bash
node server.js
```

- Public form: http://localhost:3000
- Admin panel: http://localhost:3000/admin

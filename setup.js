require('dotenv').config();
const https = require('https');

// Use Supabase Management API to run SQL directly
// This uses the secret key to execute raw SQL via the REST endpoint
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const sql = `
create table if not exists attendance (
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

alter table attendance enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'attendance' and policyname = 'Public insert'
  ) then
    execute 'create policy "Public insert" on attendance for insert with check (true)';
  end if;
end $$;

create table if not exists daily_attendance (
  id           bigserial primary key,
  employee_id  bigint references attendance(id) on delete cascade,
  date         date not null,
  present      boolean default false,
  remark       text default '',
  marked_at    timestamptz default now(),
  unique(employee_id, date)
);

alter table daily_attendance enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'daily_attendance' and policyname = 'Public insert'
  ) then
    execute 'create policy "Public insert" on daily_attendance for insert with check (true)';
    execute 'create policy "Public update" on daily_attendance for update using (true)';
    execute 'create policy "Public read" on daily_attendance for select using (true)';
  end if;
end $$;
`;

const body = JSON.stringify({ query: sql });
const url  = new URL(`${SUPABASE_URL}/rest/v1/rpc/`);

// Supabase exposes a /rest/v1/ endpoint; to run raw SQL we use the pg-meta endpoint
// which is available via the management API:
const projectRef = SUPABASE_URL.replace('https://','').split('.')[0];
const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

console.log('🔧 Creating attendance table via Supabase Management API...');
console.log('📡 Project ref:', projectRef);

const payload = JSON.stringify({ query: sql });

const options = {
    hostname: 'api.supabase.com',
    path: `/v1/projects/${projectRef}/database/query`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${SERVICE_KEY}`,
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Response status:', res.statusCode);
        try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 || res.statusCode === 201) {
                console.log('✅ Table created successfully!');
            } else {
                console.log('Response:', JSON.stringify(json, null, 2));
                if (res.statusCode === 401 || res.statusCode === 403) {
                    console.log('\n⚠️  The secret key cannot access the Management API (this is normal for project-scoped keys).');
                    console.log('👉 Please create the table manually in your Supabase SQL Editor:');
                    console.log('   → https://supabase.com/dashboard/project/' + projectRef + '/sql/new\n');
                    console.log('SQL to run:\n');
                    console.log(sql);
                }
            }
        } catch {
            console.log('Raw response:', data);
        }
    });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(payload);
req.end();

const fs = require('fs');
const file = 'public/dashboard.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Add Add Employee button
content = content.replace(
  '<button class="nav-tab"        id="tab-weekly"   onclick="switchTab(\'weekly\')">Weekly</button>',
  '<button class="nav-tab"        id="tab-weekly"   onclick="switchTab(\'weekly\')">Weekly</button>\n      <button class="nav-tab" style="background:var(--blue);color:white;" onclick="openAddModal()">+ Add Employee</button>'
);

// 2. Add Modal HTML before <script>
const modalHtml = `
<!-- Add Employee Modal -->
<div id="addModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:400; align-items:center; justify-content:center;">
  <div style="background:white; padding:24px; border-radius:10px; width:400px; max-width:90%; position:relative; box-shadow:0 4px 20px rgba(0,0,0,0.2);">
    <h2 style="margin-bottom:16px;">Add Employee Profile</h2>
    <div style="display:flex; flex-direction:column; gap:12px;">
      <input id="newEmpName" placeholder="Full Name" style="padding:10px; border:1.5px solid var(--border); border-radius:6px; font-size:14px; width:100%;">
      <input id="newEmpEmail" placeholder="Email" style="padding:10px; border:1.5px solid var(--border); border-radius:6px; font-size:14px; width:100%;">
      <select id="newEmpDept" style="padding:10px; border:1.5px solid var(--border); border-radius:6px; font-size:14px; width:100%;">
        <option value="">Select Department...</option>
        <option value="frontend">front end</option>
        <option value="backend">back end</option>
      </select>
      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
        <button onclick="closeAddModal()" style="padding:8px 16px; border:1.5px solid var(--border); background:white; border-radius:6px; cursor:pointer;">Cancel</button>
        <button onclick="submitNewEmployee()" style="padding:8px 16px; border:none; background:var(--blue); color:white; border-radius:6px; cursor:pointer; font-weight:600;">Submit</button>
      </div>
    </div>
  </div>
</div>
`;
content = content.replace('<script>', modalHtml + '\n<script>');

// 3. Rewrite <script> logic
const scriptStart = content.indexOf('<script>');
const scriptEnd = content.indexOf('</script>', scriptStart);
let beforeScript = content.substring(0, scriptStart + 8);
let afterScript = content.substring(scriptEnd);

const newScript = `
// ═══════════════════════════════════════════════════════
//  DATA & APIs
// ═══════════════════════════════════════════════════════
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const YEAR      = 2026;

let ALL_EMPLOYEES = [];
let DEPT = {};
let EMPLOYEE_IDS = {};

let ATT = {};
let REM = {};

function daysInMonth(m) { return new Date(YEAR, m + 1, 0).getDate(); }
function dayName(m, d)   { return DAY_NAMES[new Date(YEAR, m, d).getDay()]; }
function isWeekend(m, d) { const dow = new Date(YEAR, m, d).getDay(); return dow === 0 || dow === 6; }

async function fetchEmployees() {
  try {
    const res = await fetch('/api/employees');
    const json = await res.json();
    if (json.success) {
      ALL_EMPLOYEES = json.data.map(e => e.name);
      json.data.forEach(e => {
        DEPT[e.name] = e.department || 'frontend'; // default
        EMPLOYEE_IDS[e.name] = e.id;
      });
    }
  } catch (err) {
    console.error('Error fetching employees:', err);
  }
}

async function fetchDailyData(m) {
  const monthStr = \`\${YEAR}-\${String(m+1).padStart(2, '0')}\`;
  try {
    const res = await fetch(\`/api/daily?month=\${monthStr}\`);
    const json = await res.json();
    if (json.success) {
      // Re-initialize for this month
      ATT[m] = {}; REM[m] = {};
      ALL_EMPLOYEES.forEach(name => {
        ATT[m][name] = new Array(daysInMonth(m)).fill(false);
        REM[m][name] = '';
      });
      // Populate with DB data
      json.data.forEach(row => {
        const d = new Date(row.date);
        const dayIdx = d.getDate() - 1;
        // Find employee name by ID
        const empName = Object.keys(EMPLOYEE_IDS).find(name => EMPLOYEE_IDS[name] === row.employee_id);
        if (empName) {
           ATT[m][empName][dayIdx] = row.present;
           if (row.remark) REM[m][empName] = row.remark;
        }
      });
    }
  } catch (err) {
    console.error('Error fetching daily data:', err);
  }
}

async function apiTogglePresence(employee_id, date, present) {
  await fetch('/api/daily/toggle', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id, date, present })
  });
}

async function apiSaveRemark(employee_id, date, remark) {
  await fetch('/api/daily/remark', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id, date, remark })
  });
}

function openAddModal() { document.getElementById('addModal').style.display = 'flex'; }
function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

async function submitNewEmployee() {
  const name = document.getElementById('newEmpName').value.trim();
  const email = document.getElementById('newEmpEmail').value.trim();
  const department = document.getElementById('newEmpDept').value;
  if (!name || !email) return alert('Name and Email required');
  
  const submitBtn = event.target;
  submitBtn.textContent = 'Submitting...';
  submitBtn.disabled = true;

  const res = await fetch('/api/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, department })
  });
  if (res.ok) {
    closeAddModal();
    document.getElementById('newEmpName').value = '';
    document.getElementById('newEmpEmail').value = '';
    
    // Refresh employee list and logic
    await initApp();
  } else {
    alert('Failed to add employee');
  }
  submitBtn.textContent = 'Submit';
  submitBtn.disabled = false;
}

// ═══════════════════════════════════════════════════════
//  STATE & UI
// ═══════════════════════════════════════════════════════
let curMonth = 3;
let curTab   = 'frontend';

function filteredEmployees() {
  if (curTab === 'frontend') return ALL_EMPLOYEES.filter(n => DEPT[n].toLowerCase().includes('front'));
  if (curTab === 'backend')  return ALL_EMPLOYEES.filter(n => DEPT[n].toLowerCase().includes('back'));
  return ALL_EMPLOYEES;
}

function todayMeta() {
  const now = new Date();
  return { month: now.getMonth(), day: now.getDate(), year: now.getFullYear() };
}

function calcStats(m) {
  const days   = daysInMonth(m);
  const td     = todayMeta();
  let monthTotal = 0, todayCount = 0, defaulters = 0, yearTotal = 0;

  ALL_EMPLOYEES.forEach(name => {
    let empPresent = 0;
    for (let d = 0; d < days; d++) {
      if (ATT[m][name][d]) { empPresent++; monthTotal++; }
      if (m === td.month && d === td.day - 1 && ATT[m][name][d]) todayCount++;
    }
    if (empPresent === 0 && m <= new Date().getMonth()) defaulters++;
  });

  document.getElementById('stTotal').textContent   = ALL_EMPLOYEES.length;
  document.getElementById('stToday').textContent   = todayCount;
  document.getElementById('stMonth').textContent   = monthTotal;
  document.getElementById('stYear').textContent   = monthTotal; // Assuming same for now
  document.getElementById('stDefault').textContent = defaulters;
}

function buildDefaulters(m) {
  const days = daysInMonth(m);
  const ranked = ALL_EMPLOYEES.map(name => {
    let present = 0;
    ATT[m][name].forEach(v => { if (v) present++; });
    return { name, missed: days - present };
  }).sort((a, b) => b.missed - a.missed);

  document.getElementById('defaulterList').innerHTML =
    ranked.slice(0, 14).map(r => \`
      <div class="defaulter-item">
        <span class="dname">\${r.name}</span>
        <span class="dbadge">\${r.missed} missed</span>
      </div>\`).join('');
}

let chartInst = null;
function buildChart(m) {
  const days   = daysInMonth(m);
  const labels = [];
  const data   = [];
  for (let d = 0; d < days; d++) {
    labels.push(d + 1);
    let count = 0;
    ALL_EMPLOYEES.forEach(name => { if (ATT[m][name][d]) count++; });
    data.push(count);
  }

  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (chartInst) chartInst.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, 'rgba(59,130,246,0.15)');
  gradient.addColorStop(1, 'rgba(59,130,246,0)');

  chartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#3b82f6',
        backgroundColor: gradient,
        borderWidth: 1.8,
        pointRadius: ctx => data[ctx.dataIndex] > 0 ? 3 : 0,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: Math.max(10, ALL_EMPLOYEES.length) }
      }
    }
  });
}

function buildGrid(m) {
  const days  = daysInMonth(m);
  const td    = todayMeta();
  const isNow = td.month === m && td.year === YEAR;
  const emps  = filteredEmployees();

  document.getElementById('gridBadge').textContent = \`\${MONTHS[m]} \${YEAR}\`;

  let thead = \`<thead><tr><th class="th-name">Name</th>\`;
  for (let d = 1; d <= days; d++) {
    const today   = isNow && d === td.day;
    const weekend = isWeekend(m, d);
    let cls = today ? 'th-today' : (weekend ? 'th-weekend' : '');
    thead += \`<th class="\${cls}">\${d}<br><span style="font-weight:400;opacity:.75">\${dayName(m,d)}</span></th>\`;
  }
  thead += \`<th class="th-total">Total<br>Billable Days</th><th class="th-remarks">Remarks</th></tr></thead>\`;

  let tbody = '<tbody>';
  if (emps.length === 0) {
     tbody += \`<tr><td colspan="\${days+3}" style="text-align:center;padding:20px;color:var(--muted);">No employees found in this department. Click "+ Add Employee" to get started.</td></tr>\`;
  }
  emps.forEach(name => {
    let present = 0;
    ATT[m][name].forEach(v => { if (v) present++; });

    let row = \`<tr><td class="td-name">\${name}</td>\`;
    for (let d = 1; d <= days; d++) {
      const di      = d - 1;
      const chk     = ATT[m][name][di];
      const today   = isNow && d === td.day;
      const weekend = isWeekend(m, d);
      const cbId    = \`cb_\${m}_\${encodeEmp(name)}_\${di}\`;
      let cls = today ? 'td-today' : (weekend ? 'td-weekend' : '');
      row += \`<td class="\${cls}">
        <input type="checkbox" class="att-cb" id="\${cbId}"
          \${chk ? 'checked' : ''}
          onchange="toggleAtt('\${m}','\${escapeName(name)}',\${di},this)">
      </td>\`;
    }
    const remark = REM[m][name] || '';
    row += \`<td class="td-total" id="tot_\${m}_\${encodeEmp(name)}">\${present}</td>\`;
    row += \`<td class="td-remarks">
      <input class="rem-input" type="text"
      value="\${escapeVal(remark)}" placeholder="Add remark…"
      onblur="saveRemark('\${m}','\${escapeName(name)}', this.value)">
    </td>\`;
    row += '</tr>';
    tbody += row;
  });
  tbody += '</tbody>';
  document.getElementById('attTable').innerHTML = thead + tbody;
}

function encodeEmp(name) { return name.replace(/\\s+/g,'_'); }
function escapeName(n)   { return n.replace(/'/g,"\\\\'"); }
function escapeVal(v)    { return v.replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function toggleAtt(m, name, di, cb) {
  m = parseInt(m);
  ATT[m][name][di] = cb.checked;
  // Use UTC format or simple YYYY-MM-DD
  const dateStr = \`\${YEAR}-\${String(m+1).padStart(2,'0')}-\${String(di+1).padStart(2,'0')}\`;
  apiTogglePresence(EMPLOYEE_IDS[name], dateStr, cb.checked);

  let count = 0;
  ATT[m][name].forEach(v => { if (v) count++; });
  const totEl = document.getElementById(\`tot_\${m}_\${encodeEmp(name)}\`);
  if (totEl) totEl.textContent = count;
  calcStats(m);
  buildChart(m);
  buildDefaulters(m);
}

function saveRemark(m, name, val) {
  REM[m][name] = val;
  const dateStr = \`\${YEAR}-\${String(parseInt(m)+1).padStart(2,'0')}-01\`; // fallback date for summary notes
  apiSaveRemark(EMPLOYEE_IDS[name], dateStr, val);
}

// ═══════════════════════════════════════════════════════
//  WEEKLY VIEW & EXPORT
// ═══════════════════════════════════════════════════════
function rateClass(r) { return r===0?'none':r>=75?'high':r>=40?'mid':'low'; }

function buildWeekly(m) {
  document.getElementById('weeklyTitle').textContent = \`Weekly Attendance Summary — \${MONTHS[m]} \${YEAR}\`;
  const days  = daysInMonth(m);
  const weeks = splitWeeks(m, days);
  
  let html = '';
  weeks.forEach((wk, wi) => {
    let workdays = 0;
    for (let d = wk.s; d <= wk.e; d++) { if (!isWeekend(m, d)) workdays++; }

    const empRows = ALL_EMPLOYEES.map(name => {
      let present = 0;
      for (let d = wk.s; d <= wk.e; d++) {
        if (!isWeekend(m, d) && ATT[m][name] && ATT[m][name][d-1]) present++;
      }
      const absent = workdays - present;
      const rate   = workdays > 0 ? Math.round(present / workdays * 100) : 0;
      return { name, present, absent, rate };
    });

    const avg = Math.round(empRows.length ? empRows.reduce((s, r) => s + r.rate, 0) / empRows.length : 0);
    html += \`
      <div class="week-block">
        <div class="week-block-head">
          <span class="week-name">Week \${wi+1}</span>
          <span class="week-rate \${rateClass(avg)}">\${avg}% attendance</span>
        </div>
        <table class="wk-tbl">
          <thead><tr><th>Name</th><th class="th-center">Present</th><th class="th-center">Absent</th><th class="th-center">Rate</th><th class="th-bar">Progress</th></tr></thead>
          <tbody>
            \${empRows.map(r => \`<tr>
              <td>\${r.name}</td>
              <td class="td-center">\${r.present}/\${workdays}</td>
              <td class="td-center">\${r.absent}</td>
              <td class="td-center"><span class="rate-badge \${rateClass(r.rate)}">\${r.rate}%</span></td>
              <td><div class="wk-bar-wrap"><div class="wk-bar-bg"><div class="wk-bar-fill \${rateClass(r.rate)}" style="width:\${r.rate}%"></div></div></div></td>
            </tr>\`).join('')}
          </tbody>
        </table>
      </div>\`;
  });
  document.getElementById('weeklyContent').innerHTML = html;
}

function splitWeeks(m, days) {
  const weeks = []; let start = 1;
  while (start <= days) {
    const startDow = new Date(YEAR, m, start).getDay();
    let end = startDow === 1 ? Math.min(start + 6, days) : Math.min(start + (startDow === 0 ? 0 : 7 - startDow), days);
    weeks.push({ s: start, e: end });
    start = end + 1;
  }
  return weeks;
}

function switchTab(tab) {
  curTab = tab;
  ['frontend','backend','weekly'].forEach(t => {
    const el = document.getElementById(\`tab-\${t}\`);
    if(el) el.classList.toggle('active', t === tab);
  });
  if (tab === 'weekly') {
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('weeklyView').style.display = 'block';
    buildWeekly(curMonth);
  } else {
    document.getElementById('mainView').style.display = 'block';
    document.getElementById('weeklyView').style.display = 'none';
    renderMainView(curMonth);
  }
}

async function onMonthChange() {
  curMonth = parseInt(document.getElementById('monthSelect').value);
  await fetchDailyData(curMonth);
  if (curTab === 'weekly') buildWeekly(curMonth);
  else renderMainView(curMonth);
}

function exportCSV() {
  const m = curMonth;
  const days = daysInMonth(m);
  const hdr = ['Name', ...Array.from({length:days},(_,i)=>i+1), 'Total', 'Remarks'];
  const rows = [hdr];

  filteredEmployees().forEach(name => {
    let total = 0;
    const dayVals = [];
    for (let d = 0; d < days; d++) {
      const v = ATT[m][name][d] ? 1 : 0;
      dayVals.push(v); total += v;
    }
    rows.push([\`"\${name}"\`, ...dayVals, total, \`"\${(REM[m][name]||'').replace(/"/g,'""')}"\`]);
  });

  const csv = rows.map(r => r.join(',')).join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = \`attendance_\${MONTHS[m]}_\${YEAR}.csv\`;
  a.click();
}

function renderMainView(m) {
  calcStats(m);
  buildDefaulters(m);
  buildChart(m);
  buildGrid(m);
}

async function initApp() {
  await fetchEmployees();
  await fetchDailyData(curMonth);
  renderMainView(curMonth);
}

initApp();
`;
content = beforeScript + newScript + afterScript;
fs.writeFileSync(file, content);
console.log('Modified dashboard.html using JS');

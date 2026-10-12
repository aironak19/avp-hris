/* ==========================================================================
   AVP HRIS — local mock backend
   --------------------------------------------------------------------------
   Serves the static site and answers the RPC endpoint with fixtures shaped
   exactly like the real Apps Script responses, so the whole frontend can be
   developed and smoke-tested without touching production data.

       node tools/mock-server.js            # http://localhost:8080
       node tools/mock-server.js --port 3000

   Point config.js at http://localhost:8080/exec while using it.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8080;

const TODAY = new Date().toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (d) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const weekday = (d) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(d + 'T12:00:00').getDay()];
const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

const TOKEN = 'mock-session-token';

/* How many HTTP requests carried how many actions — the ratio is the whole
   point of batching, so the smoke test asserts on it. */
const STATS = { httpRequests: 0, actions: 0 };

const USER = {
  employeeId: 'E0001', code: 'AVP001', name: 'Ronak Mehta', initials: 'RM',
  email: 'ronak@example.com', phone: '9876543210', gender: 'Male',
  department: 'Structural', section: 'Design', designation: 'Senior Engineer',
  joinDate: '2021-04-12', probationEndDate: '2021-10-12', confirmationDate: '2021-10-12',
  status: 'CONFIRMED', role: 'HR_ADMIN', managerId: 'E0002', managerName: 'Asha Patel',
  locationId: 'L1', employmentType: 'Permanent', photoUrl: '', altEmail: '', googleEmail: '',
  mustChangePassword: false, needsOnboarding: false,
  isManager: true, isHR: true, isAdmin: false
};

const DAY = {
  date: TODAY, weekday: weekday(TODAY), dayType: 'WORKING', status: 'PRESENT',
  checkIn: '09:34', checkOut: '', workedMinutes: 264, lateMinutes: 4, earlyMinutes: 0,
  locationName: 'Ahmedabad HO', distance: 38, remarks: '', source: 'WEB',
  id: 'A100', leaveType: '', regularizationId: ''
};

const LOCATIONS = [
  { id: 'L1', name: 'Ahmedabad HO', address: 'Prahlad Nagar', lat: 23.0121, lng: 72.5074, radius: 150 },
  { id: 'L2', name: 'Site — Riverfront', address: 'Sabarmati', lat: 23.0611, lng: 72.5800, radius: 250 }
];

const BALANCE = {
  financialYear: '2026-27', entitledAnnual: 18, entitledToDate: 9, consumed: 3.5,
  pending: 1, available: 4.5, lwpTaken: 0, compOff: 2, onProbation: false,
  eligibleFrom: '2021-10-12',
  quarters: [
    { quarter: 'Q1', from: '2026-04-01', to: '2026-06-30', quota: 4.5, entitled: 4.5, used: 2, current: false, started: true },
    { quarter: 'Q2', from: '2026-07-01', to: '2026-09-30', quota: 4.5, entitled: 4.5, used: 1.5, current: true, started: true },
    { quarter: 'Q3', from: '2026-10-01', to: '2026-12-31', quota: 4.5, entitled: 0, used: 0, current: false, started: false },
    { quarter: 'Q4', from: '2027-01-01', to: '2027-03-31', quota: 4.5, entitled: 0, used: 0, current: false, started: false }
  ]
};

const REQUESTS = [
  { requestId: 'LR-1042', employeeId: 'E0001', employeeName: 'Ronak Mehta', leaveTypeCode: 'PL', leaveTypeName: 'Privilege Leave', fromDate: shift(TODAY, 6), toDate: shift(TODAY, 7), days: 2, paidDays: 2, lwpDays: 0, status: 'PENDING', reason: 'Family function', appliedAt: TODAY + ' 10:12', approverName: 'Asha Patel' },
  { requestId: 'LR-1021', employeeId: 'E0001', employeeName: 'Ronak Mehta', leaveTypeCode: 'CL', leaveTypeName: 'Casual Leave', fromDate: shift(TODAY, -12), toDate: shift(TODAY, -12), days: 1, paidDays: 1, lwpDays: 0, status: 'APPROVED', reason: 'Personal', appliedAt: shift(TODAY, -15) + ' 09:02', approverName: 'Asha Patel' }
];

const BOOTSTRAP = {
  user: USER,
  leaveTypes: [
    { code: 'PL', name: 'Privilege Leave', paid: true, requiresReason: true, maxPerRequest: 15, allowHalfDay: true },
    { code: 'CL', name: 'Casual Leave', paid: true, requiresReason: true, maxPerRequest: 3, allowHalfDay: true },
    { code: 'SL', name: 'Sick Leave', paid: true, requiresReason: true, maxPerRequest: 5, allowHalfDay: true },
    { code: 'LWP', name: 'Leave Without Pay', paid: false, requiresReason: true, maxPerRequest: 30, allowHalfDay: false }
  ],
  locations: LOCATIONS,
  departments: ['Structural', 'Architecture', 'Accounts', 'Admin'],
  designations: ['Junior Engineer', 'Senior Engineer', 'Project Manager'],
  settings: {
    geofenceEnabled: true, maxAccuracy: 200, shiftStart: '09:30', shiftEnd: '18:30',
    weeklyOff: ['Sunday'], allowHalfDay: true, orgName: 'AVP Structural Consultants',
    appVersion: '1.6.0',
    expenseCategories: ['Travel', 'Food', 'Stationery', 'Client entertainment'],
    receiptRequiredAbove: 500,
    helpdeskCategories: ['IT', 'Facilities', 'HR', 'Payroll'],
    assetCategories: ['Laptop', 'Phone', 'Monitor', 'Access card'],
    googleSignIn: true, passwordReset: true
  },
  financialYear: '2026-27'
};

const HOME = {
  celebrations: [
    { employeeId: 'E0007', name: 'Priya Shah', initials: 'PS', department: 'Accounts', kind: 'birthday', date: shift(TODAY, 2), inDays: 2, years: null },
    { employeeId: 'E0011', name: 'Vikram Rao', initials: 'VR', department: 'Structural', kind: 'anniversary', date: shift(TODAY, 4), inDays: 4, years: 5 }
  ],
  signRequests: [],
  notices: [
    { id: 'N-9', title: 'Diwali holiday schedule', body: 'The office will be closed from 20–24 October.', publishedAt: shift(TODAY, -3) + ' 11:00', requiresAck: true, acknowledgedAt: '', category: 'HR' }
  ],
  pendingAcks: 1,
  expenseApprovals: [],
  interviews: [],
  myTickets: [],
  today: TODAY, prettyDate: pretty(TODAY), weekday: weekday(TODAY),
  financialYear: '2026-27',
  leave: BALANCE,
  attendance: {
    date: TODAY, prettyDate: pretty(TODAY), weekday: weekday(TODAY), day: DAY,
    shift: { start: '09:30', end: '18:30', graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480 },
    geofenceEnabled: true, maxAccuracy: 200, canCheckIn: false, canCheckOut: true,
    locations: LOCATIONS,
    monthSummary: { present: 14, halfDay: 1, absent: 0, onLeave: 2, weeklyOff: 3, holiday: 1, missingPunch: 0, workedMinutes: 6720 }
  },
  approvals: [REQUESTS[0]],
  regularizations: [],
  compOffApprovals: [],
  pendingCount: 2,
  outThisWeek: [],
  teamToday: { counts: { present: 22, absent: 1, onLeave: 3, notMarked: 4, weeklyOff: 0, holiday: 0 }, rows: [] },
  upcomingHolidays: [{ date: shift(TODAY, 21), name: 'Diwali', prettyDate: pretty(shift(TODAY, 21)) }],
  myRequests: REQUESTS,
  notifications: [{ id: 'NT-1', title: 'Leave approved', body: 'Your casual leave was approved.', at: shift(TODAY, -12) + ' 14:20', read: false }]
};

const DIRECTORY = [
  { employeeId: 'E0002', code: 'AVP002', name: 'Asha Patel', initials: 'AP', gender: 'Female',
    department: 'Structural', section: 'Design', designation: 'Principal Engineer',
    email: 'asha@example.com', phone: '9820011223', joinDate: '2018-06-01',
    status: 'CONFIRMED', role: 'MANAGER', managerId: '', managerName: '',
    locationId: 'L1', locationName: 'Ahmedabad HO', onProbation: false },
  { employeeId: 'E0001', code: 'AVP001', name: 'Ronak Mehta', initials: 'RM', gender: 'Male',
    department: 'Structural', section: 'Design', designation: 'Senior Engineer',
    email: 'ronak@example.com', phone: '9876543210', joinDate: '2021-04-12',
    status: 'CONFIRMED', role: 'HR_ADMIN', managerId: 'E0002', managerName: 'Asha Patel',
    locationId: 'L1', locationName: 'Ahmedabad HO', onProbation: false }
];

const PROFILE = (id) => Object.assign({}, USER, {
  employeeId: id || USER.employeeId,
  dateOfBirth: '1993-11-04', bloodGroup: 'O+', lastWorkingDate: '',
  locationName: 'Ahmedabad HO',
  emergency: { name: 'Nidhi Mehta', relation: 'Spouse', phone: '9812345678' },
  qualification: 'M.Tech (Structural)', experience: '8 years', skills: 'ETABS, STAAD, RCC design',
  notes: '', onProbation: false,
  address: '14 Satellite Road, Ahmedabad 380015',
  bank: { name: 'HDFC Bank', ifsc: 'HDFC0001234', branch: 'Prahlad Nagar', account: 'XXXXXX4321' },
  pan: 'ABCDE1234F',
  statutory: { uan: '100234567890', pfNumber: 'GJ/AHD/1234/567', pfApplicable: true, esiNumber: '', esiApplicable: false, aadhaarLast4: '8891' },
  nationality: 'Indian',
  reports: [{ employeeId: 'E0014', name: 'Kunal Desai', designation: 'Junior Engineer', initials: 'KD' }],
  leave: BALANCE,
  attendanceThisMonth: { present: 14, halfDay: 1, absent: 0, onLeave: 2, weeklyOff: 3, holiday: 1, missingPunch: 0, workedMinutes: 6720 }
});

/* ---------------------------------------------------------------- dispatch */
/* v3.3 — Reports ▸ Approvals. Shaped like ApprovalReport.build() on the server:
   every request that came in, newest first, filtered by the day it was made. */
const APPROVAL_ROWS = (() => {
  const people = [
    ['E0003', 'AVP003', 'Kiran Shah', 'Structural', 'Engineer'], ['E0004', 'AVP004', 'Neha Joshi', 'Structural', 'Draftsperson'],
    ['E0005', 'AVP005', 'Imran Sheikh', 'Site', 'Site Engineer'], ['E0006', 'AVP006', "Divya O'Brien & Co <test>", 'Accounts', 'Accountant']
  ];
  const rows = [];
  const add = (i, kind, ago, state, f) => {
    const p = people[i % people.length], on = shift(TODAY, -ago);
    const decided = state === 'PENDING' ? '' : shift(on, 1 + (i % 3));
    rows.push(Object.assign({
      kind, id: kind.slice(0, 2) + '-' + String(1000 + rows.length), employeeId: p[0], employeeName: p[2], employeeCode: p[1], department: p[3], designation: p[4],
      requestedAt: on + ' 1' + (i % 8) + ':2' + (i % 6) + ':00', requestedOn: on, state, status: state,
      stage: state === 'PENDING' ? 'Waiting for Asha Patel' : state === 'APPROVED' ? 'Approved' : state === 'REJECTED' ? 'Declined' : 'Cancelled',
      summary: '', from: on, to: on, days: '', amount: '', reason: 'Reason ' + (rows.length + 1), approver: 'Asha Patel',
      decidedAt: decided ? decided + ' 10:00:00' : '', decidedOn: decided, remark: state === 'REJECTED' ? 'Not possible this week' : '', detail: {}
    }, f));
  };
  const states = ['PENDING', 'APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'APPROVED'];
  for (let i = 0; i < 14; i++) {
    const st = states[i % states.length], d0 = shift(TODAY, -(i * 9) + 5), days = 1 + (i % 3) * 0.5;
    add(i, 'LEAVE', i * 9 + 1, st, { summary: (i % 2 ? 'SL' : 'PL') + ' leave', from: d0, to: shift(d0, i % 3), days,
      detail: { leaveType: i % 2 ? 'SL' : 'PL', paidDays: days, lwpDays: i % 5 === 4 ? 1 : 0, sandwichDays: 0, handoverTo: 'Kiran Shah' } });
  }
  for (let i = 0; i < 8; i++) {
    const st = states[(i + 1) % states.length], d0 = shift(TODAY, -(i * 11) - 2), noLoc = i % 2 === 0;
    add(i + 1, 'REGULARISATION', i * 11 + 1, st, { summary: noLoc ? 'No location' : 'Missed punch', from: d0, to: d0,
      reason: noLoc ? 'Check-in at 09:3' + i + ' (server time) without location' : 'Forgot to check out',
      detail: { regType: noLoc ? 'NO_LOCATION' : 'MISSED_PUNCH', attDate: d0, checkIn: '09:3' + i, checkOut: noLoc ? '' : '18:4' + i, requestedStatus: 'PRESENT' } });
  }
  for (let i = 0; i < 4; i++) {
    const st = states[(i + 2) % states.length], d0 = shift(TODAY, -(i * 20) - 6);
    add(i + 2, 'COMP_OFF', i * 20 + 4, st, { summary: 'Comp off for work on ' + d0, from: d0, to: d0, days: i % 2 ? 0.5 : 1,
      detail: { workedDate: d0, hours: i % 2 ? 4 : 8, expiry: shift(d0, 90), consumedDays: 0 } });
  }
  const exp = [['SUBMITTED', 'PENDING', 'Waiting for Asha Patel'], ['MANAGER_APPROVED', 'PENDING', 'Manager approved, waiting for HR'], ['APPROVED', 'APPROVED', 'Approved, to be paid'], ['PAID', 'APPROVED', 'Paid'], ['REJECTED', 'REJECTED', 'Declined'], ['CANCELLED', 'CANCELLED', 'Cancelled']];
  for (let i = 0; i < 9; i++) {
    const e = exp[i % exp.length], d0 = shift(TODAY, -(i * 8) - 3), amt = 350.5 + i * 410;
    add(i + 3, 'EXPENSE', i * 8 + 2, e[1], { status: e[0], stage: e[2], summary: (i % 2 ? 'Travel' : 'Stationery') + ' · Claim ' + (i + 1), from: d0, to: d0, amount: amt,
      detail: { category: i % 2 ? 'Travel' : 'Stationery', title: 'Claim ' + (i + 1), expenseDate: d0, currency: 'INR', projectRef: 'P-' + (100 + i), payVia: 'PAYROLL', hasReceipt: i % 3 !== 0,
        managerName: 'Asha Patel', managerActionAt: e[0] === 'SUBMITTED' ? '' : shift(d0, 2) + ' 11:00:00', managerRemark: '', hrName: e[1] === 'APPROVED' ? 'Ronak Mehta' : '',
        hrActionAt: e[1] === 'APPROVED' ? shift(d0, 3) + ' 12:00:00' : '', hrRemark: '', paidOn: e[0] === 'PAID' ? shift(d0, 20) : '', paidRef: e[0] === 'PAID' ? 'NEFT-' + i : '' } });
  }
  add(1, 'RESIGNATION', 12, 'PENDING', { status: 'Requested', stage: 'Waiting for HR', summary: 'Resignation · Higher studies', from: shift(TODAY, -12), to: shift(TODAY, 18), approver: 'HR',
    detail: { resignationDate: shift(TODAY, -12), requestedLastWorkingDate: shift(TODAY, 18), confirmedLastWorkingDate: '', noticePeriodDays: 30, reasonCategory: 'Higher studies' } });
  return rows.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
})();

const ROUTES = {
  'app.config': () => ({
    installed: true, version: '1.6.0', appName: 'AVP HRIS',
    orgName: 'AVP Structural Consultants',
    googleAuthUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
    loginHint: 'Use your employee code and the password HR shared with you.',
    serverTime: new Date().toISOString()
  }),
  'app.ping': () => ({ ok: true, at: new Date().toISOString() }),
  'auth.login': (p) => {
    if (!p.identifier) throw new Error('Enter your employee code or email.');
    if (String(p.password || '').length < 4) throw new Error('Incorrect password.');
    return { token: TOKEN, user: USER, mustChangePassword: false, needsOnboarding: false, expiresAt: shift(TODAY, 30) };
  },
  'auth.me': () => ({ user: USER }),
  'auth.logout': () => true,
  'app.bootstrap': () => BOOTSTRAP,
  'app.home': () => HOME,
  'app.session': () => ({ boot: BOOTSTRAP, home: HOME, notifications: HOME.notifications, serverTime: new Date().toISOString() }),
  'notify.list': () => HOME.notifications,
  'notify.read': () => true,
  'leave.types': () => BOOTSTRAP.leaveTypes,
  'leave.balance': () => BALANCE,
  'leave.list': () => REQUESTS,
  'leave.approvals': () => [REQUESTS[0]],
  'leave.calendar': () => [],
  'leave.holidays': () => HOME.upcomingHolidays,
  'leave.preview': () => ({ days: 1, paidDays: 1, lwpDays: 0, breakdown: [{ date: TODAY, units: 1, type: 'PL' }], warnings: [] }),
  'att.today': () => HOME.attendance,
  'att.month': () => ({ month: TODAY.slice(0, 7), days: [DAY], summary: HOME.attendance.monthSummary }),
  'att.snapshot': () => HOME.teamToday,
  'reg.list': () => [],
  'reg.pending': () => [],
  'compoff.list': () => [],
  'compoff.pending': () => [],
  'people.directory': () => DIRECTORY,
  'people.profile': (p) => PROFILE(p && p.employeeId),
  'people.org': () => ({ root: { employeeId: 'E0002', name: 'Asha Patel', initials: 'AP', designation: 'Principal Engineer', children: [] } }),
  'appraisals.team': () => [],
  'admin.performance.cycles.list': () => [],
  'recruit.myReferrals': () => [],
  'recruit.resume': () => ({ fileName: '', mimeType: '', dataBase64: '' }),
  'admin.recruit.pipeline': () => ({ stages: [], counts: {} }),
  'people.picklist': () => ({ departments: BOOTSTRAP.departments, designations: BOOTSTRAP.designations }),
  'expenses.mine': () => [],
  'expenses.categories': () => BOOTSTRAP.settings.expenseCategories,
  'expenses.pending': () => [],
  'notices.mine': () => HOME.notices,
  'tickets.mine': () => [],
  'payslips.mine': () => [],
  'payslips.summary': () => ({ rows: [], totals: {} }),
  'goals.mine': () => [],
  'appraisals.mine': () => [],
  'exit.mine': () => null,
  'assets.mine': () => [],
  'recruit.openings': () => [],
  'interviews.mine': () => [],
  'letters.mine': () => [],
  'letters.pendingSignatures': () => [],
  'admin.stats': () => ({ headcount: 30, exited: 2, probation: 3, departments: [{ name: 'Structural', count: 18 }], today: HOME.teamToday.counts, pendingLeave: 1, pendingRegularization: 0, locations: 2, geofenced: 2, pendingExpenses: 0, openTickets: 0, openJobs: 1, exitsInProgress: 0, assetsIssued: 12, missingSalaryStructures: 0, noticesPublished: 1 }),
  'admin.settings': () => ({ rows: [] }),
  'admin.locations': () => LOCATIONS.map((l) => ({ LocationId: l.id, Name: l.name, Address: l.address, Latitude: l.lat, Longitude: l.lng, RadiusMeters: l.radius, Active: 'TRUE' })),
  'admin.audit': () => [],
  'reports.approvals': (p) => {
    const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '';
    const from = ok(p.from), to = ok(p.to);
    const rows = APPROVAL_ROWS.filter((r) => (!from || r.requestedOn >= from) && (!to || r.requestedOn <= to));
    return { rows, total: rows.length, truncated: false, from, to, generatedAt: new Date().toISOString(),
      scope: { LEAVE: 'all', COMP_OFF: 'all', REGULARISATION: 'all', EXPENSE: 'all', RESIGNATION: 'all' } };
  }
};

/* Mirrors appBatch() in Rpc.gs: each entry is dispatched independently and
   gets its own envelope, so the client sees exactly the production shape. */
function batch(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map((c) => dispatch((c || {}).action, (c || {}).payload));
}

function dispatch(action, payload) {
  if (action === 'app.batch') return { ok: true, data: batch(payload && payload.calls), ms: 1 };
  const fn = ROUTES[action];
  if (!fn) return { ok: false, error: 'Unknown action: ' + action, code: 'ERROR' };
  try {
    return { ok: true, data: fn(payload || {}), ms: 1 };
  } catch (e) {
    return { ok: false, error: e.message, code: 'ERROR' };
  }
}

/* ------------------------------------------------------------------ static */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/__stats') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors()));
    return res.end(JSON.stringify(STATS));
  }

  if (url.pathname === '/exec') {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      return req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch (e) {}
        STATS.httpRequests++;
        STATS.actions += (parsed.action === 'app.batch' && parsed.payload && parsed.payload.calls)
          ? parsed.payload.calls.length : 1;
        const out = dispatch(parsed.action, parsed.payload);
        // Mimic Apps Script's latency so loading states are exercised.
        setTimeout(() => {
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors()));
          res.end(JSON.stringify(out));
        }, 120);
      });
    }
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors()));
    return res.end(JSON.stringify(dispatch(url.searchParams.get('action') || 'app.ping', {})));
  }

  let file = decodeURIComponent(url.pathname);
  if (file === '/' || file.endsWith('/')) file += 'index.html';
  const abs = path.join(ROOT, file);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found: ' + file);
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(abs).pipe(res);
}).listen(PORT, () => console.log('mock backend + site on http://localhost:' + PORT));

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };
}

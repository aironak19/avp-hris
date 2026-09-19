/* ==========================================================================
   People directory · Approvals inbox · Reports
   ========================================================================== */
(function () {
  var A = App;

  /* ------------------------------------------------------------- directory */
  A.registerView('people', {
    title: 'People',
    render: function (params) {
      var view = params.view || 'directory';
      var head =
        '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px">' +
        '<div><div class="kicker" id="peopleCount">Directory</div><h1 style="margin:0">People</h1></div>' +
        '<div class="row">' +
        '<div class="seg" style="width:auto">' +
        '<button data-act="view" data-view="directory" class="' + (view === 'directory' ? 'on' : '') + '">Directory</button>' +
        '<button data-act="view" data-view="org" class="' + (view === 'org' ? 'on' : '') + '">Org chart</button>' +
        '</div>' +
        '<a class="btn btn-secondary" href="#/openings">' + icon('briefcase') + ' Openings</a>' +
        (A.S.user.isHR ? '<button class="btn btn-primary" data-act="add">' + icon('plus') + ' Add person</button>' : '') +
        '</div></div>';

      if (view === 'org') return A.api('people.org').then(function (t) { return head + orgHtml(t); });

      return A.api('people.directory', { q: params.q || '', department: params.department || '' })
        .then(function (list) {
          var depts = {};
          list.forEach(function (p) { if (p.department) depts[p.department] = (depts[p.department] || 0) + 1; });
          return head +
            '<div class="row wrap" style="margin-bottom:14px;gap:8px">' +
            '<div class="field" style="margin:0;flex:1;min-width:220px"><input class="input" id="pplSearch" placeholder="Search name, code, designation…" value="' + A.esc(params.q || '') + '"></div>' +
            '<span class="tag ' + (!params.department ? 'tag-accent' : 'tag-neutral') + '" data-act="filter" data-department="" style="cursor:pointer">All ' + list.length + '</span>' +
            Object.keys(depts).sort().map(function (d) {
              return '<span class="tag ' + (params.department === d ? 'tag-accent' : 'tag-neutral') + '" data-act="filter" data-department="' + A.esc(d) + '" style="cursor:pointer">' + A.esc(d) + ' ' + depts[d] + '</span>';
            }).join('') +
            '</div>' +
            '<div class="tablewrap"><table class="tbl"><thead><tr>' +
            '<th style="width:34%">Name</th><th>Code</th><th>Department</th><th>Designation</th><th>Manager</th><th>Location</th><th>Status</th>' +
            '</tr></thead><tbody>' +
            list.map(function (p) {
              return '<tr class="clickable" data-act="open" data-id="' + p.employeeId + '">' +
                '<td><div class="row"><div class="avatar sm">' + A.esc(p.initials) + '</div>' +
                '<div style="line-height:1.25"><div style="font-weight:600">' + A.esc(p.name) + '</div>' +
                '<div class="small muted">' + A.esc(p.email || '—') + '</div></div></div></td>' +
                '<td class="small">' + A.esc(p.code) + '</td>' +
                '<td>' + A.esc(p.department || '—') + '</td>' +
                '<td class="small">' + A.esc(p.designation || '—') + '</td>' +
                '<td class="small">' + A.esc(p.managerName || '—') + '</td>' +
                '<td class="small">' + A.esc(p.locationName || '—') + '</td>' +
                '<td>' + statusChip(p) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        });
    },
    mount: function (host, params) {
      var s = document.getElementById('pplSearch');
      if (s) {
        var t = null;
        s.addEventListener('input', function () {
          clearTimeout(t);
          t = setTimeout(function () { A.go('people', { q: s.value, department: params.department || '' }); }, 400);
        });
      }
    },
    actions: {
      view: function (el) { A.go('people', { view: el.getAttribute('data-view') }); },
      filter: function (el) { A.go('people', { department: el.getAttribute('data-department'), q: A.S.params.q || '' }); },
      open: function (el) { A.go('me', { id: el.getAttribute('data-id') }); },
      add: function () { addPerson(); }
    }
  });

  function statusChip(p) {
    if (p.status === 'EXITED') return '<span class="tag tag-neutral">Exited</span>';
    if (p.onProbation || p.status === 'PROBATION') return '<span class="tag tag-warn">Probation</span>';
    return '<span class="tag tag-ok">Active</span>';
  }

  function orgHtml(nodes) {
    function branch(n, depth) {
      return '<div style="margin-left:' + (depth ? 22 : 0) + 'px;border-left:' + (depth ? '2px solid var(--line)' : '0') + ';padding-left:' + (depth ? 14 : 0) + 'px">' +
        '<div class="rowline" data-act="open" data-id="' + n.employeeId + '" style="cursor:pointer">' +
        '<div class="avatar sm">' + A.esc(n.initials) + '</div>' +
        '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(n.name) + '</div>' +
        '<div class="small muted">' + A.esc(n.designation || '') + (n.reports.length ? ' · ' + n.reports.length + ' report(s)' : '') + '</div></div>' +
        '</div>' + n.reports.map(function (r) { return branch(r, depth + 1); }).join('') + '</div>';
    }
    if (!nodes.length) return '<div class="empty">No reporting structure mapped yet.</div>';
    return '<div>' + nodes.map(function (n) { return branch(n, 0); }).join('') + '</div>';
  }

  function addPerson() {
    A.prompt('Add employee', [
      { name: 'EmployeeCode', label: 'Employee code', placeholder: 'EMP100' },
      { name: 'FullName', label: 'Full name' },
      { name: 'Email', label: 'Email (also used for "Sign in with Google")', type: 'email' },
      { name: 'Department', label: 'Department' },
      { name: 'Designation', label: 'Designation' },
      { name: 'JoinDate', label: 'Date of joining', type: 'date', value: A.todayStr() },
      { name: 'Gender', label: 'Gender', type: 'select', options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }] }
    ], 'Create').then(function (v) {
      if (!v) return;
      return A.api('people.save', v).then(function (r) {
        A.render();
        A.modal({
          title: 'Employee created — ' + (r.employeeCode || v.EmployeeCode),
          body: '<p>Share this one-time password with the employee in person. It is shown only once and they must change it at first sign-in.</p>' +
            '<div class="outline" style="text-align:center;font-size:28px;font-weight:800;letter-spacing:.06em">' + A.esc(r.defaultPassword) + '</div>' +
            '<p class="small muted mt2">Lost it? Use Administration → Overview → Reset employee password.</p>'
        });
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ------------------------------------------------------------- approvals */
  A.registerView('approvals', {
    title: 'Approvals',
    render: function () {
      return Promise.all([A.api('leave.approvals'), A.api('reg.pending'), A.api('compoff.pending')])
        .then(function (r) {
          var leaves = r[0], regs = r[1], cos = r[2];
          var total = leaves.length + regs.length + cos.length;
          return '' +
            '<div class="kicker">' + total + ' item(s) waiting on you</div><h1 style="margin:0 0 22px">Approvals</h1>' +
            '<div class="sect"><h3>Leave requests</h3><span class="tag tag-neutral">' + leaves.length + '</span></div>' +
            (leaves.length ? '<div class="list">' + leaves.map(function (l) {
              return '<div class="item"><div class="avatar">' + A.esc(l.initials) + '</div>' +
                '<div><div class="t">' + A.esc(l.employeeName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(l.type) + '</span></div>' +
                '<div class="s">' + A.pretty(l.from) + ' → ' + A.pretty(l.to) + ' · ' + A.days(l.days) +
                (l.lwpDays ? ' · <b>' + l.lwpDays + ' LWP</b>' : '') + (l.sandwichDays ? ' · incl. ' + l.sandwichDays + ' sandwich' : '') + '</div>' +
                '<div class="s muted">' + A.esc(l.reason || '') + '</div></div>' +
                '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="dl" data-id="' + l.id + '" data-d="REJECT">Decline</button>' +
                '<button class="btn btn-primary btn-sm" data-act="dl" data-id="' + l.id + '" data-d="APPROVE">Approve</button></div></div>';
            }).join('') + '</div>' : '<div class="empty">No leave requests waiting.</div>') +

            '<div class="sect mt4"><h3>Attendance regularization</h3><span class="tag tag-neutral">' + regs.length + '</span></div>' +
            (regs.length ? '<div class="list">' + regs.map(function (g) {
              return '<div class="item"><div class="avatar">' + A.esc(g.initials) + '</div>' +
                '<div><div class="t">' + A.esc(g.employeeName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(String(g.regType).replace(/_/g, ' ').toLowerCase()) + '</span></div>' +
                '<div class="s">' + A.pretty(g.date) + ' · ' + A.esc(g.checkIn || '—') + ' → ' + A.esc(g.checkOut || '—') + '</div>' +
                '<div class="s muted">' + A.esc(g.reason || '') + '</div></div>' +
                '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="dr" data-id="' + g.id + '" data-d="REJECT">Decline</button>' +
                '<button class="btn btn-primary btn-sm" data-act="dr" data-id="' + g.id + '" data-d="APPROVE">Approve</button></div></div>';
            }).join('') + '</div>' : '<div class="empty">No regularization requests waiting.</div>') +

            '<div class="sect mt4"><h3>Compensatory off claims</h3><span class="tag tag-neutral">' + cos.length + '</span></div>' +
            (cos.length ? '<div class="list">' + cos.map(function (c) {
              return '<div class="item"><div class="avatar">' + A.esc(c.initials) + '</div>' +
                '<div><div class="t">' + A.esc(c.employeeName) + '</div>' +
                '<div class="s">Worked ' + A.pretty(c.workedDate) + ' · ' + c.days + ' day(s) · valid till ' + A.pretty(c.expiry) + '</div>' +
                '<div class="s muted">' + A.esc(c.reason || '') + '</div></div>' +
                '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="dc" data-id="' + c.id + '" data-d="REJECT">Decline</button>' +
                '<button class="btn btn-primary btn-sm" data-act="dc" data-id="' + c.id + '" data-d="APPROVE">Approve</button></div></div>';
            }).join('') + '</div>' : '<div class="empty">No compensatory off claims waiting.</div>');
        });
    },
    actions: {
      dl: function (el) { Approvals.decideLeave(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      dr: function (el) { Approvals.decideReg(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      dc: function (el) { Approvals.decideCompOff(el.getAttribute('data-id'), el.getAttribute('data-d')); }
    }
  });

  /* --------------------------------------------------------------- reports */
  A.registerView('reports', {
    title: 'Reports',
    render: function (params) {
      var tab = params.tab || 'attendance';
      var month = params.month || A.monthKey();
      var head =
        '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px">' +
        '<div><div class="kicker">Payroll-ready registers</div><h1 style="margin:0">Reports</h1></div>' +
        '<div class="row noprint">' +
        '<div class="seg" style="width:auto">' +
        '<button data-act="tab" data-tab="attendance" class="' + (tab === 'attendance' ? 'on' : '') + '">Attendance</button>' +
        '<button data-act="tab" data-tab="today" class="' + (tab === 'today' ? 'on' : '') + '">Today</button>' +
        (A.S.user.isHR ? '<button data-act="tab" data-tab="leave" class="' + (tab === 'leave' ? 'on' : '') + '">Leave register</button>' : '') +
        '</div>' +
        '<button class="btn btn-secondary" data-act="print">' + icon('file') + ' Print</button>' +
        '<button class="btn btn-secondary" data-act="csv">' + icon('download') + ' CSV</button>' +
        '</div></div>';

      if (tab === 'today') {
        return A.api('att.snapshot', { date: params.date || A.todayStr(), scope: A.S.user.isHR ? 'all' : 'team' })
          .then(function (s) { return head + todayReport(s); });
      }
      if (tab === 'leave') {
        return A.api('leave.register', {}).then(function (l) { return head + leaveRegister(l); });
      }
      return A.api('att.matrix', { month: month }).then(function (m) { return head + matrixReport(m); });
    },
    actions: {
      tab: function (el) { A.go('reports', { tab: el.getAttribute('data-tab') }); },
      prevMonth: function () { A.go('reports', { tab: 'attendance', month: A.addMonthKey(A.S.params.month || A.monthKey(), -1) }); },
      nextMonth: function () { A.go('reports', { tab: 'attendance', month: A.addMonthKey(A.S.params.month || A.monthKey(), 1) }); },
      print: function () { window.print(); },
      csv: function () { exportCsv(); }
    }
  });

  function matrixReport(m) {
    var dayNums = m.dates.map(function (d) { return parseInt(d.slice(8), 10); });
    return '<div class="spread noprint" style="margin-bottom:12px">' +
      '<div class="row"><button class="iconbtn" data-act="prevMonth">' + icon('back') + '</button>' +
      '<h3 style="margin:0">' + A.esc(m.label) + '</h3>' +
      '<button class="iconbtn" data-act="nextMonth">' + icon('chevron') + '</button></div>' +
      '<div class="small muted">' + m.rows.length + ' employees</div></div>' +
      '<div class="tablewrap" id="reportTable"><table class="tbl" style="font-size:12px"><thead><tr>' +
      '<th style="position:sticky;left:0;background:var(--bg);min-width:170px">Employee</th>' +
      dayNums.map(function (n, i) {
        var wd = A.dow(m.dates[i]);
        return '<th style="text-align:center;padding:6px 3px' + (wd === 'Sun' ? ';color:var(--accent)' : '') + '">' + n + '<br><span style="font-size:9px">' + wd[0] + '</span></th>';
      }).join('') +
      '<th>P</th><th>L</th><th>A</th><th>Payable</th></tr></thead><tbody>' +
      m.rows.map(function (r) {
        return '<tr><td style="position:sticky;left:0;background:var(--bg)"><div style="font-weight:600">' + A.esc(r.name) + '</div>' +
          '<div class="small muted">' + A.esc(r.code) + ' · ' + A.esc(r.department || '') + '</div></td>' +
          r.days.map(function (d) {
            return '<td style="text-align:center;padding:4px 2px;' + cellStyle(d.status) + '">' + cellCode(d.status) + '</td>';
          }).join('') +
          '<td style="text-align:center;font-weight:700">' + (r.summary.present + r.summary.halfDay) + '</td>' +
          '<td style="text-align:center">' + r.summary.leave + '</td>' +
          '<td style="text-align:center;color:var(--accent)">' + r.summary.absent + '</td>' +
          '<td style="text-align:center;font-weight:800">' + r.summary.payableDays + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="legend">P present · H half day · L leave · A absent · O weekly off · F holiday · M missing punch · D on duty</div>';
  }

  function cellCode(s) {
    return { PRESENT: 'P', HALF_DAY: 'H', ABSENT: 'A', ON_LEAVE: 'L', HALF_DAY_LEAVE: 'L', WEEKLY_OFF: 'O', HOLIDAY: 'F', MISSING_PUNCH: 'M', ON_DUTY: 'D', WFH: 'W', NOT_MARKED: '·' }[s] || '·';
  }
  function cellStyle(s) {
    var m = {
      PRESENT: 'background:var(--ok-bg)', HALF_DAY: 'background:#fdf3dd', ABSENT: 'background:var(--err-bg);font-weight:700',
      ON_LEAVE: 'background:var(--a200)', HALF_DAY_LEAVE: 'background:var(--a200)', WEEKLY_OFF: 'background:var(--n200);color:var(--n600)',
      HOLIDAY: 'background:var(--n300)', MISSING_PUNCH: 'background:#fdf3dd;color:var(--warn)'
    };
    return m[s] || '';
  }

  function todayReport(s) {
    return '<div class="statstrip">' +
      '<div><div class="stat-label">Present</div><div class="stat-value">' + s.counts.present + '</div><div class="stat-sub">checked in</div></div>' +
      '<div><div class="stat-label">On leave</div><div class="stat-value">' + s.counts.leave + '</div><div class="stat-sub">approved</div></div>' +
      '<div><div class="stat-label">Absent</div><div class="stat-value">' + s.counts.absent + '</div><div class="stat-sub">no punch</div></div>' +
      '<div><div class="stat-label">Not marked</div><div class="stat-value">' + s.counts.notMarked + '</div><div class="stat-sub">yet to punch</div></div>' +
      '</div>' +
      '<div class="tablewrap mt3" id="reportTable"><table class="tbl"><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>In</th><th>Out</th><th>Late</th><th>Worked</th><th>Location</th><th>Distance</th></tr></thead><tbody>' +
      s.rows.map(function (r) {
        return '<tr><td><div class="row"><div class="avatar sm">' + A.esc(r.initials) + '</div><div>' +
          '<div style="font-weight:600">' + A.esc(r.name) + '</div><div class="small muted">' + A.esc(r.code) + '</div></div></div></td>' +
          '<td class="small">' + A.esc(r.department || '') + '</td><td>' + A.statusTag(r.status) + '</td>' +
          '<td>' + A.esc(r.checkIn || '—') + '</td><td>' + A.esc(r.checkOut || '—') + '</td>' +
          '<td>' + (r.late ? A.hm(r.late) : '—') + '</td><td>' + (r.worked ? A.hm(r.worked) : '—') + '</td>' +
          '<td class="small">' + A.esc(r.location || '—') + '</td>' +
          '<td class="small">' + (r.distance !== null && r.distance !== undefined ? r.distance + ' m' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function leaveRegister(list) {
    return '<div class="tablewrap" id="reportTable"><table class="tbl"><thead><tr>' +
      '<th>Employee</th><th>Code</th><th>Department</th><th>Earned</th><th>Taken</th><th>Pending</th><th>Available</th><th>LWP</th><th>Comp off</th><th>Status</th>' +
      '</tr></thead><tbody>' + list.map(function (r) {
        return '<tr><td style="font-weight:600">' + A.esc(r.name) + '</td><td class="small">' + A.esc(r.code) + '</td>' +
          '<td class="small">' + A.esc(r.department || '') + '</td>' +
          '<td>' + r.entitledToDate + '</td><td>' + r.consumed + '</td><td>' + r.pending + '</td>' +
          '<td style="font-weight:700">' + r.available + '</td>' +
          '<td' + (r.lwp ? ' style="color:var(--accent);font-weight:700"' : '') + '>' + r.lwp + '</td>' +
          '<td>' + r.compOff + '</td>' +
          '<td>' + (r.onProbation ? '<span class="tag tag-warn">Probation</span>' : '<span class="tag tag-ok">Eligible</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function exportCsv() {
    var table = document.querySelector('#reportTable table');
    if (!table) return A.toast('Nothing to export on this tab.', 'err');
    var rows = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      var cells = [];
      tr.querySelectorAll('th,td').forEach(function (td) {
        cells.push('"' + td.innerText.replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"');
      });
      rows.push(cells.join(','));
    });
    var csv = rows.join('\n');
    A.modal({
      title: 'Export CSV',
      wide: true,
      body: '<p class="small muted">Copy this and paste it into Excel or Google Sheets.</p>' +
        '<textarea class="input" id="csvBox" style="min-height:280px;font-family:ui-monospace,Menlo,monospace;font-size:12px">' + A.esc(csv) + '</textarea>',
      footer: '<button class="btn btn-secondary" onclick="App.close()">Close</button>' +
        '<button class="btn btn-primary" id="csvCopy">Copy to clipboard</button>',
      onMount: function (root) {
        root.querySelector('#csvCopy').onclick = function () {
          var box = root.querySelector('#csvBox');
          box.select();
          try { document.execCommand('copy'); A.toast('Copied.', 'ok'); }
          catch (e) { A.toast('Press Ctrl/Cmd+C to copy.', 'err'); }
        };
      }
    });
  }
})();

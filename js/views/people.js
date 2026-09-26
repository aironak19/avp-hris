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
        '<div class="page-head">' +
        '<div><div class="kicker" id="peopleCount">Directory</div><h1>People</h1></div>' +
        '<div class="row wrap">' +
        '<div class="seg" style="width:auto">' +
        '<button data-act="view" data-view="directory" class="' + (view === 'directory' ? 'on' : '') + '">Directory</button>' +
        '<button data-act="view" data-view="org" class="' + (view === 'org' ? 'on' : '') + '">Org chart</button>' +
        '</div>' +
        '<a class="btn btn-secondary" href="#/openings">' + icon('briefcase') + ' Openings</a>' +
        (A.S.user.isHR || A.can('people.manage') ? '<button class="btn btn-primary" data-act="add">' + icon('plus') + ' Add person</button>' : '') +
        '</div></div>';

      if (view === 'org') return A.api('people.org').then(function (t) { return head + '<div class="panel">' + orgHtml(t) + '</div>'; });

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
                '<td><div class="row" style="gap:6px">' + statusChip(p) + roleChip(p.role) + '</div></td></tr>';
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

  function roleChip(roleId) {
    if (!roleId || roleId === 'EMPLOYEE') return '';
    var r = (A.S.roles || []).filter(function (x) { return x.roleId === roleId; })[0];
    var name = r ? r.name : A.roleLabel(roleId), color = r ? r.color : '#1d5fd8';
    return '<span class="tag" style="background:' + A.esc(color) + '1a;color:' + A.esc(color) + '"><i class="swatch" style="background:' + A.esc(color) + '"></i>' + A.esc(name) + '</span>';
  }
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
  /**
   * Unified inbox: leave, regularisation, comp-off, expense claims and letters
   * to sign, in one list with filters, inline decisions and keyboard flow
   * (j/k move, a approve, r decline, o open). Decided cards slide away
   * without a full re-render.
   */
  var inboxFocus = 0;
  A.registerView('approvals', {
    title: 'Approvals',
    render: function (params) {
      var u = A.S.user;
      var canExp = u.isManager || A.can('expenses.approve') || A.can('expenses.manage');
      var calls = [
        A.api('leave.approvals').catch(function () { return []; }),
        A.api('reg.pending').catch(function () { return []; }),
        A.api('compoff.pending').catch(function () { return []; }),
        canExp ? A.api('expenses.pending').catch(function () { return []; }) : Promise.resolve([]),
        A.api('letters.pendingSignatures').catch(function () { return []; })
      ];
      return Promise.all(calls).then(function (r) {
        var items = [];
        (r[0] || []).forEach(function (l) {
          items.push({ kind: 'leave', icon: 'calendar', id: l.id, who: l.employeeName, initials: l.initials, title: A.esc(/leave/i.test(l.type || '') ? l.type : (l.type || '') + ' leave') + ' · ' + A.days(l.days),
            sub: A.pretty(l.from) + ' → ' + A.pretty(l.to) + (l.lwpDays ? ' · <b>' + l.lwpDays + ' LWP</b>' : '') + (l.sandwichDays ? ' · incl. ' + l.sandwichDays + ' sandwich' : ''),
            reason: l.reason, meta: [l.appliedAt ? 'Applied ' + A.relTime(l.appliedAt) : ''], act: 'dl', urgent: l.from && l.from <= A.todayStr() });
        });
        (r[1] || []).forEach(function (g) {
          items.push({ kind: 'regularisation', icon: 'edit', id: g.id, who: g.employeeName, initials: g.initials, title: A.esc(String(g.regType).replace(/_/g, ' ').toLowerCase()) + ' · ' + A.pretty(g.date),
            sub: A.esc(g.checkIn || '—') + ' → ' + A.esc(g.checkOut || '—') + (g.requestedStatus ? ' · marks as ' + A.esc(String(g.requestedStatus).replace(/_/g, ' ').toLowerCase()) : ''), reason: g.reason, meta: [], act: 'dr' });
        });
        (r[2] || []).forEach(function (c) {
          items.push({ kind: 'comp off', icon: 'sun', id: c.id, who: c.employeeName, initials: c.initials, title: c.days + ' day(s) comp off',
            sub: 'Worked ' + A.pretty(c.workedDate) + (c.expiry ? ' · valid till ' + A.pretty(c.expiry) : ''), reason: c.reason, meta: [], act: 'dc' });
        });
        (r[3] || []).forEach(function (c) {
          items.push({ kind: 'expense', icon: 'receipt', id: c.id, who: c.employeeName, initials: c.initials, title: '₹' + A.money(c.amount) + ' · ' + A.esc(c.category || ''),
            sub: A.esc(c.title || '') + ' · ' + A.pretty(c.expenseDate) + (c.projectRef ? ' · ' + A.esc(c.projectRef) : ''), reason: c.description, meta: [c.receipt || c.receiptFileName ? 'Receipt attached' : 'No receipt'], act: 'de', extra: c.receiptFileName || c.hasReceipt ? '<button class="btn btn-ghost btn-sm" data-act="receipt" data-id="' + c.id + '">' + icon('eye') + ' Receipt</button>' : '' });
        });
        (r[4] || []).forEach(function (sg) {
          items.push({ kind: 'signature', icon: 'pen', id: sg.letterId, who: sg.requesterName, initials: A.initials(sg.requesterName || 'HR'), title: A.esc(sg.templateName) + ' · for ' + A.esc(sg.recipientName),
            sub: 'Sent ' + A.relTime(sg.sentAt) + (sg.expiresAt ? ' · expires ' + A.pretty(String(sg.expiresAt).slice(0, 10)) : ''), reason: sg.message, meta: [], sign: true });
        });
        var filter = params.kind || 'all';
        var counts = {};
        items.forEach(function (i) { counts[i.kind] = (counts[i.kind] || 0) + 1; });
        var shown = items.filter(function (i) { return filter === 'all' || i.kind === filter; });
        var kinds = ['leave', 'regularisation', 'comp off', 'expense', 'signature'].filter(function (k) { return counts[k]; });
        inboxFocus = 0;
        return '' +
          A.pageHead('Approvals', items.length ? items.length + ' item' + (items.length === 1 ? '' : 's') + ' waiting on you · <span class="kbd">j</span> <span class="kbd">k</span> move, <span class="kbd">a</span> approve, <span class="kbd">r</span> decline' : 'Nothing waiting on you.', '', 'Inbox') +
          '<div class="subnav noprint">' +
          '<button data-act="kind" data-kind="all" class="' + (filter === 'all' ? 'on' : '') + '">All · ' + items.length + '</button>' +
          kinds.map(function (k) { return '<button data-act="kind" data-kind="' + k + '" class="' + (filter === k ? 'on' : '') + '">' + k.charAt(0).toUpperCase() + k.slice(1) + ' · ' + counts[k] + '</button>'; }).join('') +
          '</div>' +
          (shown.length ? '<div class="inbox" id="inbox">' + shown.map(function (i, idx) {
            return '<div class="card' + (idx === 0 ? ' is-focus' : '') + (i.urgent ? ' urgent' : '') + '" data-idx="' + idx + '" data-kind="' + i.kind + '" data-id="' + A.esc(i.id) + '" data-actk="' + (i.act || '') + '">' +
              '<div class="avatar' + (i.sign ? ' accent' : '') + '">' + (i.sign ? icon('pen') : A.esc(i.initials || '?')) + '</div>' +
              '<div><div class="kind">' + icon(i.icon) + i.kind + (i.urgent ? ' <span class="tag tag-warn" style="margin-left:6px">Starts today</span>' : '') + '</div>' +
              '<div class="t">' + A.esc(i.who) + ' <span class="muted" style="font-weight:400">· ' + i.title + '</span></div>' +
              '<div class="s">' + i.sub + '</div>' +
              (i.reason ? '<div class="s" style="font-style:italic">“' + A.esc(i.reason) + '”</div>' : '') +
              (i.meta.filter(Boolean).length ? '<div class="meta">' + i.meta.filter(Boolean).map(function (m) { return '<span class="tag tag-neutral">' + A.esc(m) + '</span>'; }).join('') + '</div>' : '') +
              '</div>' +
              '<div class="acts">' + (i.sign
                ? '<button class="btn btn-primary btn-sm" data-act="goto" data-route="sign" data-params=\'' + A.esc(JSON.stringify({ letter: i.id })) + '\'>' + icon('pen') + ' Review &amp; sign</button>'
                : '<button class="btn btn-ok btn-sm" data-act="' + i.act + '" data-id="' + A.esc(i.id) + '" data-d="APPROVE">' + icon('check') + ' Approve</button>' +
                  '<button class="btn btn-secondary btn-sm" data-act="' + i.act + '" data-id="' + A.esc(i.id) + '" data-d="REJECT">' + icon('x') + ' Decline</button>') +
              (i.extra || '') + '</div></div>';
          }).join('') + '</div>' : '<div class="panel">' + A.emptyState('checkcircle', filter === 'all' ? 'Inbox zero. Nothing needs your decision right now.' : 'No ' + filter + ' items waiting.') + '</div>');
      });
    },
    mount: function (host) {
      var onKey = function (e) {
        if (A.S.route !== 'approvals') { document.removeEventListener('keydown', onKey); return; }
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '') || document.querySelector('.backdrop, .cmdk-backdrop, .drawer')) return;
        var cards = host.querySelectorAll('#inbox .card'); if (!cards.length) return;
        if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); inboxFocus = Math.min(cards.length - 1, inboxFocus + 1); focusCard(cards); }
        else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); inboxFocus = Math.max(0, inboxFocus - 1); focusCard(cards); }
        else if (e.key === 'a' || e.key === 'r' || e.key === 'o' || e.key === 'Enter') {
          var c = cards[inboxFocus]; if (!c) return;
          var btn = e.key === 'a' ? c.querySelector('[data-d="APPROVE"]') : e.key === 'r' ? c.querySelector('[data-d="REJECT"]') : c.querySelector('.acts .btn');
          if (btn) { e.preventDefault(); btn.click(); }
        }
      };
      document.addEventListener('keydown', onKey);
    },
    actions: {
      kind: function (el) { A.go('approvals', { kind: el.getAttribute('data-kind') }); },
      dl: function (el) { decideCard(el, function () { return Approvals.decideLeave(el.getAttribute('data-id'), el.getAttribute('data-d')); }); },
      dr: function (el) { decideCard(el, function () { return Approvals.decideReg(el.getAttribute('data-id'), el.getAttribute('data-d')); }); },
      dc: function (el) { decideCard(el, function () { return Approvals.decideCompOff(el.getAttribute('data-id'), el.getAttribute('data-d')); }); },
      de: function (el) { decideCard(el, function () { return Approvals.decideExpense(el.getAttribute('data-id'), el.getAttribute('data-d')); }); },
      receipt: function (el) { A.api('expenses.receipt', { claimId: el.getAttribute('data-id') }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); }
    }
  });
  function focusCard(cards) {
    cards.forEach(function (c, i) { c.classList.toggle('is-focus', i === inboxFocus); });
    var c = cards[inboxFocus]; if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function decideCard(el, fn) {
    var card = el.closest('.card');
    Promise.resolve(fn()).then(function (done) {
      if (!done || !card) return;
      card.classList.add('leaving');
      setTimeout(function () {
        card.remove();
        A.S.pending = Math.max(0, (A.S.pending || 0) - 1); A.syncShellBadges && A.syncShellBadges();
        var cards = document.querySelectorAll('#inbox .card');
        if (!cards.length) A.render(); else { inboxFocus = Math.min(inboxFocus, cards.length - 1); focusCard(cards); }
      }, 280);
    });
  }

  /* --------------------------------------------------------------- reports */
  A.registerView('reports', {
    title: 'Reports',
    render: function (params) {
      var tab = params.tab || 'attendance';
      var month = params.month || A.monthKey();
      var head =
        '<div class="page-head">' +
        '<div><div class="kicker">Payroll-ready registers</div><h1>Reports</h1></div>' +
        '<div class="row wrap noprint">' +
        '<div class="seg" style="width:auto">' +
        '<button data-act="tab" data-tab="attendance" class="' + (tab === 'attendance' ? 'on' : '') + '">Attendance</button>' +
        '<button data-act="tab" data-tab="today" class="' + (tab === 'today' ? 'on' : '') + '">Today</button>' +
        (A.S.user.isHR || A.can('leave.manage') ? '<button data-act="tab" data-tab="leave" class="' + (tab === 'leave' ? 'on' : '') + '">Leave register</button>' : '') +
        '</div>' +
        '<button class="btn btn-secondary" data-act="print">' + icon('file') + ' Print</button>' +
        '<button class="btn btn-secondary" data-act="csv">' + icon('download') + ' CSV</button>' +
        '</div></div>';

      if (tab === 'today') {
        return A.api('att.snapshot', { date: params.date || A.todayStr(), scope: (A.S.user.isHR || A.can('attendance.manage')) ? 'all' : 'team' })
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
      '<th style="position:sticky;left:0;background:var(--sunken);min-width:170px">Employee</th>' +
      dayNums.map(function (n, i) {
        var wd = A.dow(m.dates[i]);
        return '<th style="text-align:center;padding:6px 3px' + (wd === 'Sun' ? ';color:var(--accent)' : '') + '">' + n + '<br><span style="font-size:9px">' + wd[0] + '</span></th>';
      }).join('') +
      '<th>P</th><th>L</th><th>A</th><th>Payable</th></tr></thead><tbody>' +
      m.rows.map(function (r) {
        return '<tr><td style="position:sticky;left:0;background:var(--surface)"><div style="font-weight:600">' + A.esc(r.name) + '</div>' +
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
      PRESENT: 'background:var(--ok-bg);color:var(--ok)', HALF_DAY: 'background:var(--warn-bg);color:var(--warn)', ABSENT: 'background:var(--err-bg);color:var(--err);font-weight:700',
      ON_LEAVE: 'background:var(--a200);color:var(--accent-ink)', HALF_DAY_LEAVE: 'background:var(--a200);color:var(--accent-ink)', WEEKLY_OFF: 'background:var(--sunken);color:var(--faint)',
      HOLIDAY: 'background:var(--n200)', MISSING_PUNCH: 'background:var(--warn-bg);color:var(--warn)', ON_DUTY: 'background:var(--info-bg);color:var(--info)', WFH: 'background:var(--info-bg);color:var(--info)'
    };
    return m[s] || '';
  }

  function todayReport(s) {
    return '<div class="statstrip">' +
      '<div><div class="stat-ic ok">' + icon('checkcircle') + '</div><div class="stat-label">Present</div><div class="stat-value"><span data-countup="' + s.counts.present + '">' + s.counts.present + '</span></div><div class="stat-sub">checked in</div></div>' +
      '<div><div class="stat-label">On leave</div><div class="stat-ic neutral">' + icon('calendar') + '</div><div class="stat-value"><span data-countup="' + s.counts.leave + '">' + s.counts.leave + '</span></div><div class="stat-sub">approved</div></div>' +
      '<div><div class="stat-ic warn">' + icon('xcircle') + '</div><div class="stat-label">Absent</div><div class="stat-value"><span data-countup="' + s.counts.absent + '">' + s.counts.absent + '</span></div><div class="stat-sub">no punch</div></div>' +
      '<div><div class="stat-ic info">' + icon('clock') + '</div><div class="stat-label">Not marked</div><div class="stat-value"><span data-countup="' + s.counts.notMarked + '">' + s.counts.notMarked + '</span></div><div class="stat-sub">yet to punch</div></div>' +
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
      footer: '<button class="btn btn-secondary" data-close="btn">Close</button>' +
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

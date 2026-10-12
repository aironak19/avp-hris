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
          A.pageHead('Approvals', items.length ? items.length + ' item' + (items.length === 1 ? '' : 's') + ' waiting on you · <span class="kbd">j</span> <span class="kbd">k</span> move, <span class="kbd">a</span> approve, <span class="kbd">r</span> decline' : 'Nothing waiting on you.',
            canApprovalReport() ? '<button class="btn btn-secondary noprint" data-act="goto" data-route="reports" data-params=\'{"tab":"approvals"}\' title="Every request that came in, decided or not, as a list and an Excel file">' + icon('download') + ' All requests · Excel</button>' : '', 'Inbox') +
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

  /* ==================================================================
     v3.1.7 — Excel export. A small, dependency-free .xlsx writer
     (Office Open XML parts in an uncompressed ZIP) so the download works
     the same on the app link and the Google Script page, offline too.
     Opens in Excel, Google Sheets, Numbers and LibreOffice.
     ================================================================== */
  var Xlsx = (function () {
    var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    function utf8(s) {
      if (enc) return enc.encode(s);
      var b = unescape(encodeURIComponent(s)), u = new Uint8Array(b.length);
      for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      return u;
    }
    var CRC = (function () {
      var t = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
      return t;
    })();
    function crc32(u) { var c = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

    /* Stored (uncompressed) ZIP — every spreadsheet app reads it. */
    function zip(files) {
      var now = new Date();
      var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
      var chunks = [], central = [], offset = 0;
      files.forEach(function (f) {
        var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
        var h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
        chunks.push(new Uint8Array(h.buffer), name, data);
        var c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
        c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        central.push(new Uint8Array(c.buffer), name);
        offset += 30 + name.length + data.length;
      });
      var cdSize = central.reduce(function (n, u) { return n + u.length; }, 0);
      var e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
      e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
      return new Blob(chunks.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    function x(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
    function ref(r, c) { return colName(c) + (r + 1); }

    /* Styles are plain objects ({ b, sz, color, fill, align, border, fmt, wrap, i }) — deduplicated into styles.xml. */
    function Styles() {
      var fonts = ['<font><sz val="10"/><color rgb="FF1F1C1B"/><name val="Calibri"/><family val="2"/></font>'];
      var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
      var borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
        '<border><left style="thin"><color rgb="FFDADCE0"/></left><right style="thin"><color rgb="FFDADCE0"/></right><top style="thin"><color rgb="FFDADCE0"/></top><bottom style="thin"><color rgb="FFDADCE0"/></bottom><diagonal/></border>',
        '<border><left/><right/><top style="medium"><color rgb="FF1F1C1B"/></top><bottom style="medium"><color rgb="FF1F1C1B"/></bottom><diagonal/></border>'];
      var fmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], memo = {};
      function idx(list, item) { var i = list.indexOf(item); if (i === -1) { list.push(item); i = list.length - 1; } return i; }
      var BUILTIN = { '0': 1, '0.00': 2, '#,##0': 3 };
      function id(st) {
        if (!st) return 0;
        var key = JSON.stringify(st);
        if (memo[key] != null) return memo[key];
        var font = '<font>' + (st.b ? '<b/>' : '') + (st.i ? '<i/>' : '') + '<sz val="' + (st.sz || 10) + '"/><color rgb="FF' + (st.color || '1F1C1B') + '"/><name val="Calibri"/><family val="2"/></font>';
        var fontId = idx(fonts, font);
        var fillId = st.fill ? idx(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + st.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
        var borderId = st.border === 'total' ? 2 : st.border ? 1 : 0;
        var numFmtId = 0;
        if (st.fmt) numFmtId = BUILTIN[st.fmt] || (164 + idx(fmts, st.fmt));
        var align = (st.align || st.wrap || st.valign) ? '<alignment' + (st.align ? ' horizontal="' + st.align + '"' : '') + ' vertical="' + (st.valign || 'center') + '"' + (st.wrap ? ' wrapText="1"' : '') + '/>' : '';
        var xf = '<xf numFmtId="' + numFmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' +
          (numFmtId ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '') + (align ? ' applyAlignment="1">' + align + '</xf>' : '/>');
        memo[key] = idx(xfs, xf);
        return memo[key];
      }
      function xml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          (fmts.length ? '<numFmts count="' + fmts.length + '">' + fmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + x(f) + '"/>'; }).join('') + '</numFmts>' : '') +
          '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
          '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
          '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
          '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
      }
      return { id: id, xml: xml };
    }

    /* sheet = { name, cols:[widths], rows:[{ h, cells:[cell] }], merges:[], freeze:{ row, col }, filter:'A5:F20', landscape, printRows:'$5:$6', tab }
       cell = null | { v, s:style, f:formula }   (numbers stay numbers; strings become inline text) */
    function sheetXml(sh, styles) {
      var out = [], maxC = 0;
      sh.rows.forEach(function (row, r) {
        if (!row) return;
        var cells = row.cells || [];
        maxC = Math.max(maxC, cells.length);
        var cx = cells.map(function (c, ci) {
          if (c == null) return '';
          var s = styles.id(c.s), a = ' r="' + ref(r, ci) + '"' + (s ? ' s="' + s + '"' : '');
          if (c.f) return '<c' + a + '><f>' + x(c.f) + '</f>' + (typeof c.v === 'number' ? '<v>' + c.v + '</v>' : '') + '</c>';
          if (c.v === '' || c.v == null) return s ? '<c' + a + '/>' : '';
          if (typeof c.v === 'number' && isFinite(c.v)) return '<c' + a + '><v>' + c.v + '</v></c>';
          return '<c' + a + ' t="inlineStr"><is><t xml:space="preserve">' + x(c.v) + '</t></is></c>';
        }).join('');
        out.push('<row r="' + (r + 1) + '"' + (row.h ? ' ht="' + row.h + '" customHeight="1"' : '') + '>' + cx + '</row>');
      });
      var dim = 'A1:' + ref(Math.max(0, sh.rows.length - 1), Math.max(0, maxC - 1));
      var pane = '';
      if (sh.freeze && (sh.freeze.row || sh.freeze.col)) {
        var tl = ref(sh.freeze.row || 0, sh.freeze.col || 0);
        var p = sh.freeze.row && sh.freeze.col ? 'bottomRight' : sh.freeze.row ? 'bottomLeft' : 'topRight';
        pane = '<pane' + (sh.freeze.col ? ' xSplit="' + sh.freeze.col + '"' : '') + (sh.freeze.row ? ' ySplit="' + sh.freeze.row + '"' : '') +
          ' topLeftCell="' + tl + '" activePane="' + p + '" state="frozen"/><selection pane="' + p + '" activeCell="' + tl + '" sqref="' + tl + '"/>';
      }
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheetPr>' + (sh.tab ? '<tabColor rgb="FF' + sh.tab + '"/>' : '') + '<pageSetUpPr fitToPage="1"/></sheetPr>' +
        '<dimension ref="' + dim + '"/>' +
        '<sheetViews><sheetView workbookViewId="0" showGridLines="0"' + (sh.zoom ? ' zoomScale="' + sh.zoom + '" zoomScaleNormal="' + sh.zoom + '"' : '') + '>' + pane + '</sheetView></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        (sh.cols && sh.cols.length ? '<cols>' + sh.cols.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '') +
        '<sheetData>' + out.join('') + '</sheetData>' +
        (sh.filter ? '<autoFilter ref="' + sh.filter + '"/>' : '') +
        (sh.merges && sh.merges.length ? '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
        '<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
        '<pageSetup paperSize="9" orientation="' + (sh.landscape ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0"/>' +
        '<headerFooter><oddFooter>&amp;L' + x(sh.footer || 'AVP HRIS') + '&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>' +
        '</worksheet>';
    }

    function build(book) {
      var styles = Styles();
      var sheets = book.sheets.map(function (sh) { return sheetXml(sh, styles); });
      var names = book.sheets.map(function (sh) { return String(sh.name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31); });
      var defined = [];
      book.sheets.forEach(function (sh, i) {
        var q = "'" + names[i].replace(/'/g, "''") + "'";
        if (sh.filter) defined.push('<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' + q + '!' + sh.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') + '</definedName>');
        if (sh.printRows) defined.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' + q + '!' + sh.printRows + '</definedName>');
      });
      var stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      var files = [
        { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
        { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
        { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<dc:title>' + x(book.title || '') + '</dc:title><dc:creator>AVP HRIS</dc:creator>' +
          '<dcterms:created xsi:type="dcterms:W3CDTF">' + stamp + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + stamp + '</dcterms:modified></cp:coreProperties>' },
        { name: 'docProps/app.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AVP HRIS</Application></Properties>' },
        { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
          names.map(function (n, i) { return '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
          (defined.length ? '<definedNames>' + defined.join('') + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
        { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
          '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' }
      ];
      sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s }); });
      files.push({ name: 'xl/styles.xml', data: styles.xml() });
      return zip(files);
    }

    function download(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a);
      try { a.click(); } catch (e) { window.open(url, '_blank'); }
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 60000);
    }

    /* Excel serials: days since 1899-12-30; times as a fraction of a day. */
    function dateSerial(ymd) { var p = String(ymd || '').split('-'); return p.length === 3 ? Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5 + 25569 : ''; }
    function timeSerial(hhmm) { var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? Math.round(((+m[1]) * 60 + (+m[2])) / 1440 * 1e9) / 1e9 : ''; }
    function minutesSerial(min) { return min ? Math.round(min / 1440 * 1e9) / 1e9 : ''; }

    return { build: build, download: download, colName: colName, ref: ref, dateSerial: dateSerial, timeSerial: timeSerial, minutesSerial: minutesSerial };
  })();
  App.xlsx = Xlsx;

  /* ---- report workbooks ---------------------------------------------------- */
  var XL = {
    ink: '1F1C1B', muted: '6B6563', accent: 'C8102E', head: '2B2725', band: 'F4F2F1', line: 'DADCE0',
    status: {
      PRESENT: { code: 'P', fill: 'E6F4EA', color: '1E7B34' }, HALF_DAY: { code: 'H', fill: 'FFF3D6', color: '8A5A00' },
      ABSENT: { code: 'A', fill: 'FCE4E4', color: 'C5221F' }, ON_LEAVE: { code: 'L', fill: 'EDE7F6', color: '5E35B1' },
      HALF_DAY_LEAVE: { code: 'HL', fill: 'EDE7F6', color: '5E35B1' }, WEEKLY_OFF: { code: 'O', fill: 'F1F3F4', color: '9AA0A6' },
      HOLIDAY: { code: 'F', fill: 'E8EAED', color: '5F6368' }, MISSING_PUNCH: { code: 'M', fill: 'FFE8CC', color: 'B45309' },
      ON_DUTY: { code: 'D', fill: 'E3F2FD', color: '1565C0' }, WFH: { code: 'W', fill: 'E3F2FD', color: '1565C0' },
      NOT_MARKED: { code: '', fill: null, color: 'BDBDBD' }
    }
  };
  function stTitle() { return { b: true, sz: 16, color: XL.ink }; }
  function stSub() { return { b: true, sz: 11, color: XL.accent }; }
  function stNote() { return { sz: 9, color: XL.muted }; }
  function stHead(align) { return { b: true, color: 'FFFFFF', fill: XL.head, border: true, align: align || 'center', wrap: true }; }
  function stText(extra) { return Object.assign({ border: true, align: 'left' }, extra || {}); }
  function stNum(extra) { return Object.assign({ border: true, align: 'center' }, extra || {}); }
  function stTotal(align, fmt) { return { b: true, fill: XL.band, border: 'total', align: align || 'center', fmt: fmt }; }
  function stStatus(s, b) { var d = XL.status[s] || XL.status.NOT_MARKED; return { b: b !== false, color: d.color, fill: d.fill || undefined, border: true, align: 'center' }; }
  function t(v, s) { return { v: v, s: s }; }
  function label(s) { return (A.STATUS_LABEL && A.STATUS_LABEL[s]) || String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }); }
  function stamp() {
    var d = new Date();
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function headerBlock(rows, merges, width, title, sub, note) {
    rows.push({ h: 24, cells: [t(title, stTitle())] }); merges.push('A1:' + Xlsx.ref(0, width - 1));
    rows.push({ h: 18, cells: [t(sub, stSub())] }); merges.push('A2:' + Xlsx.ref(1, width - 1));
    rows.push({ h: 15, cells: [t(note, stNote())] }); merges.push('A3:' + Xlsx.ref(2, width - 1));
    rows.push({ h: 8, cells: [] });
  }
  var ORG = function () { return window.ORG_NAME || 'AVP Structural Consultants'; };
  var WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  function weekday(ymd) { var p = ymd.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }

  /** Monthly register → Summary, Register (day grid) and Daily punches. */
  function attendanceBook(m) {
    var today = A.todayStr(), n = m.rows.length;
    /* -- Summary -- */
    var S = { name: 'Summary', tab: XL.accent, rows: [], merges: [], cols: [5, 26, 10, 16, 20, 9, 9, 9, 9, 10, 9, 9, 10, 11, 9], landscape: true, footer: ORG() + ' · Attendance ' + m.label };
    var sh = ['#', 'Employee', 'Code', 'Department', 'Designation', 'Present', 'Half days', 'Leave', 'Absent', 'Missing punch', 'Weekly off', 'Holidays', 'Payable days', 'Worked hours', 'Late days'];
    headerBlock(S.rows, S.merges, sh.length, ORG(), 'Attendance summary · ' + m.label,
      'Generated ' + stamp() + ' · ' + n + ' employee' + (n === 1 ? '' : 's') + ' · Payable days = present + ½ × half days + leave + weekly offs + holidays (+ ½ × missing punch)');
    S.rows.push({ h: 30, cells: sh.map(function (h, i) { return t(h, stHead(i === 1 || i === 3 || i === 4 ? 'left' : 'center')); }) });
    var first = S.rows.length;
    m.rows.forEach(function (r, i) {
      var s = r.summary || {};
      var zebra = i % 2 ? { fill: 'FAFAFA' } : {};
      S.rows.push({ h: 17, cells: [
        t(i + 1, stNum(Object.assign({ color: XL.muted }, zebra))), t(r.name, stText(Object.assign({ b: true }, zebra))), t(r.code || '', stNum(zebra)),
        t(r.department || '', stText(zebra)), t(r.designation || '', stText(zebra)),
        t(s.present || 0, stNum(zebra)), t(s.halfDay || 0, stNum(zebra)), t(s.leave || 0, stNum(zebra)),
        t(s.absent || 0, stNum(Object.assign({}, zebra, s.absent ? { b: true, color: 'C5221F' } : {}))),
        t(s.missingPunch || 0, stNum(Object.assign({}, zebra, s.missingPunch ? { b: true, color: 'B45309' } : {}))),
        t(s.weeklyOff || 0, stNum(zebra)), t(s.holiday || 0, stNum(zebra)),
        t(s.payableDays || 0, stNum({ b: true, fill: 'E6F4EA', fmt: '0.0' })),
        t(Xlsx.minutesSerial(s.workedMinutes || 0), stNum(Object.assign({ fmt: '[h]:mm' }, zebra))),
        t(s.late || 0, stNum(Object.assign({}, zebra, s.late ? { color: 'B45309' } : {})))
      ] });
    });
    var last = S.rows.length;
    if (n) {
      var tot = [t('', stTotal()), t('Total', stTotal('left')), t('', stTotal()), t('', stTotal()), t('', stTotal())];
      for (var c = 5; c < sh.length; c++) {
        var col = Xlsx.colName(c), sum = 0;
        for (var rr = first; rr < last; rr++) { var v = S.rows[rr].cells[c].v; sum += typeof v === 'number' ? v : 0; }
        tot.push({ f: 'SUM(' + col + (first + 1) + ':' + col + last + ')', v: Math.round(sum * 1e6) / 1e6, s: stTotal('center', c === 12 ? '0.0' : c === 13 ? '[h]:mm' : undefined) });
      }
      S.rows.push({ h: 20, cells: tot });
    }
    S.freeze = { row: first, col: 2 };
    S.filter = 'A' + first + ':' + Xlsx.colName(sh.length - 1) + last;
    S.printRows = '$' + first + ':$' + first;

    /* -- Register (day grid) -- */
    var D = m.dates.length;
    var R = { name: 'Register', tab: '1E7B34', rows: [], merges: [], landscape: true, zoom: 90, footer: ORG() + ' · Attendance register ' + m.label };
    R.cols = [24, 9, 13].concat(m.dates.map(function () { return 3.6; })).concat([5, 5, 5, 5, 5, 8]);
    var width = 3 + D + 6;
    headerBlock(R.rows, R.merges, width, ORG(), 'Daily attendance register · ' + m.label,
      'P Present · H Half day · L Leave (HL half-day leave) · A Absent · M Missing punch · D On duty · W Work from home · O Weekly off · F Holiday · Generated ' + stamp());
    var h1 = [t('Employee', stHead('left')), t('Code', stHead()), t('Department', stHead('left'))];
    var h2 = [t('', stHead()), t('', stHead()), t('', stHead())];
    m.dates.forEach(function (d) {
      var wd = weekday(d), weekend = wd === 0;
      var hs = Object.assign(stHead(), weekend ? { fill: '7A1F1A' } : {});
      h1.push(t(+d.slice(8), hs));
      h2.push(t(WD[wd], Object.assign({}, hs, { b: false, sz: 8 })));
    });
    ['P', 'H', 'L', 'A', 'M', 'Payable'].forEach(function (k) { h1.push(t(k, stHead())); h2.push(t('', stHead())); });
    var hr = R.rows.length;
    R.rows.push({ h: 18, cells: h1 }); R.rows.push({ h: 14, cells: h2 });
    [0, 1, 2].concat([3 + D, 4 + D, 5 + D, 6 + D, 7 + D, 8 + D]).forEach(function (c) { R.merges.push(Xlsx.ref(hr, c) + ':' + Xlsx.ref(hr + 1, c)); });
    m.rows.forEach(function (r, i) {
      var s = r.summary || {};
      var cells = [t(r.name, stText({ b: true })), t(r.code || '', stNum({ color: XL.muted })), t(r.department || '', stText({ color: XL.muted }))];
      r.days.forEach(function (d, k) {
        var date = d.date || m.dates[k];
        var st = date > today && d.status === 'NOT_MARKED' ? null : d.status;
        var code = st ? (XL.status[st] ? XL.status[st].code : '') : '';
        cells.push(t(code, st ? stStatus(st, st !== 'WEEKLY_OFF' && st !== 'NOT_MARKED') : stNum()));
      });
      cells.push(t(s.present || 0, stNum({ b: true, color: '1E7B34' })), t(s.halfDay || 0, stNum({ color: '8A5A00' })), t(s.leave || 0, stNum({ color: '5E35B1' })),
        t(s.absent || 0, stNum(s.absent ? { b: true, color: 'C5221F' } : {})), t(s.missingPunch || 0, stNum(s.missingPunch ? { color: 'B45309' } : {})),
        t(s.payableDays || 0, stNum({ b: true, fill: 'E6F4EA', fmt: '0.0' })));
      R.rows.push({ h: 17, cells: cells });
    });
    R.rows.push({ h: 10, cells: [] });
    var leg = [['PRESENT', 'Present'], ['HALF_DAY', 'Half day'], ['ON_LEAVE', 'Leave'], ['ABSENT', 'Absent'], ['MISSING_PUNCH', 'Missing punch'], ['ON_DUTY', 'On duty'], ['WFH', 'Work from home'], ['WEEKLY_OFF', 'Weekly off'], ['HOLIDAY', 'Holiday']];
    R.rows.push({ cells: [t('Legend', { b: true, sz: 9, color: XL.muted })] });
    leg.forEach(function (l) { R.rows.push({ h: 15, cells: [t(l[1], { sz: 9, color: XL.muted }), t(XL.status[l[0]].code, stStatus(l[0]))] }); });
    R.freeze = { row: hr + 2, col: 3 };
    R.printRows = '$' + (hr + 1) + ':$' + (hr + 2);

    /* -- Daily punches -- */
    var P = { name: 'Daily punches', tab: '1565C0', rows: [], merges: [], cols: [12, 6, 24, 9, 14, 15, 9, 9, 9, 8, 8, 18, 22], landscape: true, footer: ORG() + ' · Daily punches ' + m.label };
    var ph = ['Date', 'Day', 'Employee', 'Code', 'Department', 'Status', 'Check-in', 'Check-out', 'Worked', 'Late (min)', 'Early exit (min)', 'Location', 'Note'];
    headerBlock(P.rows, P.merges, ph.length, ORG(), 'Daily punches · ' + m.label,
      'One row per person per day up to today (weekly offs and holidays only when someone punched). Times are check-in / check-out; Worked is hours:minutes.');
    P.rows.push({ h: 30, cells: ph.map(function (h, i) { return t(h, stHead(i === 2 || i === 4 || i >= 11 ? 'left' : 'center')); }) });
    var pf = P.rows.length, DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    m.rows.forEach(function (r) {
      r.days.forEach(function (d, k) {
        var date = d.date || m.dates[k];
        if (date > today) return;
        var off = d.status === 'WEEKLY_OFF' || d.status === 'HOLIDAY';
        if (off && !d.in) return;
        var note = d.note || (d.leave ? String(d.leave).replace(/_/g, ' ').toLowerCase().replace(/^./, function (ch) { return ch.toUpperCase(); }) : '');
        P.rows.push({ h: 16, cells: [
          t(Xlsx.dateSerial(date), stNum({ fmt: 'dd-mmm-yyyy' })), t(DAYN[weekday(date)], stNum({ color: XL.muted })),
          t(r.name, stText({ b: true })), t(r.code || '', stNum({ color: XL.muted })), t(r.department || '', stText({ color: XL.muted })),
          t(label(d.status), stStatus(d.status, false)),
          t(Xlsx.timeSerial(d.in), stNum({ fmt: 'hh:mm' })), t(Xlsx.timeSerial(d.out), stNum({ fmt: 'hh:mm' })),
          t(Xlsx.minutesSerial(d.worked), stNum({ fmt: '[h]:mm' })),
          t(d.late || '', stNum(d.late ? { color: 'B45309' } : {})), t(d.early || '', stNum(d.early ? { color: 'B45309' } : {})),
          t(d.loc || '', stText()), t(note, stText({ color: XL.muted }))
        ] });
      });
    });
    if (P.rows.length === pf) P.rows.push({ cells: [t('No punches recorded for this month yet.', stNote())] });
    P.freeze = { row: pf, col: 0 };
    P.filter = 'A' + pf + ':' + Xlsx.colName(ph.length - 1) + Math.max(pf, P.rows.length);
    P.printRows = '$' + pf + ':$' + pf;
    return { title: 'Attendance ' + m.label, sheets: [S, R, P] };
  }

  /** One day: who is in, when, where. */
  function todayBook(s, ymd) {
    var pretty = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
    var T = { name: 'Day ' + ymd, tab: XL.accent, rows: [], merges: [], cols: [5, 26, 10, 16, 15, 10, 10, 9, 10, 20, 11], landscape: true, footer: ORG() + ' · Attendance ' + ymd };
    var h = ['#', 'Employee', 'Code', 'Department', 'Status', 'Check-in', 'Check-out', 'Late (min)', 'Worked', 'Location', 'Distance (m)'];
    var c = s.counts || {};
    headerBlock(T.rows, T.merges, h.length, ORG(), 'Attendance · ' + pretty,
      'Present ' + (c.present || 0) + ' · On leave ' + (c.leave || 0) + ' · Absent ' + (c.absent || 0) + ' · Not marked ' + (c.notMarked || 0) + ' · Generated ' + stamp());
    T.rows.push({ h: 28, cells: h.map(function (x2, i) { return t(x2, stHead(i === 1 || i === 3 || i === 9 ? 'left' : 'center')); }) });
    var f = T.rows.length;
    (s.rows || []).forEach(function (r, i) {
      T.rows.push({ h: 17, cells: [
        t(i + 1, stNum({ color: XL.muted })), t(r.name, stText({ b: true })), t(r.code || '', stNum({ color: XL.muted })), t(r.department || '', stText({ color: XL.muted })),
        t(label(r.status), stStatus(r.status, false)),
        t(Xlsx.timeSerial(r.checkIn), stNum({ fmt: 'hh:mm' })), t(Xlsx.timeSerial(r.checkOut), stNum({ fmt: 'hh:mm' })),
        t(r.late || '', stNum(r.late ? { color: 'B45309' } : {})), t(Xlsx.minutesSerial(r.worked), stNum({ fmt: '[h]:mm' })),
        t(r.location || '', stText()), t(r.distance != null && r.distance !== '' ? Number(r.distance) : '', stNum())
      ] });
    });
    T.freeze = { row: f, col: 2 };
    T.filter = 'A' + f + ':' + Xlsx.colName(h.length - 1) + Math.max(f, T.rows.length);
    T.printRows = '$' + f + ':$' + f;
    return { title: 'Attendance ' + ymd, sheets: [T] };
  }

  /** Leave balances for the financial year. */
  function leaveBook(list) {
    var L = { name: 'Leave register', tab: '5E35B1', rows: [], merges: [], cols: [5, 26, 10, 16, 20, 12, 9, 9, 11, 9, 10, 12], landscape: true, footer: ORG() + ' · Leave register' };
    var h = ['#', 'Employee', 'Code', 'Department', 'Designation', 'Earned to date', 'Taken', 'Pending', 'Available', 'LWP', 'Comp off', 'Status'];
    headerBlock(L.rows, L.merges, h.length, ORG(), 'Leave register', 'Days, as of ' + stamp() + ' · LWP = leave without pay');
    L.rows.push({ h: 28, cells: h.map(function (x2, i) { return t(x2, stHead(i === 1 || i === 3 || i === 4 ? 'left' : 'center')); }) });
    var f = L.rows.length;
    list.forEach(function (r, i) {
      L.rows.push({ h: 17, cells: [
        t(i + 1, stNum({ color: XL.muted })), t(r.name, stText({ b: true })), t(r.code || '', stNum({ color: XL.muted })), t(r.department || '', stText({ color: XL.muted })), t(r.designation || '', stText({ color: XL.muted })),
        t(+r.entitledToDate || 0, stNum({ fmt: '0.0' })), t(+r.consumed || 0, stNum({ fmt: '0.0' })), t(+r.pending || 0, stNum({ fmt: '0.0' })),
        t(+r.available || 0, stNum({ b: true, fill: 'E6F4EA', fmt: '0.0' })), t(+r.lwp || 0, stNum(Object.assign({ fmt: '0.0' }, +r.lwp ? { b: true, color: 'C5221F' } : {}))),
        t(+r.compOff || 0, stNum({ fmt: '0.0' })), t(r.onProbation ? 'Probation' : 'Eligible', stStatus(r.onProbation ? 'HALF_DAY' : 'PRESENT', false))
      ] });
    });
    var last = L.rows.length;
    if (list.length) {
      var tot = [t('', stTotal()), t('Total', stTotal('left')), t('', stTotal()), t('', stTotal()), t('', stTotal())];
      for (var c = 5; c <= 10; c++) {
        var col = Xlsx.colName(c), sum = 0;
        for (var rr = f; rr < last; rr++) sum += L.rows[rr].cells[c].v || 0;
        tot.push({ f: 'SUM(' + col + (f + 1) + ':' + col + last + ')', v: Math.round(sum * 100) / 100, s: stTotal('center', '0.0') });
      }
      tot.push(t('', stTotal()));
      L.rows.push({ h: 20, cells: tot });
    }
    L.freeze = { row: f, col: 2 };
    L.filter = 'A' + f + ':' + Xlsx.colName(h.length - 1) + last;
    L.printRows = '$' + f + ':$' + f;
    return { title: 'Leave register', sheets: [L] };
  }

  /* ==================================================================
     v3.3 — Approval requests: every request that came in (leave,
     regularisation incl. punches without location, comp off, expenses,
     resignations), whatever became of it. HR and admins only: the one
     server read (reports.approvals) enforces that; this screen only
     filters and lays it out, on the page and as an Excel workbook.
     ================================================================== */
  var AP_KINDS = ['LEAVE', 'REGULARISATION', 'COMP_OFF', 'EXPENSE', 'RESIGNATION'];
  var AP_KIND = { LEAVE: 'Leave', REGULARISATION: 'Regularisation', COMP_OFF: 'Comp off', EXPENSE: 'Expense', RESIGNATION: 'Resignation' };
  var AP_KIND_SHEET = { LEAVE: 'Leave', REGULARISATION: 'Regularisation', COMP_OFF: 'Comp off', EXPENSE: 'Expenses', RESIGNATION: 'Resignations' };
  var AP_KIND_TAB = { LEAVE: '5E35B1', REGULARISATION: '1565C0', COMP_OFF: '8A5A00', EXPENSE: '1E7B34', RESIGNATION: 'C5221F' };
  var AP_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
  var AP_STATE = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Declined', CANCELLED: 'Cancelled' };
  var AP_STATE_XL = {
    PENDING: { fill: 'FFF3D6', color: '8A5A00' }, APPROVED: { fill: 'E6F4EA', color: '1E7B34' },
    REJECTED: { fill: 'FCE4E4', color: 'C5221F' }, CANCELLED: { fill: 'F1F3F4', color: '5F6368' }
  };
  var AP_PERIODS = [['month', 'This month'], ['last', 'Last month'], ['3m', 'Last 90 days'], ['fy', 'This financial year'], ['all', 'All time'], ['custom', 'Custom dates']];
  var AP_SCREEN_ROWS = 300;   // the page shows this many; the Excel always has them all

  /** HR and admins only (the server enforces it; this just hides the door from everyone else). */
  function canApprovalReport() {
    var u = A.S.user || {};
    return !!(u.isHR || A.can('leave.manage') || A.can('attendance.manage') || A.can('expenses.manage') || A.can('exit.manage'));
  }
  function isYmd(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
  function ymdOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  /** The dates a period stands for. The financial year starts on 1 April. */
  function apRange(p) {
    var period = p.period || '3m', now = new Date(), today = A.todayStr(), from = '', to = today;
    if (period === 'all') { to = ''; }
    else if (period === 'custom') {
      from = isYmd(p.from) ? p.from : ''; to = isYmd(p.to) ? p.to : '';
      if (from && to && from > to) { var sw = from; from = to; to = sw; }
    }
    else if (period === 'month') from = today.slice(0, 8) + '01';
    else if (period === 'last') {
      var k = A.addMonthKey(A.monthKey(), -1);
      from = k + '-01'; to = k + '-' + String(new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate()).padStart(2, '0');
    }
    else if (period === 'fy') from = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + '-04-01';
    else { period = '3m'; from = ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89, 12)); }
    return { period: period, from: from, to: to };
  }
  function apRangeLabel(range) {
    if (!range.from && !range.to) return 'All time';
    if (range.from && range.to) return A.pretty(range.from) + ' – ' + A.pretty(range.to);
    return range.from ? 'From ' + A.pretty(range.from) : 'Up to ' + A.pretty(range.to);
  }
  function apCount(rows, field) { var c = {}; rows.forEach(function (r) { c[r[field]] = (c[r[field]] || 0) + 1; }); return c; }
  function apGo(patch) {
    var p = {}, cur = A.S.params || {};
    ['period', 'from', 'to', 'kind', 'status'].forEach(function (k) { if (cur[k]) p[k] = cur[k]; });
    Object.keys(patch).forEach(function (k) { if (patch[k]) p[k] = patch[k]; else delete p[k]; });
    p.tab = 'approvals';
    A.go('reports', p);
  }
  /** Which requests the answer covers: every employee's, for the types this role may manage. */
  function apScopeLabel(scope) {
    var have = AP_KINDS.filter(function (k) { return (scope || {})[k]; });
    if (!have.length) return '';
    return 'All employees' + (have.length < AP_KINDS.length ? ' (' + have.map(function (k) { return AP_KIND_SHEET[k].toLowerCase(); }).join(', ') + ')' : '');
  }
  function apQty(r) {
    if (r.kind === 'EXPENSE') return '₹' + A.money(r.amount);
    if (r.days !== '' && r.days !== undefined && r.days !== null) return A.days(r.days);
    return '';
  }
  function apClip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function approvalsReport(data, view) {
    var rows = view.rows, all = data.rows || [];
    var byKind = apCount(all.filter(function (r) { return view.status === 'all' || r.state === view.status; }), 'kind');
    var byState = apCount(all.filter(function (r) { return view.kind === 'all' || r.kind === view.kind; }), 'state');
    var kinds = AP_KINDS.filter(function (k) { return (data.scope || {})[k]; });
    var kindTotal = kinds.reduce(function (n, k) { return n + (byKind[k] || 0); }, 0);
    var tiles = [['PENDING', 'warn', 'clock', 'waiting for a decision'], ['APPROVED', 'ok', 'checkcircle', 'granted'], ['REJECTED', 'warn', 'xcircle', 'not approved'], ['CANCELLED', 'neutral', 'x', 'withdrawn or cancelled']];
    var today = A.todayStr();

    var filters =
      '<div class="row wrap noprint" style="gap:10px;align-items:center;margin-bottom:4px">' +
      '<select class="input" style="width:auto" data-change="apPeriod" aria-label="Period">' +
      AP_PERIODS.map(function (p) { return '<option value="' + p[0] + '"' + (view.range.period === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select>' +
      (view.range.period === 'custom'
        ? '<input class="input" style="width:auto" type="date" data-change="apFrom" aria-label="From" value="' + A.esc(view.range.from) + '" max="' + today + '">' +
          '<span class="small muted">to</span>' +
          '<input class="input" style="width:auto" type="date" data-change="apTo" aria-label="To" value="' + A.esc(view.range.to) + '" max="' + today + '">'
        : '') +
      '<span class="small muted">' + A.esc(apRangeLabel(view.range)) + ' · by the day the request was made · ' + A.esc(apScopeLabel(data.scope)) + '</span>' +
      '</div>' +
      '<div class="subnav noprint">' +
      '<button data-act="apKind" data-kind="all" class="' + (view.kind === 'all' ? 'on' : '') + '">All types · ' + kindTotal + '</button>' +
      kinds.map(function (k) { return '<button data-act="apKind" data-kind="' + k + '" class="' + (view.kind === k ? 'on' : '') + '">' + AP_KIND[k] + ' · ' + (byKind[k] || 0) + '</button>'; }).join('') +
      '</div>';

    var strip = '<div class="statstrip noprint">' + tiles.map(function (s) {
      var n = byState[s[0]] || 0, on = view.status === s[0];
      return '<div data-act="apStatus" data-status="' + s[0] + '" title="Show only ' + AP_STATE[s[0]].toLowerCase() + ' requests"' + (on ? ' style="outline:2px solid var(--accent);outline-offset:-2px"' : '') + '>' +
        '<div class="stat-ic ' + s[1] + '">' + icon(s[2]) + '</div><div class="stat-label">' + AP_STATE[s[0]] + '</div>' +
        '<div class="stat-value"><span data-countup="' + n + '">' + n + '</span></div><div class="stat-sub">' + s[3] + '</div></div>';
    }).join('') + '</div>';

    var note = '<div class="spread mt3" style="margin-bottom:10px"><div class="small muted">' +
      (rows.length ? rows.length + ' request' + (rows.length === 1 ? '' : 's') + (rows.length > AP_SCREEN_ROWS ? ' — the first ' + AP_SCREEN_ROWS + ' are shown here; the Excel file has all of them' : '') : 'No requests match') +
      (view.status !== 'all' ? ' · ' + AP_STATE[view.status].toLowerCase() + ' only' : '') +
      (data.truncated ? ' · <b>Only the newest ' + all.length + ' of ' + data.total + ' were loaded — choose a shorter period to get the rest</b>' : '') +
      '</div>' + (view.status !== 'all' || view.kind !== 'all' ? '<button class="btn btn-ghost btn-sm noprint" data-act="apClear">Clear filters</button>' : '') + '</div>';

    if (!rows.length) return filters + strip + note + '<div class="panel">' + A.emptyState('inbox', all.length ? 'Nothing matches these filters.' : 'No approval requests were made in this period.') + '</div>';

    var table = '<div class="tablewrap" id="reportTable"><table class="tbl"><thead><tr>' +
      '<th>Requested</th><th style="min-width:150px">Employee</th><th>Type</th><th style="min-width:230px">Request</th><th>For</th><th style="min-width:120px">Status</th><th style="min-width:120px">Approver</th><th style="min-width:140px">Remark</th></tr></thead><tbody>' +
      rows.slice(0, AP_SCREEN_ROWS).map(function (r) {
        var when = r.from ? (r.to && r.to !== r.from ? A.shortD(r.from) + ' → ' + A.pretty(r.to) : A.pretty(r.from)) : '—';
        var qty = apQty(r);
        return '<tr>' +
          '<td class="small" style="white-space:nowrap">' + (r.requestedOn ? A.pretty(r.requestedOn) : '—') + '<div class="muted">' + A.esc(String(r.requestedAt || '').slice(11, 16)) + '</div></td>' +
          '<td><div style="font-weight:600">' + A.esc(r.employeeName) + '</div><div class="small muted">' + A.esc([r.employeeCode, r.department].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td class="small">' + AP_KIND[r.kind] + '</td>' +
          '<td><div>' + A.esc(r.summary) + (qty ? ' · <b>' + A.esc(qty) + '</b>' : '') + '</div>' + (r.reason ? '<div class="small muted" style="font-style:italic;max-width:320px">' + A.esc(apClip(r.reason, 110)) + '</div>' : '') + '</td>' +
          '<td class="small" style="white-space:nowrap">' + when + '</td>' +
          '<td><span class="tag ' + ({ PENDING: 'tag-warn', APPROVED: 'tag-ok', REJECTED: 'tag-err', CANCELLED: 'tag-neutral' }[r.state] || 'tag-neutral') + '">' + (AP_STATE[r.state] || A.esc(r.state)) + '</span>' +
          (r.stage && r.stage !== AP_STATE[r.state] ? '<div class="small muted" style="margin-top:3px">' + A.esc(r.stage) + '</div>' : '') + '</td>' +
          '<td class="small">' + A.esc(r.state === 'PENDING' ? '' : r.approver || '') + (r.decidedOn ? '<div class="muted">' + A.pretty(r.decidedOn) + '</div>' : '') + '</td>' +
          '<td class="small muted" style="max-width:220px">' + A.esc(apClip(r.remark, 90)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return filters + strip + note + table;
  }

  /* ---- the workbook: Summary · By employee · All requests · one sheet per type ---- */
  function approvalsBook(data, rows, meta) {
    var today = A.todayStr();
    function z(i) { return i % 2 ? { fill: 'FAFAFA' } : {}; }
    function txt(v, i, extra) { return t(v === undefined || v === null ? '' : v, stText(Object.assign({}, z(i), extra || {}))); }
    function num(v, i, fmt, extra) { return t(v === '' || v === undefined || v === null ? '' : v, stNum(Object.assign({}, z(i), fmt ? { fmt: fmt } : {}, extra || {}))); }
    function date(v, i) { return t(Xlsx.dateSerial(isYmd(v) ? v : ''), stNum(Object.assign({ fmt: 'dd-mmm-yyyy' }, z(i)))); }
    function time(v, i) { return t(Xlsx.timeSerial(v), stNum(Object.assign({ fmt: 'hh:mm' }, z(i)))); }
    function state(r) { var d = AP_STATE_XL[r.state] || AP_STATE_XL.CANCELLED; return t(AP_STATE[r.state] || r.state, { b: true, color: d.color, fill: d.fill, border: true, align: 'center' }); }
    function daysBetween(a, b) { return isYmd(a) && isYmd(b) ? Math.round((Xlsx.dateSerial(b) - Xlsx.dateSerial(a))) : ''; }
    /** Decided: days it took. Still pending: days it has been waiting (shown in amber). */
    function taken(r, i) {
      if (r.state === 'PENDING') { var w = daysBetween(r.requestedOn, today); return num(w === '' ? '' : Math.max(0, w), i, '0', { b: true, color: '8A5A00' }); }
      var d = daysBetween(r.requestedOn, r.decidedOn); return num(d === '' ? '' : Math.max(0, d), i, '0');
    }
    var c0 = [
      { h: '#', w: 5, cell: function (r, i) { return num(i + 1, i, null, { color: XL.muted }); } },
      { h: 'Request ID', w: 13, cell: function (r, i) { return num(r.id, i, null, { color: XL.muted }); } }
    ];
    var who = [
      { h: 'Employee', w: 24, left: true, cell: function (r, i) { return txt(r.employeeName, i, { b: true }); } },
      { h: 'Code', w: 10, cell: function (r, i) { return num(r.employeeCode, i, null, { color: XL.muted }); } },
      { h: 'Department', w: 16, left: true, cell: function (r, i) { return txt(r.department, i, { color: XL.muted }); } }
    ];
    var tail = [
      { h: 'Status', w: 12, cell: function (r) { return state(r); } },
      { h: 'Stage', w: 28, left: true, cell: function (r, i) { return txt(r.stage, i, { color: XL.muted }); } },
      { h: 'Approver', w: 20, left: true, cell: function (r, i) { return txt(r.approver, i); } },
      { h: 'Decided on', w: 13, cell: function (r, i) { return date(r.decidedOn, i); } },
      { h: 'Days taken (waiting, if pending)', w: 14, cell: taken },
      { h: 'Remark', w: 30, left: true, cell: function (r, i) { return txt(r.remark, i); } }
    ];
    function requested(label) { return { h: label || 'Requested on', w: 13, cell: function (r, i) { return date(r.requestedOn, i); } }; }
    function reason(w) { return { h: 'Reason', w: w || 36, left: true, cell: function (r, i) { return txt(r.reason, i); } }; }
    function d(r) { return r.detail || {}; }

    function sheet(name, tab, sub, cols, list, opts) {
      opts = opts || {};
      var S = { name: name, tab: tab, rows: [], merges: [], cols: cols.map(function (c) { return c.w; }), landscape: true, footer: ORG() + ' · ' + sub };
      headerBlock(S.rows, S.merges, cols.length, ORG(), sub, meta.note + ' · ' + list.length + ' request' + (list.length === 1 ? '' : 's') + ' on this sheet');
      S.rows.push({ h: 30, cells: cols.map(function (c) { return t(c.h, stHead(c.left ? 'left' : 'center')); }) });
      var f = S.rows.length;
      list.forEach(function (r, i) { S.rows.push({ h: 17, cells: cols.map(function (c) { return c.cell(r, i); }) }); });
      var last = S.rows.length;
      if (list.length && opts.sum) {
        S.rows.push({ h: 20, cells: cols.map(function (c, ci) {
          if (ci === 2) return t('Total', stTotal('left'));
          if (!c.sum) return t('', stTotal());
          var col = Xlsx.colName(ci), total = 0;
          for (var rr = f; rr < last; rr++) total += +S.rows[rr].cells[ci].v || 0;
          return { f: 'SUM(' + col + (f + 1) + ':' + col + last + ')', v: Math.round(total * 100) / 100, s: stTotal('center', c.sum) };
        }) });
      }
      S.freeze = { row: f, col: opts.freezeCol === undefined ? 3 : opts.freezeCol };
      if (list.length) S.filter = 'A' + f + ':' + Xlsx.colName(cols.length - 1) + last;
      S.printRows = '$' + f + ':$' + f;
      return S;
    }
    function of(kind) { return rows.filter(function (r) { return r.kind === kind; }); }

    /* -- Summary -- */
    var kinds = AP_KINDS.filter(function (k) { return (data.scope || {})[k] && (!meta.kind || meta.kind === 'all' || meta.kind === k); });
    var SM = { name: 'Summary', tab: XL.accent, rows: [], merges: [], cols: [22, 11, 11, 11, 11, 11, 16, 18], footer: ORG() + ' · Approval requests' };
    var sh = ['Type of request', 'Total', 'Pending', 'Approved', 'Declined', 'Cancelled', 'Days requested', 'Amount claimed (₹)'];
    headerBlock(SM.rows, SM.merges, sh.length, ORG(), 'Approval requests · ' + meta.range, meta.note + ' · ' + rows.length + ' request' + (rows.length === 1 ? '' : 's'));
    SM.rows.push({ h: 30, cells: sh.map(function (h, i) { return t(h, stHead(i === 0 ? 'left' : 'center')); }) });
    var sf = SM.rows.length;
    kinds.forEach(function (k, i) {
      var list = of(k), c = apCount(list, 'state');
      var daysSum = list.reduce(function (n, r) { return n + (+r.days || 0); }, 0), amt = list.reduce(function (n, r) { return n + (+r.amount || 0); }, 0);
      SM.rows.push({ h: 18, cells: [
        txt(AP_KIND_SHEET[k], i, { b: true }), num(list.length, i, '0', { b: true }),
        num(c.PENDING || 0, i, '0', c.PENDING ? { b: true, color: AP_STATE_XL.PENDING.color } : {}), num(c.APPROVED || 0, i, '0'),
        num(c.REJECTED || 0, i, '0', c.REJECTED ? { color: AP_STATE_XL.REJECTED.color } : {}), num(c.CANCELLED || 0, i, '0'),
        num(k === 'LEAVE' || k === 'COMP_OFF' ? Math.round(daysSum * 100) / 100 : '', i, '0.0'), num(k === 'EXPENSE' ? Math.round(amt * 100) / 100 : '', i, '#,##0.00')
      ] });
    });
    var sl = SM.rows.length;
    if (kinds.length) {
      var tot = [t('Total', stTotal('left'))];
      for (var ci = 1; ci <= 7; ci++) {
        var col = Xlsx.colName(ci), sum = 0;
        for (var rr = sf; rr < sl; rr++) sum += +SM.rows[rr].cells[ci].v || 0;
        tot.push({ f: 'SUM(' + col + (sf + 1) + ':' + col + sl + ')', v: Math.round(sum * 100) / 100, s: stTotal('center', ci === 7 ? '#,##0.00' : ci === 6 ? '0.0' : '0') });
      }
      SM.rows.push({ h: 20, cells: tot });
    }
    SM.rows.push({ h: 10, cells: [] });
    [['Period', meta.range + ' (by the day each request was made)'], ['Filters', meta.filters], ['Covers', meta.scope], ['Days taken', 'For a decided request, days from request to decision. For a pending one, days it has been waiting as of ' + A.pretty(today) + '.'],
      ['Expense claims', 'Pending covers claims waiting for the manager and claims the manager approved that wait for HR. Approved covers claims approved and claims already paid.'],
      ['Sheets', 'By employee · All requests · then one sheet per type of request with every detail.']
    ].forEach(function (line) {
      SM.rows.push({ h: line[1].length > 110 ? 26 : 15, cells: [t(line[0], { b: true, sz: 9, color: XL.ink, valign: 'top' }), t(line[1], { sz: 9, color: XL.muted, wrap: true, valign: 'top', align: 'left' })] });
      SM.merges.push('B' + SM.rows.length + ':' + Xlsx.colName(sh.length - 1) + SM.rows.length);
    });
    SM.freeze = { row: sf, col: 0 };

    /* -- By employee -- */
    var people = {}, order = [];
    rows.forEach(function (r) {
      var key = r.employeeId || r.employeeName;
      if (!people[key]) { people[key] = { employeeName: r.employeeName, employeeCode: r.employeeCode, department: r.department, n: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, days: 0, amount: 0 }; order.push(key); }
      var p = people[key]; p.n++; p[r.state] = (p[r.state] || 0) + 1;
      if (r.kind === 'LEAVE' && r.state === 'APPROVED') p.days += +r.days || 0;
      if (r.kind === 'EXPENSE' && r.state !== 'REJECTED' && r.state !== 'CANCELLED') p.amount += +r.amount || 0;
    });
    var plist = order.map(function (k) { return people[k]; }).sort(function (a, b) { return String(a.employeeName).localeCompare(String(b.employeeName)); });
    var BE = sheet('By employee', '6B6563', 'Approval requests by employee · ' + meta.range, [
      { h: '#', w: 5, cell: function (r, i) { return num(i + 1, i, null, { color: XL.muted }); } }].concat(who, [
      { h: 'Requests', w: 10, sum: '0', cell: function (r, i) { return num(r.n, i, '0', { b: true }); } },
      { h: 'Pending', w: 10, sum: '0', cell: function (r, i) { return num(r.PENDING, i, '0', r.PENDING ? { b: true, color: AP_STATE_XL.PENDING.color } : {}); } },
      { h: 'Approved', w: 10, sum: '0', cell: function (r, i) { return num(r.APPROVED, i, '0'); } },
      { h: 'Declined', w: 10, sum: '0', cell: function (r, i) { return num(r.REJECTED, i, '0', r.REJECTED ? { color: AP_STATE_XL.REJECTED.color } : {}); } },
      { h: 'Cancelled', w: 10, sum: '0', cell: function (r, i) { return num(r.CANCELLED, i, '0'); } },
      { h: 'Leave days approved', w: 13, sum: '0.0', cell: function (r, i) { return num(Math.round(r.days * 100) / 100, i, '0.0'); } },
      { h: 'Expenses claimed, not declined (₹)', w: 18, sum: '#,##0.00', cell: function (r, i) { return num(Math.round(r.amount * 100) / 100, i, '#,##0.00'); } }
    ]), plist, { sum: true, freezeCol: 2 });
    /* the Total label sits under "Employee" on this sheet */
    if (plist.length) { var tr = BE.rows[BE.rows.length - 1].cells; tr[1] = t('Total', stTotal('left')); tr[2] = t('', stTotal()); }

    /* -- All requests -- */
    var ALL = sheet('All requests', XL.head, 'All approval requests · ' + meta.range, c0.concat([
      { h: 'Type', w: 14, cell: function (r, i) { return num(AP_KIND[r.kind] || r.kind, i); } }], who, [
      requested(),
      { h: 'Request', w: 30, left: true, cell: function (r, i) { return txt(r.summary, i); } },
      { h: 'From', w: 12, cell: function (r, i) { return date(r.from, i); } },
      { h: 'To', w: 12, cell: function (r, i) { return date(r.to, i); } },
      { h: 'Days', w: 8, cell: function (r, i) { return num(r.days, i, '0.0'); } },
      { h: 'Amount (₹)', w: 13, cell: function (r, i) { return num(r.amount, i, '#,##0.00'); } },
      reason()], tail), rows, { freezeCol: 4 });

    var sheets = [SM, BE, ALL];

    if (of('LEAVE').length) sheets.push(sheet(AP_KIND_SHEET.LEAVE, AP_KIND_TAB.LEAVE, 'Leave requests · ' + meta.range, c0.concat(who, [
      requested('Applied on'),
      { h: 'Leave type', w: 11, cell: function (r, i) { return num(d(r).leaveType, i, null, { b: true }); } },
      { h: 'From', w: 12, cell: function (r, i) { return date(r.from, i); } },
      { h: 'To', w: 12, cell: function (r, i) { return date(r.to, i); } },
      { h: 'Days', w: 8, sum: '0.0', cell: function (r, i) { return num(r.days, i, '0.0', { b: true }); } },
      { h: 'Paid days', w: 9, sum: '0.0', cell: function (r, i) { return num(d(r).paidDays, i, '0.0'); } },
      { h: 'LWP days', w: 9, sum: '0.0', cell: function (r, i) { return num(d(r).lwpDays, i, '0.0', d(r).lwpDays ? { b: true, color: 'C5221F' } : {}); } },
      { h: 'Sandwich days', w: 10, cell: function (r, i) { return num(d(r).sandwichDays, i, '0.0'); } },
      reason(), { h: 'Handover to', w: 18, left: true, cell: function (r, i) { return txt(d(r).handoverTo, i); } }], tail), of('LEAVE'), { sum: true }));

    if (of('REGULARISATION').length) sheets.push(sheet(AP_KIND_SHEET.REGULARISATION, AP_KIND_TAB.REGULARISATION, 'Attendance regularisation requests · ' + meta.range, c0.concat(who, [
      requested(),
      { h: 'Attendance date', w: 13, cell: function (r, i) { return date(d(r).attDate || r.from, i); } },
      { h: 'Type', w: 18, left: true, cell: function (r, i) { return txt(r.summary, i, { b: true }); } },
      { h: 'Check-in asked', w: 10, cell: function (r, i) { return time(d(r).checkIn, i); } },
      { h: 'Check-out asked', w: 10, cell: function (r, i) { return time(d(r).checkOut, i); } },
      { h: 'Marks the day as', w: 14, cell: function (r, i) { return num(d(r).requestedStatus ? label(d(r).requestedStatus) : '', i); } },
      reason(44)], tail), of('REGULARISATION')));

    if (of('COMP_OFF').length) sheets.push(sheet(AP_KIND_SHEET.COMP_OFF, AP_KIND_TAB.COMP_OFF, 'Comp off requests · ' + meta.range, c0.concat(who, [
      requested(),
      { h: 'Worked on', w: 13, cell: function (r, i) { return date(d(r).workedDate || r.from, i); } },
      { h: 'Hours worked', w: 9, cell: function (r, i) { return num(d(r).hours || '', i, '0.0'); } },
      { h: 'Days asked', w: 9, sum: '0.0', cell: function (r, i) { return num(r.days, i, '0.0', { b: true }); } },
      { h: 'Valid till', w: 13, cell: function (r, i) { return date(d(r).expiry, i); } },
      { h: 'Days used', w: 9, sum: '0.0', cell: function (r, i) { return num(d(r).consumedDays, i, '0.0'); } },
      reason()], tail), of('COMP_OFF'), { sum: true }));

    if (of('EXPENSE').length) sheets.push(sheet(AP_KIND_SHEET.EXPENSE, AP_KIND_TAB.EXPENSE, 'Expense claims · ' + meta.range, c0.concat(who, [
      requested('Submitted on'),
      { h: 'Expense date', w: 13, cell: function (r, i) { return date(d(r).expenseDate || r.from, i); } },
      { h: 'Category', w: 14, left: true, cell: function (r, i) { return txt(d(r).category, i); } },
      { h: 'Title', w: 24, left: true, cell: function (r, i) { return txt(d(r).title, i, { b: true }); } },
      { h: 'Amount (₹)', w: 13, sum: '#,##0.00', cell: function (r, i) { return num(r.amount, i, '#,##0.00', { b: true }); } },
      { h: 'Project', w: 14, left: true, cell: function (r, i) { return txt(d(r).projectRef, i); } },
      { h: 'Receipt', w: 9, cell: function (r, i) { return num(d(r).hasReceipt ? 'Yes' : 'No', i, null, d(r).hasReceipt ? {} : { color: 'B45309' }); } },
      { h: 'Description', w: 30, left: true, cell: function (r, i) { return txt(r.reason, i); } },
      { h: 'Status', w: 12, cell: function (r) { return state(r); } },
      { h: 'Stage', w: 28, left: true, cell: function (r, i) { return txt(r.stage, i, { color: XL.muted }); } },
      { h: 'Manager', w: 18, left: true, cell: function (r, i) { return txt(d(r).managerName, i); } },
      { h: 'Manager acted on', w: 13, cell: function (r, i) { return date(String(d(r).managerActionAt || '').slice(0, 10), i); } },
      { h: 'Manager remark', w: 24, left: true, cell: function (r, i) { return txt(d(r).managerRemark, i); } },
      { h: 'HR', w: 18, left: true, cell: function (r, i) { return txt(d(r).hrName, i); } },
      { h: 'HR acted on', w: 13, cell: function (r, i) { return date(String(d(r).hrActionAt || '').slice(0, 10), i); } },
      { h: 'HR remark', w: 24, left: true, cell: function (r, i) { return txt(d(r).hrRemark, i); } },
      { h: 'Paid via', w: 11, cell: function (r, i) { return num(d(r).payVia ? label(d(r).payVia) : '', i); } },
      { h: 'Paid on', w: 13, cell: function (r, i) { return date(d(r).paidOn, i); } },
      { h: 'Payment ref', w: 14, left: true, cell: function (r, i) { return txt(d(r).paidRef, i); } },
      { h: 'Days taken (waiting, if pending)', w: 14, cell: taken }]), of('EXPENSE'), { sum: true }));

    if (of('RESIGNATION').length) sheets.push(sheet(AP_KIND_SHEET.RESIGNATION, AP_KIND_TAB.RESIGNATION, 'Resignations · ' + meta.range, c0.concat(who, [
      requested('Submitted on'),
      { h: 'Resignation date', w: 13, cell: function (r, i) { return date(d(r).resignationDate || r.from, i); } },
      { h: 'Last day asked', w: 13, cell: function (r, i) { return date(d(r).requestedLastWorkingDate, i); } },
      { h: 'Last day confirmed', w: 13, cell: function (r, i) { return date(d(r).confirmedLastWorkingDate, i); } },
      { h: 'Notice (days)', w: 9, cell: function (r, i) { return num(d(r).noticePeriodDays || '', i, '0'); } },
      { h: 'Reason category', w: 16, left: true, cell: function (r, i) { return txt(d(r).reasonCategory, i); } },
      reason()], tail), of('RESIGNATION')));

    return { title: 'Approval requests ' + meta.range, sheets: sheets };
  }

  var lastReport = null;   // what is on screen, for the Excel download

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
        '<div class="seg" style="width:auto;max-width:100%;overflow-x:auto;scrollbar-width:none">' +
        '<button data-act="tab" data-tab="attendance" class="' + (tab === 'attendance' ? 'on' : '') + '">Attendance</button>' +
        '<button data-act="tab" data-tab="today" class="' + (tab === 'today' ? 'on' : '') + '">Today</button>' +
        (A.S.user.isHR || A.can('leave.manage') ? '<button data-act="tab" data-tab="leave" class="' + (tab === 'leave' ? 'on' : '') + '">Leave register</button>' : '') +
        (canApprovalReport() ? '<button data-act="tab" data-tab="approvals" class="' + (tab === 'approvals' ? 'on' : '') + '">Approvals</button>' : '') +
        '</div>' +
        '<button class="btn btn-secondary" data-act="print">' + icon('file') + ' Print</button>' +
        '<button class="btn btn-primary" data-act="excel">' + icon('download') + ' Download Excel</button>' +
        '</div></div>';

      if (tab === 'today') {
        return A.api('att.snapshot', { date: params.date || A.todayStr(), scope: (A.S.user.isHR || A.can('attendance.manage')) ? 'all' : 'team' })
          .then(function (s) { lastReport = { tab: 'today', data: s, date: params.date || A.todayStr() }; return head + todayReport(s); });
      }
      if (tab === 'leave') {
        return A.api('leave.register', {}).then(function (l) { lastReport = { tab: 'leave', data: l }; return head + leaveRegister(l); });
      }
      if (tab === 'approvals') {
        var range = apRange(params), ask = {};
        if (range.from) ask.from = range.from;
        if (range.to) ask.to = range.to;
        var view = {
          range: range,
          kind: AP_KIND[params.kind] ? params.kind : 'all',
          status: AP_STATE[params.status] ? params.status : 'all'
        };
        lastReport = null;
        return A.api('reports.approvals', ask).then(function (data) {
          view.rows = (data.rows || []).filter(function (r) { return (view.kind === 'all' || r.kind === view.kind) && (view.status === 'all' || r.state === view.status); });
          var only = [view.kind === 'all' ? '' : AP_KIND[view.kind], view.status === 'all' ? '' : AP_STATE[view.status].toLowerCase()].filter(Boolean).join(', ');
          lastReport = { tab: 'approvals', data: data, rows: view.rows, range: range, only: only, meta: {
            range: apRangeLabel(range), kind: view.kind,
            filters: (view.kind === 'all' ? 'All types' : AP_KIND[view.kind] + ' only') + ' · ' + (view.status === 'all' ? 'every status' : AP_STATE[view.status].toLowerCase() + ' only'),
            scope: apScopeLabel(data.scope),
            note: 'Generated ' + stamp() + ' · ' + apScopeLabel(data.scope) + (view.kind === 'all' && view.status === 'all' ? '' : ' · filtered')
          } };
          return head + approvalsReport(data, view);
        }).catch(function (e) {
          if (/unknown action/i.test(e.message || '')) return head + '<div class="panel">' + A.emptyState('inbox', 'This report needs the latest server update. Please ask the administrator to publish it.') + '</div>';
          if (/only hr and admins/i.test(e.message || '')) return head + '<div class="panel">' + A.emptyState('inbox', e.message) + '</div>';
          throw e;
        });
      }
      return A.api('att.matrix', { month: month }).then(function (m) { lastReport = { tab: 'attendance', data: m }; return head + matrixReport(m); });
    },
    actions: {
      tab: function (el) { A.go('reports', { tab: el.getAttribute('data-tab') }); },
      prevMonth: function () { A.go('reports', { tab: 'attendance', month: A.addMonthKey(A.S.params.month || A.monthKey(), -1) }); },
      nextMonth: function () { A.go('reports', { tab: 'attendance', month: A.addMonthKey(A.S.params.month || A.monthKey(), 1) }); },
      print: function () { window.print(); },
      excel: function () { exportExcel(); },
      csv: function () { exportExcel(); },
      apPeriod: function (el) {
        var v = el.value, patch = { period: v, from: '', to: '' };
        // Custom starts from the dates on screen, so nothing jumps.
        if (v === 'custom') { var cur = apRange(A.S.params || {}); patch.from = cur.from || A.todayStr().slice(0, 8) + '01'; patch.to = cur.to || A.todayStr(); }
        apGo(patch);
      },
      apFrom: function (el) { apGo({ period: 'custom', from: isYmd(el.value) ? el.value : '' }); },
      apTo: function (el) { apGo({ period: 'custom', to: isYmd(el.value) ? el.value : '' }); },
      apKind: function (el) { var k = el.getAttribute('data-kind'); apGo({ kind: k === 'all' ? '' : k }); },
      apStatus: function (el) { var st = el.getAttribute('data-status'); apGo({ status: (A.S.params || {}).status === st ? '' : st }); },
      apClear: function () { apGo({ kind: '', status: '' }); }
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

  function exportExcel() {
    var r = lastReport;
    if (!r || !r.data) return A.toast('Open a report first, then download it.', 'err');
    try {
      var book, name;
      if (r.tab === 'today') { book = todayBook(r.data, r.date); name = 'AVP Attendance ' + r.date + '.xlsx'; }
      else if (r.tab === 'leave') { book = leaveBook(r.data || []); name = 'AVP Leave register ' + A.todayStr() + '.xlsx'; }
      else if (r.tab === 'approvals') {
        if (!r.rows.length) return A.toast('There are no requests to download for these filters.', 'err');
        book = approvalsBook(r.data, r.rows, r.meta);
        name = 'AVP Approval requests ' + (r.range.from && r.range.to ? r.range.from + ' to ' + r.range.to : r.range.from ? 'from ' + r.range.from : r.range.to ? 'up to ' + r.range.to : 'all time') + (r.only ? ' (' + r.only + ')' : '') + '.xlsx';
      }
      else { book = attendanceBook(r.data); name = 'AVP Attendance ' + (r.data.label || r.data.month || '') + '.xlsx'; }
      Xlsx.download(Xlsx.build(book), name);
      A.toast('Excel file downloaded — ' + name, 'ok', 3500);
    } catch (e) {
      A.toast('Could not create the Excel file: ' + e.message, 'err');
    }
  }
})();

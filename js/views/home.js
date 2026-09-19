/* ==========================================================================
   Home dashboard + My profile
   ========================================================================== */
(function () {
  var A = App;

  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
  }

  function firstName(n) { return String(n || '').split(' ')[0]; }

  A.registerView('home', {
    title: 'Home',
    render: function () {
      // v1.6.0: app.session already carries the dashboard on boot — use it once, then refetch normally.
      var cached = A.S.homePayload; A.S.homePayload = null;
      return (cached ? Promise.resolve(cached) : A.api('app.home')).then(function (h) {
        A.S.home = h;
        A.S.pending = h.pendingCount;
        A.S.pendingAcks = h.pendingAcks || 0;
        A.S.pendingSign = (h.signRequests || []).length;
        var u = A.S.user;
        var att = h.attendance.day;
        var bal = h.leave;

        var todayValue = att.checkIn
          ? att.checkIn + (att.checkOut ? ' → ' + att.checkOut : '')
          : (att.status === 'NOT_MARKED' ? 'Not marked' : A.STATUS_LABEL[att.status] || att.status);

        var stats =
          '<div class="statstrip">' +
          stat('Leave balance', bal.available + ' <small>of ' + bal.entitledAnnual + '</small>',
            bal.pending > 0 ? bal.pending + ' day(s) awaiting approval' : 'Financial year ' + h.financialYear) +
          stat('Today', todayValue, att.checkIn ? (att.lateMinutes > 0 ? 'Late by ' + A.hm(att.lateMinutes) : 'On time · ' + (att.locationName || 'checked in')) : A.pretty(h.today)) +
          stat('Compensatory off', bal.compOff + ' <small>days</small>', 'Valid 30 days from earning') +
          (u.isManager
            ? stat('Awaiting you', String(h.pendingCount), h.approvals.length + ' leave · ' + h.regularizations.length + ' regularization')
            : stat('This month', (h.attendance.monthSummary ? h.attendance.monthSummary.present + h.attendance.monthSummary.halfDay : 0) + ' <small>present</small>',
              (h.attendance.monthSummary ? h.attendance.monthSummary.absent : 0) + ' absent · ' + (h.attendance.monthSummary ? h.attendance.monthSummary.leave : 0) + ' leave')) +
          '</div>';

        var quick =
          '<div class="grid2 mt3" style="gap:8px">' +
          (att.checkIn && !att.checkOut
            ? '<button class="btn btn-dark" data-act="checkout" style="justify-content:flex-start">' + icon('clock') + ' Check out</button>'
            : (att.checkIn ? '<button class="btn btn-secondary" data-act="goAttendance" style="justify-content:flex-start">' + icon('check') + ' Day complete</button>'
              : '<button class="btn btn-primary" data-act="checkin" style="justify-content:flex-start">' + icon('clock') + ' Check in</button>')) +
          '<button class="btn btn-secondary" data-act="applyLeave" style="justify-content:flex-start">' + icon('calendar') + ' Apply for leave</button>' +
          '</div>';

        var approvals = u.isManager ? section('Needs your approval',
          h.pendingCount ? '<a href="#/approvals">View all ' + h.pendingCount + '</a>' : '',
          (h.approvals.length || h.regularizations.length || h.compOffApprovals.length)
            ? '<div class="list">' +
            h.approvals.slice(0, 4).map(function (r) {
              return '<div class="item"><div class="avatar">' + A.esc(r.initials) + '</div>' +
                '<div><div class="t">' + A.esc(r.employeeName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(r.type) + ' leave</span></div>' +
                '<div class="s">' + A.pretty(r.from) + ' → ' + A.pretty(r.to) + ' · ' + A.days(r.days) + '</div></div>' +
                '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="decide" data-id="' + r.id + '" data-d="REJECT">Decline</button>' +
                '<button class="btn btn-primary btn-sm" data-act="decide" data-id="' + r.id + '" data-d="APPROVE">Approve</button></div></div>';
            }).join('') +
            h.regularizations.slice(0, 3).map(function (r) {
              return '<div class="item"><div class="avatar">' + A.esc(r.initials) + '</div>' +
                '<div><div class="t">' + A.esc(r.employeeName) + ' <span class="muted" style="font-weight:400">· regularization</span></div>' +
                '<div class="s">' + A.pretty(r.date) + ' · ' + A.esc(String(r.regType).replace(/_/g, ' ').toLowerCase()) + '</div></div>' +
                '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="decideReg" data-id="' + r.id + '" data-d="REJECT">Decline</button>' +
                '<button class="btn btn-primary btn-sm" data-act="decideReg" data-id="' + r.id + '" data-d="APPROVE">Approve</button></div></div>';
            }).join('') +
            h.compOffApprovals.slice(0, 3).map(function (c) {
              return '<div class="item"><div class="avatar">' + A.esc(c.initials) + '</div>' +
                '<div><div class="t">' + A.esc(c.employeeName) + ' <span class="muted" style="font-weight:400">· comp off</span></div>' +
                '<div class="s">Worked ' + A.pretty(c.workedDate) + ' · ' + A.days(c.days) + '</div></div>' +
                '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="decideCo" data-id="' + c.id + '" data-d="REJECT">Decline</button>' +
                '<button class="btn btn-primary btn-sm" data-act="decideCo" data-id="' + c.id + '" data-d="APPROVE">Approve</button></div></div>';
            }).join('') +
            '</div>'
            : '<div class="empty">Nothing waiting on you.</div>') : '';

        var mine = section('My recent requests', '<a href="#/leave">All requests</a>',
          h.myRequests.length ? '<div class="list">' + h.myRequests.map(function (r) {
            return '<div class="item" style="grid-template-columns:1fr auto">' +
              '<div><div class="t">' + A.esc(r.type) + ' · ' + A.pretty(r.from) + (r.from !== r.to ? ' → ' + A.pretty(r.to) : '') + '</div>' +
              '<div class="s">' + A.days(r.days) + (r.lwpDays ? ' · ' + r.lwpDays + ' LWP' : '') + ' · ' + A.esc(r.reason || '') + '</div></div>' +
              A.statusTag(r.status) + '</div>';
          }).join('') + '</div>' : '<div class="empty">You have not applied for leave yet.</div>');

        var out = section("Who's out this week", '',
          h.outThisWeek.length ? h.outThisWeek.map(function (o) {
            return '<div class="rowline"><div class="avatar sm ghost">' + A.esc(o.initials) + '</div>' +
              '<span class="grow">' + A.esc(o.name) + '</span>' +
              '<span class="tag ' + (o.status === 'PENDING' ? 'tag-warn' : 'tag-neutral') + '">' + A.shortD(o.from) + (o.from !== o.to ? ' – ' + A.shortD(o.to) : '') + '</span></div>';
          }).join('') : '<div class="empty">Everyone is in.</div>');

        var holidays = section('Upcoming holidays', '<a href="#/leave?tab=holidays">Full list</a>',
          h.upcomingHolidays.length ? h.upcomingHolidays.map(function (x) {
            return '<div class="rowline"><div style="width:54px;font-weight:800;font-size:13px">' + A.shortD(x.date) + '</div>' +
              '<div class="grow"><div style="font-size:14px">' + A.esc(x.name) + '</div>' +
              '<div class="small muted">' + A.dow(x.date) + '</div></div></div>';
          }).join('') : '<div class="empty">No holidays declared yet.</div>');

        // v1.5.0 — notices, celebrations, and cross-module items needing attention
        var notices = (h.notices || []).length ? '<div class="sect mt4"><h3>Notice board</h3><a href="#/notices">All notices</a></div><div class="stack mt2" style="gap:10px">' +
          h.notices.slice(0, 3).map(function (n) { return A.noticeCard ? A.noticeCard(n, true) : ''; }).join('') + '</div>' : '';
        var attention = '';
        if ((h.signRequests || []).length) {
          attention += section('Awaiting your signature', '', '<div class="list">' + h.signRequests.map(function (s) {
            return '<div class="item"><div class="avatar" style="background:var(--accent)">' + icon('pen') + '</div><div><div class="t">' + A.esc(s.templateName) + ' <span class="muted" style="font-weight:400">· for ' + A.esc(s.recipientName) + '</span></div>' +
              '<div class="s">Requested by ' + A.esc(s.requesterName) + ' · ' + A.relTime(s.sentAt) + (s.expiresAt ? ' · expires ' + A.pretty(String(s.expiresAt).slice(0, 10)) : '') + '</div></div>' +
              '<div class="acts row"><button class="btn btn-primary btn-sm" data-act="goto" data-route="sign" data-params=\'' + A.esc(JSON.stringify({ letter: s.letterId })) + '\'>Review &amp; sign</button></div></div>';
          }).join('') + '</div>') + '<div class="mt4"></div>';
        }
        if ((h.expenseApprovals || []).length) {
          attention += section('Expense claims to approve', '<a href="#/expenses">All claims</a>', '<div class="list">' + h.expenseApprovals.slice(0, 4).map(function (c) {
            return '<div class="item"><div class="avatar">' + A.esc(c.initials) + '</div><div><div class="t">' + A.esc(c.employeeName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(c.category) + '</span></div>' +
              '<div class="s">' + A.esc(c.title) + ' · ' + A.pretty(c.expenseDate) + ' · <b>₹' + A.money(c.amount) + '</b></div></div>' +
              '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="decideExpense" data-id="' + c.id + '" data-d="REJECT">Decline</button><button class="btn btn-primary btn-sm" data-act="decideExpense" data-id="' + c.id + '" data-d="APPROVE">Approve</button></div></div>';
          }).join('') + '</div>') + '<div class="mt4"></div>';
        }
        if ((h.interviews || []).length) {
          attention += section('My interviews', '', '<div class="list">' + h.interviews.map(function (i) {
            var past = String(i.scheduledAt).replace(' ', 'T') < new Date().toISOString().slice(0, 16);
            return '<div class="item"><div class="avatar ghost">' + A.esc(A.initials(i.candidateName)) + '</div><div><div class="t">' + A.esc(i.candidateName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(i.jobTitle) + '</span></div>' +
              '<div class="s">' + A.esc(i.round) + ' · ' + A.esc(i.scheduledAt) + ' · ' + A.esc(i.mode) + (i.location ? ' · ' + A.esc(i.location) : '') + '</div></div>' +
              '<div class="acts row"><button class="btn ' + (past ? 'btn-primary' : 'btn-secondary') + ' btn-sm" data-act="interviewFeedback" data-json="' + A.esc(JSON.stringify(i)) + '">' + (past ? 'Submit feedback' : 'Feedback') + '</button></div></div>';
          }).join('') + '</div>') + '<div class="mt4"></div>';
        }
        if ((h.myTickets || []).length) {
          attention += section('Helpdesk needs you', '<a href="#/helpdesk">All tickets</a>', '<div class="list">' + h.myTickets.map(function (t) {
            return '<div class="item" style="grid-template-columns:1fr auto"><div><div class="t">' + A.esc(t.subject) + '</div><div class="s">' + A.esc(t.id) + ' · ' + (t.status === 'RESOLVED' ? 'resolved — please confirm or reopen' : 'HR is waiting for your reply') + '</div></div>' +
              '<a class="btn btn-secondary btn-sm" href="#/helpdesk">Open</a></div>';
          }).join('') + '</div>') + '<div class="mt4"></div>';
        }
        var celebrations = (h.celebrations || []).length ? section('Celebrations this week', '', h.celebrations.map(function (c) {
          return '<div class="rowline"><div class="avatar sm ghost">' + A.esc(c.initials) + '</div><span class="grow">' + A.esc(c.name) + ' <span class="small muted">· ' + (c.kind === 'birthday' ? 'birthday' : c.years + ' year' + (c.years === 1 ? '' : 's') + ' at AVP') + '</span></span>' +
            '<span class="tag ' + (c.inDays === 0 ? 'tag-accent' : 'tag-neutral') + '">' + (c.inDays === 0 ? 'Today' : A.shortD(c.date)) + '</span></div>';
        }).join('')) + '<div class="mt4"></div>' : '';

        return '' +
          '<div class="kicker">' + A.dow(h.today) + ', ' + A.pretty(h.today) + '</div>' +
          '<h1 style="margin:0 0 24px">' + greeting() + ', ' + A.esc(firstName(u.name)) + '.</h1>' +
          stats + quick + notices +
          '<div class="split mt4">' +
          '<div>' + attention + approvals + (approvals ? '<div class="mt4"></div>' : '') + mine + '</div>' +
          '<div>' + celebrations + out + '<div class="mt4"></div>' + holidays + '</div>' +
          '</div>';
      });
    },
    actions: {
      goAttendance: function () { A.go('attendance'); },
      applyLeave: function () { A.go('leave', { tab: 'apply' }); },
      checkin: function () { Punch.run('in').then(function () { A.render(); }); },
      checkout: function () { Punch.run('out').then(function () { A.render(); }); },
      decide: function (el) { decideLeave(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      decideReg: function (el) { decideReg(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      decideCo: function (el) { decideCompOff(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      decideExpense: function (el) {
        var id = el.getAttribute('data-id'), approve = el.getAttribute('data-d') === 'APPROVE';
        var fields = [{ name: 'remark', label: approve ? 'Remark (optional)' : 'Reason for declining', type: 'textarea' }];
        if (approve && A.S.user.isHR) fields.push({ name: 'payVia', label: 'Pay via', type: 'select', value: 'PAYROLL', options: [{ value: 'PAYROLL', label: 'Next payroll' }, { value: 'BANK', label: 'Bank transfer' }, { value: 'CASH', label: 'Cash' }] });
        A.prompt(approve ? 'Approve claim' : 'Decline claim', fields, approve ? 'Approve' : 'Decline').then(function (v) {
          if (!v) return;
          return A.api('expenses.decide', { claimId: id, decision: approve ? 'APPROVE' : 'REJECT', remark: v.remark, payVia: v.payVia }).then(function () { A.toast(approve ? 'Approved.' : 'Declined.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      interviewFeedback: function (el) { A.interviewFeedback(JSON.parse(el.getAttribute('data-json'))); },
      ackNotice: function (el) { A.noticeActions.ackNotice(el); },
      noticeFile: function (el) { A.noticeActions.noticeFile(el); }
    }
  });

  function stat(label, value, sub) {
    return '<div><div class="stat-label">' + A.esc(label) + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      '<div class="stat-sub">' + A.esc(sub || '') + '</div></div>';
  }

  function section(title, link, body) {
    return '<div class="sect"><h3>' + A.esc(title) + '</h3>' + (link || '') + '</div>' + body;
  }

  /* Shared approval helpers used by home + approvals views. */
  function decideLeave(id, decision) {
    var approve = decision === 'APPROVE';
    A.prompt(approve ? 'Approve leave request' : 'Decline leave request',
      [{ name: 'remark', label: 'Remark (optional)', type: 'textarea', placeholder: approve ? 'Approved.' : 'Reason for declining' }],
      approve ? 'Approve' : 'Decline'
    ).then(function (v) {
      if (!v) return;
      return A.api('leave.decide', { requestId: id, decision: decision, remark: v.remark })
        .then(function () { A.toast('Request ' + (approve ? 'approved' : 'declined') + '.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function decideReg(id, decision) {
    var approve = decision === 'APPROVE';
    A.prompt(approve ? 'Approve regularization' : 'Decline regularization',
      [{ name: 'remark', label: 'Remark (optional)', type: 'textarea' }], approve ? 'Approve' : 'Decline'
    ).then(function (v) {
      if (!v) return;
      return A.api('reg.decide', { regularizationId: id, decision: decision, remark: v.remark })
        .then(function () { A.toast('Regularization ' + (approve ? 'approved' : 'declined') + '.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function decideCompOff(id, decision) {
    var approve = decision === 'APPROVE';
    A.prompt(approve ? 'Approve comp off' : 'Decline comp off',
      [{ name: 'remark', label: 'Remark (optional)', type: 'textarea' }], approve ? 'Approve' : 'Decline'
    ).then(function (v) {
      if (!v) return;
      return A.api('compoff.decide', { compOffId: id, decision: decision, remark: v.remark })
        .then(function () { A.toast('Comp off ' + (approve ? 'approved' : 'declined') + '.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  window.Approvals = { decideLeave: decideLeave, decideReg: decideReg, decideCompOff: decideCompOff };

  /* ------------------------------------------------------------ my profile */
  A.registerView('me', {
    title: 'My profile',
    render: function (params) {
      var id = params.id || A.S.user.employeeId;
      var self = id === A.S.user.employeeId;
      return Promise.all([A.api('people.profile', { employeeId: id }), self ? A.api('letters.mine') : Promise.resolve([]), A.api('assets.mine', { employeeId: id }).catch(function () { return []; })]).then(function (r) {
        var p = r[0], myLetters = r[1], myAssets = r[2];
        var self = id === A.S.user.employeeId;
        var fields = [
          ['Employee code', p.code], ['Department', p.department], ['Designation', p.designation],
          ['Reporting manager', p.managerName || '—'], ['Work location', p.locationName || '—'],
          ['Date of joining', A.pretty(p.joinDate)],
          ['Employment status', A.esc(String(p.status || '').replace('_', ' '))],
          ['Email', p.email || '—'], ['Personal / alternate email', p.altEmail || '—'],
          ['Google sign-in', p.googleEmail ? 'Linked · ' + p.googleEmail : (p.email || p.altEmail ? 'Not linked yet — any address above works once' : 'No email on file')],
          ['Phone', p.phone || '—'],
          ['Date of birth', p.dateOfBirth ? A.pretty(p.dateOfBirth) : '—'],
          ['Blood group', p.bloodGroup || '—'],
          ['Emergency contact', p.emergency && p.emergency.name ? p.emergency.name + ' (' + (p.emergency.relation || '') + ') ' + (p.emergency.phone || '') : '—']
        ];
        if (p.statutory) {
          fields.push(['PAN', p.pan || '—']);
          fields.push(['UAN / PF number', (p.statutory.uan || '—') + ' / ' + (p.statutory.pfNumber || '—') + (p.statutory.pfApplicable ? '' : ' (PF not applicable)')]);
          fields.push(['ESI number', p.statutory.esiNumber ? p.statutory.esiNumber : (p.statutory.esiApplicable ? 'Applicable — not set' : 'Not applicable')]);
          fields.push(['Bank', p.bank && p.bank.name ? p.bank.name + ' · ' + p.bank.account + ' · ' + (p.bank.ifsc || '') : '—']);
        }
        var b = p.leave, a = p.attendanceThisMonth || {};

        var lettersSection = '';
        if (self && myLetters.length) {
          lettersSection = '<div class="sect mt4"><h3>My letters</h3></div>' +
            '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Letter</th><th>Reference</th><th>Status</th><th>Issued</th><th></th></tr></thead><tbody>' +
            myLetters.map(function (l) {
              var tag = l.status === 'ACKNOWLEDGED' ? 'tag-ok' : 'tag-warn';
              var label = l.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Issued';
              return '<tr><td style="font-weight:600">' + A.esc(l.templateName) + '</td>' +
                '<td class="small mono">' + A.esc(l.letterId) + '</td>' +
                '<td><span class="tag ' + tag + '">' + label + '</span></td>' +
                '<td class="small">' + A.esc(l.issuedAt) + '</td>' +
                '<td class="right"><div class="row" style="gap:6px;justify-content:flex-end">' +
                '<button class="btn btn-ghost btn-sm" data-act="viewLetter" data-id="' + l.letterId + '">' + icon('download') + ' View</button>' +
                (l.status !== 'ACKNOWLEDGED' ? '<button class="btn btn-primary btn-sm" data-act="ackLetter" data-id="' + l.letterId + '">Acknowledge</button>' : '') +
                '</div></td></tr>';
            }).join('') + '</tbody></table></div>';
        }

        return '' +
          '<div class="spread wrap" style="align-items:flex-end;margin-bottom:22px">' +
          '<div><div class="kicker">' + A.esc(p.department || '') + (p.designation ? ' · ' + A.esc(p.designation) : '') + '</div>' +
          '<h1 style="margin:0">' + A.esc(p.name) + '</h1>' +
          '<div class="row wrap mt1"><span class="tag tag-neutral">' + A.esc(p.code) + '</span>' +
          '<span class="tag tag-neutral">' + A.esc(A.roleLabel(p.role)) + '</span>' +
          (p.onProbation || p.status === 'PROBATION' ? '<span class="tag tag-warn">On probation</span>' : '<span class="tag tag-ok">Confirmed</span>') +
          '</div></div>' +
          '<div class="row wrap">' +
          (self ? '<button class="btn btn-secondary" data-act="password">Change password</button>' : '') +
          (self && A.S.boot && A.S.boot.settings && A.S.boot.settings.googleSignIn ? '<span id="googleLinkSlot"><button class="btn btn-secondary" data-act="linkGoogle">' + (typeof GOOGLE_G !== 'undefined' ? GOOGLE_G : '') + ' ' + (p.googleEmail ? 'Change Google account' : 'Link Google account') + '</button></span>' : '') +
          (self && p.googleEmail ? '<button class="btn btn-ghost" data-act="unlinkGoogle">Unlink</button>' : '') +
          '<button class="btn btn-secondary" data-act="documents">Documents</button>' +
          '<button class="btn btn-secondary" data-act="edit">Edit details</button>' +
          (self ? '<button class="btn btn-danger" data-act="logout">Sign out</button>' : '') +
          '</div></div>' +

          '<div class="statstrip">' +
          stat('Leave available', b.available + ' <small>of ' + b.entitledAnnual + '</small>', 'Earned so far ' + b.entitledToDate) +
          stat('Leave taken', String(b.consumed), b.lwpTaken ? b.lwpTaken + ' day(s) loss of pay' : 'No loss of pay') +
          stat('Compensatory off', String(b.compOff), 'Available days') +
          stat('Present this month', String((a.present || 0) + (a.halfDay || 0)), (a.absent || 0) + ' absent · ' + (a.leave || 0) + ' leave') +
          '</div>' +

          '<div class="split even mt4">' +
          '<div><div class="sect"><h3>Details</h3></div>' +
          '<div class="grid2" style="gap:0">' + fields.map(function (f) {
            return '<div style="padding:14px 16px 14px 0;border-bottom:1px solid var(--line)">' +
              '<div class="stat-label">' + A.esc(f[0]) + '</div>' +
              '<div style="font-size:15px;margin-top:3px;font-weight:600">' + A.esc(f[1] || '—') + '</div></div>';
          }).join('') + '</div></div>' +
          '<div><div class="sect"><h3>Team</h3></div>' +
          (p.reports && p.reports.length ? p.reports.map(function (r) {
            return '<div class="rowline"><div class="avatar sm">' + A.esc(r.initials) + '</div>' +
              '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(r.name) + '</div>' +
              '<div class="small muted">' + A.esc(r.designation || '') + '</div></div>' +
              '<button class="btn btn-ghost btn-sm" data-act="openProfile" data-id="' + r.employeeId + '">Open</button></div>';
          }).join('') : '<div class="empty">No direct reports.</div>') +
          '<div class="sect mt4"><h3>Quarterly leave plan</h3></div>' +
          b.quarters.map(function (q) {
            var pct = q.entitled ? Math.min(100, Math.round(q.used / q.entitled * 100)) : 0;
            return '<div style="padding:12px 0;border-bottom:1px solid var(--line)">' +
              '<div class="spread"><div style="font-size:14px;font-weight:600">' + q.quarter + ' <span class="muted small">' + A.shortD(q.from) + ' – ' + A.shortD(q.to) + '</span></div>' +
              '<div class="small">' + q.used + ' / ' + q.entitled + (q.entitled !== q.quota ? ' (quota ' + q.quota + ')' : '') + '</div></div>' +
              '<div class="bar thin mt1"><i style="width:' + pct + '%"></i></div></div>';
          }).join('') +
          (A.assetsSection ? A.assetsSection(myAssets, self) : '') +
          lettersSection +
          '</div></div>';
      });
    },
    actions: {
      password: function () { A.renderChangePassword(false); },
      logout: function () { A.signOut(); },
      linkGoogle: function (el) {
        // The OAuth redirect must be a real user click on a real link (sandbox rule), so we
        // fetch the one-time link URL first and swap the button for an anchor to click.
        el.disabled = true; el.innerHTML = '<span class="spinner"></span> Preparing…';
        A.api('auth.googleLinkUrl').then(function (r) {
          var slot = document.getElementById('googleLinkSlot');
          if (slot) slot.innerHTML = '<a class="btn btn-primary" href="' + r.url + '" target="_top">' + (typeof GOOGLE_G !== 'undefined' ? GOOGLE_G : '') + ' Continue with Google to link</a>';
          A.toast('Click the button to choose the Google account you want to sign in with.', 'ok', 5000);
        }).catch(function (e) { el.disabled = false; el.textContent = 'Link Google account'; A.toast(e.message, 'err'); });
      },
      unlinkGoogle: function () {
        A.confirm('Unlink Google account', 'You will still be able to sign in with your employee code and password, or link a Google account again later.', 'Unlink').then(function (ok) {
          if (!ok) return;
          return A.api('auth.unlinkGoogle').then(function () { A.toast('Google account unlinked.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      openProfile: function (el) { A.go('me', { id: el.getAttribute('data-id') }); },
      edit: function () { editProfile(A.S.params.id || A.S.user.employeeId); },
      documents: function () {
        var id = A.S.params.id || A.S.user.employeeId;
        A.showDocumentsModal(id, A.S.user.isHR);
      },
      viewLetter: function (el) { viewMyLetterFile(el.getAttribute('data-id')); },
      ackAsset: function (el) {
        A.api('assets.acknowledge', { movementId: el.getAttribute('data-id') }).then(function () { A.toast('Receipt acknowledged.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      ackLetter: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Acknowledge letter', 'Confirm that you have read and received this letter.', 'Acknowledge').then(function (ok) {
          if (!ok) return;
          return A.api('letters.acknowledge', { letterId: id }).then(function () { A.toast('Acknowledged.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      }
    }
  });
  function viewMyLetterFile(letterId) {
    A.api('letters.fetch', { letterId: letterId }).then(function (r) {
      var bin = atob(r.dataBase64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var blob = new Blob([bytes], { type: r.mimeType });
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function editProfile(id) {
    A.api('people.profile', { employeeId: id }).then(function (p) {
      var hr = A.S.user.isHR;
      var f = [
        { name: 'Phone', label: 'Phone', value: p.phone },
        { name: 'AltEmail', label: 'Personal / alternate email (can be used to sign in with Google)', type: 'email', value: p.altEmail || '' },
        { name: 'DateOfBirth', label: 'Date of birth', type: 'date', value: p.dateOfBirth },
        { name: 'BloodGroup', label: 'Blood group', value: p.bloodGroup },
        { name: 'EmergencyContactName', label: 'Emergency contact name', value: p.emergency ? p.emergency.name : '' },
        { name: 'EmergencyContactRelation', label: 'Relationship', value: p.emergency ? p.emergency.relation : '' },
        { name: 'EmergencyContactPhone', label: 'Emergency contact number', value: p.emergency ? p.emergency.phone : '' },
        { name: 'PermanentAddress', label: 'Permanent address', type: 'textarea', value: p.address || '' },
        { name: 'Qualification', label: 'Educational qualification', value: p.qualification || '' },
        { name: 'PreviousExperience', label: 'Previous experience', value: p.experience || '' },
        { name: 'Skills', label: 'Skills / certifications', value: p.skills || '' }
      ];
      if (hr) {
        f = f.concat([
          { name: 'Email', label: 'Work email', type: 'email', value: p.email },
          { name: 'GoogleEmail', label: 'Google account used for sign-in (auto-filled on first Google login)', type: 'email', value: p.googleEmail || '' },
          { name: 'Designation', label: 'Designation', value: p.designation },
          { name: 'Department', label: 'Department', value: p.department },
          { name: 'JoinDate', label: 'Date of joining', type: 'date', value: p.joinDate },
          { name: 'ProbationEndDate', label: 'Probation ends', type: 'date', value: p.probationEndDate },
          { name: 'Status', label: 'Employment status', type: 'select', value: p.status, options: [['PROBATION', 'Probation'], ['CONFIRMED', 'Confirmed'], ['NOTICE_PERIOD', 'Notice period'], ['EXITED', 'Exited']].map(function (o) { return { value: o[0], label: o[1] }; }) },
          { name: 'Role', label: 'App role', type: 'select', value: p.role, options: [['EMPLOYEE', 'Employee'], ['MANAGER', 'Manager'], ['HR_ADMIN', 'HR admin'], ['SUPER_ADMIN', 'Administrator']].map(function (o) { return { value: o[0], label: o[1] }; }) },
          { name: 'PAN', label: 'PAN', value: p.pan || '' },
          { name: 'UAN', label: 'PF UAN', value: p.statutory ? p.statutory.uan : '' },
          { name: 'PFNumber', label: 'PF member number', value: p.statutory ? p.statutory.pfNumber : '' },
          { name: 'PFApplicable', label: 'PF applicable', type: 'select', value: p.statutory && p.statutory.pfApplicable ? 'true' : 'false', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
          { name: 'ESINumber', label: 'ESI number', value: p.statutory ? p.statutory.esiNumber : '' },
          { name: 'ESIApplicable', label: 'ESI applicable', type: 'select', value: p.statutory && p.statutory.esiApplicable ? 'true' : 'false', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
          { name: 'BankName', label: 'Bank name', value: p.bank ? p.bank.name : '' },
          { name: 'BankAccountNumber', label: 'Bank account number', value: p.bank ? p.bank.account : '' },
          { name: 'BankIFSC', label: 'IFSC', value: p.bank ? p.bank.ifsc : '' },
          { name: 'Notes', label: 'HR notes (private)', type: 'textarea', value: p.notes || '' }
        ]);
      }
      A.prompt('Edit details', f, 'Save').then(function (v) {
        if (!v) return;
        v.employeeId = id;
        if (v.PFApplicable !== undefined) v.PFApplicable = v.PFApplicable === 'true';
        if (v.ESIApplicable !== undefined) v.ESIApplicable = v.ESIApplicable === 'true';
        return A.api('people.save', v).then(function () { A.toast('Profile updated.', 'ok'); A.render(); });
      }).catch(function (e) { A.toast(e.message, 'err'); });
    });
  }
})();

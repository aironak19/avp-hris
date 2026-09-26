/* ==========================================================================
   Home dashboard + My profile  (v3.0)
   Hero with live punch state and shift progress, KPI cards with sparklines,
   an attention feed, celebrations, who's out and holidays.
   ========================================================================== */
(function () {
  var A = App;
  var heroTimer = null;

  function firstName(n) { return A.firstName ? A.firstName(n) : String(n || '').split(' ')[0]; }
  function greeting() { return A.greeting ? A.greeting() : 'Hello'; }
  function hhmmToMin(s) { var p = String(s || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function nowMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

  A.registerView('home', {
    title: 'Home',
    render: function () {
      var cached = A.S.homePayload; A.S.homePayload = null;
      var homeP = cached ? Promise.resolve(cached) : A.api('app.home');
      var monthP = A.api('att.month', { month: A.monthKey() }).catch(function () { return null; });
      var noticesP = A.loadModule ? A.loadModule('ViewsNotices').catch(function () {}) : Promise.resolve();
      return Promise.all([homeP, monthP, noticesP]).then(function (r) {
        var h = r[0], m = r[1];
        A.S.home = h;
        A.S.pending = h.pendingCount;
        A.S.pendingAcks = h.pendingAcks || 0;
        A.S.pendingSign = (h.signRequests || []).length;
        var u = A.S.user;
        var att = h.attendance.day || {};
        var bal = h.leave || {};
        var ms = h.attendance.monthSummary || {};
        var settings = (A.S.boot && A.S.boot.settings) || {};
        var shiftLen = Math.max(60, hhmmToMin(settings.shiftEnd || '18:30') - hhmmToMin(settings.shiftStart || '09:30'));

        /* ---- hero ---- */
        var worked = 0;
        if (att.checkIn && att.checkOut) worked = att.workedMinutes || 0;
        else if (att.checkIn) worked = Math.max(0, nowMin() - hhmmToMin(att.checkIn));
        var pct = Math.min(100, Math.round(worked / shiftLen * 100));
        var heroSub, cta;
        if (att.checkIn && !att.checkOut) {
          heroSub = 'You checked in at <b>' + A.esc(att.checkIn) + '</b>' + (att.locationName ? ' · ' + A.esc(att.locationName) : '') + (att.lateMinutes ? ' · late by ' + A.hm(att.lateMinutes) : ' · on time') + '. <span id="heroWorked">' + A.hm(worked) + '</span> so far.';
          cta = '<button class="btn btn-light" data-act="checkout">' + icon('logout') + ' Check out</button>';
        } else if (att.checkIn && att.checkOut) {
          heroSub = 'Day complete — <b>' + A.esc(att.checkIn) + ' → ' + A.esc(att.checkOut) + '</b>, ' + A.hm(att.workedMinutes) + ' worked. See you tomorrow.';
          cta = '<button class="btn btn-glass" data-act="goAttendance">' + icon('calendarcheck') + ' Register</button>';
        } else if (att.status === 'HOLIDAY' || att.status === 'WEEKLY_OFF') {
          heroSub = 'Today is a ' + A.STATUS_LABEL[att.status].toLowerCase() + '. Enjoy the break — if you work today, claim a comp off.';
          cta = '<button class="btn btn-glass" data-act="compoff">' + icon('sun') + ' Claim comp off</button>';
        } else if (att.status === 'ON_LEAVE' || att.status === 'HALF_DAY_LEAVE') {
          heroSub = 'You are on leave today. Nothing to do here — rest well.';
          cta = '';
        } else {
          heroSub = 'You have not checked in yet. Shift starts at <b>' + A.esc(settings.shiftStart || '09:30') + '</b>' + (h.pendingCount ? ' · <b>' + h.pendingCount + '</b> item' + (h.pendingCount === 1 ? '' : 's') + ' waiting for you' : '') + '.';
          cta = '<button class="btn btn-primary" data-act="checkin">' + icon('clock') + ' Check in now</button>';
        }
        var ringInner = att.checkIn ? '<b>' + pct + '%</b><small>of shift</small>' : '<b>' + A.esc(String(bal.available !== undefined ? bal.available : '—')) + '</b><small>leave days left</small>';
        var hero =
          '<div class="hero">' +
          '<div class="glow"></div>' + skyline() +
          '<div style="position:relative;z-index:1;max-width:640px">' +
          '<div class="chips"><span class="chip">' + icon('calendar') + A.esc(A.dow(h.today) + ', ' + A.pretty(h.today)) + '</span>' +
          (att.locationName ? '<span class="chip">' + icon('mappin') + A.esc(att.locationName) + '</span>' : (h.financialYear ? '<span class="chip">' + icon('layers') + 'FY ' + A.esc(h.financialYear) + '</span>' : '')) +
          (u.roleName ? '<span class="chip">' + icon('shield') + A.esc(u.roleName) + '</span>' : '') + '</div>' +
          '<h1>' + greeting() + ', ' + A.esc(firstName(u.name)) + ' <span aria-hidden="true">👋</span></h1>' +
          '<p>' + heroSub + '</p>' +
          '<div class="row wrap" style="gap:10px;margin-top:6px">' + cta +
          '<button class="btn btn-glass" data-act="applyLeave">' + icon('calendar') + ' Apply for leave</button>' +
          (u.isManager || A.can('leave.approve') ? '<button class="btn btn-glass" data-act="goto" data-route="approvals">' + icon('inbox') + ' Inbox' + (h.pendingCount ? ' · ' + h.pendingCount : '') + '</button>' : '') +
          '</div></div>' +
          '<div class="side"><div id="heroRing">' + A.ring(att.checkIn ? pct : (bal.entitledAnnual ? Math.round(100 * (bal.available || 0) / bal.entitledAnnual) : 0), ringInner, att.checkIn && att.checkOut ? 'ok' : '') + '</div></div>' +
          '</div>';

        /* ---- KPI cards ---- */
        var workedSeries = (m && m.days ? m.days.filter(function (d) { return d.date <= A.todayStr() && ['WEEKLY_OFF', 'HOLIDAY'].indexOf(d.status) === -1; }).map(function (d) { return Math.round((d.workedMinutes || 0) / 60 * 10) / 10; }) : []);
        var presentDays = (ms.present || 0) + (ms.halfDay || 0);
        var kpis = '<div class="statstrip mt3">' +
          kpi('Leave balance', bal.available !== undefined ? bal.available : '—', 'of ' + (bal.entitledAnnual !== undefined ? bal.entitledAnnual : '—') + ' days', bal.pending > 0 ? '<div class="stat-sub mt1"><span class="trend flat">' + icon('clock') + bal.pending + ' awaiting approval</span></div>' : quarterBars(bal.quarters), 'calendar', 'neutral', { route: 'leave' }) +
          kpi('This month', presentDays, 'days present', workedSeries.length > 1 ? A.spark(workedSeries, { cls: 'ok', color: 'var(--ok)' }) : '', 'activity', 'ok', { route: 'attendance', params: { tab: 'month' } }, (ms.absent || 0) + ' absent · ' + (ms.leave || 0) + ' leave · ' + (ms.workedHours || 0) + ' h') +
          (u.isManager || A.can('leave.approve') || A.can('expenses.approve')
            ? kpi('Awaiting you', h.pendingCount || 0, h.pendingCount === 1 ? 'item' : 'items', '<div class="stat-sub mt1">' + (h.pendingCount ? '<span class="trend down">' + icon('alert') + 'Needs a decision</span>' : '<span class="trend up">' + icon('check') + 'All clear</span>') + '</div>', 'inbox', h.pendingCount ? 'warn' : 'ok', { route: 'approvals' }, (h.approvals || []).length + ' leave · ' + (h.regularizations || []).length + ' regularisation · ' + (h.expenseApprovals || []).length + ' claims')
            : kpi('My requests', (h.myRequests || []).filter(function (r) { return r.status === 'PENDING'; }).length, 'pending', '', 'file', 'info', { route: 'leave', params: { tab: 'requests' } }, (h.myRequests || []).length ? 'Latest: ' + A.esc((h.myRequests[0] || {}).type || '') + ' · ' + A.esc(String((h.myRequests[0] || {}).status || '').toLowerCase()) : 'No requests yet')) +
          kpi('Comp off', bal.compOff !== undefined ? bal.compOff : 0, 'days', '', 'sun', 'neutral', { route: 'leave', params: { tab: 'compoff' } }, h.pendingAcks ? '<span class="trend flat">' + icon('megaphone') + h.pendingAcks + ' notice' + (h.pendingAcks === 1 ? '' : 's') + ' to acknowledge</span>' : 'Valid 30 days from earning') +
          '</div>';

        /* ---- quick actions ---- */
        var quick = '<div class="sect mt4"><h3>Quick actions</h3><span class="small muted">Press <span class="kbd">n</span> anywhere</span></div>' +
          '<div class="qa mt2">' +
          qa('attendance', 'clock', 'Mark attendance', 'Geofenced check in/out') +
          qa('applyLeave', 'calendar', 'Apply for leave', 'Balance ' + (bal.available !== undefined ? bal.available : '—') + ' days') +
          qa('regularize', 'edit', 'Regularise a day', 'Missed punch, site visit, WFH') +
          qa('expense', 'receipt', 'Claim an expense', 'Attach a receipt, get paid') +
          qa('ticket', 'lifebuoy', 'Ask HR', 'Raise a helpdesk ticket') +
          qa('payslips', 'wallet', 'My payslips', 'Download & acknowledge') +
          '</div>';

        /* ---- notices ---- */
        var notices = (h.notices || []).length ? '<div class="sect mt4"><h3>Notice board</h3><a href="#/notices">All notices</a></div><div class="stack mt2 stagger" style="gap:10px">' +
          h.notices.slice(0, 3).map(function (n) { return A.noticeCard ? A.noticeCard(n, true) : ''; }).join('') + '</div>' : '';

        /* ---- attention feed ---- */
        var attention = '';
        if ((h.signRequests || []).length) {
          attention += panel('Awaiting your signature', '', '<div class="list">' + h.signRequests.map(function (s) {
            return '<div class="item"><div class="avatar accent">' + icon('pen') + '</div><div><div class="t">' + A.esc(s.templateName) + ' <span class="muted" style="font-weight:400">· for ' + A.esc(s.recipientName) + '</span></div>' +
              '<div class="s">Requested by ' + A.esc(s.requesterName) + ' · ' + A.relTime(s.sentAt) + (s.expiresAt ? ' · expires ' + A.pretty(String(s.expiresAt).slice(0, 10)) : '') + '</div></div>' +
              '<div class="acts row"><button class="btn btn-primary btn-sm" data-act="goto" data-route="sign" data-params=\'' + A.esc(JSON.stringify({ letter: s.letterId })) + '\'>Review &amp; sign</button></div></div>';
          }).join('') + '</div>');
        }
        var approvalsBody = '';
        if (u.isManager || A.can('leave.approve') || A.can('expenses.approve')) {
          var rows = [];
          (h.approvals || []).slice(0, 3).forEach(function (r) {
            rows.push(row(r.initials, A.esc(r.employeeName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(r.type) + ' leave</span>', A.pretty(r.from) + ' → ' + A.pretty(r.to) + ' · ' + A.days(r.days), 'decide', r.id));
          });
          (h.regularizations || []).slice(0, 2).forEach(function (r) {
            rows.push(row(r.initials, A.esc(r.employeeName) + ' <span class="muted" style="font-weight:400">· regularisation</span>', A.pretty(r.date) + ' · ' + A.esc(String(r.regType).replace(/_/g, ' ').toLowerCase()), 'decideReg', r.id));
          });
          (h.compOffApprovals || []).slice(0, 2).forEach(function (c) {
            rows.push(row(c.initials, A.esc(c.employeeName) + ' <span class="muted" style="font-weight:400">· comp off</span>', 'Worked ' + A.pretty(c.workedDate) + ' · ' + A.days(c.days), 'decideCo', c.id));
          });
          (h.expenseApprovals || []).slice(0, 2).forEach(function (c) {
            rows.push(row(c.initials, A.esc(c.employeeName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(c.category) + '</span>', A.esc(c.title) + ' · ₹' + A.money(c.amount), 'decideExpense', c.id));
          });
          approvalsBody = panel('Needs your approval', h.pendingCount ? '<a href="#/approvals">Open inbox · ' + h.pendingCount + '</a>' : '',
            rows.length ? '<div class="list">' + rows.join('') + '</div>' : A.emptyState('checkcircle', 'Nothing waiting on you. Nice.'));
        }
        if ((h.interviews || []).length) {
          attention += panel('My interviews', '', '<div class="list">' + h.interviews.map(function (i) {
            var past = String(i.scheduledAt).replace(' ', 'T') < new Date().toISOString().slice(0, 16);
            return '<div class="item"><div class="avatar ghost">' + A.esc(A.initials(i.candidateName)) + '</div><div><div class="t">' + A.esc(i.candidateName) + ' <span class="muted" style="font-weight:400">· ' + A.esc(i.jobTitle) + '</span></div>' +
              '<div class="s">' + A.esc(i.round) + ' · ' + A.esc(i.scheduledAt) + ' · ' + A.esc(i.mode) + (i.location ? ' · ' + A.esc(i.location) : '') + '</div></div>' +
              '<div class="acts row"><button class="btn ' + (past ? 'btn-primary' : 'btn-secondary') + ' btn-sm" data-act="interviewFeedback" data-json="' + A.esc(JSON.stringify(i)) + '">' + (past ? 'Submit feedback' : 'Feedback') + '</button></div></div>';
          }).join('') + '</div>');
        }
        if ((h.myTickets || []).length) {
          attention += panel('Helpdesk needs you', '<a href="#/helpdesk">All tickets</a>', '<div class="list">' + h.myTickets.map(function (t) {
            return '<div class="item" style="grid-template-columns:1fr auto"><div><div class="t">' + A.esc(t.subject) + '</div><div class="s">' + A.esc(t.id) + ' · ' + (t.status === 'RESOLVED' ? 'resolved — please confirm or reopen' : 'HR is waiting for your reply') + '</div></div>' +
              '<a class="btn btn-secondary btn-sm" href="#/helpdesk">Open</a></div>';
          }).join('') + '</div>');
        }
        var mine = panel('My recent requests', '<a href="#/leave?tab=requests">All requests</a>',
          (h.myRequests || []).length ? '<div class="list">' + h.myRequests.map(function (r) {
            return '<div class="item" style="grid-template-columns:1fr auto"><div><div class="t">' + A.esc(r.type) + ' · ' + A.pretty(r.from) + (r.from !== r.to ? ' → ' + A.pretty(r.to) : '') + '</div>' +
              '<div class="s">' + A.days(r.days) + (r.lwpDays ? ' · ' + r.lwpDays + ' LWP' : '') + (r.reason ? ' · ' + A.esc(r.reason) : '') + '</div></div>' + A.statusTag(r.status) + '</div>';
          }).join('') + '</div>' : A.emptyState('calendar', 'You have not applied for leave yet.'));

        /* ---- right column ---- */
        var celebrations = (h.celebrations || []).length ? panel('Celebrations this week', '', '<div class="stack stagger" style="gap:8px">' + h.celebrations.map(function (c) {
          return '<div class="celeb"><div class="avatar sm">' + A.esc(c.initials) + '</div><div class="grow"><div style="font-size:13.5px;font-weight:600">' + A.esc(c.name) + '</div><div class="small muted">' + (c.kind === 'birthday' ? '🎂 Birthday' : '🎉 ' + c.years + ' year' + (c.years === 1 ? '' : 's') + ' at AVP') + '</div></div>' +
            '<span class="tag ' + (c.inDays === 0 ? 'tag-accent' : 'tag-neutral') + '">' + (c.inDays === 0 ? 'Today' : A.shortD(c.date)) + '</span></div>';
        }).join('') + '</div>') : '';
        var out = panel("Who's out this week", (u.isManager ? '<a href="#/leave?tab=calendar">Team calendar</a>' : ''),
          (h.outThisWeek || []).length ? h.outThisWeek.map(function (o) {
            return '<div class="rowline"><div class="avatar sm ghost">' + A.esc(o.initials) + '</div><span class="grow">' + A.esc(o.name) + '</span>' +
              '<span class="tag ' + (o.status === 'PENDING' ? 'tag-warn' : 'tag-neutral') + '">' + A.shortD(o.from) + (o.from !== o.to ? ' – ' + A.shortD(o.to) : '') + '</span></div>';
          }).join('') : A.emptyState('users', 'Everyone is in.'));
        var holidays = panel('Upcoming holidays', '<a href="#/leave?tab=holidays">Full list</a>',
          (h.upcomingHolidays || []).length ? h.upcomingHolidays.map(function (x) {
            var dd = String(x.date).split('-');
            return '<div class="rowline"><div class="holiday-date"><b>' + (+dd[2]) + '</b><small>' + A.shortD(x.date).split(' ')[1] + '</small></div>' +
              '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(x.name) + '</div><div class="small muted">' + A.dow(x.date) + (x.isOptional ? ' · optional' : '') + '</div></div></div>';
          }).join('') : A.emptyState('calendar', 'No holidays declared yet.'));
        var teamToday = h.teamToday && h.teamToday.counts ? panel('Team today', '<a href="#/reports?tab=today">Snapshot</a>', teamStrip(h.teamToday.counts)) : '';

        return hero + (window.HRIS && HRIS.pwa ? HRIS.pwa.homeCard() : '') + kpis + quick + notices +
          '<div class="split mt4">' +
          '<div class="stack" style="gap:20px">' + attention + approvalsBody + mine + '</div>' +
          '<div class="stack" style="gap:20px">' + teamToday + celebrations + out + holidays + '</div>' +
          '</div>';
      });
    },
    mount: function () {
      if (heroTimer) clearInterval(heroTimer);
      heroTimer = setInterval(function () {
        var el = document.getElementById('heroWorked'); if (!el) { clearInterval(heroTimer); return; }
        var h = A.S.home; if (!h || !h.attendance || !h.attendance.day || !h.attendance.day.checkIn) return;
        el.textContent = A.hm(Math.max(0, nowMin() - hhmmToMin(h.attendance.day.checkIn)));
      }, 30000);
    },
    actions: {
      goAttendance: function () { A.go('attendance'); },
      applyLeave: function () { A.go('leave', { tab: 'apply' }); },
      regularize: function () { A.go('attendance', { tab: 'regularize' }); },
      compoff: function () { A.go('leave', { tab: 'compoff' }); },
      expense: function () { A.go('expenses', { action: 'new' }); },
      ticket: function () { A.go('helpdesk', { action: 'new' }); },
      payslips: function () { A.go('payslips'); },
      attendance: function () { A.go('attendance'); },
      checkin: function () { Punch.run('in').then(function () { A.confetti && A.confetti(40); A.refreshSession(); A.render(); }).catch(function () {}); },
      checkout: function () { Punch.run('out').then(function () { A.refreshSession(); A.render(); }).catch(function () {}); },
      decide: function (el) { decideLeave(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      decideReg: function (el) { decideReg(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      decideCo: function (el) { decideCompOff(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      decideExpense: function (el) { decideExpense(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      interviewFeedback: function (el) { A.interviewFeedback(JSON.parse(el.getAttribute('data-json'))); },
      ackNotice: function (el) { A.noticeActions.ackNotice(el); },
      noticeFile: function (el) { A.noticeActions.noticeFile(el); }
    }
  });

  /* ---- pieces ---- */
  function kpi(label, value, unit, extra, iconName, tone, link, sub) {
    var numeric = typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value));
    return '<div' + (link ? ' data-act="goto" data-route="' + link.route + '" data-params=\'' + A.esc(JSON.stringify(link.params || {})) + '\'' : '') + '>' +
      '<div class="stat-ic ' + (tone || '') + '">' + icon(iconName) + '</div>' +
      '<div class="stat-label">' + A.esc(label) + '</div>' +
      '<div class="stat-value">' + (numeric ? '<span data-countup="' + value + '">' + value + '</span>' : A.esc(String(value))) + (unit ? ' <small>' + A.esc(unit) + '</small>' : '') + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + (extra || '') + '</div>';
  }
  function quarterBars(qs) {
    if (!qs || !qs.length) return '';
    return '<div class="row mt2" style="gap:4px">' + qs.map(function (q) {
      var pct = q.entitled ? Math.min(100, Math.round(q.used / q.entitled * 100)) : 0;
      return '<div class="grow" title="' + A.esc(q.quarter + ': ' + q.used + ' of ' + q.entitled) + '"><div class="bar thin"><i style="width:' + pct + '%"></i></div><div class="tiny mt1" style="font-size:9.5px">' + A.esc(q.quarter) + '</div></div>';
    }).join('') + '</div>';
  }
  function qa(act, ic, label, sub) { return '<button data-act="' + act + '">' + icon(ic) + '<span>' + A.esc(label) + '<br><small>' + A.esc(sub) + '</small></span></button>'; }
  function panel(title, link, body) { return '<div class="panel"><div class="sect"><h3>' + A.esc(title) + '</h3>' + (link || '') + '</div><div class="mt1">' + body + '</div></div>'; }
  function row(initials, t, s, act, id) {
    return '<div class="item"><div class="avatar">' + A.esc(initials) + '</div><div><div class="t">' + t + '</div><div class="s">' + s + '</div></div>' +
      '<div class="acts row"><button class="btn btn-secondary btn-sm" data-act="' + act + '" data-id="' + id + '" data-d="REJECT">Decline</button><button class="btn btn-primary btn-sm" data-act="' + act + '" data-id="' + id + '" data-d="APPROVE">Approve</button></div></div>';
  }
  function teamStrip(c) {
    var items = [['Present', c.present || c.PRESENT || 0, 'ok'], ['On leave', c.onLeave || c.ON_LEAVE || 0, 'accent'], ['Absent', c.absent || c.ABSENT || 0, 'err'], ['Not marked', c.notMarked || c.NOT_MARKED || 0, 'neutral']];
    var total = items.reduce(function (s, i) { return s + (+i[1] || 0); }, 0) || 1;
    return '<div class="row" style="gap:3px;height:8px;border-radius:999px;overflow:hidden;margin:6px 0 10px">' + items.map(function (i) { return '<div style="flex:' + (+i[1] || 0) + ' 0 auto;background:var(--' + (i[2] === 'accent' ? 'accent' : i[2] === 'neutral' ? 'n300' : i[2]) + ');min-width:' + (+i[1] ? 4 : 0) + 'px"></div>'; }).join('') + '</div>' +
      '<div class="grid2" style="gap:6px">' + items.map(function (i) { return '<div class="rowline" style="padding:6px 0;font-size:13px"><span class="tag tag-' + i[2] + '">' + i[1] + '</span><span class="grow">' + i[0] + '</span><span class="small muted">' + Math.round(100 * (+i[1] || 0) / total) + '%</span></div>'; }).join('') + '</div>';
  }
  function skyline() {
    var s = '', x = 0, i = 0, seed = 7;
    while (x < 100) {
      seed = (seed * 9301 + 49297) % 233280; var w = 5 + (seed / 233280) * 8; seed = (seed * 9301 + 49297) % 233280; var hgt = 20 + (seed / 233280) * 60;
      s += '<rect x="' + x.toFixed(1) + '" y="' + (100 - hgt).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="1" fill="rgba(255,255,255,' + (0.05 + (i % 3) * 0.03).toFixed(2) + ')"/>';
      for (var wy = 100 - hgt + 4; wy < 96; wy += 6) for (var wx = x + 1.5; wx < x + w - 1.5; wx += 2.6) { seed = (seed * 9301 + 49297) % 233280; if (seed / 233280 > .45) s += '<rect x="' + wx.toFixed(1) + '" y="' + wy.toFixed(1) + '" width="1.2" height="2" fill="rgba(255,214,150,' + (seed / 233280 > .8 ? .9 : .45) + ')"/>'; }
      x += w + 1.5; i++;
    }
    return '<svg class="skyline" viewBox="0 0 100 100" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">' + s + '</svg>';
  }

  /* Shared approval helpers used by home + approvals views. */
  function decideLeave(id, decision) {
    var approve = decision === 'APPROVE';
    return A.prompt(approve ? 'Approve leave request' : 'Decline leave request',
      [{ name: 'remark', label: 'Remark (optional)', type: 'textarea', placeholder: approve ? 'Approved.' : 'Reason for declining' }], approve ? 'Approve' : 'Decline'
    ).then(function (v) {
      if (!v) return false;
      return A.api('leave.decide', { requestId: id, decision: decision, remark: v.remark }).then(function () { A.toast('Request ' + (approve ? 'approved' : 'declined') + '.', 'ok'); A.render({ quiet: true }); return true; });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
  function decideReg(id, decision) {
    var approve = decision === 'APPROVE';
    return A.prompt(approve ? 'Approve regularisation' : 'Decline regularisation', [{ name: 'remark', label: 'Remark (optional)', type: 'textarea' }], approve ? 'Approve' : 'Decline').then(function (v) {
      if (!v) return false;
      return A.api('reg.decide', { regularizationId: id, decision: decision, remark: v.remark }).then(function () { A.toast('Regularisation ' + (approve ? 'approved' : 'declined') + '.', 'ok'); A.render({ quiet: true }); return true; });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
  function decideCompOff(id, decision) {
    var approve = decision === 'APPROVE';
    return A.prompt(approve ? 'Approve comp off' : 'Decline comp off', [{ name: 'remark', label: 'Remark (optional)', type: 'textarea' }], approve ? 'Approve' : 'Decline').then(function (v) {
      if (!v) return false;
      return A.api('compoff.decide', { compOffId: id, decision: decision, remark: v.remark }).then(function () { A.toast('Comp off ' + (approve ? 'approved' : 'declined') + '.', 'ok'); A.render({ quiet: true }); return true; });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
  function decideExpense(id, decision) {
    var approve = decision === 'APPROVE';
    var fields = [{ name: 'remark', label: approve ? 'Remark (optional)' : 'Reason for declining', type: 'textarea' }];
    if (approve && (A.S.user.isHR || A.can('expenses.manage'))) fields.push({ name: 'payVia', label: 'Pay via', type: 'select', value: 'PAYROLL', options: [{ value: 'PAYROLL', label: 'Next payroll' }, { value: 'BANK', label: 'Bank transfer' }, { value: 'CASH', label: 'Cash' }] });
    return A.prompt(approve ? 'Approve claim' : 'Decline claim', fields, approve ? 'Approve' : 'Decline').then(function (v) {
      if (!v) return false;
      return A.api('expenses.decide', { claimId: id, decision: approve ? 'APPROVE' : 'REJECT', remark: v.remark, payVia: v.payVia }).then(function () { A.toast(approve ? 'Approved.' : 'Declined.', 'ok'); A.render({ quiet: true }); return true; });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
  window.Approvals = { decideLeave: decideLeave, decideReg: decideReg, decideCompOff: decideCompOff, decideExpense: decideExpense };

  /* ------------------------------------------------------------ my profile */
  A.registerView('me', {
    title: 'My profile',
    render: function (params) {
      var id = params.id || A.S.user.employeeId;
      var self = id === A.S.user.employeeId;
      return Promise.all([A.api('people.profile', { employeeId: id }), self ? A.api('letters.mine') : Promise.resolve([]), A.api('assets.mine', { employeeId: id }).catch(function () { return []; })]).then(function (r) {
        var p = r[0], myLetters = r[1], myAssets = r[2];
        var fields = [
          ['Employee code', p.code], ['Department', p.department], ['Designation', p.designation],
          ['Reporting manager', p.managerName || '—'], ['Work location', p.locationName || '—'],
          ['Date of joining', A.pretty(p.joinDate)], ['Employment status', String(p.status || '').replace('_', ' ')],
          ['Email', p.email || '—'], ['Personal / alternate email', p.altEmail || '—'],
          ['Google sign-in', p.googleEmail ? 'Linked · ' + p.googleEmail : (p.email || p.altEmail ? 'Not linked yet — any address above works once' : 'No email on file')],
          ['Phone', p.phone || '—'], ['Date of birth', p.dateOfBirth ? A.pretty(p.dateOfBirth) : '—'], ['Blood group', p.bloodGroup || '—'],
          ['Emergency contact', p.emergency && p.emergency.name ? p.emergency.name + ' (' + (p.emergency.relation || '') + ') ' + (p.emergency.phone || '') : '—']
        ];
        if (p.statutory) {
          fields.push(['PAN', p.pan || '—']);
          fields.push(['UAN / PF number', (p.statutory.uan || '—') + ' / ' + (p.statutory.pfNumber || '—') + (p.statutory.pfApplicable ? '' : ' (PF not applicable)')]);
          fields.push(['ESI number', p.statutory.esiNumber ? p.statutory.esiNumber : (p.statutory.esiApplicable ? 'Applicable — not set' : 'Not applicable')]);
          fields.push(['Bank', p.bank && p.bank.name ? p.bank.name + ' · ' + p.bank.account + ' · ' + (p.bank.ifsc || '') : '—']);
        }
        var b = p.leave || {}, a = p.attendanceThisMonth || {};
        var role = roleInfo(p.role);
        var lettersSection = '';
        if (self && myLetters.length) {
          lettersSection = '<div class="panel mt3"><div class="sect"><h3>My letters</h3></div><div class="tablewrap bare mt1"><table class="tbl"><thead><tr><th>Letter</th><th>Reference</th><th>Status</th><th>Issued</th><th></th></tr></thead><tbody>' +
            myLetters.map(function (l) {
              var ok = l.status === 'ACKNOWLEDGED';
              return '<tr><td style="font-weight:600">' + A.esc(l.templateName) + '</td><td class="small mono">' + A.esc(l.letterId) + '</td><td><span class="tag ' + (ok ? 'tag-ok' : 'tag-warn') + '">' + (ok ? 'Acknowledged' : 'Issued') + '</span></td>' +
                '<td class="small">' + A.esc(l.issuedAt) + '</td><td class="right"><div class="row" style="gap:6px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" data-act="viewLetter" data-id="' + l.letterId + '">' + icon('download') + ' View</button>' +
                (ok ? '' : '<button class="btn btn-primary btn-sm" data-act="ackLetter" data-id="' + l.letterId + '">Acknowledge</button>') + '</div></td></tr>';
            }).join('') + '</tbody></table></div></div>';
        }
        var canEdit = self || A.S.user.isHR || A.can('people.manage');
        return '' +
          '<div class="page-head"><div class="row" style="gap:16px;align-items:center"><div class="avatar xl">' + A.esc(p.initials || A.initials(p.name)) + '</div><div>' +
          '<div class="kicker">' + A.esc(p.department || '') + (p.designation ? ' · ' + A.esc(p.designation) : '') + '</div><h1>' + A.esc(p.name) + '</h1>' +
          '<div class="row wrap mt1"><span class="tag tag-neutral">' + A.esc(p.code) + '</span>' +
          '<span class="tag" style="background:' + A.esc(role.color) + '1a;color:' + A.esc(role.color) + '"><i class="swatch" style="background:' + A.esc(role.color) + '"></i>' + A.esc(role.name) + '</span>' +
          (p.onProbation || p.status === 'PROBATION' ? '<span class="tag tag-warn">On probation</span>' : '<span class="tag tag-ok">Confirmed</span>') + '</div></div></div>' +
          '<div class="row wrap">' +
          (self ? '<button class="btn btn-secondary" data-act="password">' + icon('shield') + ' Change password</button>' : '') +
          (self && A.S.boot && A.S.boot.settings && A.S.boot.settings.googleSignIn ? '<span id="googleLinkSlot"><button class="btn btn-secondary" data-act="linkGoogle">' + (typeof GOOGLE_G !== 'undefined' ? GOOGLE_G : '') + ' ' + (p.googleEmail ? 'Change Google account' : 'Link Google account') + '</button></span>' : '') +
          (self && p.googleEmail ? '<button class="btn btn-ghost" data-act="unlinkGoogle">Unlink</button>' : '') +
          '<button class="btn btn-secondary" data-act="documents">' + icon('filetext') + ' Documents</button>' +
          (canEdit ? '<button class="btn btn-primary" data-act="edit">' + icon('edit') + ' Edit details</button>' : '') +
          (!self && (A.S.user.isAdmin || A.can('admin.viewAs')) ? '<button class="btn btn-secondary" data-act="viewAsThis" data-json="' + A.esc(JSON.stringify({ id: p.employeeId, name: p.name, role: p.role })) + '">' + icon('eye') + ' View as</button>' : '') +
          '</div></div>' +
          '<div class="statstrip">' +
          kpi('Leave available', b.available !== undefined ? b.available : '—', 'of ' + (b.entitledAnnual !== undefined ? b.entitledAnnual : '—'), '', 'calendar', 'neutral', null, 'Earned so far ' + A.esc(String(b.entitledToDate !== undefined ? b.entitledToDate : '—'))) +
          kpi('Leave taken', b.consumed !== undefined ? b.consumed : 0, 'days', '', 'calendarcheck', 'info', null, b.lwpTaken ? b.lwpTaken + ' day(s) loss of pay' : 'No loss of pay') +
          kpi('Comp off', b.compOff !== undefined ? b.compOff : 0, 'days', '', 'sun', 'neutral', null, 'Available now') +
          kpi('Present this month', (a.present || 0) + (a.halfDay || 0), 'days', '', 'activity', 'ok', null, (a.absent || 0) + ' absent · ' + (a.leave || 0) + ' leave') +
          '</div>' +
          '<div class="split even mt4">' +
          '<div><div class="panel"><div class="sect"><h3>Details</h3></div><div class="grid2" style="gap:0">' + fields.map(function (f) {
            return '<div style="padding:12px 16px 12px 0;border-bottom:1px solid var(--hairline)"><div class="stat-label">' + A.esc(f[0]) + '</div><div style="font-size:14.5px;margin-top:3px;font-weight:600">' + A.esc(f[1] || '—') + '</div></div>';
          }).join('') + '</div></div></div>' +
          '<div class="stack" style="gap:20px">' +
          '<div class="panel"><div class="sect"><h3>Team</h3></div><div class="mt1">' + (p.reports && p.reports.length ? p.reports.map(function (r) {
            return '<div class="rowline"><div class="avatar sm">' + A.esc(r.initials) + '</div><div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(r.name) + '</div><div class="small muted">' + A.esc(r.designation || '') + '</div></div>' +
              '<button class="btn btn-ghost btn-sm" data-act="openProfile" data-id="' + r.employeeId + '">Open</button></div>';
          }).join('') : A.emptyState('users', 'No direct reports.')) + '</div></div>' +
          '<div class="panel"><div class="sect"><h3>Quarterly leave plan</h3></div>' + (b.quarters || []).map(function (q) {
            var pct = q.entitled ? Math.min(100, Math.round(q.used / q.entitled * 100)) : 0;
            return '<div style="padding:12px 0;border-bottom:1px solid var(--hairline)"><div class="spread"><div style="font-size:14px;font-weight:600">' + q.quarter + ' <span class="muted small">' + A.shortD(q.from) + ' – ' + A.shortD(q.to) + '</span></div>' +
              '<div class="small">' + q.used + ' / ' + q.entitled + (q.entitled !== q.quota ? ' (quota ' + q.quota + ')' : '') + '</div></div><div class="bar thin mt1"><i style="width:' + pct + '%"></i></div></div>';
          }).join('') + '</div>' +
          (A.assetsSection ? '<div class="panel">' + A.assetsSection(myAssets, self) + '</div>' : '') +
          '</div></div>' + lettersSection;
      });
    },
    actions: {
      password: function () { A.renderChangePassword(false); },
      logout: function () { A.signOut(); },
      linkGoogle: function (el) {
        el.disabled = true; el.innerHTML = '<span class="spinner"></span> Preparing…';
        A.api('auth.googleLinkUrl').then(function (r) {
          var slot = document.getElementById('googleLinkSlot');
          if (slot) slot.innerHTML = '<a class="btn btn-primary" data-google-link href="' + r.url + '" target="_top">' + (typeof GOOGLE_G !== 'undefined' ? GOOGLE_G : '') + ' Continue with Google to link</a>';
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
      documents: function () { A.showDocumentsModal(A.S.params.id || A.S.user.employeeId, A.S.user.isHR || A.can('onboarding.review')); },
      viewLetter: function (el) { A.api('letters.fetch', { letterId: el.getAttribute('data-id') }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); },
      viewAsThis: function (el) { A.enterViewAs(JSON.parse(el.getAttribute('data-json'))); },
      ackAsset: function (el) { A.api('assets.acknowledge', { movementId: el.getAttribute('data-id') }).then(function () { A.toast('Receipt acknowledged.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); }); },
      ackLetter: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Acknowledge letter', 'Confirm that you have read and received this letter.', 'Acknowledge').then(function (ok) {
          if (!ok) return;
          return A.api('letters.acknowledge', { letterId: id }).then(function () { A.toast('Acknowledged.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      }
    }
  });

  function roleInfo(roleId) {
    var r = (A.S.roles || []).filter(function (x) { return x.roleId === roleId; })[0];
    return r ? { name: r.name, color: r.color } : { name: A.roleLabel(roleId), color: { MANAGER: '#1d5fd8', HR_ADMIN: '#ec3013', SUPER_ADMIN: '#1f1c1b' }[roleId] || '#7d7674' };
  }
  function roleOptions(current) {
    var list = (A.S.roles && A.S.roles.length) ? A.S.roles : [{ roleId: 'EMPLOYEE', name: 'Employee' }, { roleId: 'MANAGER', name: 'Manager' }, { roleId: 'HR_ADMIN', name: 'HR admin' }, { roleId: 'SUPER_ADMIN', name: 'Administrator' }];
    if (!A.S.user.isAdmin) list = list.filter(function (r) { return r.roleId !== 'SUPER_ADMIN' || current === 'SUPER_ADMIN'; });
    return list.map(function (r) { return { value: r.roleId, label: r.name + (r.isSystem === false ? ' (custom)' : '') }; });
  }
  function editProfile(id) {
    A.api('people.profile', { employeeId: id }).then(function (p) {
      var hr = A.S.user.isHR || A.can('people.manage');
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
          { name: 'Role', label: 'App role (define more under Administration → Roles & permissions)', type: 'select', value: p.role, options: roleOptions(p.role) },
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

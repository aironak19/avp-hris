/* ==========================================================================
   Leave — balance, application with live policy preview, history,
   compensatory off, holidays, team calendar
   ========================================================================== */
(function () {
  var A = App;
  var TABS = [['balance', 'Balance'], ['apply', 'Apply'], ['requests', 'My requests'],
  ['compoff', 'Comp off'], ['holidays', 'Holidays'], ['calendar', 'Team']];

  A.registerView('leave', {
    title: 'Leave',
    render: function (params) {
      var tab = params.tab || 'balance';
      var head =
        '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px">' +
        '<div><div class="kicker">Financial year ' + A.esc(A.S.boot.financialYear) + ' · April–March</div>' +
        '<h1 style="margin:0">Leave</h1></div>' +
        '<button class="btn btn-primary" data-act="tab" data-tab="apply">' + icon('plus') + ' Apply for leave</button></div>' +
        '<div class="seg" style="margin-bottom:22px;overflow:auto">' +
        TABS.map(function (t) {
          return '<button data-act="tab" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
        }).join('') + '</div>';

      if (tab === 'apply') {
        return Promise.all([A.api('leave.balance', {}), A.api('leave.types')])
          .then(function (r) { return head + applyTab(r[0], r[1]); });
      }
      if (tab === 'requests') {
        return A.api('leave.list', { scope: 'me' }).then(function (l) { return head + requestsTab(l); });
      }
      if (tab === 'compoff') {
        return A.api('compoff.list', {}).then(function (l) { return head + compOffTab(l); });
      }
      if (tab === 'holidays') {
        return A.api('leave.holidays', {}).then(function (l) { return head + holidaysTab(l); });
      }
      if (tab === 'calendar') {
        var from = A.todayStr(), to = A.addDaysStr(from, 30);
        return A.api('leave.calendar', { from: from, to: to, scope: A.S.user.isHR ? 'all' : 'team' })
          .then(function (l) { return head + calendarTab(l, from, to); });
      }
      return A.api('leave.balance', {}).then(function (b) { return head + balanceTab(b); });
    },
    mount: function (host, params) {
      if ((params.tab || 'balance') === 'apply') wireApply();
    },
    actions: {
      tab: function (el) { A.go('leave', { tab: el.getAttribute('data-tab') }); },
      cancel: function (el) { cancelRequest(el.getAttribute('data-id')); },
      viewReq: function (el) { viewRequest(el.getAttribute('data-id')); },
      claimCompOff: function () { compOffForm(); }
    }
  });

  A.addDaysStr = function (ymd, n) {
    var p = String(ymd).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2], 12);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ----------------------------------------------------------- balance tab */
  function balanceTab(b) {
    var pct = b.entitledAnnual ? Math.round(b.available / b.entitledAnnual * 100) : 0;
    return '' +
      '<div class="split wide">' +
      '<div>' +
      '  <div class="stat-label">Paid leave available</div>' +
      '  <div style="font-weight:800;font-size:64px;letter-spacing:-.035em;line-height:1;margin:6px 0 12px">' + b.available +
      '    <span style="font-size:15px;font-weight:400;color:var(--n600);letter-spacing:0">of ' + b.entitledAnnual + ' days this year</span></div>' +
      '  <div class="bar" style="height:8px"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>' +
      (b.onProbation ? '<div class="geo bad mt2">' + icon('alert') + '<div>You are on probation until <b>' + A.pretty(b.eligibleFrom) +
        '</b>. As per policy §9, paid leave is not available during probation — any leave taken now is recorded as loss of pay.</div></div>' : '') +
      '  <div class="statstrip mt3">' +
      '    <div><div class="stat-label">Earned so far</div><div class="stat-value">' + b.entitledToDate + '</div><div class="stat-sub">accrued to date</div></div>' +
      '    <div><div class="stat-label">Taken</div><div class="stat-value">' + b.consumed + '</div><div class="stat-sub">approved</div></div>' +
      '    <div><div class="stat-label">Pending</div><div class="stat-value">' + b.pending + '</div><div class="stat-sub">awaiting approval</div></div>' +
      '    <div><div class="stat-label">Loss of pay</div><div class="stat-value">' + b.lwpTaken + '</div><div class="stat-sub">this year</div></div>' +
      '  </div>' +
      '  <div class="sect mt4"><h3>Quarterly allocation</h3><span class="small muted">4 · 4 · 3 · 4 days</span></div>' +
      '  <div class="tablewrap"><table class="tbl"><thead><tr><th>Quarter</th><th>Period</th><th>Quota</th><th>Earned</th><th>Used</th><th>Status</th></tr></thead><tbody>' +
      b.quarters.map(function (q) {
        return '<tr' + (q.current ? ' style="background:var(--a100)"' : '') + '><td style="font-weight:700">' + q.quarter + '</td>' +
          '<td class="nowrap">' + A.shortD(q.from) + ' – ' + A.shortD(q.to) + '</td>' +
          '<td>' + q.quota + '</td><td>' + q.entitled + '</td><td>' + q.used + '</td>' +
          '<td>' + (q.current ? '<span class="tag tag-accent">Current</span>' : (q.started ? '<span class="tag tag-neutral">Closed</span>' : '<span class="tag tag-neutral">Upcoming</span>')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '</div>' +
      '<div>' +
      '  <div class="sect"><h3>Compensatory off</h3></div>' +
      '  <div class="panel tight"><div class="spread"><div><div class="stat-label">Available</div>' +
      '    <div style="font-weight:800;font-size:34px;line-height:1;margin-top:4px">' + b.compOff + '</div></div>' +
      '    <button class="btn btn-secondary btn-sm" data-act="tab" data-tab="compoff">Manage</button></div>' +
      '    <div class="small muted mt1">Earned against approved extra working. Must be availed within 30 days; no encashment.</div></div>' +
      '  <div class="sect mt4"><h3>Policy at a glance</h3></div>' +
      '  <div class="panel tight small" style="line-height:1.7">' +
      '    • 15 paid leaves per financial year, allotted 4/4/3/4 by quarter.<br>' +
      '    • Unused quarter balance carries forward within the year; the balance lapses on 31 March.<br>' +
      '    • No paid leave during the 6-month probation.<br>' +
      '    • Leave beyond the balance earned so far is loss of pay for that month.<br>' +
      '    • Sandwich rule: a holiday or weekly off enclosed by leave counts as leave.<br>' +
      '    • Prior approval from the reporting authority is mandatory.' +
      '  </div>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------- apply tab */
  function applyTab(bal, types) {
    var today = A.todayStr();
    return '' +
      '<div class="split wide">' +
      '<div><form id="lvForm" class="panel">' +
      '  <h4 style="margin-bottom:16px">New leave request</h4>' +
      '  <div class="field"><label>Leave type</label><select class="input" name="leaveTypeCode" id="lvType">' +
      types.map(function (t) {
        return '<option value="' + t.code + '">' + A.esc(t.name) + (t.isPaid ? '' : ' (unpaid)') + '</option>';
      }).join('') + '</select><div class="small muted mt1" id="lvTypeHelp">' + A.esc((types[0] || {}).description || '') + '</div></div>' +
      '  <div class="grid2">' +
      '    <div class="field"><label>From</label><input class="input" type="date" name="fromDate" id="lvFrom" value="' + today + '" required></div>' +
      '    <div class="field"><label>To</label><input class="input" type="date" name="toDate" id="lvTo" value="' + today + '" required></div>' +
      '  </div>' +
      '  <div class="grid2">' +
      '    <div class="field"><label>First day</label><select class="input" name="fromSession" id="lvFromS">' +
      '      <option value="FULL">Full day</option><option value="SECOND_HALF">Second half only</option></select></div>' +
      '    <div class="field"><label>Last day</label><select class="input" name="toSession" id="lvToS">' +
      '      <option value="FULL">Full day</option><option value="FIRST_HALF">First half only</option></select></div>' +
      '  </div>' +
      '  <div class="field"><label>Reason</label><textarea class="input" name="reason" id="lvReason" placeholder="Your manager will see this." required></textarea></div>' +
      '  <div class="grid2">' +
      '    <div class="field"><label>Contact number during leave</label><input class="input" name="contactNumber" value="' + A.esc(A.S.user.phone || '') + '"></div>' +
      '    <div class="field"><label>Handover to (optional)</label><input class="input" name="handoverTo"></div>' +
      '  </div>' +
      '  <button class="btn btn-primary btn-xl" type="submit" id="lvSubmit">Send for approval</button>' +
      '</form></div>' +
      '<div>' +
      '  <div class="sect"><h3>What this costs</h3></div>' +
      '  <div id="lvPreview" class="panel tight"><div class="small muted">Choose your dates to see the calculation.</div></div>' +
      '  <div class="sect mt4"><h3>Balance</h3></div>' +
      '  <div class="statstrip" style="grid-template-columns:1fr 1fr">' +
      '    <div><div class="stat-label">Available</div><div class="stat-value">' + bal.available + '</div><div class="stat-sub">days</div></div>' +
      '    <div><div class="stat-label">Comp off</div><div class="stat-value">' + bal.compOff + '</div><div class="stat-sub">days</div></div>' +
      '  </div>' +
      '</div></div>';
  }

  var previewTimer = null;
  function wireApply() {
    var form = document.getElementById('lvForm');
    if (!form) return;
    var ids = ['lvType', 'lvFrom', 'lvTo', 'lvFromS', 'lvToS'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', schedulePreview);
    });
    document.getElementById('lvFrom').addEventListener('change', function () {
      var f = document.getElementById('lvFrom'), t = document.getElementById('lvTo');
      if (t.value < f.value) t.value = f.value;
      schedulePreview();
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('lvSubmit');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';
      A.api('leave.apply', collect()).then(function (res) {
        A.toast('Leave request ' + res.requestId + ' sent to ' + (res.approver.FullName || 'your approver') + '.', 'ok', 5000);
        A.go('leave', { tab: 'requests' });
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Send for approval';
        A.toast(e.message, 'err');
      });
    });
    schedulePreview();
  }

  function collect() {
    var f = document.getElementById('lvForm');
    return {
      leaveTypeCode: f.leaveTypeCode.value,
      fromDate: f.fromDate.value, toDate: f.toDate.value,
      fromSession: f.fromSession.value, toSession: f.toSession.value,
      reason: f.reason.value, contactNumber: f.contactNumber.value, handoverTo: f.handoverTo.value
    };
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, 250);
  }

  function runPreview() {
    var box = document.getElementById('lvPreview');
    if (!box) return;
    var p = collect();
    if (!p.fromDate || !p.toDate) return;
    box.innerHTML = '<div class="row"><span class="spinner"></span><span class="small muted">Calculating…</span></div>';
    A.api('leave.preview', p).then(function (r) {
      if (!box.isConnected) return;
      box.innerHTML =
        '<div class="spread"><span class="stat-label">Total leave</span><span style="font-weight:800;font-size:26px">' + r.totalDays + '</span></div>' +
        row('Working days', r.workingDays) +
        (r.sandwichDays ? row('Sandwich (holidays/offs counted)', r.sandwichDays) : '') +
        (r.paidDays ? row('Paid from balance', r.paidDays) : '') +
        (r.compOffDays ? row('From compensatory off', r.compOffDays) : '') +
        (r.lwpDays ? row('Loss of pay', r.lwpDays) : '') +
        row('Balance after', r.balanceAfter + ' of ' + (r.balanceBefore) + ' now') +
        (r.warnings || []).map(function (w) {
          return '<div class="geo bad mt2" style="align-items:flex-start">' + icon('alert') + '<div>' + A.esc(w) + '</div></div>';
        }).join('') +
        '<div class="mt2 small muted">' + r.breakdown.filter(function (b) { return b.units > 0; }).map(function (b) {
          return A.shortD(b.date) + (b.units === 0.5 ? ' ½' : '') + (b.reason && b.reason.indexOf('SANDWICH') === 0 ? ' (sandwich)' : '');
        }).join(' · ') + '</div>';
    }).catch(function (e) {
      if (box.isConnected) box.innerHTML = '<div class="geo bad">' + icon('alert') + '<div>' + A.esc(e.message) + '</div></div>';
    });
  }

  function row(k, v) {
    return '<div class="spread" style="border-top:1px solid var(--line);padding:8px 0">' +
      '<span class="small muted">' + A.esc(k) + '</span><span style="font-weight:600">' + A.esc(v) + '</span></div>';
  }

  /* ---------------------------------------------------------- requests tab */
  function requestsTab(list) {
    if (!list.length) return '<div class="empty">No leave requests yet. Use <b>Apply</b> to raise one.</div>';
    return '<div class="tablewrap"><table class="tbl"><thead><tr>' +
      '<th>Applied</th><th>Type</th><th>Period</th><th>Days</th><th>Paid</th><th>LWP</th><th>Status</th><th>Approver</th><th></th>' +
      '</tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr class="clickable"><td class="small nowrap">' + A.esc(String(r.appliedAt || '').slice(0, 10)) + '</td>' +
          '<td>' + A.esc(r.type) + '</td>' +
          '<td class="nowrap">' + A.pretty(r.from) + (r.from !== r.to ? ' → ' + A.pretty(r.to) : '') + '</td>' +
          '<td>' + r.days + '</td><td>' + r.paidDays + '</td><td>' + r.lwpDays + '</td>' +
          '<td>' + A.statusTag(r.status) + '</td>' +
          '<td class="small">' + A.esc(r.approverName || '') + '</td>' +
          '<td class="right nowrap">' +
          '<button class="btn btn-ghost btn-sm" data-act="viewReq" data-id="' + r.id + '">View</button>' +
          (r.status === 'PENDING' || (r.status === 'APPROVED' && r.from >= A.todayStr())
            ? '<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="' + r.id + '">Cancel</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewRequest(id) {
    A.api('leave.list', { scope: 'me' }).then(function (l) {
      var r = l.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      A.modal({
        title: 'Leave request ' + r.id,
        body: '<div>' + A.statusTag(r.status) + '</div><div class="mt2">' +
          kv('Type', r.type) + kv('Period', A.pretty(r.from) + ' → ' + A.pretty(r.to)) +
          kv('Total days', r.days) + kv('Paid days', r.paidDays) + kv('Loss of pay', r.lwpDays) +
          (r.sandwichDays ? kv('Sandwich days', r.sandwichDays) : '') +
          kv('Reason', r.reason || '—') + kv('Approver', r.approverName || '—') +
          kv('Actioned', r.actionAt || '—') + kv('Remark', r.actionRemark || '—') + '</div>'
      });
    });
  }

  function kv(k, v) {
    return '<div class="spread" style="border-bottom:1px solid var(--line);padding:8px 0">' +
      '<span class="small muted">' + A.esc(k) + '</span><span style="font-size:14px;font-weight:600">' + A.esc(v) + '</span></div>';
  }

  function cancelRequest(id) {
    A.prompt('Cancel leave request', [{ name: 'reason', label: 'Reason for cancelling', type: 'textarea' }], 'Cancel request')
      .then(function (v) {
        if (!v) return;
        return A.api('leave.cancel', { requestId: id, reason: v.reason })
          .then(function () { A.toast('Request cancelled.', 'ok'); A.render(); });
      }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ----------------------------------------------------------- comp off tab */
  function compOffTab(list) {
    return '' +
      '<div class="sect"><h3>Compensatory off</h3>' +
      '<button class="btn btn-primary btn-sm" data-act="claimCompOff">' + icon('plus') + ' Claim comp off</button></div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">Claim a compensatory off for work done on a weekly off or a declared holiday. ' +
      'Once approved it must be availed within 30 days, cannot be applied to a leave taken <i>before</i> the extra working, and is never encashed.</div>' +
      (list.length ? '<div class="tablewrap mt3"><table class="tbl"><thead><tr><th>Worked on</th><th>Days</th><th>Hours</th><th>Reason</th><th>Valid till</th><th>Used</th><th>Status</th></tr></thead><tbody>' +
        list.map(function (c) {
          return '<tr><td class="nowrap">' + A.pretty(c.workedDate) + '</td><td>' + c.days + '</td><td>' + (c.hours || '—') + '</td>' +
            '<td class="small">' + A.esc(c.reason || '') + '</td>' +
            '<td class="nowrap">' + A.pretty(c.expiry) + '</td><td>' + c.consumed + '</td>' +
            '<td>' + (c.expired ? '<span class="tag tag-neutral">Lapsed</span>' : A.statusTag(c.status)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">No compensatory off claimed yet.</div>');
  }

  function compOffForm() {
    A.modal({
      title: 'Claim compensatory off',
      body: '<form id="cof">' +
        '<div class="field"><label>Date worked (weekly off or holiday)</label>' +
        '<input class="input" type="date" name="workedDate" max="' + A.todayStr() + '" value="' + A.todayStr() + '" required></div>' +
        '<div class="field"><label>Hours worked</label><input class="input" type="number" name="hours" min="1" max="14" step="0.5" value="8"></div>' +
        '<div class="field"><label>What did you work on?</label><textarea class="input" name="reason" required></textarea></div>' +
        '<div class="small muted">6 hours or more earns a full day, 3–6 hours earns half a day.</div>' +
        '</form>',
      footer: '<button class="btn btn-secondary" onclick="App.close()">Cancel</button>' +
        '<button class="btn btn-primary" id="co-send">Send for approval</button>',
      onMount: function (root) {
        root.querySelector('#co-send').onclick = function () {
          var f = root.querySelector('#cof');
          A.api('compoff.request', {
            workedDate: f.workedDate.value, hours: f.hours.value, reason: f.reason.value
          }).then(function (r) {
            A.close(); A.toast('Comp off claim sent · valid till ' + A.pretty(r.expiry), 'ok'); A.render();
          }).catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  }

  /* ---------------------------------------------------------- holidays tab */
  function holidaysTab(list) {
    if (!list.length) return '<div class="empty">No holidays have been declared for this financial year yet.</div>';
    var past = A.todayStr();
    return '<div class="tablewrap"><table class="tbl"><thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th>Type</th><th></th></tr></thead><tbody>' +
      list.map(function (h) {
        return '<tr' + (h.date < past ? ' class="muted"' : '') + '><td class="nowrap">' + A.pretty(h.date) + '</td>' +
          '<td>' + A.dow(h.date) + '</td><td style="font-weight:600">' + A.esc(h.name) + '</td>' +
          '<td><span class="tag tag-neutral">' + A.esc(h.optional ? 'Optional' : h.type) + '</span></td>' +
          '<td class="right small muted">' + (h.date < past ? 'Past' : 'Upcoming') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------------------------------------------------- calendar tab */
  function calendarTab(list, from, to) {
    if (!list.length) return '<div class="empty">Nobody in your team is on leave in the next 30 days.</div>';
    var byPerson = {};
    list.forEach(function (l) { (byPerson[l.name] = byPerson[l.name] || []).push(l); });
    return '<div class="sect"><h3>Away between ' + A.pretty(from) + ' and ' + A.pretty(to) + '</h3></div>' +
      Object.keys(byPerson).sort().map(function (name) {
        var rows = byPerson[name];
        return '<div class="rowline"><div class="avatar sm ghost">' + A.esc(A.initials(name)) + '</div>' +
          '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(name) + '</div>' +
          '<div class="small muted">' + A.esc(rows[0].department || '') + '</div></div>' +
          '<div class="row wrap" style="justify-content:flex-end">' + rows.map(function (r) {
            return '<span class="tag ' + (r.status === 'PENDING' ? 'tag-warn' : 'tag-accent') + '">' +
              A.shortD(r.from) + (r.from !== r.to ? ' – ' + A.shortD(r.to) : '') + ' · ' + A.esc(r.type) + '</span>';
          }).join(' ') + '</div></div>';
      }).join('');
  }
})();

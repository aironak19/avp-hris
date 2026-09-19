/* ==========================================================================
   Attendance — geofenced punching, monthly register, regularization
   ========================================================================== */
var Punch = (function () {
  var A = App;

  function haversine(a, b, c, d) {
    var R = 6371000, r = function (v) { return v * Math.PI / 180; };
    var dLat = r(c - a), dLon = r(d - b);
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }

  /**
   * A random id minted once per browser/device and kept in localStorage —
   * separate from the user-agent string, which many phones of the same model
   * share. Lets HR spot one device punching in for several different
   * employees (Administration → Device anomalies), without identifying
   * anyone beyond that.
   */
  function deviceId() {
    var id = A.store.get('hris_device_id');
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      A.store.set('hris_device_id', id);
    }
    return id;
  }

  function progress(text) {
    A.modal({
      title: 'Marking attendance',
      body: '<div class="row" style="gap:12px"><span class="spinner"></span><span id="pg-text">' + A.esc(text) + '</span></div>',
      footer: null
    });
  }
  function step(t) { var e = document.getElementById('pg-text'); if (e) e.textContent = t; }

  /** Full punch flow. dir = 'in' | 'out'. */
  function run(dir) {
    progress('Reading your location…');
    return A.getPosition()
      .then(function (pos) {
        step('Verifying you are inside the site boundary…');
        return A.api(dir === 'in' ? 'att.checkin' : 'att.checkout', {
          lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
          device: navigator.userAgent, deviceId: deviceId()
        }).then(function (res) {
          A.close();
          if (dir === 'in') {
            A.toast('Checked in at ' + res.time + (res.location ? ' · ' + res.location : '') +
              (res.lateMinutes ? ' · late by ' + A.hm(res.lateMinutes) : ''), 'ok', 5000);
          } else {
            A.toast('Checked out at ' + res.time + ' · ' + res.worked + ' worked', 'ok', 5000);
          }
          return res;
        }).catch(function (e) {
          A.close();
          if (e.code === 'OUT_OF_GEOFENCE') return outOfFence(e.details, dir, pos);
          throw e;
        });
      })
      .catch(function (e) {
        A.close();
        A.toast(e.message, 'err');
        throw e;
      });
  }

  /** Offer a regularization when the punch lands outside every allowed fence. */
  function outOfFence(det, dir, pos) {
    var now = new Date();
    var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return new Promise(function (resolve) {
      A.modal({
        title: 'You are outside the site boundary',
        body:
          '<div class="geo bad" style="margin-bottom:14px">' + icon('pin') +
          '<div>You are <b>' + (det.distance !== null ? det.distance + ' m' : 'too far') + '</b> from <b>' +
          A.esc(det.nearest || 'your mapped location') + '</b>, which allows ' + (det.radius || '—') + ' m.</div></div>' +
          '<p class="small muted">Attendance cannot be marked from here. If you are on site work, client visit or working from home, raise a regularization and your manager can approve it.</p>' +
          '<form id="oof">' +
          '<div class="field"><label>What were you doing?</label><select class="input" name="regType">' +
          '<option value="ON_DUTY">On duty — site / client visit</option>' +
          '<option value="OUT_OF_GEOFENCE">At work but outside the mapped boundary</option>' +
          '<option value="WFH">Working from home</option></select></div>' +
          '<div class="grid2"><div class="field"><label>Check-in time</label><input class="input" type="time" name="checkIn" value="' + (dir === 'in' ? hhmm : '09:30') + '"></div>' +
          '<div class="field"><label>Check-out time</label><input class="input" type="time" name="checkOut" value="' + (dir === 'out' ? hhmm : '') + '"></div></div>' +
          '<div class="field"><label>Reason</label><textarea class="input" name="reason" placeholder="Site visit at ..., client meeting, etc."></textarea></div>' +
          '<input type="hidden" name="lat" value="' + pos.lat + '"><input type="hidden" name="lng" value="' + pos.lng + '">' +
          '</form>',
        footer: '<button class="btn btn-secondary" id="oof-no">Not now</button><button class="btn btn-primary" id="oof-yes">Send for approval</button>',
        onMount: function (root) {
          root.querySelector('#oof-no').onclick = function () { A.close(); resolve(null); };
          root.querySelector('#oof-yes').onclick = function () {
            var f = root.querySelector('#oof');
            A.api('reg.request', {
              date: A.todayStr(),
              regType: f.regType.value,
              checkIn: f.checkIn.value,
              checkOut: f.checkOut.value,
              status: f.regType.value === 'WFH' ? 'WFH' : (f.regType.value === 'ON_DUTY' ? 'ON_DUTY' : 'PRESENT'),
              reason: f.reason.value + ' [GPS ' + Number(f.lat.value).toFixed(5) + ', ' + Number(f.lng.value).toFixed(5) +
                ' · ' + (det.distance || '?') + ' m from ' + (det.nearest || '—') + ']'
            }).then(function () {
              A.close(); A.toast('Sent to your manager for approval.', 'ok'); resolve(null); A.render();
            }).catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    });
  }

  return { run: run, haversine: haversine };
})();

(function () {
  var A = App;
  var live = null;

  A.registerView('attendance', {
    title: 'Attendance',
    render: function (params) {
      var tab = params.tab || 'today';
      var month = params.month || A.monthKey();
      var head =
        '<div class="spread wrap" style="align-items:flex-end;margin-bottom:20px">' +
        '<div><div class="kicker">Geofenced attendance</div><h1 style="margin:0">Attendance</h1></div>' +
        '<div class="seg" style="width:auto">' +
        tabBtn('today', tab, 'Today') + tabBtn('month', tab, 'Register') + tabBtn('regularize', tab, 'Regularize') +
        '</div></div>';

      if (tab === 'month') return A.api('att.month', { month: month }).then(function (m) { return head + monthTab(m); });
      if (tab === 'regularize') {
        return Promise.all([A.api('reg.list', { scope: 'me' }), A.api('att.month', { month: month })])
          .then(function (r) { return head + regularizeTab(r[0], r[1]); });
      }
      return A.api('att.today').then(function (t) { return head + todayTab(t); });
    },
    mount: function (host, params) {
      var tab = params.tab || 'today';
      if (tab === 'today') {
        startClock();
        locate();
      }
    },
    actions: {
      tab: function (el) { A.go('attendance', { tab: el.getAttribute('data-tab') }); },
      checkin: function () { Punch.run('in').then(function () { A.render(); }).catch(function () {}); },
      checkout: function () { Punch.run('out').then(function () { A.render(); }).catch(function () {}); },
      refreshLoc: function () { locate(true); },
      prevMonth: function () { A.go('attendance', { tab: 'month', month: A.addMonthKey(A.S.params.month || A.monthKey(), -1) }); },
      nextMonth: function () { A.go('attendance', { tab: 'month', month: A.addMonthKey(A.S.params.month || A.monthKey(), 1) }); },
      dayInfo: function (el) { dayInfo(el.getAttribute('data-date'), el.getAttribute('data-status')); },
      newReg: function () { regularizeForm(); },
      regFor: function (el) { regularizeForm(el.getAttribute('data-date')); },
      cancelReg: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Withdraw request', 'Withdraw this regularization request?', 'Withdraw').then(function (ok) {
          if (!ok) return;
          return A.api('reg.cancel', { regularizationId: id })
            .then(function () { A.toast('Request withdrawn.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      }
    }
  });

  function tabBtn(id, cur, label) {
    return '<button data-act="tab" data-tab="' + id + '" class="' + (cur === id ? 'on' : '') + '">' + label + '</button>';
  }

  /* ------------------------------------------------------------- today tab */
  function todayTab(t) {
    var d = t.day;
    var done = d.checkIn && d.checkOut;
    var locs = t.locations.map(function (l) {
      return '<div class="rowline" data-loc="' + l.id + '" data-name="' + A.esc(l.name) + '" data-lat="' + l.lat + '" data-lng="' + l.lng + '" data-radius="' + l.radius + '">' +
        icon('pin') + '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(l.name) + '</div>' +
        '<div class="small muted">' + A.esc(l.address || '') + ' · fence ' + l.radius + ' m</div></div>' +
        '<span class="tag tag-neutral dist">—</span></div>';
    }).join('');

    return '' +
      '<div class="split wide">' +
      '<div>' +
      '  <div class="punch">' +
      '    <div class="spread"><div class="stat-label">' + A.esc(t.weekday + ', ' + t.prettyDate) + '</div>' + A.statusTag(d.status) + '</div>' +
      '    <div class="clock" id="clock">--:--</div>' +
      '    <div class="geo wait" id="geoStatus"><span class="pulse"></span><span id="geoText">Locating you…</span>' +
      '      <button class="btn btn-ghost btn-sm" data-act="refreshLoc" style="margin-left:auto">' + icon('refresh') + '</button></div>' +
      (done
        ? '<button class="btn btn-secondary btn-xl" disabled>' + icon('check') + ' Day complete</button>'
        : (d.checkIn
          ? '<button class="btn btn-dark btn-xl" data-act="checkout" id="punchBtn">' + icon('clock') + ' Check out</button>'
          : '<button class="btn btn-primary btn-xl" data-act="checkin" id="punchBtn">' + icon('clock') + ' Check in</button>')) +
      '    <div class="punchgrid">' +
      '      <div><div class="stat-label">Check in</div><div style="font-weight:800;font-size:22px;margin-top:4px">' + (d.checkIn || '—') + '</div>' +
      '        <div class="small muted">' + (d.checkIn ? (d.lateMinutes ? 'Late by ' + A.hm(d.lateMinutes) : 'On time') + (d.locationName ? ' · ' + A.esc(d.locationName) : '') : 'Shift starts ' + t.shift.start) + '</div></div>' +
      '      <div><div class="stat-label">Check out</div><div style="font-weight:800;font-size:22px;margin-top:4px">' + (d.checkOut || '—') + '</div>' +
      '        <div class="small muted">' + (d.checkOut ? A.hm(d.workedMinutes) + ' worked' : 'Shift ends ' + t.shift.end) + '</div></div>' +
      '    </div>' +
      (d.status === 'HOLIDAY' || d.status === 'WEEKLY_OFF'
        ? '<div class="small muted">Today is a ' + A.STATUS_LABEL[d.status].toLowerCase() + '. If you work today, claim a compensatory off from the Leave screen.</div>' : '') +
      '  </div>' +
      '  <div class="sect mt4"><h3>This month</h3><a href="#/attendance?tab=month">Open register</a></div>' +
      summaryStrip(t.monthSummary) +
      '</div>' +
      '<div>' +
      '  <div class="sect"><h3>Your sites</h3></div>' + (locs || '<div class="empty">No location mapped yet — ask HR.</div>') +
      '  <div class="sect mt4"><h3>How it works</h3></div>' +
      '  <div class="panel tight small" style="line-height:1.6">' +
      '    Attendance is marked from your phone or laptop using GPS. You must be inside the boundary of a site mapped to you. ' +
      'Working elsewhere? Mark it through <b>Regularize</b> and your manager approves it. Shift is ' +
      A.esc(t.shift.start) + '–' + A.esc(t.shift.end) + ' with ' + t.shift.grace + ' minutes grace.' +
      '  </div>' +
      '</div></div>';
  }

  function summaryStrip(s) {
    if (!s) return '';
    return '<div class="statstrip">' +
      '<div><div class="stat-label">Present</div><div class="stat-value">' + (s.present + s.halfDay) + '</div><div class="stat-sub">' + s.halfDay + ' half day(s)</div></div>' +
      '<div><div class="stat-label">Leave</div><div class="stat-value">' + s.leave + '</div><div class="stat-sub">approved</div></div>' +
      '<div><div class="stat-label">Absent</div><div class="stat-value">' + s.absent + '</div><div class="stat-sub">' + s.missingPunch + ' missing punch</div></div>' +
      '<div><div class="stat-label">Hours</div><div class="stat-value">' + s.workedHours + '</div><div class="stat-sub">' + s.late + ' late mark(s)</div></div>' +
      '</div>';
  }

  function startClock() {
    if (live) clearInterval(live);
    var tick = function () {
      var el = document.getElementById('clock');
      if (!el) { clearInterval(live); return; }
      var n = new Date();
      el.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0') +
        ':' + String(n.getSeconds()).padStart(2, '0');
    };
    tick();
    live = setInterval(tick, 1000);
  }

  /** Show live distance to each mapped site. */
  function locate(force) {
    var box = document.getElementById('geoStatus');
    var txt = document.getElementById('geoText');
    if (!box) return;
    box.className = 'geo wait';
    if (txt) txt.textContent = 'Locating you…';
    A.getPosition({ maximumAge: force ? 0 : 30000 }).then(function (pos) {
      var nodes = document.querySelectorAll('[data-loc]');
      var best = null;
      nodes.forEach(function (n) {
        var la = parseFloat(n.getAttribute('data-lat')), ln = parseFloat(n.getAttribute('data-lng'));
        var rad = parseFloat(n.getAttribute('data-radius')) || 150;
        var tag = n.querySelector('.dist');
        if (!la || !ln) { if (tag) tag.textContent = 'no coordinates'; return; }
        var dist = Punch.haversine(pos.lat, pos.lng, la, ln);
        if (tag) {
          tag.textContent = dist < 1000 ? dist + ' m' : (dist / 1000).toFixed(1) + ' km';
          tag.className = 'tag dist ' + (dist <= rad ? 'tag-ok' : 'tag-neutral');
        }
        if (!best || dist < best.dist) best = { dist: dist, name: n.getAttribute('data-name'), ok: dist <= rad };
      });
      if (!box.isConnected) return;
      if (!best) {
        box.className = 'geo';
        if (txt) txt.textContent = 'Location ready (±' + Math.round(pos.accuracy) + ' m). No site coordinates configured yet.';
        return;
      }
      box.className = 'geo ' + (best.ok ? 'ok' : 'bad');
      if (txt) {
        txt.textContent = best.ok
          ? 'Inside ' + best.name + ' · ' + best.dist + ' m from centre (±' + Math.round(pos.accuracy) + ' m)'
          : 'Outside every site — nearest is ' + best.name + ' at ' + (best.dist < 1000 ? best.dist + ' m' : (best.dist / 1000).toFixed(1) + ' km');
      }
    }).catch(function (e) {
      if (!box.isConnected) return;
      box.className = 'geo bad';
      if (txt) txt.textContent = e.message;
    });
  }

  /* ------------------------------------------------------------- month tab */
  function monthTab(m) {
    var first = m.days[0];
    var lead = first ? new Date(first.date + 'T12:00:00').getDay() : 0;
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<div class="d empty"></div>';
    m.days.forEach(function (d) {
      var n = parseInt(d.date.slice(8), 10);
      cells += '<div class="d ' + d.status + (d.date === A.todayStr() ? ' today' : '') + '" data-act="dayInfo" data-date="' + d.date + '" data-status="' + d.status + '">' +
        '<div class="n">' + n + '</div>' +
        '<div class="m">' + shortStatus(d) + '</div></div>';
    });

    return '' +
      '<div class="spread" style="margin-bottom:14px">' +
      '<div class="row"><button class="iconbtn" data-act="prevMonth">' + icon('back') + '</button>' +
      '<h3 style="margin:0">' + A.esc(m.label) + '</h3>' +
      '<button class="iconbtn" data-act="nextMonth">' + icon('chevron') + '</button></div>' +
      '<div class="small muted">' + A.esc(m.employee.name) + '</div></div>' +
      summaryStrip(m.summary) +
      '<div class="mt3 cal">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (x) {
        return '<div class="h">' + x + '</div>';
      }).join('') + cells + '</div>' +
      '<div class="legend">' +
      leg('var(--ok-bg)', 'Present') + leg('#fdf3dd', 'Half / missing punch') + leg('var(--err-bg)', 'Absent') +
      leg('var(--a200)', 'Leave') + leg('var(--n200)', 'Weekly off') + leg('var(--n300)', 'Holiday') +
      '</div>' +
      '<div class="sect mt4"><h3>Daily log</h3></div>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>Date</th><th>Day</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Late</th><th>Location</th><th></th></tr></thead><tbody>' +
      m.days.map(function (d) {
        return '<tr><td class="nowrap">' + A.pretty(d.date) + '</td><td>' + d.weekday + '</td><td>' + A.statusTag(d.status) + '</td>' +
          '<td>' + (d.checkIn || '—') + '</td><td>' + (d.checkOut || '—') + '</td>' +
          '<td>' + (d.workedMinutes ? A.hm(d.workedMinutes) : '—') + '</td>' +
          '<td>' + (d.lateMinutes ? A.hm(d.lateMinutes) : '—') + '</td>' +
          '<td class="small">' + A.esc(d.locationName || d.remarks || '') + '</td>' +
          '<td class="right">' + ((d.status === 'ABSENT' || d.status === 'MISSING_PUNCH' || d.status === 'NOT_MARKED') && d.date <= A.todayStr()
            ? '<button class="btn btn-ghost btn-sm" data-act="regFor" data-date="' + d.date + '">Regularize</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function shortStatus(d) {
    return { PRESENT: 'P', HALF_DAY: 'H', ABSENT: 'A', ON_LEAVE: 'L', HALF_DAY_LEAVE: 'L½', WEEKLY_OFF: 'WO', HOLIDAY: 'HO', MISSING_PUNCH: 'MP', NOT_MARKED: '', ON_DUTY: 'OD', WFH: 'WFH' }[d.status] || '';
  }

  function leg(c, l) { return '<span><i style="background:' + c + '"></i>' + l + '</span>'; }

  function dayInfo(date, status) {
    A.api('att.month', { month: A.monthKey(date) }).then(function (m) {
      var d = m.days.filter(function (x) { return x.date === date; })[0];
      if (!d) return;
      A.modal({
        title: A.pretty(date) + ' · ' + A.dow(date),
        body: '<div class="stack" style="gap:10px">' +
          '<div>' + A.statusTag(d.status) + '</div>' +
          kv('Check in', d.checkIn || '—') + kv('Check out', d.checkOut || '—') +
          kv('Worked', d.workedMinutes ? A.hm(d.workedMinutes) : '—') +
          kv('Late by', d.lateMinutes ? A.hm(d.lateMinutes) : '—') +
          kv('Location', d.locationName || '—') +
          kv('Distance from centre', d.distance !== null && d.distance !== undefined ? d.distance + ' m' : '—') +
          kv('Remarks', d.remarks || '—') + '</div>',
        footer: (d.date <= A.todayStr() && ['ABSENT', 'MISSING_PUNCH', 'NOT_MARKED', 'HALF_DAY'].indexOf(d.status) > -1)
          ? '<button class="btn btn-secondary" onclick="App.close()">Close</button>' +
          '<button class="btn btn-primary" id="di-reg">Regularize this day</button>'
          : '<button class="btn btn-secondary" onclick="App.close()">Close</button>',
        onMount: function (root) {
          var b = root.querySelector('#di-reg');
          if (b) b.onclick = function () { A.close(); regularizeForm(date); };
        }
      });
    });
  }

  function kv(k, v) {
    return '<div class="spread" style="border-bottom:1px solid var(--line);padding:7px 0">' +
      '<span class="small muted">' + A.esc(k) + '</span><span style="font-size:14px;font-weight:600">' + A.esc(v) + '</span></div>';
  }

  /* -------------------------------------------------------- regularize tab */
  function regularizeTab(list, month) {
    return '' +
      '<div class="split wide">' +
      '<div><div class="sect"><h3>My regularization requests</h3>' +
      '<button class="btn btn-primary btn-sm" data-act="newReg">' + icon('plus') + ' New request</button></div>' +
      (list.length ? '<div class="tablewrap"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>In</th><th>Out</th><th>Reason</th><th>Status</th><th>Approver</th><th></th></tr></thead><tbody>' +
        list.map(function (r) {
          return '<tr><td class="nowrap">' + A.pretty(r.date) + '</td>' +
            '<td class="small">' + A.esc(String(r.regType).replace(/_/g, ' ')) + '</td>' +
            '<td>' + A.esc(r.checkIn || '—') + '</td><td>' + A.esc(r.checkOut || '—') + '</td>' +
            '<td class="small">' + A.esc(r.reason || '') + '</td>' +
            '<td>' + A.statusTag(r.status) + '</td>' +
            '<td class="small">' + A.esc(r.approverName || '') + '</td>' +
            '<td class="right">' + (r.status === 'PENDING' ? '<button class="btn btn-ghost btn-sm" data-act="cancelReg" data-id="' + r.id + '">Withdraw</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty">No regularization requests yet.</div>') +
      '</div>' +
      '<div><div class="sect"><h3>Rules</h3></div>' +
      '<div class="panel tight small" style="line-height:1.65">' +
      'Use regularization when you forgot to punch, were on site or client work, or worked from outside the mapped boundary. ' +
      'Requests go to your reporting manager. HR sets the monthly limit and how far back you can go.' +
      '</div>' +
      '<div class="sect mt4"><h3>Days that need attention</h3></div>' +
      (function () {
        var bad = month.days.filter(function (d) {
          return d.date <= A.todayStr() && ['ABSENT', 'MISSING_PUNCH'].indexOf(d.status) > -1;
        });
        return bad.length ? bad.map(function (d) {
          return '<div class="rowline"><div class="grow"><div style="font-size:14px;font-weight:600">' + A.pretty(d.date) + '</div>' +
            '<div class="small muted">' + A.STATUS_LABEL[d.status] + '</div></div>' +
            '<button class="btn btn-secondary btn-sm" data-act="regFor" data-date="' + d.date + '">Regularize</button></div>';
        }).join('') : '<div class="empty">Nothing pending this month.</div>';
      })() +
      '</div></div>';
  }

  function regularizeForm(date) {
    A.modal({
      title: 'Regularize attendance',
      body: '<form id="rgf">' +
        '<div class="field"><label>Date</label><input class="input" type="date" name="date" value="' + (date || A.todayStr()) + '" max="' + A.todayStr() + '" required></div>' +
        '<div class="field"><label>Reason type</label><select class="input" name="regType">' +
        '<option value="MISSED_PUNCH">Missed punch</option>' +
        '<option value="FORGOT_TO_MARK">Forgot to mark attendance</option>' +
        '<option value="ON_DUTY">On duty — site / client visit</option>' +
        '<option value="OUT_OF_GEOFENCE">Worked outside the mapped boundary</option>' +
        '<option value="WFH">Work from home</option>' +
        '<option value="WRONG_TIME">Wrong punch time</option></select></div>' +
        '<div class="grid2"><div class="field"><label>Check-in time</label><input class="input" type="time" name="checkIn" value="09:30"></div>' +
        '<div class="field"><label>Check-out time</label><input class="input" type="time" name="checkOut" value="18:30"></div></div>' +
        '<div class="field"><label>Reason</label><textarea class="input" name="reason" placeholder="Explain briefly — your manager sees this." required></textarea></div>' +
        '</form>',
      footer: '<button class="btn btn-secondary" onclick="App.close()">Cancel</button>' +
        '<button class="btn btn-primary" id="rg-send">Send for approval</button>',
      onMount: function (root) {
        root.querySelector('#rg-send').onclick = function () {
          var f = root.querySelector('#rgf');
          if (!f.reason.value.trim()) return A.toast('Please add a reason.', 'err');
          A.api('reg.request', {
            date: f.date.value, regType: f.regType.value,
            checkIn: f.checkIn.value, checkOut: f.checkOut.value,
            status: f.regType.value === 'WFH' ? 'WFH' : (f.regType.value === 'ON_DUTY' ? 'ON_DUTY' : 'PRESENT'),
            reason: f.reason.value
          }).then(function () {
            A.close(); A.toast('Regularization sent for approval.', 'ok'); A.render();
          }).catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  }
})();

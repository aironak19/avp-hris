/* ══════════════════════════════════════════════════════════════════════════
   Helpdesk — employee tickets & grievances with a conversation thread, and
   Administration → Helpdesk (queue, SLA, assignment, internal notes).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var ST_LABEL = { OPEN: 'Open', IN_PROGRESS: 'In progress', AWAITING_EMPLOYEE: 'Waiting on you', RESOLVED: 'Resolved', CLOSED: 'Closed' };
  var ST_TAG = { OPEN: 'tag-warn', IN_PROGRESS: 'tag-accent', AWAITING_EMPLOYEE: 'tag-err', RESOLVED: 'tag-ok', CLOSED: 'tag-neutral' };
  var PR_TAG = { LOW: 'tag-neutral', NORMAL: 'tag-neutral', HIGH: 'tag-warn', URGENT: 'tag-err' };
  function tag(s, hr) { var l = ST_LABEL[s] || s; if (hr && s === 'AWAITING_EMPLOYEE') l = 'Waiting on employee'; return '<span class="tag ' + (ST_TAG[s] || 'tag-neutral') + '">' + A.esc(l) + '</span>'; }
  function prio(p) { return p === 'NORMAL' ? '' : '<span class="tag ' + (PR_TAG[p] || 'tag-neutral') + '">' + A.esc(p.toLowerCase()) + '</span>'; }

  function ticketRow(t, hr) {
    return '<div class="item" data-act="openTicket" data-id="' + t.id + '" style="cursor:pointer;grid-template-columns:1fr auto"><div>' +
      '<div class="t">' + (hr ? A.esc(t.employeeName) + ' <span class="muted" style="font-weight:400">· </span>' : '') + A.esc(t.subject) + (t.confidential ? ' <span class="tag tag-dark">confidential</span>' : '') + '</div>' +
      '<div class="s">' + A.esc(t.id) + ' · ' + A.esc(t.category) + ' · ' + A.relTime(t.createdAt) + (t.assignedToName ? ' · ' + A.esc(t.assignedToName) : (hr ? ' · <span style="color:var(--accent)">unassigned</span>' : '')) + (t.overdue ? ' · <b style="color:var(--accent)">SLA breached</b>' : (t.dueAt && (t.status === 'OPEN' || t.status === 'IN_PROGRESS') ? ' · due ' + A.relTime(t.dueAt).replace(' ago', '') : '')) + '</div></div>' +
      '<div class="acts row" style="gap:6px">' + prio(t.priority) + tag(t.status, hr) + '</div></div>';
  }

  /* ------------------------------------------------------------ employee */
  A.registerView('helpdesk', {
    title: 'Helpdesk',
    render: function (params) {
      return A.api('tickets.mine').then(function (list) {
        if (params.action === 'new') setTimeout(function () { A.go('helpdesk'); ticketForm(); }, 0);
        var open = list.filter(function (t) { return t.status !== 'CLOSED'; }), closed = list.filter(function (t) { return t.status === 'CLOSED'; });
        return '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">Ask HR</div><h1 style="margin:0">Helpdesk</h1></div><button class="btn btn-primary" data-act="newTicket">' + icon('plus') + ' New ticket</button></div>' +
          '<div class="panel tight small" style="line-height:1.65">Payroll questions, leave corrections, IT access, documents, facilities — or a confidential grievance that only HR administrators can see. HR responds within the SLA for the priority you choose.</div>' +
          '<div class="sect mt3"><h3>Open tickets</h3><span class="small muted">' + open.length + '</span></div>' +
          (open.length ? '<div class="list">' + open.map(function (t) { return ticketRow(t, false); }).join('') + '</div>' : '<div class="empty">No open tickets.</div>') +
          (closed.length ? '<div class="sect mt4"><h3>Closed</h3></div><div class="list">' + closed.slice(0, 20).map(function (t) { return ticketRow(t, false); }).join('') + '</div>' : '');
      });
    },
    actions: { newTicket: function () { ticketForm(); }, openTicket: function (el) { openTicket(el.getAttribute('data-id'), false); } }
  });

  function ticketForm() {
    var cats = (A.S.boot && A.S.boot.settings && A.S.boot.settings.helpdeskCategories) || ['Other'];
    A.modal({
      title: 'New helpdesk ticket',
      body: '<form id="tkf"><div class="grid2"><div class="field"><label>Category</label><select class="input" name="category">' + cats.map(function (c) { return '<option>' + A.esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Priority</label><select class="input" name="priority"><option value="LOW">Low — whenever convenient</option><option value="NORMAL" selected>Normal — within 3 days</option><option value="HIGH">High — within a day</option><option value="URGENT">Urgent — blocking my work</option></select></div></div>' +
        '<div class="field"><label>Subject</label><input class="input" name="subject" placeholder="One line summary"></div>' +
        '<div class="field"><label>Details</label><textarea class="input" name="description" rows="5" placeholder="What happened, what you expected, any reference numbers."></textarea></div>' +
        '<label class="row small"><input type="checkbox" name="confidential"> Confidential — visible only to HR administrators (grievances are always confidential)</label></form>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="tk-save">Raise ticket</button>',
      onMount: function (root) {
        root.querySelector('#tk-save').onclick = function () {
          var f = root.querySelector('#tkf');
          A.api('tickets.create', { category: f.category.value, priority: f.priority.value, subject: f.subject.value, description: f.description.value, confidential: f.confidential.checked })
            .then(function (t) { A.close(); A.toast('Ticket ' + t.id + ' raised — HR has been notified.', 'ok'); A.render(); })
            .catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  }

  /** Conversation modal shared by employee and HR. */
  function openTicket(id, hr) {
    A.api('tickets.get', { ticketId: id }).then(function (t) {
      var thread = '<div class="panel tight small" style="line-height:1.6;white-space:pre-wrap"><div class="tiny" style="margin-bottom:4px">' + A.esc(t.employeeName) + ' · ' + A.esc(t.createdAt) + '</div>' + A.esc(t.description || '(no details)') + '</div>' +
        t.comments.map(function (c) {
          return '<div class="panel tight small mt1" style="line-height:1.6;white-space:pre-wrap;' + (c.internal ? 'border-left:3px solid var(--warn);' : (c.mine ? 'margin-left:24px;' : '')) + '"><div class="tiny" style="margin-bottom:4px">' + A.esc(c.authorName) + (c.internal ? ' · internal note' : '') + ' · ' + A.relTime(c.at) + '</div>' + A.esc(c.body) + '</div>';
        }).join('') + (t.resolution ? '<div class="geo ok mt2"><div><b>Resolution</b><br>' + A.esc(t.resolution) + '</div></div>' : '');
      var canReply = t.status !== 'CLOSED';
      var employeeCloses = !hr && t.status === 'RESOLVED';
      var hrControls = hr ? '<div class="grid3 mt2"><div class="field"><label>Status</label><select class="input" id="tk-status">' + Object.keys(ST_LABEL).map(function (s) { return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + (s === 'AWAITING_EMPLOYEE' ? 'Waiting on employee' : ST_LABEL[s]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Priority</label><select class="input" id="tk-prio">' + ['LOW', 'NORMAL', 'HIGH', 'URGENT'].map(function (p) { return '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Assigned to</label><select class="input" id="tk-assign"><option value="">Unassigned</option></select></div></div>' +
        '<div class="field" id="tk-resolution-wrap" style="' + (t.status === 'RESOLVED' ? '' : 'display:none') + '"><label>Resolution (sent to the employee)</label><input class="input" id="tk-resolution" value="' + A.esc(t.resolution || '') + '"></div>' +
        '<div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" id="tk-update">Update ticket</button></div>' : '';
      A.modal({
        title: t.id + ' — ' + t.subject, wide: true,
        body: '<div class="row wrap" style="gap:6px;margin-bottom:10px">' + tag(t.status, hr) + prio(t.priority) + (t.confidential ? '<span class="tag tag-dark">confidential</span>' : '') + '<span class="small muted">' + A.esc(t.category) + (hr ? ' · ' + A.esc(t.employeeName) + ' (' + A.esc(t.employeeCode) + ')' : '') + (t.assignedToName ? ' · assigned to ' + A.esc(t.assignedToName) : '') + (t.dueAt && t.status !== 'CLOSED' && t.status !== 'RESOLVED' ? ' · due ' + A.esc(String(t.dueAt).slice(0, 16)) : '') + '</span></div>' +
          thread + hrControls +
          (canReply ? '<form id="tk-reply" class="mt3"><div class="field"><label>' + (hr ? 'Reply' : 'Add a reply') + '</label><textarea class="input" name="body" rows="3" placeholder="' + (t.status === 'RESOLVED' && !hr ? 'Replying reopens the ticket.' : 'Type your message…') + '"></textarea></div>' +
            (hr ? '<label class="row small"><input type="checkbox" name="internal"> Internal note (not visible to the employee)</label>' : '') + '</form>' : ''),
        footer: '<button class="btn btn-secondary" data-close="btn">Close</button>' +
          (employeeCloses ? '<button class="btn btn-primary" id="tk-close">It\'s resolved — close ticket</button>' : '') +
          (canReply ? '<button class="btn btn-primary" id="tk-send">Send reply</button>' : ''),
        onMount: function (root) {
          var send = root.querySelector('#tk-send');
          if (send) send.onclick = function () {
            var f = root.querySelector('#tk-reply');
            A.api('tickets.comment', { ticketId: t.id, body: f.body.value, internal: f.internal ? f.internal.checked : false }).then(function () { A.toast('Sent.', 'ok'); openTicket(id, hr); }).catch(function (e) { A.toast(e.message, 'err'); });
          };
          var close = root.querySelector('#tk-close');
          if (close) close.onclick = function () {
            A.prompt('Close ticket', [{ name: 'rating', label: 'How was the help you received? (1–5, optional)', type: 'select', value: '', options: [{ value: '', label: 'Skip' }, { value: '5', label: '5 — Excellent' }, { value: '4', label: '4 — Good' }, { value: '3', label: '3 — Okay' }, { value: '2', label: '2 — Poor' }, { value: '1', label: '1 — Very poor' }] }], 'Close ticket').then(function (v) {
              if (!v) return;
              return A.api('tickets.close', { ticketId: t.id, rating: v.rating }).then(function () { A.close(); A.toast('Ticket closed. Thanks!', 'ok'); A.render(); });
            }).catch(function (e) { A.toast(e.message, 'err'); });
          };
          if (hr) {
            A.api('people.picklist').then(function (list) {
              var sel = root.querySelector('#tk-assign');
              list.filter(function (p) { return p.role === 'HR_ADMIN' || p.role === 'SUPER_ADMIN' || p.role === 'MANAGER'; }).forEach(function (p) {
                var o = document.createElement('option'); o.value = p.id; o.textContent = p.name + ' (' + p.code + ')'; if (p.id === t.assignedTo) o.selected = true; sel.appendChild(o);
              });
            });
            root.querySelector('#tk-status').onchange = function () { root.querySelector('#tk-resolution-wrap').style.display = this.value === 'RESOLVED' ? '' : 'none'; };
            root.querySelector('#tk-update').onclick = function () {
              A.api('admin.tickets.update', { ticketId: t.id, status: root.querySelector('#tk-status').value, priority: root.querySelector('#tk-prio').value, assignedTo: root.querySelector('#tk-assign').value, resolution: root.querySelector('#tk-resolution').value })
                .then(function () { A.toast('Ticket updated.', 'ok'); A.close(); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
            };
          }
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'helpdesk', label: 'Helpdesk', group: 'Engagement',
    render: function (params) {
      return Promise.all([A.api('admin.tickets.stats'), A.api('admin.tickets.list', { status: params.status || 'OPEN_ALL', category: params.category || '' })])
        .then(function (r) { return adminTab(r[0], r[1], params); });
    },
    actions: {
      hdStatus: function (el) { A.go('admin', { tab: 'helpdesk', status: el.getAttribute('data-status') }); },
      openTicket: function (el) { openTicket(el.getAttribute('data-id'), true); }
    }
  });

  function stat(label, value, sub) { return '<div><div class="stat-label">' + A.esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>'; }

  function adminTab(s, list, params) {
    var chips = [['OPEN_ALL', 'All open'], ['OPEN', 'New'], ['IN_PROGRESS', 'In progress'], ['AWAITING_EMPLOYEE', 'Waiting on employee'], ['RESOLVED', 'Resolved'], ['CLOSED', 'Closed']].map(function (x) {
      return '<span class="tag ' + ((params.status || 'OPEN_ALL') === x[0] ? 'tag-accent' : 'tag-neutral') + '" data-act="hdStatus" data-status="' + x[0] + '" style="cursor:pointer">' + x[1] + '</span>';
    }).join('');
    return '<div class="statstrip">' + stat('Open tickets', String(s.open), s.unassigned + ' unassigned') + stat('SLA breached', '<span' + (s.overdue ? ' style="color:var(--accent)"' : '') + '>' + s.overdue + '</span>', 'past due') + stat('Assigned to me', String(s.mine), 'open') + stat('Resolved this month', String(s.resolvedThisMonth), s.avgRating ? 'avg rating ' + s.avgRating + ' / 5' : 'no ratings yet') + '</div>' +
      '<div class="sect mt4"><h3>Ticket queue</h3></div><div class="row wrap mt2" style="gap:6px">' + chips + '</div>' +
      (list.length ? '<div class="list mt2">' + list.map(function (t) { return ticketRow(t, true); }).join('') + '</div>' : '<div class="empty">Queue is clear.</div>');
  }
})();

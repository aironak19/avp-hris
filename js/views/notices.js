/* ══════════════════════════════════════════════════════════════════════════
   Notices & policies — employee notice board (with acknowledgements) and
   Administration → Notices (compose, publish, acknowledgement report).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var KIND_LABEL = { NOTICE: 'Notice', POLICY: 'Policy', EVENT: 'Event', CELEBRATION: 'Celebration' };
  var KIND_TAG = { NOTICE: 'tag-neutral', POLICY: 'tag-accent', EVENT: 'tag-ok', CELEBRATION: 'tag-warn' };
  var ST_TAG = { DRAFT: 'tag-warn', PUBLISHED: 'tag-ok', ARCHIVED: 'tag-neutral' };
  function kind(k) { return '<span class="tag ' + (KIND_TAG[k] || 'tag-neutral') + '">' + A.esc(KIND_LABEL[k] || k) + '</span>'; }

  /** Card used on Home and on the Notices page. */
  A.noticeCard = function (n, compact) {
    var needsAck = n.requiresAck && !n.acknowledgedAt;
    return '<div class="panel tight' + (needsAck ? '" style="border-left:3px solid var(--accent)' : '') + '">' +
      '<div class="spread wrap" style="gap:8px;align-items:flex-start"><div><div class="row wrap" style="gap:6px">' + kind(n.kind) + (n.pinned ? '<span class="tag tag-dark">Pinned</span>' : '') + '<span class="small muted">' + A.pretty(n.publishAt) + (n.audience !== 'ALL' ? ' · ' + A.esc(n.audience) : '') + '</span></div>' +
      '<div style="font-weight:700;font-size:15px;margin-top:6px">' + A.esc(n.title) + '</div></div>' +
      (n.acknowledgedAt ? '<span class="tag tag-ok">Acknowledged</span>' : '') + '</div>' +
      '<div class="small mt1" style="line-height:1.6;white-space:pre-wrap">' + (compact ? A.esc(String(n.body || '').slice(0, 220)) + (String(n.body || '').length > 220 ? '…' : '') : A.esc(n.body || '')) + '</div>' +
      '<div class="row wrap mt2" style="gap:6px">' +
      (n.hasFile ? '<button class="btn btn-secondary btn-sm" data-act="noticeFile" data-id="' + n.id + '">' + icon('download') + ' ' + A.esc(n.fileName || 'Attachment') + '</button>' : '') +
      (needsAck ? '<button class="btn btn-primary btn-sm" data-act="ackNotice" data-id="' + n.id + '">I have read and understood</button>' : '') +
      (compact ? '<a href="#/notices" class="small" style="margin-left:auto">All notices</a>' : '') + '</div></div>';
  };
  A.noticeActions = {
    noticeFile: function (el) { A.api('notices.file', { id: el.getAttribute('data-id') }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); },
    ackNotice: function (el) {
      A.api('notices.acknowledge', { id: el.getAttribute('data-id') }).then(function () { A.toast('Thank you — acknowledgement recorded.', 'ok'); A.S.pendingAcks = Math.max(0, (A.S.pendingAcks || 0) - 1); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
    }
  };

  A.registerView('notices', {
    title: 'Notices',
    render: function () {
      return A.api('notices.mine').then(function (list) {
        A.S.pendingAcks = list.filter(function (n) { return n.requiresAck && !n.acknowledgedAt; }).length;
        var pending = list.filter(function (n) { return n.requiresAck && !n.acknowledgedAt; });
        var rest = list.filter(function (n) { return !(n.requiresAck && !n.acknowledgedAt); });
        return '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">Notice board</div><h1 style="margin:0">Notices &amp; policies</h1></div></div>' +
          (pending.length ? '<div class="sect"><h3>Needs your acknowledgement</h3><span class="tag tag-warn">' + pending.length + '</span></div><div class="stack mt2" style="gap:10px">' + pending.map(function (n) { return A.noticeCard(n); }).join('') + '</div>' : '') +
          '<div class="sect' + (pending.length ? ' mt4' : '') + '"><h3>Notice board</h3></div>' +
          (rest.length ? '<div class="stack mt2" style="gap:10px">' + rest.map(function (n) { return A.noticeCard(n); }).join('') + '</div>' : '<div class="empty">Nothing on the board right now.</div>');
      });
    },
    actions: A.noticeActions
  });

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'notices', label: 'Notices & policies', group: 'Engagement',
    render: function (params) {
      return A.api('admin.notices.list', { includeArchived: params.all === '1' }).then(function (list) { return adminTab(list, params); });
    },
    actions: {
      ntToggleAll: function () { A.go('admin', { tab: 'notices', all: A.S.params.all === '1' ? '0' : '1' }); },
      newNotice: function () { noticeForm(null); },
      editNotice: function (el) { noticeForm(JSON.parse(el.getAttribute('data-json'))); },
      publishNotice: function (el) {
        var n = JSON.parse(el.getAttribute('data-json'));
        A.confirm('Publish', 'Publish "' + n.title + '" to ' + (n.audience === 'ALL' ? 'everyone' : n.audience) + '? Each person gets an in-app notification' + (n.requiresAck ? ' and must acknowledge it' : '') + '.', 'Publish').then(function (ok) {
          if (!ok) return;
          A.api('admin.notices.publish', { id: n.id }).then(function () { A.toast('Published.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      archiveNotice: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Archive', 'Remove this notice from the board? It stays on record.', 'Archive').then(function (ok) {
          if (!ok) return;
          A.api('admin.notices.archive', { id: id }).then(function () { A.toast('Archived.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      ackReport: function (el) { ackReport(el.getAttribute('data-id')); },
      noticeFile: A.noticeActions.noticeFile
    }
  });

  function adminTab(list, params) {
    var rows = !list.length ? '<div class="empty">No notices yet. Publish the Office Policy manual as a POLICY so everyone acknowledges it.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Notice</th><th>Audience</th><th>Dates</th><th>Acknowledged</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (n) {
        var j = A.esc(JSON.stringify(n));
        var pct = n.requiresAck && n.audienceCount ? Math.round(n.ackCount / n.audienceCount * 100) : null;
        return '<tr><td><div class="row wrap" style="gap:6px">' + kind(n.kind) + (n.pinned ? '<span class="tag tag-dark">Pinned</span>' : '') + '</div><div style="font-weight:600;margin-top:4px">' + A.esc(n.title) + '</div><div class="small muted">' + A.esc(String(n.body || '').slice(0, 90)) + (n.hasFile ? ' · 📎 ' + A.esc(n.fileName) : '') + '</div></td>' +
          '<td class="small">' + A.esc(n.audience === 'ALL' ? 'Everyone' : n.audience) + '<div class="tiny">' + n.audienceCount + ' people</div></td>' +
          '<td class="small">' + A.shortD(n.publishAt) + (n.expiresAt ? ' – ' + A.shortD(n.expiresAt) : '') + '</td>' +
          '<td class="small">' + (n.requiresAck ? n.ackCount + ' / ' + n.audienceCount + '<div class="bar thin mt1" style="width:90px"><i style="width:' + pct + '%"></i></div>' : '<span class="muted">not required</span>') + '</td>' +
          '<td><span class="tag ' + (ST_TAG[n.status] || 'tag-neutral') + '">' + A.esc(n.status.toLowerCase()) + '</span></td>' +
          '<td class="right nowrap">' + (n.status === 'DRAFT' ? '<button class="btn btn-primary btn-sm" data-act="publishNotice" data-json="' + j + '">Publish</button>' : '') +
          (n.requiresAck && n.status !== 'DRAFT' ? '<button class="btn btn-ghost btn-sm" data-act="ackReport" data-id="' + n.id + '">Who read it</button>' : '') +
          (n.status !== 'ARCHIVED' ? '<button class="btn btn-ghost btn-sm" data-act="editNotice" data-json="' + j + '">Edit</button><button class="btn btn-ghost btn-sm" data-act="archiveNotice" data-id="' + n.id + '">Archive</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return '<div class="sect"><h3>Notices &amp; policies</h3><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-act="ntToggleAll">' + (params.all === '1' ? 'Hide archived' : 'Show archived') + '</button><button class="btn btn-primary btn-sm" data-act="newNotice">' + icon('plus') + ' New notice</button></div></div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">Notices appear on everyone\'s Home page and notify them when published. Mark something a <b>Policy</b> (or tick "requires acknowledgement") to track exactly who has read it — pending acknowledgements are nudged every Monday.</div>' + rows;
  }

  function noticeForm(n) {
    n = n || {};
    var depts = (A.S.boot && A.S.boot.departments) || [];
    A.modal({
      title: n.id ? 'Edit notice' : 'New notice', wide: true,
      body: '<form id="ntf"><div class="grid2"><div class="field"><label>Type</label><select class="input" name="kind">' + Object.keys(KIND_LABEL).map(function (k) { return '<option value="' + k + '"' + (n.kind === k ? ' selected' : '') + '>' + KIND_LABEL[k] + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Audience</label><select class="input" name="audience"><option value="ALL">Everyone</option>' + depts.map(function (d) { return '<option value="' + A.esc(d) + '"' + (n.audience === d ? ' selected' : '') + '>' + A.esc(d) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="field"><label>Title</label><input class="input" name="title" value="' + A.esc(n.title || '') + '" placeholder="e.g. Office closed on 2 October"></div>' +
        '<div class="field"><label>Message</label><textarea class="input" name="body" rows="6">' + A.esc(n.body || '') + '</textarea></div>' +
        '<div class="grid3"><div class="field"><label>Show from</label><input class="input" type="date" name="publishAt" value="' + A.esc(n.publishAt || A.todayStr()) + '"></div>' +
        '<div class="field"><label>Hide after (optional)</label><input class="input" type="date" name="expiresAt" value="' + A.esc(n.expiresAt || '') + '"></div>' +
        '<div class="field"><label>Options</label><label class="row small" style="margin-top:8px"><input type="checkbox" name="pinned"' + (n.pinned ? ' checked' : '') + '> Pin to top</label><label class="row small"><input type="checkbox" name="requiresAck"' + (n.requiresAck ? ' checked' : '') + '> Requires acknowledgement</label></div></div>' +
        A.fileField('file', 'Attachment (PDF / image / Word, max 4 MB)' + (n.hasFile ? ' — currently: ' + n.fileName : ''), 'application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document') + '</form>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-secondary" id="nt-draft">Save draft</button>' + (!n.id || n.status === 'DRAFT' ? '<button class="btn btn-primary" id="nt-pub">Save &amp; publish</button>' : ''),
      onMount: function (root) {
        function save(publish) {
          var f = root.querySelector('#ntf');
          A.readUpload(f.file).then(function (file) {
            return A.api('admin.notices.save', { id: n.id, kind: f.kind.value, audience: f.audience.value, title: f.title.value, body: f.body.value, publishAt: f.publishAt.value, expiresAt: f.expiresAt.value, pinned: f.pinned.checked, requiresAck: f.requiresAck.checked, file: file, publishNow: publish && !n.id });
          }).then(function (r) {
            if (publish && n.id) return A.api('admin.notices.publish', { id: n.id });
            return r;
          }).then(function () { A.close(); A.toast(publish ? 'Published.' : 'Saved.', 'ok'); A.render(); })
            .catch(function (e) { A.toast(e.message, 'err'); });
        }
        root.querySelector('#nt-draft').onclick = function () { save(false); };
        var pub = root.querySelector('#nt-pub'); if (pub) pub.onclick = function () { save(true); };
      }
    });
  }

  function ackReport(id) {
    A.api('admin.notices.ackReport', { id: id }).then(function (r) {
      A.modal({
        title: 'Acknowledgements — ' + r.notice.title, wide: true,
        body: '<div class="spread"><div class="small muted">' + r.acknowledged + ' of ' + r.total + ' have acknowledged</div><div class="bar thin" style="width:160px"><i style="width:' + (r.total ? Math.round(r.acknowledged / r.total * 100) : 0) + '%"></i></div></div>' +
          '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Employee</th><th>Department</th><th>Acknowledged</th></tr></thead><tbody>' +
          r.rows.map(function (x) { return '<tr><td style="font-weight:600">' + A.esc(x.name) + ' <span class="small muted">' + A.esc(x.code) + '</span></td><td class="small">' + A.esc(x.department || '') + '</td><td>' + (x.acknowledgedAt ? '<span class="tag tag-ok">' + A.esc(String(x.acknowledgedAt).slice(0, 16)) + '</span>' : '<span class="tag tag-warn">Pending</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>'
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

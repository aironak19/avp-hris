/* ══════════════════════════════════════════════════════════════════════════
   Assets — Administration → Assets (register, issue / return, history) and
   the "My assets" section rendered on the profile page.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var ST_LABEL = { AVAILABLE: 'Available', ISSUED: 'Issued', UNDER_REPAIR: 'Under repair', RETIRED: 'Retired', LOST: 'Lost' };
  var ST_TAG = { AVAILABLE: 'tag-ok', ISSUED: 'tag-accent', UNDER_REPAIR: 'tag-warn', RETIRED: 'tag-neutral', LOST: 'tag-err' };
  function tag(s) { return '<span class="tag ' + (ST_TAG[s] || 'tag-neutral') + '">' + A.esc(ST_LABEL[s] || s) + '</span>'; }

  /** Section for My profile: assets issued to this person (self can acknowledge). */
  A.assetsSection = function (list, self) {
    if (!list || !list.length) return '';
    return '<div class="sect mt4"><h3>' + (self ? 'My assets' : 'Assets issued') + '</h3><span class="small muted">' + list.length + ' item(s)</span></div>' +
      list.map(function (a) {
        return '<div class="rowline" style="gap:10px;flex-wrap:wrap"><div class="grow" style="min-width:200px"><div style="font-weight:600;font-size:14px">' + A.esc(a.name) + ' <span class="small muted mono">' + A.esc(a.tag) + '</span></div>' +
          '<div class="small muted">' + A.esc(a.category) + (a.serialNumber ? ' · S/N ' + A.esc(a.serialNumber) : '') + ' · issued ' + A.relTime(a.assignedAt) + (a.warrantyExpired ? ' · <span style="color:var(--accent)">warranty expired</span>' : '') + '</div></div>' +
          (a.acknowledgedAt ? '<span class="tag tag-ok">Acknowledged</span>' : (self && a.movementId ? '<button class="btn btn-primary btn-sm" data-act="ackAsset" data-id="' + a.movementId + '">Acknowledge receipt</button>' : '<span class="tag tag-warn">Not acknowledged</span>')) + '</div>';
      }).join('');
  };

  A.registerAdminTab({
    id: 'assets', label: 'Assets', group: 'Pay',
    render: function (params) {
      return Promise.all([A.api('admin.assets.stats'), A.api('admin.assets.list', { q: params.q || '', status: params.status || '', includeRetired: params.status === 'RETIRED' })])
        .then(function (r) { return assetsTab(r[0], r[1], params); });
    },
    actions: {
      asStatus: function (el) { A.go('admin', { tab: 'assets', status: el.getAttribute('data-status'), q: A.S.params.q || '' }); },
      asSearch: function (el) { A.go('admin', { tab: 'assets', q: el.value, status: A.S.params.status || '' }); },
      addAsset: function () { assetForm(null); },
      editAsset: function (el) { assetForm(JSON.parse(el.getAttribute('data-json'))); },
      issueAsset: function (el) { issueForm(JSON.parse(el.getAttribute('data-json'))); },
      returnAsset: function (el) { returnForm(JSON.parse(el.getAttribute('data-json'))); },
      assetStatus: function (el) { statusForm(JSON.parse(el.getAttribute('data-json'))); },
      assetHistory: function (el) { historyModal(JSON.parse(el.getAttribute('data-json'))); }
    }
  });

  function stat(label, value, sub) { return '<div><div class="stat-label">' + A.esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>'; }

  function assetsTab(s, list, params) {
    var chips = [['', 'All'], ['AVAILABLE', 'Available'], ['ISSUED', 'Issued'], ['UNDER_REPAIR', 'Under repair'], ['LOST', 'Lost'], ['RETIRED', 'Retired']].map(function (x) {
      return '<span class="tag ' + ((params.status || '') === x[0] ? 'tag-accent' : 'tag-neutral') + '" data-act="asStatus" data-status="' + x[0] + '" style="cursor:pointer">' + x[1] + '</span>';
    }).join('');
    var rows = !list.length ? '<div class="empty">No assets' + (params.q ? ' match "' + A.esc(params.q) + '"' : ' yet — add laptops, phones, ID cards and instruments to track who has what') + '.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Tag</th><th>Asset</th><th>Serial</th><th>Holder</th><th>Warranty</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (a) {
        var j = A.esc(JSON.stringify(a));
        var acts = '<button class="btn btn-ghost btn-sm" data-act="assetHistory" data-json="' + j + '">History</button><button class="btn btn-ghost btn-sm" data-act="editAsset" data-json="' + j + '">Edit</button>';
        if (a.status === 'AVAILABLE') acts += '<button class="btn btn-primary btn-sm" data-act="issueAsset" data-json="' + j + '">Issue</button>';
        if (a.status === 'ISSUED') acts += '<button class="btn btn-secondary btn-sm" data-act="returnAsset" data-json="' + j + '">Return</button>';
        if (a.status !== 'ISSUED' && a.status !== 'RETIRED') acts += '<button class="btn btn-ghost btn-sm" data-act="assetStatus" data-json="' + j + '">Status</button>';
        return '<tr><td class="mono small">' + A.esc(a.tag) + '</td><td><div style="font-weight:600">' + A.esc(a.name) + '</div><div class="small muted">' + A.esc(a.category) + (a.make || a.model ? ' · ' + A.esc([a.make, a.model].filter(Boolean).join(' ')) : '') + '</div></td>' +
          '<td class="small mono">' + A.esc(a.serialNumber || '—') + '</td><td class="small">' + (a.assignedToName ? A.esc(a.assignedToName) + '<div class="tiny">since ' + A.esc(String(a.assignedAt).slice(0, 10)) + '</div>' : '—') + '</td>' +
          '<td class="small' + (a.warrantyExpired ? '" style="color:var(--accent)' : '') + '">' + (a.warrantyTill ? A.pretty(a.warrantyTill) : '—') + '</td><td>' + tag(a.status) + '</td><td class="right nowrap">' + acts + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return '<div class="statstrip">' + stat('Assets', String(s.total), s.available + ' available') + stat('Issued', String(s.issued), 'with employees') + stat('Under repair / lost', s.repair + ' <small>/ ' + s.lost + '</small>', '') + stat('Warranty expiring', String(s.warrantyExpiring), 'in the next 30 days') + '</div>' +
      '<div class="sect mt4"><h3>Asset register</h3><button class="btn btn-primary btn-sm" data-act="addAsset">' + icon('plus') + ' Add asset</button></div>' +
      '<div class="row wrap mt2" style="gap:8px"><input class="input" placeholder="Search tag, name, serial, holder…" value="' + A.esc(params.q || '') + '" data-change="asSearch" style="max-width:320px">' + chips + '</div>' + rows;
  }

  function assetForm(a) {
    a = a || {};
    var cats = (A.S.boot && A.S.boot.settings && A.S.boot.settings.assetCategories) || ['Laptop', 'Other'];
    A.prompt(a.id ? 'Edit asset ' + a.tag : 'Add asset', [
      { name: 'category', label: 'Category', type: 'select', value: a.category || 'Laptop', options: cats.map(function (c) { return { value: c, label: c }; }) },
      { name: 'name', label: 'Name', value: a.name || '', placeholder: 'e.g. Dell Latitude 5440 14"' },
      { name: 'make', label: 'Make', value: a.make || '' },
      { name: 'model', label: 'Model', value: a.model || '' },
      { name: 'serialNumber', label: 'Serial / IMEI / licence key', value: a.serialNumber || '' },
      { name: 'assetTag', label: 'Asset tag (leave blank to auto-number)', value: a.tag || '' },
      { name: 'purchaseDate', label: 'Purchase date', type: 'date', value: a.purchaseDate || '' },
      { name: 'purchaseValue', label: 'Purchase value (₹)', type: 'number', value: a.purchaseValue || '' },
      { name: 'warrantyTill', label: 'Warranty till', type: 'date', value: a.warrantyTill || '' },
      { name: 'notes', label: 'Notes', type: 'textarea', value: a.notes || '' }
    ], a.id ? 'Save' : 'Add asset').then(function (v) {
      if (!v) return;
      if (a.id) v.assetId = a.id;
      return A.api('admin.assets.save', v).then(function (r) { A.toast('Saved ' + r.tag + '.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function issueForm(a) {
    A.api('people.picklist').then(function (list) {
      return A.prompt('Issue ' + a.tag + ' — ' + a.name, [
        { name: 'employeeId', label: 'Issue to', type: 'select', options: list.map(function (p) { return { value: p.id, label: p.code + ' — ' + p.name }; }) },
        { name: 'condition', label: 'Condition at issue', value: a.condition || 'Good' },
        { name: 'remark', label: 'Remark (accessories, charger, bag…)', type: 'textarea' }
      ], 'Issue').then(function (v) {
        if (!v) return;
        v.assetId = a.id;
        return A.api('admin.assets.issue', v).then(function () { A.toast('Issued — the employee has been asked to acknowledge receipt.', 'ok'); A.render(); });
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function returnForm(a) {
    A.prompt('Return ' + a.tag + ' from ' + a.assignedToName, [
      { name: 'condition', label: 'Condition on return', value: 'Good' },
      { name: 'nextStatus', label: 'After return', type: 'select', value: 'AVAILABLE', options: [{ value: 'AVAILABLE', label: 'Available for re-issue' }, { value: 'UNDER_REPAIR', label: 'Send for repair' }, { value: 'RETIRED', label: 'Retire' }, { value: 'LOST', label: 'Lost / not returned' }] },
      { name: 'remark', label: 'Remark', type: 'textarea' }
    ], 'Record return').then(function (v) {
      if (!v) return;
      v.assetId = a.id;
      return A.api('admin.assets.return', v).then(function () { A.toast('Return recorded.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function statusForm(a) {
    A.prompt('Change status — ' + a.tag, [
      { name: 'status', label: 'Status', type: 'select', value: a.status, options: ['AVAILABLE', 'UNDER_REPAIR', 'RETIRED', 'LOST'].map(function (s) { return { value: s, label: ST_LABEL[s] }; }) },
      { name: 'remark', label: 'Remark', type: 'textarea' }
    ], 'Update').then(function (v) {
      if (!v) return;
      v.assetId = a.id;
      return A.api('admin.assets.setStatus', v).then(function () { A.toast('Updated.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function historyModal(a) {
    A.api('admin.assets.history', { assetId: a.id }).then(function (list) {
      A.modal({
        title: a.tag + ' — history',
        body: '<div class="small muted">' + A.esc(a.name) + ' · ' + A.esc(a.category) + (a.purchaseDate ? ' · bought ' + A.pretty(a.purchaseDate) : '') + (a.purchaseValue ? ' for ₹' + A.money(a.purchaseValue) : '') + '</div>' +
          (list.length ? list.map(function (m) {
            return '<div class="rowline" style="align-items:flex-start"><div style="width:90px" class="small muted">' + A.esc(String(m.movedAt).slice(0, 10)) + '</div><div class="grow"><div style="font-size:14px"><b>' + A.esc(m.type.replace(/_/g, ' ').toLowerCase()) + '</b>' + (m.employeeName ? ' · ' + A.esc(m.employeeName) : '') + '</div>' +
              '<div class="small muted">by ' + A.esc(m.byName) + (m.condition ? ' · ' + A.esc(m.condition) : '') + (m.remark ? ' · ' + A.esc(m.remark) : '') + (m.acknowledgedAt ? ' · acknowledged ' + A.esc(String(m.acknowledgedAt).slice(0, 10)) : '') + '</div></div></div>';
          }).join('') : '<div class="empty">No movements recorded yet.</div>')
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

/* ══════════════════════════════════════════════════════════════════════════
   Letters (v1.6.0) — Administration → Letters (templates, new-letter form,
   draft review, ordered e-signatures, issue) + the signing experience used
   both inside the app (#/sign?letter=…) and on the standalone page opened
   from a "please sign" email (?sign=<token>).  Lazy-loaded.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var STATUS_TAG = { DRAFT: 'tag-neutral', PENDING_SIGNATURE: 'tag-warn', SIGNED: 'tag-accent', ISSUED: 'tag-ok', ACKNOWLEDGED: 'tag-ok', DECLINED: 'tag-err', VOID: 'tag-err' };
  var SIG_TAG = { WAITING: 'tag-neutral', SENT: 'tag-warn', VIEWED: 'tag-warn', SIGNED: 'tag-ok', DECLINED: 'tag-err', CANCELLED: 'tag-neutral' };
  var SIG_LABEL = { WAITING: 'Waiting', SENT: 'Sent', VIEWED: 'Viewed', SIGNED: 'Signed', DECLINED: 'Declined', CANCELLED: 'Cancelled' };

  function tag(status, label) { return '<span class="tag ' + (STATUS_TAG[status] || 'tag-neutral') + '">' + A.esc(label || status) + '</span>'; }
  function sigTag(s) { return '<span class="tag ' + (SIG_TAG[s] || 'tag-neutral') + '">' + A.esc(SIG_LABEL[s] || s) + '</span>'; }
  function when(s) { return s ? A.esc(String(s).slice(0, 16)) : '—'; }

  function blobUrl(r) {
    var bin = atob(r.dataBase64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: r.mimeType || 'application/pdf' }));
  }

  /** Embedded PDF viewer + fallback button (mobile browsers often refuse inline PDFs). */
  function pdfViewer(r, host) {
    var url = blobUrl(r);
    host.className = ''; host.removeAttribute('style');
    host.innerHTML = '<div class="pdfwrap"><iframe src="' + url + '#toolbar=1&view=FitH" title="Document preview"></iframe></div>' +
      '<div class="row mt1" style="justify-content:space-between;flex-wrap:wrap"><span class="small muted">' + A.esc(r.fileName || '') + '</span>' +
      '<button class="btn btn-secondary btn-sm" id="pdfOpen">' + icon('download') + ' Open / download PDF</button></div>';
    host.querySelector('#pdfOpen').onclick = function () { window.open(url, '_blank'); };
    return url;
  }

  /* ════════════════════════════════════════════════════ Administration tab */
  A.registerAdminTab({
    id: 'letters', label: 'Letters', group: 'Documents',
    render: function (params) {
      var filter = { status: params.lstatus || '', q: params.lq || '' };
      return Promise.all([
        A.api('admin.letters.list', filter),
        A.api('admin.letters.templates', { includeInactive: true })
      ]).then(function (r) {
        var letters = r[0], templates = r[1];
        if (params.generateFor || params.newLetter) setTimeout(function () { newLetterWizard({ templateId: params.templateId, employeeId: params.generateFor }); }, 60);
        if (params.letter) setTimeout(function () { openLetter(params.letter); }, 60);
        return lettersHome(letters, templates, filter);
      });
    },
    actions: {
      newLetter: function () { newLetterWizard({}); },
      openLetter: function (el) { openLetter(el.getAttribute('data-id')); },
      lfilter: function (el) { A.go('admin', { tab: 'letters', lstatus: el.getAttribute('data-status') || '' }); },
      lsearch: function (el, ev) { if (ev) ev.preventDefault(); A.go('admin', { tab: 'letters', lq: el.querySelector('[name=q]').value.trim() }); },
      addTemplate: function () { templateForm(null); },
      editTemplate: function (el) { templateForm(JSON.parse(el.getAttribute('data-json'))); },
      manageFields: function (el) { fieldsForm(JSON.parse(el.getAttribute('data-json'))); },
      toggleTemplate: function (el) {
        var id = el.getAttribute('data-id'), active = el.getAttribute('data-active') === '1';
        A.api('admin.letters.setTemplateActive', { templateId: id, active: !active })
          .then(function () { A.toast(active ? 'Template deactivated.' : 'Template activated.', 'ok'); A.render(); })
          .catch(function (e) { A.toast(e.message, 'err'); });
      },
      toggleTemplates: function () { var el = document.getElementById('tplBlock'); if (el) el.classList.toggle('hide'); }
    }
  });

  function lettersHome(letters, templates, filter) {
    var counts = { DRAFT: 0, PENDING_SIGNATURE: 0, SIGNED: 0, ISSUED: 0 };
    var monthKey = A.monthKey();
    letters.forEach(function (l) {
      if (counts[l.status] !== undefined) counts[l.status]++;
      if ((l.status === 'ISSUED' || l.status === 'ACKNOWLEDGED') && String(l.issuedAt).slice(0, 7) === monthKey) counts.ISSUED_MONTH = (counts.ISSUED_MONTH || 0) + 1;
    });
    var chips = [['', 'All'], ['DRAFT', 'Drafts'], ['PENDING_SIGNATURE', 'Awaiting signature'], ['SIGNED', 'Ready to issue'], ['ISSUED', 'Issued'], ['ACKNOWLEDGED', 'Acknowledged'], ['DECLINED', 'Declined'], ['VOID', 'Voided']]
      .map(function (c) { return '<span class="tag ' + (filter.status === c[0] ? 'tag-dark' : 'tag-neutral') + '" data-act="lfilter" data-status="' + c[0] + '" style="cursor:pointer;padding:6px 12px;font-size:12px">' + c[1] + '</span>'; }).join('');

    var rows = !letters.length ? '<div class="empty">No letters yet. Click <b>New letter</b> to generate one from a template.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Reference</th><th>Recipient</th><th>Letter</th><th>Status</th><th>Signatures</th><th>Updated</th><th></th></tr></thead><tbody>' +
      letters.map(function (l) {
        var signing = l.signing || { total: 0, signed: 0 };
        var sigCell = signing.total ? signing.signed + ' / ' + signing.total + (signing.current && l.status === 'PENDING_SIGNATURE' ? '<div class="small muted">waiting on ' + A.esc(signing.current) + '</div>' : '') : '<span class="muted">—</span>';
        return '<tr class="clickable" data-act="openLetter" data-id="' + l.letterId + '"><td class="small mono">' + A.esc(l.letterId) + '</td>' +
          '<td style="font-weight:600">' + A.esc(l.recipientName) + ' <span class="small muted">' + (l.recipientType === 'EXTERNAL' ? '(external)' : '(' + A.esc(l.employeeCode) + ')') + '</span></td>' +
          '<td class="small">' + A.esc(l.templateName) + '</td>' +
          '<td>' + tag(l.status, l.statusLabel) + (l.status === 'DECLINED' && l.declinedReason ? '<div class="small muted">' + A.esc(l.declinedReason) + '</div>' : '') + '</td>' +
          '<td class="small">' + sigCell + '</td>' +
          '<td class="small">' + when(l.issuedAt || l.signedAt || l.sentForSignatureAt || l.createdAt) + '<div class="muted">by ' + A.esc(l.issuedByName || l.createdByName || '') + '</div></td>' +
          '<td class="right"><button class="btn btn-ghost btn-sm" data-act="openLetter" data-id="' + l.letterId + '">Open</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    var tplRows = !templates.length ? '<div class="empty">No letter templates yet. Add one to get started.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Template</th><th>Category</th><th>Merge fields</th><th>Signature slots</th><th>Status</th><th></th></tr></thead><tbody>' +
      templates.map(function (t) {
        var json = A.esc(JSON.stringify(t));
        return '<tr><td style="font-weight:600">' + A.esc(t.name) + '</td>' +
          '<td class="small">' + A.esc(t.category) + '</td>' +
          '<td class="small">' + t.placeholders.length + '</td>' +
          '<td class="small">' + (t.signatureSlots || 0) + '</td>' +
          '<td><span class="tag ' + (t.active ? 'tag-ok' : 'tag-neutral') + '">' + (t.active ? 'Active' : 'Inactive') + '</span></td>' +
          '<td class="right"><div class="row" style="gap:6px;justify-content:flex-end">' +
          '<button class="btn btn-ghost btn-sm" data-act="editTemplate" data-json="' + json + '">Edit</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="manageFields" data-json="' + json + '">Fields</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="toggleTemplate" data-id="' + t.templateId + '" data-active="' + (t.active ? '1' : '0') + '">' + (t.active ? 'Deactivate' : 'Activate') + '</button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div>';

    return '<div class="statstrip">' +
      stat('Drafts', counts.DRAFT, 'not yet sent anywhere') +
      stat('Awaiting signature', counts.PENDING_SIGNATURE, 'out with signatories') +
      stat('Ready to issue', counts.SIGNED, 'fully signed, needs your OK') +
      stat('Issued this month', counts.ISSUED_MONTH || 0, A.monthLabel(monthKey)) +
      '</div>' +
      '<div class="sect spread mt4"><h3>Letters</h3><div class="row"><button class="btn btn-secondary btn-sm" data-act="toggleTemplates">' + icon('filetext') + ' Templates</button>' +
      '<button class="btn btn-primary btn-sm" data-act="newLetter">' + icon('plus') + ' New letter</button></div></div>' +
      '<div id="tplBlock" class="hide"><div class="panel tight small mt2" style="line-height:1.65">' +
      'Templates are Google Docs with merge fields written as <span class="mono">{{FieldName}}</span>. Fields like <span class="mono">{{FullName}}</span>, <span class="mono">{{Designation}}</span> or <span class="mono">{{JoinDate}}</span> fill in automatically; anything else is asked for in the form. ' +
      'Put <span class="mono">{{Signature1}}</span>, <span class="mono">{{Signature2}}</span>… where signatures should appear (optional — otherwise the signature goes just above <span class="mono">{{AuthorizedSignatory}}</span>, or in a block at the end). <span class="mono">{{SignatoryName1}}</span>, <span class="mono">{{SignatoryTitle1}}</span> and <span class="mono">{{SignatureDate1}}</span> are also available.' +
      '</div>' + tplRows + '<div class="row mt2"><button class="btn btn-secondary btn-sm" data-act="addTemplate">' + icon('plus') + ' New template</button></div><div class="mt4"></div></div>' +
      '<form data-submit="lsearch" class="row wrap mt2" style="gap:8px;align-items:center">' + chips +
      '<span class="grow"></span><input class="input" name="q" placeholder="Search reference, name, template…" value="' + A.esc(filter.q) + '" style="max-width:280px;min-height:34px"><button class="btn btn-secondary btn-sm" type="submit">Search</button></form>' +
      rows;
  }

  function stat(label, value, sub) {
    return '<div><div class="stat-label">' + A.esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>';
  }

  /* ---------------------------------------------------------- templates */
  function templateForm(existing) {
    A.prompt(existing ? 'Edit template' : 'New letter template', [
      { name: 'name', label: 'Template name', type: 'text', value: existing ? existing.name : '', placeholder: 'e.g. Offer Letter' },
      { name: 'category', label: 'Category', type: 'text', value: existing ? existing.category : 'General', placeholder: 'e.g. Onboarding, Confirmation, Experience' },
      { name: 'docUrl', label: 'Google Doc link', type: 'text', value: existing ? ('https://docs.google.com/document/d/' + existing.docId + '/edit') : '', placeholder: 'Paste the sharing link to the Google Doc template' }
    ], existing ? 'Save changes' : 'Create template').then(function (v) {
      if (!v) return;
      if (!v.name || !v.docUrl) { A.toast('Name and Google Doc link are required.', 'err'); return; }
      A.api('admin.letters.saveTemplate', { templateId: existing ? existing.templateId : undefined, name: v.name, category: v.category, docUrl: v.docUrl }).then(function (t) {
        A.toast('Template saved — ' + t.placeholders.length + ' merge field(s) found.', 'ok');
        A.render();
      }).catch(function (e) { A.toast(e.message, 'err'); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function fieldsForm(tpl) {
    var fields = (tpl.fields || []).filter(function (f) { return !f.auto; });
    if (!fields.length) { A.toast('Every field on this template is filled in automatically — nothing to customize.', 'ok'); return; }
    var typeOpts = [['text', 'Short text'], ['textarea', 'Long text'], ['date', 'Date'], ['number', 'Number'], ['select', 'Dropdown']];
    A.modal({
      title: 'Customize fields — ' + tpl.name, wide: true,
      body: '<div class="small muted" style="margin-bottom:12px">These are the fields HR fills in when generating a letter from this template.</div>' +
        '<form id="fldf">' + fields.map(function (f, i) {
          return '<div class="panel tight small mt2"><div class="row wrap" style="gap:10px;align-items:flex-end">' +
            '<div class="field" style="min-width:140px"><label>Merge tag</label><input class="input" value="{{' + A.esc(f.key) + '}}" disabled></div>' +
            '<div class="field grow" style="min-width:160px"><label>Label</label><input class="input" data-idx="' + i + '" data-prop="label" value="' + A.esc(f.label) + '"></div>' +
            '<div class="field" style="min-width:140px"><label>Field type</label><select class="input" data-idx="' + i + '" data-prop="type">' +
            typeOpts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === f.type ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
            '<div class="field" style="min-width:110px"><label>Required</label><select class="input" data-idx="' + i + '" data-prop="required"><option value="true"' + (f.required ? ' selected' : '') + '>Yes</option><option value="false"' + (!f.required ? ' selected' : '') + '>No</option></select></div></div>' +
            '<div class="field mt1" data-opt-row="' + i + '" style="' + (f.type === 'select' ? '' : 'display:none') + '"><label>Dropdown options (comma-separated)</label><input class="input" data-idx="' + i + '" data-prop="options" value="' + A.esc((f.options || []).join(', ')) + '"></div></div>';
        }).join('') + '</form>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="fld-save">Save fields</button>',
      onMount: function (root) {
        root.querySelectorAll('select[data-prop="type"]').forEach(function (sel) {
          sel.onchange = function () { root.querySelector('[data-opt-row="' + sel.getAttribute('data-idx') + '"]').style.display = sel.value === 'select' ? '' : 'none'; };
        });
        root.querySelector('#fld-save').onclick = function () {
          var updated = fields.map(function (f, i) {
            return {
              key: f.key,
              label: root.querySelector('[data-idx="' + i + '"][data-prop="label"]').value || f.label,
              type: root.querySelector('[data-idx="' + i + '"][data-prop="type"]').value,
              required: root.querySelector('[data-idx="' + i + '"][data-prop="required"]').value === 'true',
              options: root.querySelector('[data-idx="' + i + '"][data-prop="options"]').value
            };
          });
          A.api('admin.letters.saveTemplateFields', { templateId: tpl.templateId, fields: updated }).then(function () { A.toast('Fields updated.', 'ok'); A.close(); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  }

  /* ═══════════════════════════════════════════════════ New letter wizard */
  var _people = null, _candidates = null, _templates = null;
  function loadPickers() {
    return Promise.all([
      _templates ? Promise.resolve(_templates) : A.api('admin.letters.templates', {}),
      _people ? Promise.resolve(_people) : A.api('people.picklist'),
      _candidates ? Promise.resolve(_candidates) : A.api('admin.letters.candidates').catch(function () { return []; })
    ]).then(function (r) { _templates = r[0]; _people = r[1]; _candidates = r[2]; return r; });
  }

  function personOptions(selected) {
    return '<option value="">— choose —</option>' + _people.map(function (e) { return '<option value="' + A.esc(e.id) + '"' + (e.id === selected ? ' selected' : '') + '>' + A.esc(e.code + ' — ' + e.name + (e.designation ? ' · ' + e.designation : '')) + '</option>'; }).join('');
  }

  /**
   * One scrolling form: template + recipient at the top (changing either refreshes the
   * field list below via admin.letters.prepare), then the merge fields, what will be
   * auto-filled, the ordered signatories, and delivery options.
   * `existing` = a letter detail DTO when editing a draft.
   */
  function newLetterWizard(preset, existing) {
    preset = preset || {};
    loadPickers().then(function () {
      if (!_templates.length) { A.toast('Add a letter template first.', 'err'); return; }
      var state = {
        templateId: (existing && existing.templateId) || preset.templateId || _templates[0].templateId,
        recipientType: existing ? existing.recipientType : (preset.employeeId ? 'EMPLOYEE' : 'EMPLOYEE'),
        employeeId: (existing && existing.employeeId) || preset.employeeId || '',
        external: existing && existing.recipientType === 'EXTERNAL' ? { name: existing.recipientName, email: existing.recipientEmail, designation: existing.recipientDesignation, candidateId: existing.candidateId } : { name: '', email: '', designation: '', candidateId: '' },
        values: existing ? (existing.values || {}) : {},
        signatories: existing ? existing.signatories.map(function (s) { return { employeeId: s.employeeId, name: s.name, email: s.email, title: s.title }; }) : null,
        options: existing ? { attachCertificate: existing.attachCertificate, emailOnIssue: existing.emailOnIssue, subject: existing.subject, message: existing.message } : null,
        prep: null
      };

      A.modal({
        title: existing ? 'Edit draft — ' + existing.letterId : 'New letter', wide: true,
        body: '<div id="nlw"><div class="empty">Loading…</div></div>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="nlw-go">' + (existing ? 'Regenerate draft' : 'Generate draft') + '</button>',
        onMount: function (root) {
          var host = root.querySelector('#nlw');
          function recipientPayload() {
            if (state.recipientType === 'EMPLOYEE') return { type: 'EMPLOYEE', employeeId: state.employeeId };
            return { type: 'EXTERNAL', name: state.external.name, email: state.external.email, designation: state.external.designation, candidateId: state.external.candidateId };
          }
          function refresh() {
            host.innerHTML = headHtml() + '<div id="nlw-fields"><div class="empty"><span class="spinner"></span> Loading template fields…</div></div>';
            wireHead();
            var hasRecipient = state.recipientType === 'EMPLOYEE' ? !!state.employeeId : !!state.external.name;
            A.api('admin.letters.prepare', { templateId: state.templateId, recipient: hasRecipient ? recipientPayload() : undefined }).then(function (prep) {
              state.prep = prep;
              if (state.signatories === null) state.signatories = (prep.defaultSignatories || []).map(function (s) { return { employeeId: s.employeeId || '', name: s.name || '', email: s.email || '', title: s.title || '' }; });
              if (state.options === null) state.options = { attachCertificate: prep.options.attachCertificate, emailOnIssue: prep.options.emailOnIssue, subject: '', message: '' };
              host.querySelector('#nlw-fields').innerHTML = fieldsHtml(prep);
              wireFields();
            }).catch(function (e) { host.querySelector('#nlw-fields').innerHTML = '<div class="geo bad">' + A.esc(e.message) + '</div>'; });
          }
          function headHtml() {
            var ext = state.external;
            return '<div class="formgrid">' +
              '<div class="field"><label>Letter template</label><select class="input" id="nlw-tpl">' + _templates.map(function (t) { return '<option value="' + t.templateId + '"' + (t.templateId === state.templateId ? ' selected' : '') + '>' + A.esc(t.name) + (t.category ? ' · ' + A.esc(t.category) : '') + '</option>'; }).join('') + '</select></div>' +
              '<div class="field"><label>Recipient</label><div class="seg"><button type="button" data-rt="EMPLOYEE" class="' + (state.recipientType === 'EMPLOYEE' ? 'on' : '') + '">Employee</button><button type="button" data-rt="EXTERNAL" class="' + (state.recipientType === 'EXTERNAL' ? 'on' : '') + '">Candidate / external</button></div></div>' +
              (state.recipientType === 'EMPLOYEE'
                ? '<div class="field full"><label>Employee</label><select class="input" id="nlw-emp">' + personOptions(state.employeeId) + '</select></div>'
                : '<div class="field full"><label>Pick a candidate from Recruitment (optional)</label><select class="input" id="nlw-cand"><option value="">— type details manually —</option>' +
                  _candidates.map(function (c) { return '<option value="' + A.esc(c.candidateId) + '"' + (c.candidateId === ext.candidateId ? ' selected' : '') + '>' + A.esc(c.name + ' · ' + (c.jobTitle || '') + ' · ' + c.stage) + '</option>'; }).join('') + '</select></div>' +
                  '<div class="field"><label>Full name</label><input class="input" id="nlw-xname" value="' + A.esc(ext.name) + '" placeholder="e.g. Ms. Priya Sharma"></div>' +
                  '<div class="field"><label>Email (the letter is sent here)</label><input class="input" id="nlw-xemail" type="email" value="' + A.esc(ext.email) + '"></div>' +
                  '<div class="field full"><label>Designation / role (optional)</label><input class="input" id="nlw-xdesig" value="' + A.esc(ext.designation) + '"></div>') +
              '</div>';
          }
          function wireHead() {
            host.querySelector('#nlw-tpl').onchange = function () { state.templateId = this.value; refresh(); };
            host.querySelectorAll('[data-rt]').forEach(function (b) { b.onclick = function () { state.recipientType = b.getAttribute('data-rt'); refresh(); }; });
            var emp = host.querySelector('#nlw-emp'); if (emp) emp.onchange = function () { state.employeeId = this.value; refresh(); };
            var cand = host.querySelector('#nlw-cand'); if (cand) cand.onchange = function () {
              var c = _candidates.filter(function (x) { return x.candidateId === cand.value; })[0];
              state.external.candidateId = cand.value;
              if (c) { state.external.name = c.name; state.external.email = c.email || ''; state.external.designation = c.jobTitle || ''; }
              refresh();
            };
            ['xname', 'xemail', 'xdesig'].forEach(function (k) {
              var el = host.querySelector('#nlw-' + k); if (!el) return;
              el.onchange = function () { state.external[{ xname: 'name', xemail: 'email', xdesig: 'designation' }[k]] = el.value.trim(); if (k === 'xname') refresh(); };
            });
          }
          function fieldInput(f) {
            var v = state.values[f.key] !== undefined ? state.values[f.key] : (f.prefill || '');
            var req = f.required ? ' <span style="color:var(--accent)">*</span>' : '';
            if (f.type === 'textarea') return '<div class="field full"><label>' + A.esc(f.label) + req + '</label><textarea class="input" data-key="' + A.esc(f.key) + '">' + A.esc(v) + '</textarea></div>';
            if (f.type === 'select') return '<div class="field"><label>' + A.esc(f.label) + req + '</label><select class="input" data-key="' + A.esc(f.key) + '"><option value="">—</option>' + (f.options || []).map(function (o) { return '<option value="' + A.esc(o) + '"' + (o === v ? ' selected' : '') + '>' + A.esc(o) + '</option>'; }).join('') + '</select></div>';
            var type = f.type === 'date' ? 'date' : (f.type === 'number' ? 'text' : 'text');
            return '<div class="field"><label>' + A.esc(f.label) + req + '</label><input class="input" type="' + type + '" data-key="' + A.esc(f.key) + '" value="' + A.esc(v) + '"' + (f.type === 'number' ? ' inputmode="decimal" placeholder="Numbers only, e.g. 600000"' : (f.hint ? ' placeholder="' + A.esc(f.hint) + '"' : '')) + '></div>';
          }
          function fieldsHtml(prep) {
            var hasRecipient = !!prep.recipient;
            var manual = prep.manualFields.map(fieldInput).join('');
            var auto = prep.autoFields.map(function (f) {
              var ov = state.values[f.key] || '';
              return '<div class="autofield"><span class="k">' + A.esc(f.label) + '</span><span><span data-auto-show="' + A.esc(f.key) + '">' + (ov ? '<b>' + A.esc(ov) + '</b> <span class="small muted">(overridden)</span>' : (A.esc(f.value) || '<span class="muted">— blank —</span>')) + '</span> ' +
                '<a href="#" class="small" data-auto-edit="' + A.esc(f.key) + '">edit</a><input class="input hide" data-auto-key="' + A.esc(f.key) + '" value="' + A.esc(ov || f.value) + '" style="min-height:30px;margin-top:4px"></span></div>';
            }).join('');
            var sigs = signatoriesHtml();
            var o = state.options;
            return (!hasRecipient ? '<div class="geo wait mt2">Choose the recipient above to see the exact fields for this letter.</div>' : '') +
              '<div class="subsect">Fields to fill in' + (prep.manualFields.length ? '' : ' — nothing needed, everything is automatic') + '</div>' +
              '<div class="formgrid" id="nlw-manual">' + manual + '</div>' +
              (prep.autoFields.length ? '<div class="subsect">Filled in automatically <span class="muted" style="text-transform:none;letter-spacing:0">(from the ' + (prep.recipient && prep.recipient.type === 'EMPLOYEE' ? 'employee record' : 'recipient details') + ')</span></div><div id="nlw-auto">' + auto + '</div>' : '') +
              '<div class="subsect">Signatories <span class="muted" style="text-transform:none;letter-spacing:0">— sign in this order, one after another. Leave empty to issue without signatures.</span></div>' +
              '<div id="nlw-sigs">' + sigs + '</div>' +
              '<div class="subsect">Delivery</div>' +
              '<div class="formgrid">' +
              '<label class="row" style="gap:8px;font-size:13px"><input type="checkbox" id="nlw-cert"' + (o.attachCertificate ? ' checked' : '') + '> Attach a signature certificate page (audit trail) to the issued PDF</label>' +
              '<label class="row" style="gap:8px;font-size:13px"><input type="checkbox" id="nlw-mail"' + (o.emailOnIssue ? ' checked' : '') + '> Email the issued letter to the recipient</label>' +
              '<div class="field full"><label>Email subject (optional)</label><input class="input" id="nlw-subject" value="' + A.esc(o.subject || '') + '" placeholder="Defaults to the letter name"></div>' +
              '<div class="field full"><label>Message to signatories (optional)</label><textarea class="input" id="nlw-msg" placeholder="Shown in the signing request email">' + A.esc(o.message || '') + '</textarea></div>' +
              '</div>' +
              '<div class="panel tight small mt2" style="line-height:1.6">' + icon('shield', 14) + ' The letter is generated as a <b>draft that only HR can see</b>. You will review the PDF next, then send it to the signatories (or issue it straight away). Nothing reaches ' + (prep.recipient ? A.esc(prep.recipient.name) : 'the recipient') + ' until you click <b>Issue</b>.</div>';
          }
          function signatoriesHtml() {
            var list = state.signatories || [];
            return (list.length ? list.map(function (s, i) {
              return '<div class="sigrow" data-i="' + i + '">' +
                '<div class="handle">' + (i + 1) + '</div>' +
                '<div><select class="input" data-sig="employeeId" style="min-height:34px"><option value="">External (type details)</option>' + _people.map(function (e) { return '<option value="' + A.esc(e.id) + '"' + (e.id === s.employeeId ? ' selected' : '') + '>' + A.esc(e.name) + '</option>'; }).join('') + '</select>' +
                '<input class="input mt1" data-sig="name" placeholder="Full name" value="' + A.esc(s.name) + '" style="min-height:34px"></div>' +
                '<div class="email"><input class="input" data-sig="email" type="email" placeholder="Email for the signing link" value="' + A.esc(s.email) + '" style="min-height:34px"></div>' +
                '<div class="title"><input class="input" data-sig="title" placeholder="Title, e.g. Director" value="' + A.esc(s.title) + '" style="min-height:34px"></div>' +
                '<div class="row" style="gap:2px"><button type="button" class="iconbtn" data-sigact="up" title="Move up"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button><button type="button" class="iconbtn" data-sigact="down" title="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button><button type="button" class="iconbtn" data-sigact="remove" title="Remove">' + icon('trash') + '</button></div>' +
                '</div>';
            }).join('') : '<div class="small muted" style="padding:8px 0">No signatories — the letter will be issued without e-signatures.</div>') +
              '<button type="button" class="btn btn-secondary btn-sm mt2" id="nlw-addsig">' + icon('plus') + ' Add signatory</button>';
          }
          function readSignatories() {
            var out = [];
            host.querySelectorAll('.sigrow').forEach(function (row) {
              out.push({
                employeeId: row.querySelector('[data-sig="employeeId"]').value,
                name: row.querySelector('[data-sig="name"]').value.trim(),
                email: row.querySelector('[data-sig="email"]').value.trim(),
                title: row.querySelector('[data-sig="title"]').value.trim()
              });
            });
            state.signatories = out;
            return out;
          }
          function readValues() {
            var v = {};
            host.querySelectorAll('#nlw-manual [data-key]').forEach(function (i) { v[i.getAttribute('data-key')] = i.value; });
            host.querySelectorAll('#nlw-auto [data-auto-key]').forEach(function (i) {
              if (i.classList.contains('hide')) { if (state.values[i.getAttribute('data-auto-key')]) v[i.getAttribute('data-auto-key')] = state.values[i.getAttribute('data-auto-key')]; }
              else if (i.value.trim()) v[i.getAttribute('data-auto-key')] = i.value.trim();
            });
            state.values = v;
            return v;
          }
          function wireFields() {
            host.querySelectorAll('[data-auto-edit]').forEach(function (a) {
              a.onclick = function (ev) { ev.preventDefault(); var inp = host.querySelector('[data-auto-key="' + a.getAttribute('data-auto-edit') + '"]'); inp.classList.remove('hide'); inp.focus(); a.classList.add('hide'); };
            });
            host.querySelector('#nlw-addsig').onclick = function () { readSignatories(); readValues(); state.signatories.push({ employeeId: '', name: '', email: '', title: '' }); host.querySelector('#nlw-sigs').innerHTML = signatoriesHtml(); wireFields(); };
            host.querySelectorAll('.sigrow').forEach(function (row) {
              var i = +row.getAttribute('data-i');
              row.querySelector('[data-sig="employeeId"]').onchange = function () {
                readSignatories(); readValues();
                var p = _people.filter(function (e) { return e.id === row.querySelector('[data-sig="employeeId"]').value; })[0];
                if (p) { state.signatories[i].name = p.name; state.signatories[i].title = p.designation || ''; state.signatories[i].email = ''; }
                host.querySelector('#nlw-sigs').innerHTML = signatoriesHtml(); wireFields();
              };
              row.querySelectorAll('[data-sigact]').forEach(function (b) {
                b.onclick = function () {
                  readSignatories(); readValues();
                  var act = b.getAttribute('data-sigact'), list = state.signatories;
                  if (act === 'remove') list.splice(i, 1);
                  if (act === 'up' && i > 0) { var t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; }
                  if (act === 'down' && i < list.length - 1) { var t2 = list[i + 1]; list[i + 1] = list[i]; list[i] = t2; }
                  host.querySelector('#nlw-sigs').innerHTML = signatoriesHtml(); wireFields();
                };
              });
            });
          }
          root.querySelector('#nlw-go').onclick = function () {
            if (!state.prep) return;
            if (state.recipientType === 'EMPLOYEE' && !state.employeeId) return A.toast('Choose the employee first.', 'err');
            if (state.recipientType === 'EXTERNAL' && !state.external.name) return A.toast('Enter the recipient\'s name.', 'err');
            var values = readValues();
            for (var i = 0; i < state.prep.manualFields.length; i++) {
              var f = state.prep.manualFields[i], val = String(values[f.key] || '').trim();
              if (f.required && !val) return A.toast('"' + f.label + '" is required.', 'err');
              if (val && f.type === 'number' && isNaN(Number(val.replace(/,/g, '')))) return A.toast('"' + f.label + '" must be a number.', 'err');
            }
            var sigs = readSignatories().filter(function (s) { return s.name || s.email || s.employeeId; });
            for (var j = 0; j < sigs.length; j++) {
              if (!sigs[j].employeeId && !sigs[j].email) return A.toast('Signatory ' + (j + 1) + ' needs an email address for the signing link.', 'err');
              if (!sigs[j].employeeId && !sigs[j].name) return A.toast('Signatory ' + (j + 1) + ' needs a name.', 'err');
            }
            var payload = {
              templateId: state.templateId, recipient: recipientPayload(), values: values, signatories: sigs,
              options: { attachCertificate: root.querySelector('#nlw-cert').checked, emailOnIssue: root.querySelector('#nlw-mail').checked, subject: root.querySelector('#nlw-subject').value.trim(), message: root.querySelector('#nlw-msg').value.trim() }
            };
            var btn = root.querySelector('#nlw-go');
            btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Generating PDF…';
            var call = existing ? A.api('admin.letters.updateDraft', Object.assign({ letterId: existing.letterId }, payload)) : A.api('admin.letters.createDraft', payload);
            call.then(function (letter) {
              A.toast('Draft ready — review it before sending.', 'ok');
              A.close();
              showLetter(letter);
              if (A.S.route === 'admin') A.render();
            }).catch(function (e) { btn.disabled = false; btn.textContent = existing ? 'Regenerate draft' : 'Generate draft'; A.toast(e.message, 'err'); });
          };
          refresh();
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ═══════════════════════════════════════════════════════ Letter detail */
  function openLetter(letterId) {
    A.api('admin.letters.get', { letterId: letterId }).then(showLetter).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function stepsHtml(l) {
    var order = ['DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'ISSUED', 'ACKNOWLEDGED'];
    var idx = order.indexOf(l.status);
    var labels = { DRAFT: 'Draft created', PENDING_SIGNATURE: 'Out for signature', SIGNED: 'All signed', ISSUED: 'Issued to recipient', ACKNOWLEDGED: 'Acknowledged' };
    var dates = { DRAFT: l.createdAt, PENDING_SIGNATURE: l.sentForSignatureAt, SIGNED: l.signedAt, ISSUED: l.issuedAt, ACKNOWLEDGED: l.acknowledgedAt };
    if (l.status === 'VOID' || l.status === 'DECLINED') {
      return '<div class="steps"><div class="step bad"><div class="n">!</div><div><b>' + A.esc(l.statusLabel) + '</b>' + (l.declinedReason || l.voidReason ? '<div class="small muted">' + A.esc(l.declinedByName ? l.declinedByName + ': ' : '') + A.esc(l.declinedReason || l.voidReason) + '</div>' : '') + '</div></div></div>';
    }
    var steps = order.filter(function (s) { return !(s === 'PENDING_SIGNATURE' || s === 'SIGNED') || l.signatories.length; });
    return '<div class="steps">' + steps.map(function (s, i) {
      var si = order.indexOf(s);
      var cls = si < idx ? 'done' : (si === idx ? 'now' : '');
      return '<div class="step ' + cls + '"><div class="n">' + (cls === 'done' ? '✓' : (i + 1)) + '</div><div><b>' + labels[s] + '</b>' + (dates[s] ? '<div class="small muted">' + when(dates[s]) + '</div>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function showLetter(l) {
    var sigs = l.signatories.length ? l.signatories.map(function (s) {
      return '<div class="rowline" style="align-items:flex-start;gap:12px"><div class="avatar sm ghost">' + s.order + '</div>' +
        '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(s.name) + (s.title ? ' <span class="small muted">· ' + A.esc(s.title) + '</span>' : '') + '</div>' +
        '<div class="small muted">' + A.esc(s.email || (s.employeeId ? 'in-app' : '')) + (s.signedAt ? ' · signed ' + when(s.signedAt) + (s.method ? ' (' + s.method + ')' : '') : (s.viewedAt ? ' · viewed ' + when(s.viewedAt) : (s.sentAt ? ' · sent ' + when(s.sentAt) : ''))) + (s.declineReason ? ' · ' + A.esc(s.declineReason) : '') + '</div>' +
        ((s.status === 'SENT' || s.status === 'VIEWED') && s.signUrl ? '<div class="small mt1"><a href="#" data-copy="' + A.esc(s.signUrl) + '">' + icon('link', 12) + ' Copy signing link</a></div>' : '') + '</div>' +
        sigTag(s.status) + '</div>';
    }).join('') : '<div class="small muted" style="padding:8px 0">No signatories — this letter is issued without e-signatures.</div>';

    var timeline = '<div class="timeline">' + (l.events || []).slice().reverse().map(function (e) {
      return '<div><span class="when">' + when(e.at) + '</span><span><b>' + A.esc(e.event.replace(/_/g, ' ').toLowerCase()) + '</b> · ' + A.esc(e.actorName) + (e.details ? '<div class="muted">' + A.esc(e.details) + '</div>' : '') + '</span></div>';
    }).join('') + '</div>';

    var actions = '';
    if (l.canSend) actions += '<button class="btn btn-primary" id="ld-send">' + icon('send') + ' Approve &amp; send for signature</button>';
    if (l.canIssue) actions += '<button class="btn ' + (l.canSend ? 'btn-secondary' : 'btn-primary') + '" id="ld-issue">' + icon('check') + ' ' + (l.status === 'SIGNED' ? 'Approve &amp; issue' : 'Issue now (no signatures)') + '</button>';
    if (l.canRemind) actions += '<button class="btn btn-secondary" id="ld-remind">' + icon('bell') + ' Remind</button>';
    if (l.canEdit) actions += '<button class="btn btn-secondary" id="ld-edit">' + icon('edit') + ' Edit &amp; regenerate</button>';
    if (l.canCancelSigning) actions += '<button class="btn btn-secondary" id="ld-cancel">Withdraw request</button>';
    if (l.canVoid) actions += '<button class="btn btn-danger" id="ld-void">Void</button>';

    A.modal({
      title: l.templateName + ' — ' + l.recipientName, wide: true,
      body: '<div class="spread wrap" style="align-items:flex-start;gap:12px;margin-bottom:14px"><div><span class="small mono muted">' + A.esc(l.letterId) + '</span> ' + tag(l.status, l.statusLabel) +
        '<div class="small muted mt1">' + (l.recipientType === 'EXTERNAL' ? 'External recipient' : 'Employee ' + A.esc(l.employeeCode)) + (l.recipientEmail ? ' · ' + A.esc(l.recipientEmail) : '') + ' · created by ' + A.esc(l.createdByName) + ' ' + when(l.createdAt) + '</div></div>' +
        '<div class="row wrap" style="gap:6px;justify-content:flex-end">' + actions + '</div></div>' +
        '<div class="signgrid">' +
        '<div><div id="ld-pdf" class="pdfwrap" style="display:grid;place-items:center;min-height:320px"><div class="row"><span class="spinner"></span><span class="small muted">Rendering PDF…</span></div></div></div>' +
        '<div>' + stepsHtml(l) +
        '<div class="subsect">Signatories</div>' + sigs +
        (l.status === 'ISSUED' || l.status === 'ACKNOWLEDGED' ? '<div class="subsect">Delivery</div><div class="small">' + (l.emailedAt ? 'Emailed ' + when(l.emailedAt) + ' to ' + A.esc(l.recipientEmail) : 'Available in the app' + (l.recipientType === 'EXTERNAL' ? ' — not emailed' : '')) + (l.pdfSha256 ? '<div class="muted mono" style="word-break:break-all">SHA-256 ' + A.esc(l.pdfSha256) + '</div>' : '') + '</div>' : '') +
        '<div class="subsect">Activity</div>' + timeline + '</div></div>',
      footer: '<button class="btn btn-secondary" data-close="btn">Close</button>',
      onMount: function (root) {
        A.api('admin.letters.preview', { letterId: l.letterId }).then(function (r) { pdfViewer(r, root.querySelector('#ld-pdf')); })
          .catch(function (e) { root.querySelector('#ld-pdf').innerHTML = '<div class="geo bad">' + A.esc(e.message) + '</div>'; });
        root.querySelectorAll('[data-copy]').forEach(function (a) {
          a.onclick = function (ev) { ev.preventDefault(); var v = a.getAttribute('data-copy'); (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { A.toast('Signing link copied.', 'ok'); }, function () { window.prompt('Copy this signing link:', v); }); };
        });
        function run(action, payload, okMsg) {
          return A.api(action, Object.assign({ letterId: l.letterId }, payload || {})).then(function (fresh) { A.toast(okMsg, 'ok'); showLetter(fresh); if (A.S.route === 'admin') A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        }
        var b;
        if ((b = root.querySelector('#ld-send'))) b.onclick = function () {
          A.confirm('Send for signature', 'The signing link will be emailed to <b>' + A.esc(l.signatories[0].name) + '</b> first' + (l.signatories.length > 1 ? ', then to the next signatory each time one signs' : '') + '. The recipient is not contacted until you issue the letter.', 'Send').then(function (ok) { if (ok) { b.disabled = true; run('admin.letters.sendForSignature', {}, 'Sent to ' + l.signatories[0].name + '.'); } });
        };
        if ((b = root.querySelector('#ld-issue'))) b.onclick = function () {
          A.confirm('Issue letter', 'This files the final PDF' + (l.attachCertificate && l.signatories.length ? ' (with the signature certificate page)' : '') + (l.recipientType === 'EXTERNAL' ? '' : ' in ' + A.esc(l.recipientName) + '\'s folder') + (l.emailOnIssue && l.recipientEmail ? ' and emails it to ' + A.esc(l.recipientEmail) : '') + '. Continue?', 'Issue').then(function (ok) { if (ok) { b.disabled = true; b.innerHTML = '<span class="spinner"></span> Issuing…'; run('admin.letters.issue', {}, 'Letter issued.'); } });
        };
        if ((b = root.querySelector('#ld-remind'))) b.onclick = function () { b.disabled = true; run('admin.letters.remind', {}, 'Reminder sent.'); };
        if ((b = root.querySelector('#ld-edit'))) b.onclick = function () { A.close(); newLetterWizard({}, l); };
        if ((b = root.querySelector('#ld-cancel'))) b.onclick = function () {
          A.prompt('Withdraw signature request', [{ name: 'reason', label: 'Reason (optional)', type: 'textarea' }], 'Withdraw').then(function (v) { if (v) run('admin.letters.cancelSigning', { reason: v.reason }, 'Request withdrawn — back to draft.'); });
        };
        if ((b = root.querySelector('#ld-void'))) b.onclick = function () {
          A.prompt('Void letter', [{ name: 'reason', label: 'Reason for voiding', type: 'textarea' }], 'Void letter').then(function (v) {
            if (!v) return; if (!v.reason) return A.toast('A reason is required.', 'err');
            A.api('admin.letters.void', { letterId: l.letterId, reason: v.reason }).then(function () { A.toast('Letter voided.', 'ok'); A.close(); if (A.S.route === 'admin') A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
          });
        };
      }
    });
  }

  /* ══════════════════════════════════════════════════ Signing experience */
  /** Signature capture widget: draw (pointer events, hi-dpi), type (cursive), or upload. Returns { getPng(), method, clear() }. */
  function signaturePad(host, typedDefault) {
    host.innerHTML =
      '<div class="sigtabs"><button type="button" data-tab="draw" class="on">Draw</button><button type="button" data-tab="type">Type</button><button type="button" data-tab="upload">Upload</button></div>' +
      '<div data-pane="draw"><div class="sigpad"><canvas></canvas><div class="baseline"></div><div class="hint">Sign here with your finger or mouse</div></div>' +
      '<div class="row mt1" style="justify-content:flex-end"><button type="button" class="btn btn-ghost btn-sm" data-clear>Clear</button></div></div>' +
      '<div data-pane="type" class="hide"><input class="input" data-typed placeholder="Type your name" value="' + A.esc(typedDefault || '') + '"><div class="sigtyped mt1" data-typed-preview>' + A.esc(typedDefault || '') + '</div></div>' +
      '<div data-pane="upload" class="hide"><input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-upload><div class="small muted mt1">A photo or scan of your signature on white paper works best.</div><div class="mt1 hide" data-upload-preview style="background:#fff;border:1px dashed var(--n500);padding:10px;text-align:center"><img style="max-height:120px;max-width:100%"></div></div>';
    var method = 'draw';
    var canvas = host.querySelector('canvas'), ctx = canvas.getContext('2d');
    var drawing = false, last = null, hasInk = false;
    function fit() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var snapshot = hasInk ? canvas.toDataURL() : null;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      if (snapshot) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, r.width, r.height); }; im.src = snapshot; }
    }
    fit(); window.addEventListener('resize', fit);
    function pos(ev) { var r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (ev) { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); drawing = true; last = pos(ev); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + 0.1, last.y + 0.1); ctx.stroke(); hasInk = true; host.querySelector('.hint').style.display = 'none'; });
    canvas.addEventListener('pointermove', function (ev) { if (!drawing) return; ev.preventDefault(); var p = pos(ev); var mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }; ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mid.x, mid.y); last = p; });
    function up() { drawing = false; }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
    host.querySelector('[data-clear]').onclick = function () { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; host.querySelector('.hint').style.display = ''; };
    host.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { method = b.getAttribute('data-tab'); host.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x === b); }); host.querySelectorAll('[data-pane]').forEach(function (p) { p.classList.toggle('hide', p.getAttribute('data-pane') !== method); }); if (method === 'draw') fit(); if (method === 'type' && document.fonts && document.fonts.load) document.fonts.load('600 60px Caveat').catch(function () {}); };
    });
    var typed = host.querySelector('[data-typed]'), typedPreview = host.querySelector('[data-typed-preview]');
    typed.oninput = function () { typedPreview.textContent = typed.value; };
    var uploadImg = null;
    host.querySelector('[data-upload]').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      if (f.size > 3 * 1024 * 1024) { A.toast('Image too large (max 3 MB).', 'err'); return; }
      var reader = new FileReader();
      reader.onload = function () { var im = new Image(); im.onload = function () { uploadImg = im; var pv = host.querySelector('[data-upload-preview]'); pv.classList.remove('hide'); pv.querySelector('img').src = reader.result; }; im.src = reader.result; };
      reader.readAsDataURL(f);
    };
    /** Crop transparent/white margins so the stamped signature sits tight. */
    function trim(c) {
      var cx = c.getContext('2d'), w = c.width, h = c.height, d = cx.getImageData(0, 0, w, h).data;
      var minX = w, minY = h, maxX = -1, maxY = -1;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var i = (y * w + x) * 4; if (d[i + 3] > 20 && (d[i] + d[i + 1] + d[i + 2]) < 600) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
      if (maxX < 0) return null;
      var pad = 12, out = document.createElement('canvas');
      out.width = Math.min(w, maxX - minX + 1 + pad * 2); out.height = Math.min(h, maxY - minY + 1 + pad * 2);
      out.getContext('2d').drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), out.width, out.height, 0, 0, out.width, out.height);
      return out;
    }
    function getPng() {
      var c;
      if (method === 'draw') {
        if (!hasInk) throw new Error('Please draw your signature first.');
        c = trim(canvas);
      } else if (method === 'type') {
        var name = typed.value.trim(); if (!name) throw new Error('Please type your name.');
        c = document.createElement('canvas'); c.width = 1000; c.height = 260;
        var t = c.getContext('2d'); t.fillStyle = '#111'; t.textBaseline = 'middle';
        var size = 120; t.font = '600 ' + size + 'px Caveat, "Segoe Script", "Brush Script MT", cursive';
        while (t.measureText(name).width > 940 && size > 40) { size -= 6; t.font = '600 ' + size + 'px Caveat, "Segoe Script", "Brush Script MT", cursive'; }
        t.fillText(name, 30, 130);
        c = trim(c) || c;
      } else {
        if (!uploadImg) throw new Error('Please choose an image of your signature.');
        c = document.createElement('canvas'); var scale = Math.min(1, 1200 / uploadImg.width); c.width = Math.round(uploadImg.width * scale); c.height = Math.round(uploadImg.height * scale);
        var u = c.getContext('2d'); u.drawImage(uploadImg, 0, 0, c.width, c.height);
        // knock out near-white paper background so it blends into the letter
        var img = u.getImageData(0, 0, c.width, c.height), px = img.data;
        for (var i = 0; i < px.length; i += 4) { if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200) px[i + 3] = 0; }
        u.putImageData(img, 0, 0);
        c = trim(c) || c;
      }
      return { dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height };
    }
    return { getPng: getPng, method: function () { return method; }, typedName: function () { return typed.value.trim(); } };
  }

  /** Shared renderer. `io` = { context(), pdf(), sign(payload), decline(payload) } wrapping either the token or the logged-in RPCs. */
  function renderSigning(host, io, standalone) {
    host.innerHTML = '<div class="empty"><span class="spinner"></span> Loading document…</div>';
    io.context().then(function (ctx) { paint(ctx); }).catch(function (e) { host.innerHTML = '<div class="panel" style="max-width:520px;margin:40px auto"><h3>This link cannot be used</h3><p class="muted">' + A.esc(e.message) + '</p></div>'; });

    function paint(ctx) {
      var l = ctx.letter, me = ctx.me;
      var stepList = '<div class="steps">' + ctx.signatories.map(function (s) {
        var cls = s.status === 'SIGNED' ? 'done' : ((s.status === 'SENT' || s.status === 'VIEWED') ? 'now' : (s.status === 'DECLINED' ? 'bad' : ''));
        return '<div class="step ' + cls + '"><div class="n">' + (cls === 'done' ? '✓' : s.order) + '</div><div><b>' + A.esc(s.name) + '</b>' + (s.signatoryId === me.signatoryId ? ' <span class="tag tag-accent">you</span>' : '') + (s.title ? '<div class="small muted">' + A.esc(s.title) + '</div>' : '') + '<div class="small muted">' + A.esc(SIG_LABEL[s.status] || s.status) + (s.signedAt ? ' · ' + when(s.signedAt) : '') + '</div></div></div>';
      }).join('') + '</div>';
      var banner = '';
      if (me.status === 'SIGNED') banner = '<div class="geo ok">' + icon('check') + ' You signed this document on ' + when(me.signedAt) + '. ' + (l.status === 'SIGNED' ? 'All signatures are in — HR will issue it.' : (l.status === 'ISSUED' || l.status === 'ACKNOWLEDGED' ? 'It has been issued.' : 'Waiting for the remaining signatories.')) + '</div>';
      else if (me.status === 'DECLINED') banner = '<div class="geo bad">You declined to sign this document' + (me.declineReason ? ': ' + A.esc(me.declineReason) : '') + '.</div>';
      else if (ctx.expired) banner = '<div class="geo bad">This signing request has expired. Please ask ' + A.esc(l.requesterName) + ' to send it again.</div>';
      else if (l.status !== 'PENDING_SIGNATURE') banner = '<div class="geo wait">This request is no longer open (' + A.esc(l.statusLabel) + ').</div>';
      else if (!ctx.canSign && ctx.waitingOn) banner = '<div class="geo wait">It is not your turn yet — waiting for <b>' + A.esc(ctx.waitingOn) + '</b> to sign first. We will email you when it is your turn.</div>';

      host.innerHTML =
        (standalone ? '<div class="signhead">' + A.brandLogo(180) + '<div class="small muted">' + A.esc(ctx.orgName) + ' · secure e-signature</div></div>' : '') +
        '<div class="kicker">Signature requested by ' + A.esc(l.requesterName) + '</div>' +
        '<h1 style="margin:0 0 6px;font-size:28px">' + A.esc(l.templateName) + ' <span class="muted" style="font-weight:400">for ' + A.esc(l.recipientName) + '</span></h1>' +
        '<div class="small muted" style="margin-bottom:16px">Ref. ' + A.esc(l.letterId) + (l.expiresAt ? ' · please sign by ' + A.esc(String(l.expiresAt).slice(0, 10)) : '') + '</div>' +
        (l.message ? '<div class="panel tight small" style="margin-bottom:16px;border-left:2px solid var(--accent)">' + A.esc(l.message).replace(/\n/g, '<br>') + '</div>' : '') +
        (banner ? '<div style="margin-bottom:16px">' + banner + '</div>' : '') +
        '<div class="signgrid">' +
        '<div><div id="sg-pdf" class="pdfwrap" style="display:grid;place-items:center"><div class="row"><span class="spinner"></span><span class="small muted">Rendering document…</span></div></div></div>' +
        '<div>' +
        '<div class="subsect" style="margin-top:0">Signing order</div>' + stepList +
        (ctx.canSign ?
          '<div class="subsect">Your signature</div><div id="sg-pad"></div>' +
          '<div class="field mt2"><label>Type your full name to confirm</label><input class="input" id="sg-name" value="' + A.esc(me.name) + '"></div>' +
          '<label class="consent"><input type="checkbox" id="sg-agree"><span>' + A.esc(ctx.consentText) + '</span></label>' +
          '<button class="btn btn-primary btn-xl mt2" id="sg-sign">' + icon('pen') + ' Sign document</button>' +
          '<button class="btn btn-ghost btn-block mt1" id="sg-decline">Decline to sign</button>'
          : '') +
        '</div></div>';

      io.pdf().then(function (r) { pdfViewer(r, host.querySelector('#sg-pdf')); }).catch(function (e) { host.querySelector('#sg-pdf').innerHTML = '<div class="geo bad">' + A.esc(e.message) + '</div>'; });

      if (!ctx.canSign) return;
      var pad = signaturePad(host.querySelector('#sg-pad'), me.name);
      host.querySelector('#sg-sign').onclick = function () {
        var btn = this;
        try {
          if (!host.querySelector('#sg-agree').checked) throw new Error('Please tick the consent box to sign electronically.');
          var typedName = host.querySelector('#sg-name').value.trim();
          if (!typedName) throw new Error('Please type your full name.');
          var png = pad.getPng();
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Applying signature…';
          io.sign({ signaturePng: png.dataUrl, width: png.width, height: png.height, typedName: typedName, method: pad.method(), agree: true, userAgent: navigator.userAgent })
            .then(function (fresh) { A.toast('Signed. Thank you!', 'ok'); paint(fresh); if (!standalone && A.refreshSession) A.refreshSession(); })
            .catch(function (e) { btn.disabled = false; btn.innerHTML = icon('pen') + ' Sign document'; A.toast(e.message, 'err'); });
        } catch (e) { A.toast(e.message, 'err'); }
      };
      host.querySelector('#sg-decline').onclick = function () {
        A.prompt('Decline to sign', [{ name: 'reason', label: 'Let ' + l.requesterName + ' know why', type: 'textarea' }], 'Decline').then(function (v) {
          if (!v) return; if (!v.reason) return A.toast('Please give a reason.', 'err');
          io.decline({ reason: v.reason, userAgent: navigator.userAgent }).then(function (fresh) { A.toast('Declined. HR has been notified.', 'ok'); paint(fresh); if (!standalone && A.refreshSession) A.refreshSession(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      };
    }
  }

  /* In-app: #/sign?letter=LTR-… */
  A.registerView('sign', {
    title: 'Sign document',
    render: function (params) {
      if (!params.letter) return Promise.resolve('<div class="empty">No document selected.</div>');
      return Promise.resolve('<div id="signHost" class="signpage" style="padding:0"></div>');
    },
    mount: function (host, params) {
      var id = params.letter;
      renderSigning(host.querySelector('#signHost'), {
        context: function () { return A.api('letters.signContext', { letterId: id, userAgent: navigator.userAgent }); },
        pdf: function () { return A.api('letters.signPdf', { letterId: id }); },
        sign: function (p) { return A.api('letters.sign', Object.assign({ letterId: id }, p)); },
        decline: function (p) { return A.api('letters.decline', Object.assign({ letterId: id }, p)); }
      }, false);
    }
  });

  /* In-app: #/signatures — everything waiting on me */
  A.registerView('signatures', {
    title: 'Documents to sign',
    render: function () {
      return A.api('letters.pendingSignatures').then(function (list) {
        A.S.pendingSign = list.length;
        return '<div class="kicker">E-signatures</div><h1 style="margin:0 0 18px">Waiting for your signature</h1>' +
          (list.length ? '<div class="list">' + list.map(function (s) {
            return '<div class="item"><div class="avatar" style="background:var(--accent)">' + icon('pen') + '</div><div><div class="t">' + A.esc(s.templateName) + ' <span class="muted" style="font-weight:400">· for ' + A.esc(s.recipientName) + '</span></div><div class="s">Requested by ' + A.esc(s.requesterName) + ' · ' + A.relTime(s.sentAt) + '</div></div>' +
              '<div class="acts row"><button class="btn btn-primary btn-sm" data-act="goto" data-route="sign" data-params=\'' + A.esc(JSON.stringify({ letter: s.letterId })) + '\'>Review &amp; sign</button></div></div>';
          }).join('') + '</div>' : '<div class="empty">Nothing is waiting for your signature.</div>');
      });
    }
  });

  /* Standalone page opened from the email link (?sign=<token>) — no HRIS login. */
  A.signStandalone = function (token) {
    document.getElementById('app').innerHTML = '<div class="signpage" id="signHost"></div>';
    renderSigning(document.getElementById('signHost'), {
      context: function () { return A.api('sign.context', { signToken: token, userAgent: navigator.userAgent }); },
      pdf: function () { return A.api('sign.pdf', { signToken: token }); },
      sign: function (p) { return A.api('sign.submit', Object.assign({ signToken: token }, p)); },
      decline: function (p) { return A.api('sign.decline', Object.assign({ signToken: token }, p)); }
    }, true);
  };
})();

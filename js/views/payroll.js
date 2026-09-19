/* ══════════════════════════════════════════════════════════════════════════
   Payroll — employee "Payslips" view + Administration → Payroll tab
   (salary structures, monthly runs with an HR-confirmed LOP worksheet,
   batched PDF publishing, register export).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var STATUS_TAG = { Draft: 'tag-warn', Processed: 'tag-ok', Locked: 'tag-dark', Generated: 'tag-warn', Published: 'tag-ok', Voided: 'tag-err' };
  function tag(s, label) { return '<span class="tag ' + (STATUS_TAG[s] || 'tag-neutral') + '">' + A.esc(label || s) + '</span>'; }
  function rs(n) { return '₹' + A.money(n); }

  /* ------------------------------------------------------------ employee */
  A.registerView('payslips', {
    title: 'Payslips',
    render: function () {
      return Promise.all([A.api('payslips.mine'), A.api('payslips.summary')]).then(function (r) {
        var list = r[0], sum = r[1];
        var strip = '<div class="statstrip">' +
          stat('Net paid · FY ' + sum.financialYear, rs(sum.net), sum.months + ' payslip(s)') +
          stat('Gross earnings', rs(sum.gross), 'before deductions') +
          stat('Provident fund', rs(sum.pf), 'your contribution') +
          stat('TDS', rs(sum.tds), 'tax deducted at source') +
          '</div>';
        var rows = !list.length ? '<div class="empty">No payslips published yet. They appear here as soon as HR processes a payroll run.</div>' :
          '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Period</th><th>Payable days</th><th class="right">Gross</th><th class="right">Deductions</th><th class="right">Net pay</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(function (p) {
            return '<tr><td style="font-weight:600">' + A.esc(p.label) + '</td>' +
              '<td class="small">' + p.payableDays + ' / ' + p.daysInMonth + (p.lopDays ? ' <span class="tag tag-warn">LOP ' + p.lopDays + '</span>' : '') + '</td>' +
              '<td class="right mono">' + rs(p.gross) + '</td><td class="right mono">' + rs(p.totalDeductions) + '</td>' +
              '<td class="right mono" style="font-weight:700">' + rs(p.netPay) + '</td>' +
              '<td>' + (p.acknowledged ? '<span class="tag tag-ok">Acknowledged</span>' : '<span class="tag tag-warn">New</span>') + '</td>' +
              '<td class="right nowrap"><button class="btn btn-ghost btn-sm" data-act="breakdown" data-json="' + A.esc(JSON.stringify(p)) + '">Breakdown</button>' +
              '<button class="btn btn-secondary btn-sm" data-act="viewPayslip" data-id="' + p.id + '">' + icon('download') + ' PDF</button></td></tr>';
          }).join('') + '</tbody></table></div>';
        return '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">Compensation</div><h1 style="margin:0">Payslips</h1></div></div>' +
          strip + '<div class="sect mt4"><h3>All payslips</h3><span class="small muted">Opening a PDF also acknowledges receipt</span></div>' + rows;
      });
    },
    actions: {
      viewPayslip: function (el) {
        var id = el.getAttribute('data-id');
        A.api('payslips.fetch', { payslipId: id }).then(function (r) {
          A.openBlob(r);
          return A.api('payslips.acknowledge', { payslipId: id }).then(function () { A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      breakdown: function (el) { breakdownModal(JSON.parse(el.getAttribute('data-json'))); }
    }
  });

  function stat(label, value, sub) {
    return '<div><div class="stat-label">' + A.esc(label) + '</div><div class="stat-value" style="font-size:26px">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>';
  }

  function breakdownModal(p) {
    function row(l, v, bold) { return '<div class="rowline"><span class="grow' + (bold ? '" style="font-weight:700' : '') + '">' + A.esc(l) + '</span><span class="mono' + (bold ? '" style="font-weight:700' : '') + '">' + rs(v) + '</span></div>'; }
    A.modal({
      title: 'Payslip — ' + p.label, wide: true,
      body: '<div class="split even"><div><div class="tiny" style="margin-bottom:6px">Earnings</div>' +
        row('Basic', p.basic) + row('House rent allowance', p.hra) + row('Conveyance', p.conveyance) + row('Medical', p.medical) + row('Special allowance', p.special) + row('Other allowance', p.other) + row('Gross earnings', p.gross, true) +
        '</div><div><div class="tiny" style="margin-bottom:6px">Deductions</div>' +
        row('Provident fund', p.pfEmployee) + row('ESI', p.esiEmployee) + row('Professional tax', p.professionalTax) + row('TDS', p.tds) + row('Other deductions', p.otherDeductions) + row('Total deductions', p.totalDeductions, true) +
        '</div></div>' +
        (p.reimbursements ? '<div class="rowline mt2"><span class="grow">Reimbursements (approved expense claims, non-taxable)</span><span class="mono">' + rs(p.reimbursements) + '</span></div>' : '') +
        '<div class="outline mt3" style="padding:16px"><div class="spread"><div><div class="tiny">Net pay</div><div style="font-size:26px;font-weight:800">' + rs(p.netPay) + '</div></div>' +
        '<div class="small muted right">' + p.payableDays + ' of ' + p.daysInMonth + ' days payable' + (p.lopDays ? '<br>' + p.lopDays + ' day(s) loss of pay' : '') + '<br>Employer PF ' + rs(p.pfEmployer) + ' · ESI ' + rs(p.esiEmployer) + '</div></div></div>'
    });
  }

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'payroll', label: 'Payroll', group: 'Pay',
    render: function (params) {
      return Promise.all([A.api('admin.payroll.runs.list'), A.api('admin.payroll.structures.list', {}), A.api('admin.payroll.structures.missing')])
        .then(function (r) { return payrollTab(r[0], r[1], r[2]); });
    },
    actions: {
      addSalaryStructure: function (el) { salaryStructureForm(el.getAttribute('data-id') || '', null); },
      reviseStructure: function (el) { salaryStructureForm('', JSON.parse(el.getAttribute('data-json'))); },
      createPayrollRun: function () { createPayrollRunForm(); },
      viewRun: function (el) { openRun(el.getAttribute('data-id')); }
    }
  });

  function payrollTab(runs, structures, missing) {
    var runRows = !runs.length ? '<div class="empty">No payroll runs yet. Create the first one for the month just ended.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Period</th><th>Status</th><th>Payslips</th><th class="right">Gross</th><th class="right">Net</th><th>Processed</th><th></th></tr></thead><tbody>' +
      runs.map(function (r) {
        return '<tr><td style="font-weight:600">' + A.esc(r.label) + '</td><td>' + tag(r.status) + '</td>' +
          '<td class="small">' + r.published + ' published / ' + r.payslips + (r.voided ? ' · ' + r.voided + ' voided' : '') + '</td>' +
          '<td class="right mono">' + rs(r.grossTotal) + '</td><td class="right mono">' + rs(r.netTotal) + '</td>' +
          '<td class="small">' + (r.processedAt ? A.esc(r.processedAt) + ' · ' + A.esc(r.processedByName || '') : '—') + '</td>' +
          '<td class="right"><button class="btn btn-secondary btn-sm" data-act="viewRun" data-id="' + r.id + '">Open</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    var missingRows = missing.length ? '<div class="geo bad mt2" style="align-items:flex-start;flex-direction:column;gap:6px"><div><b>' + missing.length + ' employee(s) have no salary structure</b> and will be skipped by payroll until one is added.</div>' +
      '<div class="row wrap" style="gap:6px">' + missing.map(function (e) { return '<button class="btn btn-secondary btn-sm" data-act="addSalaryStructure" data-id="' + e.employeeId + '">' + A.esc(e.code + ' ' + e.name) + '</button>'; }).join('') + '</div></div>' : '';

    var structRows = !structures.length ? '<div class="empty">No salary structures yet.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Employee</th><th>Effective</th><th class="right">Basic</th><th class="right">HRA</th><th class="right">Gross / month</th><th class="right">CTC / year</th><th>PF</th><th>ESI</th><th></th></tr></thead><tbody>' +
      structures.map(function (s) {
        return '<tr><td><div style="font-weight:600">' + A.esc(s.employeeName || s.employeeCode) + '</div><div class="small muted">' + A.esc(s.employeeCode) + ' · ' + A.esc(s.designation || '') + '</div></td>' +
          '<td class="small">' + A.pretty(s.effectiveFrom) + '</td><td class="right mono">' + rs(s.basic) + '</td><td class="right mono">' + rs(s.hra) + '</td>' +
          '<td class="right mono" style="font-weight:700">' + rs(s.gross) + '</td><td class="right mono">' + rs(s.ctcAnnual) + '</td>' +
          '<td>' + (s.pfApplicable ? '<span class="tag tag-ok">Yes</span>' : '<span class="tag tag-neutral">No</span>') + '</td><td>' + (s.esiApplicable ? '<span class="tag tag-ok">Yes</span>' : '<span class="tag tag-neutral">No</span>') + '</td>' +
          '<td class="right"><button class="btn btn-ghost btn-sm" data-act="reviseStructure" data-json="' + A.esc(JSON.stringify(s)) + '">Revise</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    return '<div class="sect"><h3>Payroll runs</h3><button class="btn btn-primary btn-sm" data-act="createPayrollRun">' + icon('plus') + ' New run</button></div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">A run goes <b>Draft → Processed → Locked</b>. Open a draft run to review each employee\'s suggested loss-of-pay days (from the attendance register), enter TDS / other deductions, generate payslips, then process it to build the PDFs and notify everyone. Approved expense claims marked "pay via payroll" are added automatically as reimbursements.</div>' +
      runRows +
      '<div class="sect mt4"><h3>Salary structures</h3><button class="btn btn-secondary btn-sm" data-act="addSalaryStructure">' + icon('plus') + ' Add / revise</button></div>' +
      missingRows + structRows;
  }

  /* ---- salary structure form (live totals) */
  function salaryStructureForm(employeeId, existing) {
    A.api('people.picklist').then(function (people) {
      var sel = employeeId || (existing ? existing.employeeId : '');
      var opts = people.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + A.esc(p.code + ' — ' + p.name) + '</option>'; }).join('');
      function num(name, label, val) { return '<div class="field"><label>' + label + '</label><input class="input ss-num" type="number" min="0" step="1" name="' + name + '" value="' + (val || 0) + '"></div>'; }
      var ex = existing || {};
      A.modal({
        title: existing ? 'Revise salary structure — ' + existing.employeeName : 'Add salary structure', wide: true,
        body: '<form id="ssf">' +
          '<div class="grid2"><div class="field"><label>Employee</label><select class="input" name="employeeId"' + (existing ? ' disabled' : '') + '>' + opts + '</select></div>' +
          '<div class="field"><label>Effective from</label><input class="input" type="date" name="effectiveFrom" value="' + A.todayStr().slice(0, 8) + '01" required></div></div>' +
          '<div class="grid3">' + num('basic', 'Basic', ex.basic) + num('hra', 'House rent allowance', ex.hra) + num('conveyanceAllowance', 'Conveyance', ex.conveyance) + '</div>' +
          '<div class="grid3">' + num('medicalAllowance', 'Medical', ex.medical) + num('specialAllowance', 'Special allowance', ex.special) + num('otherAllowance', 'Other allowance', ex.other) + '</div>' +
          '<div class="grid2"><div class="field"><label>PF applicable</label><select class="input" name="pfApplicable"><option value="true"' + (ex.pfApplicable !== false ? ' selected' : '') + '>Yes — 12% on basic (capped at ceiling)</option><option value="false"' + (ex.pfApplicable === false ? ' selected' : '') + '>No</option></select></div>' +
          '<div class="field"><label>ESI applicable</label><select class="input" name="esiApplicable"><option value="false"' + (!ex.esiApplicable ? ' selected' : '') + '>No</option><option value="true"' + (ex.esiApplicable ? ' selected' : '') + '>Yes — only if gross ≤ threshold</option></select></div></div>' +
          '<div class="outline" style="padding:14px"><div class="spread"><div><div class="tiny">Gross per month</div><div style="font-size:24px;font-weight:800" id="ss-gross">₹0</div></div><div class="right"><div class="tiny">CTC per year (auto, editable)</div><input class="input" type="number" name="ctcAnnual" style="width:180px;text-align:right" value="' + (ex.ctcAnnual || '') + '"></div></div></div>' +
          '</form>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="ss-save">Save structure</button>',
        onMount: function (root) {
          var f = root.querySelector('#ssf');
          function recalc() {
            var g = 0; root.querySelectorAll('.ss-num').forEach(function (i) { g += Number(i.value) || 0; });
            root.querySelector('#ss-gross').textContent = rs(g);
            if (!f.ctcAnnual.getAttribute('data-touched')) f.ctcAnnual.value = g * 12;
          }
          root.querySelectorAll('.ss-num').forEach(function (i) { i.addEventListener('input', recalc); });
          f.ctcAnnual.addEventListener('input', function () { f.ctcAnnual.setAttribute('data-touched', '1'); });
          recalc();
          root.querySelector('#ss-save').onclick = function () {
            var b = { employeeId: f.employeeId.value, effectiveFrom: f.effectiveFrom.value, pfApplicable: f.pfApplicable.value === 'true', esiApplicable: f.esiApplicable.value === 'true', ctcAnnual: f.ctcAnnual.value };
            ['basic', 'hra', 'conveyanceAllowance', 'medicalAllowance', 'specialAllowance', 'otherAllowance'].forEach(function (k) { b[k] = f[k].value; });
            A.api('admin.payroll.structures.save', b).then(function () { A.close(); A.toast('Salary structure saved.', 'ok'); A.render(); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function createPayrollRunForm() {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    var dflt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    A.prompt('Create payroll run', [{ name: 'period', label: 'Month', type: 'month', value: dflt }], 'Create').then(function (v) {
      if (!v || !v.period) return;
      var parts = v.period.split('-');
      return A.api('admin.payroll.runs.create', { year: Number(parts[0]), month: Number(parts[1]) })
        .then(function (r) { A.toast('Payroll run created.', 'ok'); openRun(r.id); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ---- run detail: worksheet + lifecycle */
  function openRun(runId) {
    A.api('admin.payroll.runs.preview', { runId: runId }).then(runModal).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function runModal(pv) {
    var run = pv.run, rows = pv.rows;
    var draft = run.status === 'Draft';
    var toGenerate = rows.filter(function (r) { return !r.alreadyGenerated && r.hasStructure; }).length;
    var generatedPending = rows.filter(function (r) { return r.payslipStatus === 'Generated'; }).length;
    var missing = rows.filter(function (r) { return !r.hasStructure; });

    var table = '<div class="tablewrap"><table class="tbl" style="font-size:13px"><thead><tr><th>Employee</th><th class="right">Gross</th><th>Attendance</th><th>LOP days</th><th>TDS</th><th>Other ded.</th><th class="right">Reimb.</th><th class="right">Est. net</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var att = r.attendance || {};
        var attTxt = att.present + 'P · ' + att.leave + 'L · <span style="color:var(--accent)">' + att.absent + 'A</span>' + (att.missingPunch ? ' · ' + att.missingPunch + 'M' : '') + (att.lwp ? ' · ' + att.lwp + ' LWP' : '') + (att.preJoin ? ' · joined ' + A.shortD(r.joinDate) : '') + (att.postExit ? ' · left ' + A.shortD(r.lastWorkingDate) : '');
        var editable = draft && !r.alreadyGenerated && r.hasStructure;
        var editGen = draft && r.payslipStatus === 'Generated';
        var inputs = function (lop, tds, oth, cls) {
          return '<td><input class="input ' + cls + '" data-f="lop" type="number" min="0" step="0.5" style="width:70px" value="' + lop + '"></td>' +
            '<td><input class="input ' + cls + '" data-f="tds" type="number" min="0" style="width:84px" value="' + tds + '"></td>' +
            '<td><input class="input ' + cls + '" data-f="other" type="number" min="0" style="width:84px" value="' + oth + '"></td>';
        };
        return '<tr data-emp="' + r.employeeId + '" data-ps="' + (r.payslipId || '') + '">' +
          '<td><div style="font-weight:600">' + A.esc(r.name) + '</div><div class="small muted">' + A.esc(r.code) + ' · ' + A.esc(r.department || '') + '</div></td>' +
          '<td class="right mono">' + (r.hasStructure ? rs(r.gross) : '<span class="tag tag-err">no structure</span>') + '</td>' +
          '<td class="small">' + attTxt + '</td>' +
          (editable ? inputs(r.suggestedLop, 0, 0, 'pr-in') : (editGen ? inputs(r.suggestedLop, 0, 0, 'pr-edit') : '<td>' + r.suggestedLop + '</td><td>—</td><td>—</td>')) +
          '<td class="right mono">' + (r.reimbursements ? rs(r.reimbursements) : '—') + '</td>' +
          '<td class="right mono" data-net>' + (r.hasStructure ? rs(r.estimatedNet) : '—') + '</td>' +
          '<td>' + (r.alreadyGenerated ? tag(r.payslipStatus) : (r.hasStructure ? '<span class="tag tag-neutral">Not generated</span>' : '<span class="tag tag-err">Skipped</span>')) + '</td>' +
          '<td class="nowrap">' + (editGen ? '<button class="btn btn-ghost btn-sm" data-save-ps="' + r.payslipId + '">Save</button>' : '') +
          (r.alreadyGenerated && run.status !== 'Locked' ? '<button class="btn btn-ghost btn-sm" data-void-ps="' + r.payslipId + '">Void</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var canProcess = run.status !== 'Locked' && generatedPending > 0;
    var canLock = run.status === 'Processed';
    A.modal({
      title: 'Payroll run — ' + run.label, wide: true,
      body: '<div class="spread wrap" style="gap:10px;margin-bottom:12px"><div class="row wrap" style="gap:8px">' + tag(run.status) +
        '<span class="small muted">' + rows.length + ' employees · ' + pv.period.daysInMonth + ' days · PF ' + pv.rates.pfEmployeePct + '% · ESI ' + pv.rates.esiEmployeePct + '% up to ₹' + pv.rates.esiWageThreshold + '</span></div>' +
        '<div class="row" style="gap:6px">' + (run.payslips ? '<button class="btn btn-secondary btn-sm" id="run-register">' + icon('download') + ' Register CSV</button>' : '') + '</div></div>' +
        (missing.length ? '<div class="geo bad" style="margin-bottom:12px">' + missing.length + ' employee(s) have no salary structure and will be skipped: ' + A.esc(missing.map(function (m) { return m.code; }).join(', ')) + '</div>' : '') +
        (draft && toGenerate ? '<div class="geo wait" style="margin-bottom:12px">LOP days are <b>suggested from the attendance register</b> — confirm or correct each row, enter any TDS / other deductions, then generate payslips.</div>' : '') +
        table +
        '<div id="run-progress" class="small muted mt2"></div>',
      footer: '<button class="btn btn-secondary" data-close="btn">Close</button>' +
        (draft && toGenerate ? '<button class="btn btn-secondary" id="run-gen">Generate ' + toGenerate + ' payslip(s)</button>' : '') +
        (canProcess ? '<button class="btn btn-primary" id="run-process">Process & publish ' + generatedPending + '</button>' : '') +
        (canLock ? '<button class="btn btn-dark" id="run-lock">Lock run</button>' : ''),
      onMount: function (root) {
        var gen = root.querySelector('#run-gen');
        if (gen) gen.onclick = function () {
          var list = [];
          root.querySelectorAll('tr[data-emp]').forEach(function (tr) {
            var ins = tr.querySelectorAll('.pr-in');
            if (!ins.length) return;
            list.push({ employeeId: tr.getAttribute('data-emp'), lopDays: ins[0].value, tds: ins[1].value, otherDeductions: ins[2].value });
          });
          gen.disabled = true; gen.innerHTML = '<span class="spinner"></span> Generating…';
          A.api('admin.payroll.payslips.generate', { runId: run.id, rows: list }).then(function (r) {
            A.toast(r.generated + ' payslip(s) generated' + (r.skippedNoStructure.length ? ' · skipped ' + r.skippedNoStructure.length : '') + '.', 'ok');
            openRun(run.id);
          }).catch(function (e) { gen.disabled = false; gen.textContent = 'Generate payslips'; A.toast(e.message, 'err'); });
        };
        root.querySelectorAll('[data-save-ps]').forEach(function (btn) {
          btn.onclick = function () {
            var tr = btn.closest('tr'); var ins = tr.querySelectorAll('.pr-edit');
            A.api('admin.payroll.payslips.update', { payslipId: btn.getAttribute('data-save-ps'), lopDays: ins[0].value, tds: ins[1].value, otherDeductions: ins[2].value })
              .then(function (p) { tr.querySelector('[data-net]').textContent = rs(p.netPay); A.toast('Payslip updated — net ' + rs(p.netPay) + '.', 'ok'); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        });
        root.querySelectorAll('[data-void-ps]').forEach(function (btn) {
          btn.onclick = function () {
            A.prompt('Void payslip', [{ name: 'reason', label: 'Reason (shown to HR in the audit trail)', type: 'textarea' }], 'Void').then(function (v) {
              if (!v) return;
              return A.api('admin.payroll.payslips.void', { payslipId: btn.getAttribute('data-void-ps'), reason: v.reason }).then(function () { A.toast('Payslip voided — regenerate it from this screen.', 'ok'); openRun(run.id); });
            }).catch(function (e) { A.toast(e.message, 'err'); });
          };
        });
        var proc = root.querySelector('#run-process');
        if (proc) proc.onclick = function () {
          A.confirm('Process & publish', 'Build the PDF for every generated payslip, publish them to employees and notify them? You can still void and regenerate individual payslips until the run is locked.', 'Process').then(function (ok) {
            if (!ok) return;
            proc.disabled = true;
            var prog = root.querySelector('#run-progress'); var done = 0;
            (function step() {
              prog.innerHTML = '<span class="spinner"></span> Publishing payslips… ' + done + ' done';
              A.api('admin.payroll.runs.process', { runId: run.id }).then(function (r) {
                done += r.published;
                if (!r.done) return step();
                A.toast(done + ' payslip(s) published and employees notified.', 'ok');
                A.render(); openRun(run.id);
              }).catch(function (e) { proc.disabled = false; prog.textContent = ''; A.toast(e.message, 'err'); });
            })();
          });
        };
        var lock = root.querySelector('#run-lock');
        if (lock) lock.onclick = function () {
          A.confirm('Lock run', 'Lock ' + run.label + '? No further edits, voids or regeneration will be possible.', 'Lock').then(function (ok) {
            if (!ok) return;
            A.api('admin.payroll.runs.lock', { runId: run.id }).then(function () { A.toast('Run locked.', 'ok'); A.close(); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
          });
        };
        var reg = root.querySelector('#run-register');
        if (reg) reg.onclick = function () { exportRegister(run.id); };
      }
    });
  }

  function exportRegister(runId) {
    A.api('admin.payroll.runs.register', { runId: runId }).then(function (r) {
      var cols = ['employeeCode', 'employeeName', 'department', 'designation', 'daysInMonth', 'payableDays', 'lopDays', 'basic', 'hra', 'conveyance', 'medical', 'special', 'other', 'gross', 'pfEmployee', 'esiEmployee', 'professionalTax', 'tds', 'otherDeductions', 'totalDeductions', 'reimbursements', 'netPay', 'pfEmployer', 'esiEmployer', 'bankName', 'bankAccount', 'bankIFSC', 'uan', 'pfNumber', 'esiNumber', 'pan', 'status'];
      var lines = [cols.join(',')].concat(r.rows.map(function (row) {
        return cols.map(function (c) { return '"' + String(row[c] === undefined || row[c] === null ? '' : row[c]).replace(/"/g, '""') + '"'; }).join(',');
      }));
      lines.push('"TOTAL","","","","","","","","","","","","","' + r.totals.gross + '","' + r.totals.pfEmployee + '","' + r.totals.esiEmployee + '","' + r.totals.professionalTax + '","' + r.totals.tds + '","' + r.totals.otherDeductions + '","' + r.totals.totalDeductions + '","' + r.totals.reimbursements + '","' + r.totals.netPay + '","' + r.totals.pfEmployer + '","' + r.totals.esiEmployer + '"');
      A.modal({
        title: 'Payroll register — ' + r.run.label, wide: true,
        body: '<p class="small muted">Copy into Excel / Google Sheets, or use it as the bank-advice source. Totals are on the last line.</p>' +
          '<textarea class="input" id="regBox" style="min-height:280px;font-family:ui-monospace,Menlo,monospace;font-size:12px">' + A.esc(lines.join('\n')) + '</textarea>',
        footer: '<button class="btn btn-secondary" data-close="btn">Close</button><button class="btn btn-primary" id="regCopy">Copy to clipboard</button>',
        onMount: function (root) {
          root.querySelector('#regCopy').onclick = function () {
            var box = root.querySelector('#regBox'); box.select();
            try { document.execCommand('copy'); A.toast('Copied.', 'ok'); } catch (e) { A.toast('Press Ctrl/Cmd+C to copy.', 'err'); }
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

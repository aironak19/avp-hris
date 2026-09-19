/* ══════════════════════════════════════════════════════════════════════════
   Exit management — employee "Resignation" tracker + Administration →
   Exit management (approvals, clearance, full & final, relieving).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var STEP_LABEL = { Requested: 'Requested', ClearanceInProgress: 'Clearance', Cleared: 'Cleared', Settled: 'Settled', Relieved: 'Relieved' };
  var ST_TAG = { Requested: 'tag-warn', ClearanceInProgress: 'tag-accent', Cleared: 'tag-accent', Settled: 'tag-ok', Relieved: 'tag-dark', Rejected: 'tag-err', Withdrawn: 'tag-neutral', Pending: 'tag-warn', Blocked: 'tag-err', 'Not applicable': 'tag-neutral', Prepared: 'tag-warn', Approved: 'tag-ok', Paid: 'tag-dark', Cancelled: 'tag-neutral' };
  var STATUS_TEXT = {
    Requested: 'Submitted — awaiting HR approval.', ClearanceInProgress: 'Accepted. Department clearance is in progress.',
    Cleared: 'Clearance complete. HR is preparing your full & final settlement.', Settled: 'Settlement approved. Relieving formalities are next.',
    Relieved: 'You have been relieved. Thank you for your time with AVP — all the best!', Rejected: 'This request was not accepted by HR.', Withdrawn: 'This request was withdrawn.'
  };
  function tag(s) { return '<span class="tag ' + (ST_TAG[s] || 'tag-neutral') + '">' + A.esc(STEP_LABEL[s] || s.replace(/([A-Z])/g, ' $1').trim()) + '</span>'; }
  function rs(n) { return '₹' + A.money(n); }

  function progress(ex) {
    var idx = ex.step;
    return '<div class="row mt2" style="gap:4px">' + ex.steps.map(function (s, i) { return '<div class="bar thin grow"><i style="width:' + (i <= idx ? 100 : 0) + '%"></i></div>'; }).join('') + '</div>' +
      '<div class="row small muted mt1" style="justify-content:space-between">' + ex.steps.map(function (s) { return '<span>' + STEP_LABEL[s] + '</span>'; }).join('') + '</div>';
  }

  function clearanceList(items, editable) {
    var byDept = {};
    items.forEach(function (it) { (byDept[it.department] = byDept[it.department] || []).push(it); });
    return Object.keys(byDept).map(function (dept) {
      return '<div class="mt2"><div class="tiny" style="margin-bottom:4px">' + A.esc(dept) + '</div>' + byDept[dept].map(function (it) {
        return '<div class="rowline" data-item="' + it.id + '" style="gap:10px;flex-wrap:wrap">' +
          '<div class="grow" style="min-width:200px"><div style="font-size:14px">' + A.esc(it.itemName) + '</div>' + (it.remark ? '<div class="small muted">' + A.esc(it.remark) + '</div>' : '') + (it.clearedByName ? '<div class="tiny">' + A.esc(it.clearedByName) + ' · ' + A.esc(it.clearedAt) + '</div>' : '') + '</div>' +
          (editable ? '<select class="input" data-clear-select="' + it.id + '" style="width:150px">' + ['Pending', 'Blocked', 'Cleared', 'Not applicable'].map(function (s) { return '<option value="' + s + '"' + (it.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
            '<button class="btn btn-ghost btn-sm" data-clear-remark="' + it.id + '" title="Add remark">' + icon('edit') + '</button>' : tag(it.status)) + '</div>';
      }).join('') + '</div>';
    }).join('');
  }

  /* ------------------------------------------------------------ employee */
  A.registerView('exit', {
    title: 'Resignation',
    render: function () {
      return A.api('exit.mine').then(function (ex) {
        var head = '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">Separation</div><h1 style="margin:0">Resignation</h1></div></div>';
        if (!ex) {
          return head + '<div class="panel" style="max-width:640px"><h3>Thinking of moving on?</h3><p class="muted">Submitting a resignation here starts the formal process: HR reviews it, confirms your last working day (' + 'notice period applies' + '), and tracks clearance and your full & final settlement. You can withdraw the request while it is still pending.</p>' +
            '<button class="btn btn-primary" data-act="requestExit">Submit resignation</button></div>';
        }
        var canWithdraw = ex.status === 'Requested' || ex.status === 'ClearanceInProgress';
        var fnf = ex.fnf;
        return head +
          '<div class="split"><div>' +
          '<div class="panel"><div class="spread wrap" style="gap:10px"><div><div style="font-weight:700;font-size:16px">Status</div><div class="small muted">' + A.esc(STATUS_TEXT[ex.status] || '') + '</div></div>' + tag(ex.status) + '</div>' + (ex.step >= 0 ? progress(ex) : '') + '</div>' +
          '<div class="grid2 mt3" style="gap:0">' +
          [['Resignation date', A.pretty(ex.resignationDate)], ['Requested last working day', A.pretty(ex.requestedLastWorkingDate)],
            ['Confirmed last working day', ex.confirmedLastWorkingDate ? A.pretty(ex.confirmedLastWorkingDate) + (ex.daysToLwd !== null && ex.daysToLwd >= 0 ? ' <span class="tag tag-neutral">' + ex.daysToLwd + ' day(s) left</span>' : '') : '—'],
            ['Reason', A.esc(ex.reasonCategory) + (ex.reason ? ' · ' + A.esc(ex.reason) : '')]].map(function (f) {
            return '<div style="padding:12px 16px 12px 0;border-bottom:1px solid var(--line)"><div class="stat-label">' + f[0] + '</div><div style="font-size:15px;margin-top:3px;font-weight:600">' + (f[1] || '—') + '</div></div>';
          }).join('') + '</div>' +
          (ex.rejectedReason ? '<div class="geo bad mt2">' + A.esc(ex.rejectedReason) + '</div>' : '') +
          (canWithdraw ? '<div class="mt3"><button class="btn btn-secondary" data-act="withdrawExit" data-id="' + ex.id + '">Withdraw request</button></div>' : '') +
          '</div><div>' +
          (ex.clearance && ex.clearance.total ? '<div class="sect"><h3>Clearance</h3><span class="small muted">' + ex.clearance.cleared + ' / ' + ex.clearance.total + ' done</span></div>' + clearanceList(ex.clearance.items, false) : '') +
          (fnf ? '<div class="sect mt4"><h3>Full &amp; final settlement</h3>' + tag(fnf.status) + '</div>' +
            [['Leave encashment', fnf.leaveEncashmentDays + ' day(s) · ' + rs(fnf.leaveEncashmentAmount)], ['Pending salary', fnf.pendingSalaryDays + ' day(s) · ' + rs(fnf.pendingSalaryAmount)], ['Other additions', rs(fnf.additions)], ['Deductions', rs(fnf.deductions)]].map(function (f) {
              return '<div class="rowline"><span class="grow">' + f[0] + '</span><span class="mono">' + f[1] + '</span></div>';
            }).join('') + '<div class="rowline" style="font-weight:800"><span class="grow">Net payable</span><span class="mono">' + rs(fnf.netPayable) + '</span></div>' + (fnf.paidAt ? '<div class="small muted mt1">Paid ' + A.esc(fnf.paidAt) + '</div>' : '') : '') +
          '</div></div>';
      });
    },
    actions: {
      requestExit: function () { requestForm(); },
      withdrawExit: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Withdraw resignation', 'Withdraw this resignation request? HR will be informed.', 'Withdraw').then(function (ok) {
          if (!ok) return;
          A.api('exit.withdraw', { exitId: id }).then(function () { A.toast('Request withdrawn.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      }
    }
  });

  function requestForm(employee) {
    var d = new Date(); var lwd = new Date(d.getTime() + 30 * 86400000);
    function ymd(x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
    A.prompt(employee ? 'Record resignation — ' + employee.name : 'Submit resignation', [
      { name: 'resignationDate', label: 'Resignation date', type: 'date', value: ymd(d) },
      { name: 'requestedLastWorkingDate', label: 'Requested last working day', type: 'date', value: ymd(lwd) },
      { name: 'reasonCategory', label: 'Reason', type: 'select', value: 'BetterOpportunity', options: [['Personal', 'Personal / family'], ['HigherStudies', 'Higher studies'], ['BetterOpportunity', 'Better opportunity'], ['Relocation', 'Relocation'], ['Health', 'Health'], ['Other', 'Other']].map(function (o) { return { value: o[0], label: o[1] }; }) },
      { name: 'reason', label: 'A few words about why', type: 'textarea' }
    ], employee ? 'Record' : 'Submit resignation').then(function (v) {
      if (!v) return;
      if (!v.reason) { A.toast('Please add a short reason.', 'err'); return; }
      if (employee) v.employeeId = employee.id;
      return A.api('exit.request', v).then(function () { A.toast(employee ? 'Resignation recorded.' : 'Resignation submitted to HR.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'exit', label: 'Exit management', group: 'Workforce',
    render: function (params) {
      return A.api('admin.exit.list', { includeClosed: params.all === '1' }).then(function (list) { return exitTab(list, params); });
    },
    actions: {
      toggleAll: function () { A.go('admin', { tab: 'exit', all: A.S.params.all === '1' ? '0' : '1' }); },
      hrInitiate: function () {
        A.api('people.picklist').then(function (list) {
          A.prompt('Record a resignation on behalf of', [{ name: 'employeeId', label: 'Employee', type: 'select', options: list.map(function (p) { return { value: p.id, label: p.code + ' — ' + p.name }; }) }], 'Next').then(function (v) {
            if (!v) return;
            var p = list.filter(function (x) { return x.id === v.employeeId; })[0];
            requestForm(p);
          });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      approveExit: function (el) {
        var ex = JSON.parse(el.getAttribute('data-json'));
        A.prompt('Accept resignation — ' + ex.employeeName, [{ name: 'confirmedLastWorkingDate', label: 'Confirmed last working day (notice period ' + ex.noticePeriodDays + ' days)', type: 'date', value: ex.requestedLastWorkingDate }], 'Accept').then(function (v) {
          if (!v) return;
          return A.api('admin.exit.approve', { exitId: ex.id, confirmedLastWorkingDate: v.confirmedLastWorkingDate }).then(function (r) { A.toast('Accepted — ' + r.clearanceItems + ' clearance item(s) created.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      rejectExit: function (el) {
        var id = el.getAttribute('data-id');
        A.prompt('Decline resignation request', [{ name: 'reason', label: 'Reason (shown to the employee)', type: 'textarea' }], 'Decline').then(function (v) {
          if (!v) return;
          return A.api('admin.exit.reject', { exitId: id, reason: v.reason }).then(function () { A.toast('Request declined.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      setLwd: function (el) {
        var ex = JSON.parse(el.getAttribute('data-json'));
        A.prompt('Change last working day', [{ name: 'confirmedLastWorkingDate', label: 'Last working day', type: 'date', value: ex.lastWorkingDate }], 'Update').then(function (v) {
          if (!v) return;
          return A.api('admin.exit.setLastWorkingDate', { exitId: ex.id, confirmedLastWorkingDate: v.confirmedLastWorkingDate }).then(function () { A.toast('Updated.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      viewClearance: function (el) { openClearance(el.getAttribute('data-id'), el.getAttribute('data-name')); },
      prepareFnf: function (el) { fnfForm(el.getAttribute('data-id')); },
      approveFnf: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Approve settlement', 'Approve this full & final settlement? The employee will be notified of the net amount.', 'Approve').then(function (ok) {
          if (!ok) return;
          A.api('admin.exit.fnf.approve', { fnfId: id }).then(function () { A.toast('Settlement approved.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      cancelFnf: function (el) {
        var id = el.getAttribute('data-id');
        A.prompt('Cancel settlement', [{ name: 'reason', label: 'Why? (a fresh settlement can then be prepared)', type: 'textarea' }], 'Cancel settlement').then(function (v) {
          if (!v) return;
          return A.api('admin.exit.fnf.cancel', { fnfId: id, reason: v.reason }).then(function () { A.toast('Settlement cancelled.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      markFnfPaid: function (el) {
        var id = el.getAttribute('data-id');
        A.prompt('Mark settlement paid', [{ name: 'reference', label: 'Payment reference (UTR / cheque no.)', placeholder: 'optional' }], 'Mark paid').then(function (v) {
          if (!v) return;
          return A.api('admin.exit.fnf.markPaid', { fnfId: id, reference: v.reference }).then(function () { A.toast('Marked as paid.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      relieveEmployee: function (el) {
        var ex = JSON.parse(el.getAttribute('data-json'));
        A.confirm('Relieve ' + ex.employeeName, 'This marks the employee as exited as of ' + A.pretty(ex.lastWorkingDate) + ', signs them out everywhere and removes them from headcount, payroll and approvals. Continue?', 'Relieve').then(function (ok) {
          if (!ok) return;
          A.api('admin.exit.relieve', { exitId: ex.id }).then(function (r) {
            A.modal({
              title: 'Relieved — ' + ex.employeeName,
              body: '<p>' + A.esc(ex.employeeName) + ' has been relieved. The usual next step is to issue their separation documents:</p>' +
                '<div class="stack" style="gap:8px">' + r.suggestedLetterTemplates.map(function (t) { return '<button class="btn btn-secondary btn-block" data-close="btn" data-letter="' + t.templateId + '" style="justify-content:flex-start">' + icon('file') + ' Generate ' + A.esc(t.label) + '</button>'; }).join('') + '</div>',
              footer: '<button class="btn btn-secondary" data-close="btn">Later</button>',
              onMount: function (root) {
                root.querySelectorAll('[data-letter]').forEach(function (b) { b.addEventListener('click', function () { A.go('admin', { tab: 'letters', generateFor: ex.employeeId, templateId: b.getAttribute('data-letter') }); }); });
              }
            });
          }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      }
    }
  });

  function exitTab(list, params) {
    var rows = !list.length ? '<div class="empty">' + (params.all === '1' ? 'No exit records.' : 'No resignations in progress.') + '</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Employee</th><th>Resigned</th><th>Last working day</th><th>Clearance</th><th>F&amp;F</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (x) {
        var j = A.esc(JSON.stringify(x));
        var fnf = x.fnf, cl = x.clearance || { total: 0, cleared: 0 };
        var actions = '';
        if (x.status === 'Requested') actions = '<button class="btn btn-primary btn-sm" data-act="approveExit" data-json="' + j + '">Accept</button> <button class="btn btn-ghost btn-sm" data-act="rejectExit" data-id="' + x.id + '">Decline</button>';
        else if (x.status === 'ClearanceInProgress') actions = '<button class="btn btn-secondary btn-sm" data-act="viewClearance" data-id="' + x.id + '" data-name="' + A.esc(x.employeeName) + '">Clearance</button>';
        else if (x.status === 'Cleared') {
          actions = '<button class="btn btn-ghost btn-sm" data-act="viewClearance" data-id="' + x.id + '" data-name="' + A.esc(x.employeeName) + '">Clearance</button> ';
          if (!fnf || fnf.status === 'Cancelled') actions += '<button class="btn btn-primary btn-sm" data-act="prepareFnf" data-id="' + x.id + '">Prepare F&amp;F</button>';
          else if (fnf.status === 'Prepared') actions += '<button class="btn btn-primary btn-sm" data-act="approveFnf" data-id="' + fnf.id + '">Approve F&amp;F</button> <button class="btn btn-ghost btn-sm" data-act="cancelFnf" data-id="' + fnf.id + '">Cancel</button>';
        } else if (x.status === 'Settled') {
          actions = (fnf && fnf.status === 'Approved' ? '<button class="btn btn-secondary btn-sm" data-act="markFnfPaid" data-id="' + fnf.id + '">Mark paid</button> ' : '') + '<button class="btn btn-primary btn-sm" data-act="relieveEmployee" data-json="' + j + '">Relieve</button>';
        }
        if (['Requested', 'ClearanceInProgress', 'Cleared', 'Settled'].indexOf(x.status) > -1 && x.status !== 'Requested') actions += ' <button class="btn btn-ghost btn-sm" data-act="setLwd" data-json="' + j + '" title="Change last working day">' + icon('edit') + '</button>';
        return '<tr><td><div style="font-weight:600">' + A.esc(x.employeeName) + '</div><div class="small muted">' + A.esc(x.employeeCode) + ' · ' + A.esc(x.reasonCategory || '') + (x.initiatedByHR ? ' · recorded by HR' : '') + '</div></td>' +
          '<td class="small">' + A.pretty(x.resignationDate) + '</td>' +
          '<td class="small">' + A.pretty(x.lastWorkingDate) + (x.daysToLwd !== null && x.status !== 'Relieved' ? '<div class="tiny">' + (x.daysToLwd >= 0 ? x.daysToLwd + ' day(s) left' : Math.abs(x.daysToLwd) + ' day(s) ago') + '</div>' : '') + '</td>' +
          '<td class="small">' + (cl.total ? cl.cleared + ' / ' + cl.total + '<div class="bar thin mt1" style="width:80px"><i style="width:' + Math.round(cl.cleared / cl.total * 100) + '%"></i></div>' : '—') + '</td>' +
          '<td class="small">' + (fnf ? tag(fnf.status) + '<div class="mono">' + rs(fnf.netPayable) + '</div>' : '—') + '</td>' +
          '<td>' + tag(x.status) + '</td><td class="right nowrap">' + actions + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return '<div class="sect"><h3>Exit requests</h3><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-act="toggleAll">' + (params.all === '1' ? 'Hide closed' : 'Show closed') + '</button><button class="btn btn-primary btn-sm" data-act="hrInitiate">' + icon('plus') + ' Record resignation</button></div></div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">Accept a request to confirm the last working day and start clearance (department checklist + any assets issued). Once everything is cleared, prepare the full &amp; final settlement — the numbers are pre-filled from the leave balance and salary structure but you confirm them — approve it, mark it paid, then relieve the employee and issue their letters.</div>' + rows;
  }

  function openClearance(exitId, name) {
    A.api('admin.exit.clearance.list', { exitId: exitId }).then(function (items) {
      A.modal({
        title: 'Clearance — ' + name, wide: true,
        body: '<div class="small muted">Set each item to Cleared (or Not applicable). The exit moves to <b>Cleared</b> automatically once every item is done. Returning an asset from the asset register clears its line here too.</div>' + clearanceList(items, true),
        footer: '<button class="btn btn-secondary" data-close="btn">Close</button>',
        onMount: function (root) {
          root.querySelectorAll('[data-clear-select]').forEach(function (sel) {
            sel.onchange = function () {
              A.api('admin.exit.clearance.update', { clearanceId: sel.getAttribute('data-clear-select'), status: sel.value })
                .then(function (r) { A.toast(r.allCleared ? 'All items cleared — exit moved to Cleared.' : 'Updated.', 'ok'); if (r.allCleared) { A.close(); A.render(); } })
                .catch(function (e) { A.toast(e.message, 'err'); });
            };
          });
          root.querySelectorAll('[data-clear-remark]').forEach(function (b) {
            b.onclick = function () {
              var id = b.getAttribute('data-clear-remark');
              A.prompt('Remark', [{ name: 'remark', label: 'Note for this item', type: 'textarea' }], 'Save').then(function (v) {
                if (!v) return;
                return A.api('admin.exit.clearance.update', { clearanceId: id, remark: v.remark }).then(function () { A.toast('Saved.', 'ok'); openClearance(exitId, name); });
              }).catch(function (e) { A.toast(e.message, 'err'); });
            };
          });
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function fnfForm(exitId) {
    A.api('admin.exit.fnf.suggest', { exitId: exitId }).then(function (s) {
      function num(name, label, val, note) { return '<div class="field"><label>' + label + '</label><input class="input fnf-n" type="number" step="0.01" name="' + name + '" value="' + (val || 0) + '">' + (note ? '<div class="tiny mt1">' + A.esc(note) + '</div>' : '') + '</div>'; }
      A.modal({
        title: 'Full & final settlement — ' + s.exit.employeeName, wide: true,
        body: '<div class="geo wait" style="margin-bottom:12px">Pre-filled from live data — <b>check every number</b> before preparing. Last working day ' + A.pretty(s.lastWorkingDate) + ' · gross ₹' + A.money(s.grossMonthly) + '/month' + (s.notes.assets ? '<br>' + A.esc(s.notes.assets) : '') + '</div>' +
          '<form id="fnff"><div class="grid2">' + num('leaveEncashmentDays', 'Leave encashment — days', s.leaveEncashmentDays, s.notes.leave) + num('leaveEncashmentAmount', 'Leave encashment — amount (₹)', s.leaveEncashmentAmount) + '</div>' +
          '<div class="grid2">' + num('pendingSalaryDays', 'Pending salary — days', s.pendingSalaryDays, s.notes.salary) + num('pendingSalaryAmount', 'Pending salary — amount (₹)', s.pendingSalaryAmount) + '</div>' +
          '<div class="grid2">' + num('additions', 'Other additions (₹)', s.additions, s.notes.additions || 'Bonus, gratuity, approved expense claims…') + num('deductions', 'Deductions (₹)', s.deductions, 'Notice-period shortfall, advances, unreturned assets…') + '</div>' +
          '<div class="field"><label>Remark</label><input class="input" name="remark" placeholder="optional"></div>' +
          '<div class="outline" style="padding:14px"><div class="tiny">Net payable</div><div style="font-size:26px;font-weight:800" id="fnf-net">₹0</div></div></form>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="fnf-save">Prepare settlement</button>',
        onMount: function (root) {
          var f = root.querySelector('#fnff');
          function recalc() { var n = (Number(f.leaveEncashmentAmount.value) || 0) + (Number(f.pendingSalaryAmount.value) || 0) + (Number(f.additions.value) || 0) - (Number(f.deductions.value) || 0); root.querySelector('#fnf-net').textContent = rs(n); }
          root.querySelectorAll('.fnf-n').forEach(function (i) { i.addEventListener('input', recalc); }); recalc();
          root.querySelector('#fnf-save').onclick = function () {
            var b = { exitId: exitId, remark: f.remark.value };
            ['leaveEncashmentDays', 'leaveEncashmentAmount', 'pendingSalaryDays', 'pendingSalaryAmount', 'additions', 'deductions'].forEach(function (k) { b[k] = f[k].value; });
            A.api('admin.exit.fnf.prepare', b).then(function (r) { A.close(); A.toast('Settlement prepared — net payable ' + rs(r.netPayable) + '.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

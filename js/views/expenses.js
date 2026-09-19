/* ══════════════════════════════════════════════════════════════════════════
   Expenses — employee claims (with receipt upload), approvals waiting on the
   signed-in manager / HR, and Administration → Expenses (register, payment,
   monthly summary).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var ST_LABEL = { SUBMITTED: 'Awaiting manager', MANAGER_APPROVED: 'Awaiting HR', APPROVED: 'Approved', PAID: 'Paid', REJECTED: 'Declined', CANCELLED: 'Cancelled' };
  var ST_TAG = { SUBMITTED: 'tag-warn', MANAGER_APPROVED: 'tag-accent', APPROVED: 'tag-ok', PAID: 'tag-dark', REJECTED: 'tag-err', CANCELLED: 'tag-neutral' };
  function tag(s) { return '<span class="tag ' + (ST_TAG[s] || 'tag-neutral') + '">' + A.esc(ST_LABEL[s] || s) + '</span>'; }
  function rs(n) { return '₹' + A.money(n); }

  function claimRow(c, opts) {
    opts = opts || {};
    return '<div class="item" style="grid-template-columns:1fr auto"><div>' +
      '<div class="t">' + (opts.showEmployee ? A.esc(c.employeeName) + ' <span class="muted" style="font-weight:400">· </span>' : '') + A.esc(c.title) + ' <span class="muted" style="font-weight:400">· ' + A.esc(c.category) + '</span></div>' +
      '<div class="s">' + A.pretty(c.expenseDate) + ' · <b class="mono">' + rs(c.amount) + '</b>' + (c.projectRef ? ' · ' + A.esc(c.projectRef) : '') + (c.description ? ' · ' + A.esc(c.description) : '') + '</div>' +
      '<div class="s muted">' + A.esc(c.id) + ' · submitted ' + A.relTime(c.submittedAt) + (c.managerRemark ? ' · manager: ' + A.esc(c.managerRemark) : '') + (c.hrRemark ? ' · HR: ' + A.esc(c.hrRemark) : '') + (c.paidRef ? ' · ref ' + A.esc(c.paidRef) : '') + '</div></div>' +
      '<div class="acts row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">' + tag(c.status) +
      (c.hasReceipt ? '<button class="btn btn-ghost btn-sm" data-act="viewReceipt" data-id="' + c.id + '">' + icon('download') + ' Receipt</button>' : '') +
      (opts.actions || '') + '</div></div>';
  }

  /* ------------------------------------------------------------ employee */
  A.registerView('expenses', {
    title: 'Expenses',
    render: function (params) {
      return Promise.all([A.api('expenses.mine'), A.api('expenses.pending')]).then(function (r) {
        var mine = r[0], pending = r[1];
        if (params.action === 'new') setTimeout(function () { A.go('expenses'); claimForm(); }, 0);
        var open = mine.filter(function (c) { return c.status === 'SUBMITTED' || c.status === 'MANAGER_APPROVED'; });
        var approved = mine.filter(function (c) { return c.status === 'APPROVED'; });
        var paidYtd = mine.filter(function (c) { return c.status === 'PAID'; }).reduce(function (s, c) { return s + c.amount; }, 0);
        var strip = '<div class="statstrip">' +
          stat('Awaiting approval', String(open.length), rs(open.reduce(function (s, c) { return s + c.amount; }, 0))) +
          stat('Approved, unpaid', String(approved.length), rs(approved.reduce(function (s, c) { return s + c.amount; }, 0)) + ' · paid with next payroll') +
          stat('Reimbursed', rs(paidYtd), mine.filter(function (c) { return c.status === 'PAID'; }).length + ' claim(s) so far') +
          stat('Waiting on you', String(pending.length), pending.length ? 'claims to approve' : 'nothing to approve') +
          '</div>';
        var approvals = pending.length ? '<div class="sect mt4"><h3>Waiting on your approval</h3><span class="tag tag-warn">' + pending.length + '</span></div><div class="list">' +
          pending.map(function (c) {
            return claimRow(c, { showEmployee: true, actions: '<button class="btn btn-secondary btn-sm" data-act="decide" data-id="' + c.id + '" data-d="REJECT">Decline</button><button class="btn btn-primary btn-sm" data-act="decide" data-id="' + c.id + '" data-d="APPROVE">Approve</button>' });
          }).join('') + '</div>' : '';
        var list = !mine.length ? '<div class="empty">No claims yet. Site-visit travel, prints, client meetings — claim them here with the receipt.</div>' :
          '<div class="list">' + mine.map(function (c) {
            return claimRow(c, { actions: (c.status === 'SUBMITTED' || c.status === 'MANAGER_APPROVED') ? '<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="' + c.id + '">Cancel</button>' : '' });
          }).join('') + '</div>';
        return '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">Reimbursements</div><h1 style="margin:0">Expenses</h1></div>' +
          '<button class="btn btn-primary" data-act="newClaim">' + icon('plus') + ' New claim</button></div>' + strip + approvals +
          '<div class="sect mt4"><h3>My claims</h3></div>' + list;
      });
    },
    actions: {
      newClaim: function () { claimForm(); },
      viewReceipt: function (el) { A.api('expenses.receipt', { claimId: el.getAttribute('data-id') }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); },
      cancel: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Cancel claim', 'Cancel this expense claim?', 'Cancel claim').then(function (ok) {
          if (!ok) return;
          A.api('expenses.cancel', { claimId: id }).then(function () { A.toast('Claim cancelled.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      decide: function (el) { decide(el.getAttribute('data-id'), el.getAttribute('data-d')); }
    }
  });

  function stat(label, value, sub) { return '<div><div class="stat-label">' + A.esc(label) + '</div><div class="stat-value" style="font-size:26px">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>'; }

  function decide(id, decision) {
    var approve = decision === 'APPROVE';
    var fields = [{ name: 'remark', label: approve ? 'Remark (optional)' : 'Reason for declining', type: 'textarea' }];
    if (approve && A.S.user.isHR) fields.push({ name: 'payVia', label: 'Pay via', type: 'select', value: 'PAYROLL', options: [{ value: 'PAYROLL', label: 'Next payroll (added to payslip)' }, { value: 'BANK', label: 'Bank transfer (mark paid manually)' }, { value: 'CASH', label: 'Cash' }] });
    A.prompt(approve ? 'Approve claim' : 'Decline claim', fields, approve ? 'Approve' : 'Decline').then(function (v) {
      if (!v) return;
      return A.api('expenses.decide', { claimId: id, decision: decision, remark: v.remark, payVia: v.payVia }).then(function () { A.toast(approve ? 'Approved.' : 'Declined.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function claimForm() {
    var cats = (A.S.boot && A.S.boot.settings && A.S.boot.settings.expenseCategories) || ['Travel', 'Other'];
    A.modal({
      title: 'New expense claim',
      body: '<form id="exf">' +
        '<div class="field"><label>What was it for?</label><input class="input" name="title" placeholder="e.g. Site visit — Andheri project, auto + train" required></div>' +
        '<div class="grid2"><div class="field"><label>Category</label><select class="input" name="category">' + cats.map(function (c) { return '<option>' + A.esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Date of expense</label><input class="input" type="date" name="expenseDate" value="' + A.todayStr() + '" max="' + A.todayStr() + '"></div></div>' +
        '<div class="grid2"><div class="field"><label>Amount (₹)</label><input class="input" type="number" name="amount" min="1" step="0.01" placeholder="0.00"></div>' +
        '<div class="field"><label>Project / client (optional)</label><input class="input" name="projectRef" placeholder="Project code or client"></div></div>' +
        '<div class="field"><label>Details (optional)</label><textarea class="input" name="description" rows="2" placeholder="Route, purpose, who you met…"></textarea></div>' +
        A.fileField('receipt', 'Receipt (JPG / PNG / PDF, max 4 MB) — required above ₹' + ((A.S.boot && A.S.boot.settings && A.S.boot.settings.receiptRequiredAbove) || 500)) +
        '</form>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="ex-save">Submit claim</button>',
      onMount: function (root) {
        root.querySelector('#ex-save').onclick = function () {
          var f = root.querySelector('#exf'), btn = this;
          btn.disabled = true;
          A.readUpload(f.receipt).then(function (receipt) {
            return A.api('expenses.submit', { title: f.title.value, category: f.category.value, expenseDate: f.expenseDate.value, amount: f.amount.value, projectRef: f.projectRef.value, description: f.description.value, receipt: receipt });
          }).then(function (c) { A.close(); A.toast('Claim ' + c.id + ' submitted to ' + (c.approverName || 'HR') + '.', 'ok'); A.render(); })
            .catch(function (e) { btn.disabled = false; A.toast(e.message, 'err'); });
        };
      }
    });
  }

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'expenses', label: 'Expenses', group: 'Pay',
    render: function (params) {
      var month = params.month || A.monthKey();
      return Promise.all([A.api('admin.expenses.summary', { month: month }), A.api('admin.expenses.list', { status: params.status || '', month: params.status ? '' : month })])
        .then(function (r) { return adminTab(r[0], r[1], params, month); });
    },
    actions: {
      exMonth: function (el) { A.go('admin', { tab: 'expenses', month: el.value }); },
      exStatus: function (el) { A.go('admin', { tab: 'expenses', status: el.getAttribute('data-status'), month: A.S.params.month || '' }); },
      viewReceipt: function (el) { A.api('expenses.receipt', { claimId: el.getAttribute('data-id') }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); },
      decide: function (el) { decide(el.getAttribute('data-id'), el.getAttribute('data-d')); },
      markPaid: function (el) {
        var id = el.getAttribute('data-id');
        A.prompt('Mark paid', [{ name: 'reference', label: 'Payment reference (UTR / voucher)', placeholder: 'optional' }, { name: 'payVia', label: 'Paid via', type: 'select', value: 'BANK', options: [{ value: 'BANK', label: 'Bank transfer' }, { value: 'CASH', label: 'Cash' }] }], 'Mark paid').then(function (v) {
          if (!v) return;
          return A.api('admin.expenses.markPaid', { claimId: id, reference: v.reference, payVia: v.payVia }).then(function () { A.toast('Marked paid.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      }
    }
  });

  function adminTab(s, list, params, month) {
    var statuses = [['', 'This month'], ['SUBMITTED', 'Awaiting manager'], ['MANAGER_APPROVED', 'Awaiting HR'], ['APPROVED', 'Approved, unpaid'], ['PAID', 'Paid'], ['REJECTED', 'Declined']];
    var chips = statuses.map(function (x) { return '<span class="tag ' + ((params.status || '') === x[0] ? 'tag-accent' : 'tag-neutral') + '" data-act="exStatus" data-status="' + x[0] + '" style="cursor:pointer">' + x[1] + '</span>'; }).join('');
    var strip = '<div class="statstrip">' +
      stat('Claimed · ' + s.label, rs(s.total), s.count + ' claim(s) by expense date') +
      stat('Pending approval', String(s.pendingCount), rs(s.pendingAmount) + ' in the queue') +
      stat('Top category', s.byCategory.length ? A.esc(s.byCategory[0].name) : '—', s.byCategory.length ? rs(s.byCategory[0].amount) : '') +
      stat('Top claimant', s.byEmployee.length ? A.esc(s.byEmployee[0].name) : '—', s.byEmployee.length ? rs(s.byEmployee[0].amount) : '') +
      '</div>';
    var cats = s.byCategory.length ? '<div class="mt3">' + s.byCategory.map(function (c) {
      var pct = s.total ? Math.round(c.amount / s.total * 100) : 0;
      return '<div style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="spread"><span class="small">' + A.esc(c.name) + '</span><span class="small mono">' + rs(c.amount) + '</span></div><div class="bar thin mt1"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') + '</div>' : '';
    var rows = !list.length ? '<div class="empty">No claims match.</div>' : '<div class="list">' + list.map(function (c) {
      var actions = '';
      if (c.status === 'SUBMITTED' || c.status === 'MANAGER_APPROVED') actions = '<button class="btn btn-secondary btn-sm" data-act="decide" data-id="' + c.id + '" data-d="REJECT">Decline</button><button class="btn btn-primary btn-sm" data-act="decide" data-id="' + c.id + '" data-d="APPROVE">Approve</button>';
      if (c.status === 'APPROVED') actions = '<span class="small muted">' + (c.payVia === 'PAYROLL' ? 'via payroll' : 'via ' + c.payVia.toLowerCase()) + '</span><button class="btn btn-secondary btn-sm" data-act="markPaid" data-id="' + c.id + '">Mark paid</button>';
      return claimRow(c, { showEmployee: true, actions: actions });
    }).join('') + '</div>';
    return '<div class="sect"><h3>Expense claims</h3><input class="input" type="month" value="' + month + '" data-change="exMonth" style="width:auto"></div>' +
      strip + '<div class="split mt3"><div><div class="row wrap" style="gap:6px;margin-bottom:8px">' + chips + '</div>' + rows + '</div><div><div class="sect"><h3 style="font-size:15px">By category · ' + A.esc(s.label) + '</h3></div>' + (cats || '<div class="empty">No spend this month.</div>') + '</div></div>';
  }
})();

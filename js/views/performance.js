/* ══════════════════════════════════════════════════════════════════════════
   Performance — employee goals + self-assessment, manager team reviews,
   and Administration → Performance (cycles, HR review queue, finalization).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var ST_LABEL = { SelfPending: 'Self-assessment pending', ManagerPending: 'Manager review pending', HRReview: 'HR review', Finalized: 'Finalized', Open: 'Open', Closed: 'Closed', Achieved: 'Achieved', Dropped: 'Dropped', 'In progress': 'In progress' };
  var ST_TAG = { SelfPending: 'tag-warn', ManagerPending: 'tag-accent', HRReview: 'tag-accent', Finalized: 'tag-ok', Open: 'tag-ok', Closed: 'tag-neutral', Achieved: 'tag-ok', Dropped: 'tag-neutral', 'In progress': 'tag-warn' };
  var RATING = { 1: 'Needs improvement', 2: 'Below expectations', 3: 'Meets expectations', 4: 'Exceeds expectations', 5: 'Outstanding' };
  function tag(s) { return '<span class="tag ' + (ST_TAG[s] || 'tag-neutral') + '">' + A.esc(ST_LABEL[s] || s) + '</span>'; }
  function stars(n) { n = Number(n) || 0; if (!n) return '<span class="muted">—</span>'; var s = ''; for (var i = 1; i <= 5; i++) s += '<span style="color:' + (i <= n ? 'var(--accent)' : 'var(--n300)') + '">★</span>'; return s + ' <span class="small muted">' + (RATING[n] || '') + '</span>'; }
  function ratingSelect(name, val) { return '<select class="input" name="' + name + '"><option value="">Select rating…</option>' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (String(val) === String(n) ? ' selected' : '') + '>' + n + ' — ' + RATING[n] + '</option>'; }).join('') + '</select>'; }

  /* ------------------------------------------------------------ employee */
  A.registerView('performance', {
    title: 'Performance',
    render: function () {
      var calls = [A.api('goals.mine'), A.api('appraisals.mine')];
      if (A.S.user.isManager) calls.push(A.api('appraisals.team'));
      return Promise.all(calls).then(function (r) { return renderPage(r[0], r[1], r[2] || []); });
    },
    actions: {
      addGoal: function () { goalForm(null); },
      editGoal: function (el) { goalForm(JSON.parse(el.getAttribute('data-json'))); },
      dropGoal: function (el) {
        var g = JSON.parse(el.getAttribute('data-json'));
        A.confirm('Drop goal', 'Drop "' + g.title + '"? It stays on record as dropped.', 'Drop').then(function (ok) {
          if (!ok) return;
          A.api('goals.save', { goalId: g.id, cycleId: g.cycleId, status: 'Dropped' }).then(function () { A.toast('Goal dropped.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      submitSelf: function (el) { selfAssessmentForm(JSON.parse(el.getAttribute('data-json'))); },
      reviewTeamAppraisal: function (el) { managerAssessmentForm(el.getAttribute('data-id')); },
      viewAppraisal: function (el) { detailModal(el.getAttribute('data-id')); }
    }
  });

  function renderPage(goals, appraisals, team) {
    var current = appraisals.filter(function (a) { return a.cycleStatus === 'Open'; })[0] || appraisals[0];
    var cycleGoals = current ? goals.filter(function (g) { return g.cycleId === current.cycleId; }) : goals;
    var live = cycleGoals.filter(function (g) { return g.status !== 'Dropped'; });
    var weight = live.reduce(function (s, g) { return s + (Number(g.weightage) || 0); }, 0);
    var canEditGoals = current && current.status === 'SelfPending' && current.cycleStatus === 'Open';

    var goalRows = !cycleGoals.length ? '<div class="empty">No goals yet' + (canEditGoals ? ' — add the 3–5 things you want to achieve this cycle.' : '.') + '</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Goal</th><th>Weight</th><th>Target</th><th>Status</th><th>Self</th><th>Manager</th><th></th></tr></thead><tbody>' +
      cycleGoals.map(function (g) {
        var j = A.esc(JSON.stringify(g));
        return '<tr><td><div style="font-weight:600">' + A.esc(g.title) + '</div><div class="small muted">' + A.esc(g.description || '') + '</div></td>' +
          '<td>' + (g.weightage || 0) + '%</td><td class="small">' + (g.targetDate ? A.pretty(g.targetDate) : '—') + '</td><td>' + tag(g.status) + '</td>' +
          '<td class="small">' + (g.selfRating ? g.selfRating + '/5' : '—') + '</td><td class="small">' + (g.managerRating ? g.managerRating + '/5' : '—') + '</td>' +
          '<td class="right nowrap">' + (canEditGoals && g.status !== 'Dropped' ? '<button class="btn btn-ghost btn-sm" data-act="editGoal" data-json="' + j + '">Edit</button><button class="btn btn-ghost btn-sm" data-act="dropGoal" data-json="' + j + '">Drop</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var selfBlock;
    if (!current) {
      selfBlock = '<div class="empty">No appraisal cycle has been opened for you yet.</div>';
    } else {
      var j = A.esc(JSON.stringify(current));
      var steps = ['SelfPending', 'ManagerPending', 'HRReview', 'Finalized'];
      var idx = steps.indexOf(current.status);
      selfBlock = '<div class="panel tight"><div class="spread wrap" style="gap:10px"><div><div style="font-weight:700">' + A.esc(current.cycleName) + '</div>' +
        '<div class="small muted">' + (current.reportingManagerName ? 'Reviewed by ' + A.esc(current.reportingManagerName) : 'No reporting manager mapped — HR reviews directly') +
        (current.selfReviewDueDate && current.status === 'SelfPending' ? ' · self-assessment due ' + A.pretty(current.selfReviewDueDate) : '') + '</div></div>' + tag(current.status) + '</div>' +
        '<div class="row mt2" style="gap:4px">' + steps.map(function (s, i) { return '<div class="bar thin grow"><i style="width:' + (i <= idx ? 100 : 0) + '%"></i></div>'; }).join('') + '</div>' +
        '<div class="row small muted mt1" style="justify-content:space-between"><span>Self</span><span>Manager</span><span>HR</span><span>Final</span></div></div>';
      if (current.status === 'SelfPending') {
        selfBlock += '<div class="mt2"><button class="btn btn-primary" data-act="submitSelf" data-json="' + j + '">Submit self-assessment</button>' +
          (weight !== 100 && live.length ? '<span class="small muted" style="margin-left:10px">Goal weights add up to ' + weight + '% — aim for 100%.</span>' : '') + '</div>';
      } else {
        selfBlock += '<div class="mt2"><button class="btn btn-secondary btn-sm" data-act="viewAppraisal" data-id="' + current.id + '">View full review</button></div>';
        if (current.status === 'Finalized') {
          selfBlock += '<div class="outline mt3" style="padding:16px"><div class="tiny">Final rating</div><div style="font-size:22px;margin-top:4px">' + stars(current.finalRating) + '</div>' + (current.hrRemark ? '<div class="small mt1">' + A.esc(current.hrRemark) + '</div>' : '') + '</div>';
        }
      }
    }

    var past = appraisals.filter(function (a) { return !current || a.id !== current.id; });
    var history = past.length ? '<div class="sect mt4"><h3>Past cycles</h3></div><div class="tablewrap"><table class="tbl"><thead><tr><th>Cycle</th><th>Status</th><th>Final rating</th><th></th></tr></thead><tbody>' +
      past.map(function (a) { return '<tr><td style="font-weight:600">' + A.esc(a.cycleName) + '</td><td>' + tag(a.status) + '</td><td>' + stars(a.finalRating) + '</td><td class="right"><button class="btn btn-ghost btn-sm" data-act="viewAppraisal" data-id="' + a.id + '">Open</button></td></tr>'; }).join('') + '</tbody></table></div>' : '';

    var teamBlock = '';
    if (A.S.user.isManager) {
      var pending = team.filter(function (a) { return a.status === 'ManagerPending'; });
      teamBlock = '<div class="sect mt4"><h3>My team</h3>' + (pending.length ? '<span class="tag tag-warn">' + pending.length + ' awaiting your review</span>' : '<span class="small muted">' + team.length + ' in the open cycle</span>') + '</div>' +
        (!team.length ? '<div class="empty">None of your direct reports are in an open appraisal cycle.</div>' :
          '<div class="list">' + team.map(function (a) {
            return '<div class="item"><div class="avatar">' + A.esc(a.initials) + '</div><div><div class="t">' + A.esc(a.employeeName) + '</div><div class="s">' + (a.goals || []).length + ' goal(s) · ' + (a.selfRating ? 'self-rated ' + a.selfRating + '/5' : 'self-assessment pending') + '</div></div>' +
              '<div class="acts row">' + tag(a.status) + (a.status === 'ManagerPending' ? '<button class="btn btn-primary btn-sm" data-act="reviewTeamAppraisal" data-id="' + a.id + '">Review</button>' : '<button class="btn btn-ghost btn-sm" data-act="viewAppraisal" data-id="' + a.id + '">Open</button>') + '</div></div>';
          }).join('') + '</div>');
    }

    return '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">Growth</div><h1 style="margin:0">Performance</h1></div>' +
      (canEditGoals ? '<button class="btn btn-primary" data-act="addGoal">' + icon('plus') + ' Add goal</button>' : '') + '</div>' +
      '<div class="split"><div><div class="sect"><h3>My goals</h3><span class="small muted">' + (live.length ? weight + '% of 100% weighted' : '') + '</span></div>' + goalRows + '</div>' +
      '<div><div class="sect"><h3>My appraisal</h3></div>' + selfBlock + '</div></div>' + history + teamBlock;
  }

  function goalForm(g) {
    A.api('appraisals.mine').then(function (list) {
      var current = list.filter(function (a) { return a.cycleStatus === 'Open'; })[0];
      if (!current) { A.toast('No open appraisal cycle to add a goal to.', 'err'); return; }
      return A.prompt(g ? 'Edit goal' : 'Add goal', [
        { name: 'title', label: 'Goal', value: g ? g.title : '', placeholder: 'e.g. Deliver structural drawings for Project X on schedule' },
        { name: 'description', label: 'How will success be measured?', type: 'textarea', value: g ? g.description : '' },
        { name: 'weightage', label: 'Weightage (%) — all goals should total 100', type: 'number', value: g ? g.weightage : '' },
        { name: 'targetDate', label: 'Target date', type: 'date', value: g ? g.targetDate : '' },
        { name: 'status', label: 'Status', type: 'select', value: g ? g.status : 'Open', options: ['Open', 'In progress', 'Achieved'].map(function (s) { return { value: s, label: s }; }) }
      ], g ? 'Save' : 'Add goal').then(function (v) {
        if (!v) return;
        if (!v.title) { A.toast('Goal title is required.', 'err'); return; }
        var b = { cycleId: current.cycleId, title: v.title, description: v.description, weightage: v.weightage, targetDate: v.targetDate, status: v.status };
        if (g) b.goalId = g.id;
        return A.api('goals.save', b).then(function () { A.toast(g ? 'Goal updated.' : 'Goal added.', 'ok'); A.render(); });
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function goalRatingRows(goals, field) {
    if (!goals.length) return '';
    return '<div class="tiny mt2" style="margin-bottom:6px">Rate each goal</div>' + goals.map(function (g) {
      return '<div class="rowline" style="gap:12px"><div class="grow"><div style="font-weight:600;font-size:13px">' + A.esc(g.title) + '</div><div class="small muted">' + (g.weightage || 0) + '%' + (field === 'managerRating' && g.selfRating ? ' · self-rated ' + g.selfRating + '/5' : '') + '</div></div>' +
        '<select class="input" data-goal="' + g.id + '" style="width:190px"><option value="">—</option>' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '">' + n + ' — ' + RATING[n] + '</option>'; }).join('') + '</select></div>';
    }).join('');
  }

  function collectGoalRatings(root) {
    var out = [];
    root.querySelectorAll('select[data-goal]').forEach(function (s) { if (s.value) out.push({ goalId: s.getAttribute('data-goal'), rating: s.value }); });
    return out;
  }

  function selfAssessmentForm(appraisal) {
    A.api('goals.mine', { cycleId: appraisal.cycleId }).then(function (goals) {
      goals = goals.filter(function (g) { return g.status !== 'Dropped'; });
      A.modal({
        title: 'Self-assessment — ' + appraisal.cycleName, wide: true,
        body: '<form id="saf"><div class="field"><label>Your self-assessment</label><textarea class="input" name="selfAssessment" rows="6" placeholder="Key achievements, challenges, learning and support you need. Be specific — this is what your manager and HR will read."></textarea></div>' +
          '<div class="field"><label>Overall self rating</label>' + ratingSelect('selfRating', '') + '</div>' + goalRatingRows(goals, 'selfRating') + '</form>' +
          '<div class="small muted mt2">Once submitted, goals are locked for this cycle and your manager is notified.</div>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="sa-submit">Submit</button>',
        onMount: function (root) {
          root.querySelector('#sa-submit').onclick = function () {
            var f = root.querySelector('#saf');
            A.api('appraisals.submitSelf', { appraisalId: appraisal.id, selfAssessment: f.selfAssessment.value, selfRating: f.selfRating.value, goalRatings: collectGoalRatings(root) })
              .then(function () { A.close(); A.toast('Self-assessment submitted.', 'ok'); A.render(); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function managerAssessmentForm(appraisalId) {
    A.api('appraisals.detail', { appraisalId: appraisalId }).then(function (a) {
      var goals = (a.goals || []).filter(function (g) { return g.status !== 'Dropped'; });
      A.modal({
        title: 'Review — ' + a.employeeName, wide: true,
        body: '<div class="panel tight small"><div class="tiny" style="margin-bottom:4px">Their self-assessment · rated ' + (a.selfRating || '—') + '/5</div>' + A.esc(a.selfAssessment || '').replace(/\n/g, '<br>') + '</div>' +
          '<form id="maf" class="mt2"><div class="field"><label>Your assessment</label><textarea class="input" name="managerAssessment" rows="6" placeholder="Strengths, areas to improve, and what you\'d like them to focus on next cycle."></textarea></div>' +
          '<div class="field"><label>Overall rating</label>' + ratingSelect('managerRating', '') + '</div>' + goalRatingRows(goals, 'managerRating') + '</form>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="ma-submit">Submit review</button>',
        onMount: function (root) {
          root.querySelector('#ma-submit').onclick = function () {
            var f = root.querySelector('#maf');
            A.api('appraisals.submitManager', { appraisalId: a.id, managerAssessment: f.managerAssessment.value, managerRating: f.managerRating.value, goalRatings: collectGoalRatings(root) })
              .then(function () { A.close(); A.toast('Review submitted to HR.', 'ok'); A.render(); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /** Read-only (or HR finalize) detail. */
  function detailModal(appraisalId, hrMode) {
    A.api('appraisals.detail', { appraisalId: appraisalId }).then(function (a) {
      function block(label, text, rating, meta) {
        return '<div class="panel tight mt2"><div class="spread"><div class="tiny">' + label + '</div><div class="small">' + (rating ? stars(rating) : '') + '</div></div>' +
          '<div class="small mt1" style="line-height:1.6">' + (text ? A.esc(text).replace(/\n/g, '<br>') : '<span class="muted">Not submitted yet</span>') + '</div>' + (meta ? '<div class="tiny mt1">' + A.esc(meta) + '</div>' : '') + '</div>';
      }
      var goals = (a.goals || []).length ? '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Goal</th><th>Weight</th><th>Status</th><th>Self</th><th>Manager</th></tr></thead><tbody>' +
        a.goals.map(function (g) { return '<tr><td>' + A.esc(g.title) + '</td><td>' + (g.weightage || 0) + '%</td><td>' + tag(g.status) + '</td><td>' + (g.selfRating || '—') + '</td><td>' + (g.managerRating || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
      var canFinalize = hrMode && a.status === 'HRReview';
      var canSkip = hrMode && a.status === 'ManagerPending';
      A.modal({
        title: a.employeeName + ' — ' + a.cycleName, wide: true,
        body: '<div class="row wrap" style="gap:8px">' + tag(a.status) + '<span class="small muted">' + A.esc(a.employeeCode) + ' · manager: ' + A.esc(a.reportingManagerName || 'none') + '</span></div>' +
          goals + block('Self-assessment', a.selfAssessment, a.selfRating, a.selfSubmittedAt ? 'Submitted ' + a.selfSubmittedAt : '') +
          block('Manager assessment', a.managerAssessment, a.managerRating, a.managerSubmittedAt ? 'Submitted ' + a.managerSubmittedAt : '') +
          (a.status === 'Finalized' ? block('HR remark', a.hrRemark, a.finalRating, 'Finalized ' + a.finalizedAt + ' by ' + a.finalizedByName) : '') +
          (canFinalize ? '<form id="hrf" class="mt3"><div class="sect"><h3 style="font-size:16px">Finalize</h3></div><div class="field mt2"><label>HR remark (visible to the employee)</label><textarea class="input" name="hrRemark" rows="3"></textarea></div><div class="field"><label>Final rating</label>' + ratingSelect('finalRating', a.managerRating || a.selfRating) + '</div></form>' : ''),
        footer: '<button class="btn btn-secondary" data-close="btn">Close</button>' +
          (canSkip ? '<button class="btn btn-secondary" id="ap-skip">Skip manager review</button>' : '') +
          (canFinalize ? '<button class="btn btn-primary" id="ap-finalize">Finalize rating</button>' : ''),
        onMount: function (root) {
          var fin = root.querySelector('#ap-finalize');
          if (fin) fin.onclick = function () {
            var f = root.querySelector('#hrf');
            A.api('admin.performance.finalize', { appraisalId: a.id, hrRemark: f.hrRemark.value, finalRating: f.finalRating.value })
              .then(function () { A.close(); A.toast('Appraisal finalized and the employee notified.', 'ok'); A.render(); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
          var skip = root.querySelector('#ap-skip');
          if (skip) skip.onclick = function () {
            A.confirm('Skip manager review', 'Move this appraisal straight to HR review (e.g. the manager has left)?', 'Skip').then(function (ok) {
              if (!ok) return;
              A.api('admin.performance.skipManager', { appraisalId: a.id }).then(function () { A.close(); A.toast('Moved to HR review.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
            });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'performance', label: 'Performance', group: 'Growth',
    render: function (params) {
      return Promise.all([A.api('admin.performance.cycles.list'), A.api('admin.performance.appraisals.list', { cycleId: params.cycleId || '' }), A.api('admin.performance.summary', { cycleId: params.cycleId || '' })])
        .then(function (r) { return performanceTab(r[0], r[1], r[2], params); });
    },
    actions: {
      createCycle: function () { createCycleForm(); },
      addToCycle: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Add missing employees', 'Add every active employee who is not yet in this cycle (e.g. new joiners)?', 'Add').then(function (ok) {
          if (!ok) return;
          A.api('admin.performance.cycles.addEmployees', { cycleId: id }).then(function (r) { A.toast(r.added + ' employee(s) added.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      closeCycle: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Close cycle', 'Close this appraisal cycle? Employees will no longer be able to submit self-assessments. Finalized ratings stay on record.', 'Close cycle').then(function (ok) {
          if (!ok) return;
          A.api('admin.performance.cycles.close', { cycleId: id }).then(function () { A.toast('Cycle closed.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      },
      pickCycle: function (el) { A.go('admin', { tab: 'performance', cycleId: el.value }); },
      filterStatus: function (el) { A.go('admin', { tab: 'performance', cycleId: A.S.params.cycleId || '', status: el.getAttribute('data-status') }); },
      hrAppraisal: function (el) { detailModal(el.getAttribute('data-id'), true); }
    }
  });

  function performanceTab(cycles, appraisals, summary, params) {
    var cycleSel = '<select class="input" style="width:auto;display:inline-block" data-change="pickCycle"><option value="">Current open cycle</option>' +
      cycles.map(function (c) { return '<option value="' + c.id + '"' + (params.cycleId === c.id ? ' selected' : '') + '>' + A.esc(c.name) + ' (' + c.status + ')</option>'; }).join('') + '</select>';
    var cycleRows = !cycles.length ? '<div class="empty">No appraisal cycles yet. Open one to start the review process for everyone.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Cycle</th><th>Period</th><th>Due dates</th><th>Progress</th><th>Avg rating</th><th>Status</th><th></th></tr></thead><tbody>' +
      cycles.map(function (c) {
        var done = c.total ? Math.round(c.finalized / c.total * 100) : 0;
        return '<tr><td style="font-weight:600">' + A.esc(c.name) + '</td><td class="small">' + A.shortD(c.periodStart) + ' – ' + A.pretty(c.periodEnd) + '</td>' +
          '<td class="small">Self ' + (c.selfReviewDueDate ? A.shortD(c.selfReviewDueDate) : '—') + ' · Mgr ' + (c.managerReviewDueDate ? A.shortD(c.managerReviewDueDate) : '—') + '</td>' +
          '<td style="min-width:160px"><div class="small">' + c.finalized + ' / ' + c.total + ' finalized · ' + c.selfPending + ' self · ' + c.managerPending + ' mgr · ' + c.hrReview + ' HR</div><div class="bar thin mt1"><i style="width:' + done + '%"></i></div></td>' +
          '<td>' + (c.avgFinalRating ? c.avgFinalRating + ' / 5' : '—') + '</td><td>' + tag(c.status) + '</td>' +
          '<td class="right nowrap">' + (c.status === 'Open' ? '<button class="btn btn-ghost btn-sm" data-act="addToCycle" data-id="' + c.id + '">Add joiners</button><button class="btn btn-ghost btn-sm" data-act="closeCycle" data-id="' + c.id + '">Close</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var statuses = ['', 'SelfPending', 'ManagerPending', 'HRReview', 'Finalized'];
    var filter = params.status || '';
    var shown = filter ? appraisals.filter(function (a) { return a.status === filter; }) : appraisals;
    var chips = statuses.map(function (s) {
      var n = s ? appraisals.filter(function (a) { return a.status === s; }).length : appraisals.length;
      return '<span class="tag ' + (filter === s ? 'tag-accent' : 'tag-neutral') + '" data-act="filterStatus" data-status="' + s + '" style="cursor:pointer">' + (s ? ST_LABEL[s] : 'All') + ' ' + n + '</span>';
    }).join('');
    var dist = summary && summary.distribution ? '<div class="row wrap" style="gap:10px;margin:8px 0 4px">' + [1, 2, 3, 4, 5].map(function (n) { return '<span class="small"><b>' + summary.distribution[n] + '</b> × ' + n + '★</span>'; }).join('') + '</div>' : '';

    var apRows = !shown.length ? '<div class="empty">Nothing here.</div>' :
      '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Employee</th><th>Manager</th><th>Self</th><th>Manager</th><th>Final</th><th>Status</th><th></th></tr></thead><tbody>' +
      shown.map(function (a) {
        return '<tr><td><div style="font-weight:600">' + A.esc(a.employeeName) + '</div><div class="small muted">' + A.esc(a.employeeCode) + '</div></td>' +
          '<td class="small">' + A.esc(a.reportingManagerName || '—') + '</td><td>' + (a.selfRating || '—') + '</td><td>' + (a.managerRating || '—') + '</td><td>' + (a.finalRating ? '<b>' + a.finalRating + '</b>' : '—') + '</td>' +
          '<td>' + tag(a.status) + '</td><td class="right"><button class="btn ' + (a.status === 'HRReview' ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-act="hrAppraisal" data-id="' + a.id + '">' + (a.status === 'HRReview' ? 'Finalize' : 'Open') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    return '<div class="sect"><h3>Appraisal cycles</h3><button class="btn btn-primary btn-sm" data-act="createCycle">' + icon('plus') + ' New cycle</button></div>' + cycleRows +
      '<div class="sect mt4"><h3>Appraisals</h3>' + cycleSel + '</div><div class="row wrap mt2" style="gap:6px">' + chips + '</div>' + dist + apRows;
  }

  function createCycleForm() {
    var y = new Date().getFullYear();
    A.prompt('Open an appraisal cycle', [
      { name: 'name', label: 'Cycle name', placeholder: 'FY ' + y + '-' + String(y + 1).slice(2) + ' Annual appraisal' },
      { name: 'periodStart', label: 'Review period start', type: 'date', value: y + '-04-01' },
      { name: 'periodEnd', label: 'Review period end', type: 'date', value: (y + 1) + '-03-31' },
      { name: 'selfReviewDueDate', label: 'Self-assessment due', type: 'date' },
      { name: 'managerReviewDueDate', label: 'Manager review due', type: 'date' }
    ], 'Open cycle').then(function (v) {
      if (!v) return;
      return A.api('admin.performance.cycles.create', v).then(function (r) { A.toast('Cycle opened — ' + r.appraisalsCreated + ' employee(s) notified.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

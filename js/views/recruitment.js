/* ══════════════════════════════════════════════════════════════════════════
   Recruitment — Administration → Recruitment (openings, candidate pipeline,
   interviews, offer → employee), the employee "Openings & referrals" page,
   and the interviewer feedback form used from Home.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = App;
  var STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'];
  var STAGE_LABEL = { APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview', OFFERED: 'Offered', HIRED: 'Hired', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
  var STAGE_TAG = { APPLIED: 'tag-neutral', SCREENING: 'tag-warn', INTERVIEW: 'tag-accent', OFFERED: 'tag-ok', HIRED: 'tag-dark', REJECTED: 'tag-err', WITHDRAWN: 'tag-neutral' };
  var JOB_TAG = { DRAFT: 'tag-warn', OPEN: 'tag-ok', ON_HOLD: 'tag-neutral', FILLED: 'tag-dark', CLOSED: 'tag-neutral' };
  function stage(s) { return '<span class="tag ' + (STAGE_TAG[s] || 'tag-neutral') + '">' + A.esc(STAGE_LABEL[s] || s) + '</span>'; }
  function jtag(s) { return '<span class="tag ' + (JOB_TAG[s] || 'tag-neutral') + '">' + A.esc(String(s).replace('_', ' ').toLowerCase()) + '</span>'; }

  /* ---------------------------------------------- interviewer feedback */
  A.interviewFeedback = function (iv) {
    A.modal({
      title: 'Interview feedback — ' + iv.candidateName,
      body: '<div class="small muted">' + A.esc(iv.jobTitle) + ' · ' + A.esc(iv.round) + ' · ' + A.esc(iv.scheduledAt) + '</div>' +
        (iv.candidateId ? '<button class="btn btn-ghost btn-sm mt1" id="iv-resume">' + icon('download') + ' Open resume</button>' : '') +
        '<form id="ivf" class="mt2"><div class="field"><label>Your feedback</label><textarea class="input" name="feedback" rows="5" placeholder="Technical depth, communication, fit for the role, concerns…"></textarea></div>' +
        '<div class="grid2"><div class="field"><label>Rating (1–5)</label><select class="input" name="rating"><option value="">—</option>' + [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Recommendation</label><select class="input" name="recommendation"><option value="HIRE">Hire</option><option value="HOLD">Hold / another round</option><option value="NO_HIRE">Do not hire</option></select></div></div></form>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="iv-submit">Submit feedback</button>',
      onMount: function (root) {
        var r = root.querySelector('#iv-resume'); if (r) r.onclick = function () { A.api('recruit.resume', { candidateId: iv.candidateId }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); };
        root.querySelector('#iv-submit').onclick = function () {
          var f = root.querySelector('#ivf');
          A.api('interviews.feedback', { interviewId: iv.id, feedback: f.feedback.value, rating: f.rating.value, recommendation: f.recommendation.value })
            .then(function () { A.close(); A.toast('Feedback sent to HR — thank you.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  };

  /* ------------------------------------------------- employee: openings */
  A.registerView('openings', {
    title: 'Openings',
    render: function () {
      return Promise.all([A.api('recruit.openings'), A.api('recruit.myReferrals')]).then(function (r) {
        var jobs = r[0], refs = r[1];
        return '<div class="spread wrap" style="align-items:flex-end;margin-bottom:18px"><div><div class="kicker">We are hiring</div><h1 style="margin:0">Openings &amp; referrals</h1></div></div>' +
          (jobs.length ? '<div class="grid2">' + jobs.map(function (j) {
            return '<div class="panel"><div class="kicker">' + A.esc(j.department || 'AVP') + (j.location ? ' · ' + A.esc(j.location) : '') + '</div><h3 style="margin:0 0 6px">' + A.esc(j.title) + '</h3>' +
              '<div class="small muted">' + (j.experience ? A.esc(j.experience) + ' experience · ' : '') + j.openings + ' opening(s)' + (j.hiringManagerName ? ' · hiring manager ' + A.esc(j.hiringManagerName) : '') + '</div>' +
              (j.description ? '<div class="small mt2" style="line-height:1.6;white-space:pre-wrap">' + A.esc(j.description) + '</div>' : '') +
              '<button class="btn btn-primary btn-sm mt3" data-act="refer" data-json="' + A.esc(JSON.stringify({ id: j.id, title: j.title })) + '">Refer someone</button></div>';
          }).join('') + '</div>' : '<div class="empty">No open positions right now. Openings appear here (and as a notification) whenever HR starts hiring.</div>') +
          (refs.length ? '<div class="sect mt4"><h3>My referrals</h3></div><div class="tablewrap"><table class="tbl"><thead><tr><th>Candidate</th><th>Role</th><th>Stage</th><th>Referred</th></tr></thead><tbody>' +
            refs.map(function (c) { return '<tr><td style="font-weight:600">' + A.esc(c.name) + '</td><td class="small">' + A.esc(c.jobTitle) + '</td><td>' + stage(c.stage) + '</td><td class="small">' + A.relTime(c.at) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '');
      });
    },
    actions: { refer: function (el) { candidateForm(JSON.parse(el.getAttribute('data-json')), null, true); } }
  });

  function candidateForm(job, existing, referral) {
    var c = existing || {};
    var sources = ['Referral', 'Naukri', 'LinkedIn', 'Walk-in', 'Campus', 'Consultant', 'Website', 'Other'];
    A.modal({
      title: referral ? 'Refer a candidate — ' + job.title : (c.id ? 'Edit candidate' : 'Add candidate — ' + job.title),
      body: '<form id="cdf"><div class="grid2"><div class="field"><label>Full name</label><input class="input" name="name" value="' + A.esc(c.name || '') + '"></div><div class="field"><label>Email</label><input class="input" type="email" name="email" value="' + A.esc(c.email || '') + '"></div></div>' +
        '<div class="grid2"><div class="field"><label>Phone</label><input class="input" name="phone" value="' + A.esc(c.phone || '') + '"></div><div class="field"><label>Current company</label><input class="input" name="currentCompany" value="' + A.esc(c.currentCompany || '') + '"></div></div>' +
        '<div class="grid3"><div class="field"><label>Experience (years)</label><input class="input" name="experienceYears" value="' + A.esc(c.experienceYears || '') + '"></div><div class="field"><label>Notice period (days)</label><input class="input" name="noticePeriodDays" value="' + A.esc(c.noticePeriodDays || '') + '"></div>' +
        (referral ? '' : '<div class="field"><label>Source</label><select class="input" name="source">' + sources.map(function (s) { return '<option' + (c.source === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>') + '</div>' +
        (referral ? '' : '<div class="grid2"><div class="field"><label>Current CTC (₹ p.a.)</label><input class="input" name="currentCTC" value="' + A.esc(c.currentCTC || '') + '"></div><div class="field"><label>Expected CTC (₹ p.a.)</label><input class="input" name="expectedCTC" value="' + A.esc(c.expectedCTC || '') + '"></div></div>') +
        '<div class="field"><label>' + (referral ? 'Why are they a good fit?' : 'Notes') + '</label><textarea class="input" name="notes" rows="3">' + A.esc(c.notes || '') + '</textarea></div>' +
        A.fileField('resume', 'Resume (PDF / Word, max 4 MB)' + (c.hasResume ? ' — currently: ' + c.resumeName : ''), 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document') + '</form>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="cd-save">' + (referral ? 'Send referral' : 'Save') + '</button>',
      onMount: function (root) {
        root.querySelector('#cd-save').onclick = function () {
          var f = root.querySelector('#cdf'), btn = this; btn.disabled = true;
          A.readUpload(f.resume).then(function (resume) {
            var b = { jobId: job.id, candidateId: c.id, name: f.name.value, email: f.email.value, phone: f.phone.value, currentCompany: f.currentCompany.value, experienceYears: f.experienceYears.value, noticePeriodDays: f.noticePeriodDays.value, notes: f.notes.value, resume: resume };
            if (!referral) { b.source = f.source.value; b.currentCTC = f.currentCTC.value; b.expectedCTC = f.expectedCTC.value; }
            return A.api(referral ? 'recruit.refer' : 'admin.recruit.candidates.save', b);
          }).then(function () { A.close(); A.toast(referral ? 'Referral sent to HR — thank you!' : 'Candidate saved.', 'ok'); A.render(); })
            .catch(function (e) { btn.disabled = false; A.toast(e.message, 'err'); });
        };
      }
    });
  }

  /* --------------------------------------------------------------- admin */
  A.registerAdminTab({
    id: 'recruitment', label: 'Recruitment', group: 'Workforce',
    render: function (params) {
      return Promise.all([A.api('admin.recruit.pipeline'), A.api('admin.recruit.jobs.list', { includeClosed: params.all === '1' }), A.api('admin.recruit.candidates.list', { jobId: params.jobId || '', includeClosed: params.all === '1' }), A.api('admin.recruit.interviews.list', { upcoming: true })])
        .then(function (r) { return adminTab(r[0], r[1], r[2], r[3], params); });
    },
    actions: {
      rcAll: function () { A.go('admin', { tab: 'recruitment', all: A.S.params.all === '1' ? '0' : '1' }); },
      rcJob: function (el) { A.go('admin', { tab: 'recruitment', jobId: el.value, all: A.S.params.all || '' }); },
      newJob: function () { jobForm(null); },
      editJob: function (el) { jobForm(JSON.parse(el.getAttribute('data-json'))); },
      jobStatus: function (el) {
        var j = JSON.parse(el.getAttribute('data-json'));
        A.prompt('Change status — ' + j.title, [{ name: 'status', label: 'Status', type: 'select', value: j.status, options: ['DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CLOSED'].map(function (s) { return { value: s, label: s.replace('_', ' ') }; }) }], 'Update').then(function (v) {
          if (!v) return;
          return A.api('admin.recruit.jobs.setStatus', { jobId: j.id, status: v.status }).then(function () { A.toast('Updated' + (v.status === 'OPEN' ? ' — employees notified about the opening.' : '.'), 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      addCandidate: function (el) { candidateForm(JSON.parse(el.getAttribute('data-json')), null, false); },
      editCandidate: function (el) { var c = JSON.parse(el.getAttribute('data-json')); candidateForm({ id: c.jobId, title: c.jobTitle }, c, false); },
      moveStage: function (el) { moveStageForm(JSON.parse(el.getAttribute('data-json'))); },
      schedule: function (el) { scheduleForm(JSON.parse(el.getAttribute('data-json'))); },
      resume: function (el) { A.api('recruit.resume', { candidateId: el.getAttribute('data-id') }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); },
      convert: function (el) { convertForm(JSON.parse(el.getAttribute('data-json'))); },
      candidateDetail: function (el) { candidateDetail(JSON.parse(el.getAttribute('data-json'))); },
      cancelInterview: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Cancel interview', 'Cancel this interview? The interviewer will be notified.', 'Cancel interview').then(function (ok) {
          if (!ok) return;
          A.api('admin.recruit.interviews.cancel', { interviewId: id }).then(function () { A.toast('Cancelled.', 'ok'); A.render(); }).catch(function (e) { A.toast(e.message, 'err'); });
        });
      }
    }
  });

  function stat(label, value, sub) { return '<div><div class="stat-label">' + A.esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>'; }

  function adminTab(p, jobs, cands, interviews, params) {
    var strip = '<div class="statstrip">' + stat('Open positions', String(p.openJobs), p.seats + ' seat(s)') + stat('Active candidates', String(p.byStage.APPLIED + p.byStage.SCREENING + p.byStage.INTERVIEW + p.byStage.OFFERED), p.byStage.OFFERED + ' offered') + stat('Interviews scheduled', String(p.upcomingInterviews), p.awaitingFeedback ? p.awaitingFeedback + ' awaiting feedback' : '') + stat('Hired', String(p.byStage.HIRED), 'all time') + '</div>';
    var jobRows = !jobs.length ? '<div class="empty">No openings yet.</div>' : '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Role</th><th>Dept / location</th><th>Seats</th><th>Pipeline</th><th>Status</th><th></th></tr></thead><tbody>' +
      jobs.map(function (j) {
        var jj = A.esc(JSON.stringify(j));
        return '<tr><td><div style="font-weight:600">' + A.esc(j.title) + '</div><div class="small muted">' + (j.experience ? A.esc(j.experience) + ' · ' : '') + (j.hiringManagerName ? 'HM ' + A.esc(j.hiringManagerName) : '') + '</div></td><td class="small">' + A.esc(j.department || '—') + (j.location ? ' · ' + A.esc(j.location) : '') + '</td>' +
          '<td>' + j.hired + ' / ' + j.openings + '</td><td class="small">' + j.active + ' active</td><td>' + jtag(j.status) + '</td>' +
          '<td class="right nowrap"><button class="btn btn-ghost btn-sm" data-act="addCandidate" data-json="' + A.esc(JSON.stringify({ id: j.id, title: j.title })) + '">+ Candidate</button><button class="btn btn-ghost btn-sm" data-act="editJob" data-json="' + jj + '">Edit</button><button class="btn btn-ghost btn-sm" data-act="jobStatus" data-json="' + jj + '">Status</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    var jobSel = '<select class="input" style="width:auto;display:inline-block" data-change="rcJob"><option value="">All openings</option>' + jobs.map(function (j) { return '<option value="' + j.id + '"' + (params.jobId === j.id ? ' selected' : '') + '>' + A.esc(j.title) + '</option>'; }).join('') + '</select>';
    var board = '<div class="tablewrap mt2"><div style="display:grid;grid-template-columns:repeat(4,minmax(200px,1fr));gap:12px;min-width:820px">' + ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED'].map(function (s) {
      var col = cands.filter(function (c) { return c.stage === s; });
      return '<div><div class="tiny" style="margin-bottom:8px">' + STAGE_LABEL[s] + ' · ' + col.length + '</div>' + (col.length ? col.map(function (c) {
        var cj = A.esc(JSON.stringify(c));
        return '<div class="panel tight mt1" style="padding:10px"><div style="font-weight:600;font-size:14px;cursor:pointer" data-act="candidateDetail" data-json="' + cj + '">' + A.esc(c.name) + '</div><div class="small muted">' + A.esc(c.jobTitle) + '</div><div class="small muted">' + A.esc(c.source) + (c.experienceYears ? ' · ' + A.esc(c.experienceYears) + ' yrs' : '') + (c.rating ? ' · ' + c.rating + '★' : '') + '</div>' +
          '<div class="row wrap mt1" style="gap:4px">' + (c.hasResume ? '<button class="btn btn-ghost btn-sm" data-act="resume" data-id="' + c.id + '">CV</button>' : '') + '<button class="btn btn-ghost btn-sm" data-act="schedule" data-json="' + cj + '">Interview</button><button class="btn btn-secondary btn-sm" data-act="moveStage" data-json="' + cj + '">Move</button>' + (s === 'OFFERED' ? '<button class="btn btn-primary btn-sm" data-act="convert" data-json="' + cj + '">Hire →</button>' : '') + '</div></div>';
      }).join('') : '<div class="small muted">—</div>') + '</div>';
    }).join('') + '</div></div>';
    var ivRows = interviews.length ? '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>When</th><th>Candidate</th><th>Round</th><th>Interviewer</th><th></th></tr></thead><tbody>' + interviews.map(function (i) {
      return '<tr><td class="small nowrap">' + A.esc(i.scheduledAt) + '</td><td style="font-weight:600">' + A.esc(i.candidateName) + ' <span class="small muted">' + A.esc(i.jobTitle) + '</span></td><td class="small">' + A.esc(i.round) + ' · ' + A.esc(i.mode) + '</td><td class="small">' + A.esc(i.interviewerName) + '</td><td class="right"><button class="btn btn-ghost btn-sm" data-act="cancelInterview" data-id="' + i.id + '">Cancel</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">No interviews scheduled.</div>';
    return strip + '<div class="sect mt4"><h3>Openings</h3><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-act="rcAll">' + (params.all === '1' ? 'Hide closed' : 'Show closed') + '</button><button class="btn btn-primary btn-sm" data-act="newJob">' + icon('plus') + ' New opening</button></div></div>' + jobRows +
      '<div class="sect mt4"><h3>Candidate pipeline</h3>' + jobSel + '</div>' + board +
      '<div class="sect mt4"><h3>Upcoming interviews</h3></div>' + ivRows;
  }

  function jobForm(j) {
    j = j || {};
    A.api('people.picklist').then(function (list) {
      var mgrs = list.filter(function (p) { return p.role !== 'EMPLOYEE'; });
      return A.prompt(j.id ? 'Edit opening' : 'New opening', [
        { name: 'title', label: 'Job title', value: j.title || '', placeholder: 'e.g. Structural Design Engineer' },
        { name: 'department', label: 'Department', type: 'select', value: j.department || '', options: [{ value: '', label: '—' }].concat(((A.S.boot && A.S.boot.departments) || []).map(function (d) { return { value: d, label: d }; })) },
        { name: 'location', label: 'Location', value: j.location || 'Mumbai' },
        { name: 'openings', label: 'Number of openings', type: 'number', value: j.openings || 1 },
        { name: 'experience', label: 'Experience required', value: j.experience || '', placeholder: 'e.g. 3–6 years' },
        { name: 'hiringManagerId', label: 'Hiring manager', type: 'select', value: j.hiringManagerId || '', options: [{ value: '', label: '—' }].concat(mgrs.map(function (p) { return { value: p.id, label: p.name + ' (' + p.code + ')' }; })) },
        { name: 'description', label: 'Description / requirements', type: 'textarea', value: j.description || '' },
        { name: 'openNow', label: j.id ? 'Status' : 'Publish', type: 'select', value: j.id ? 'no' : 'yes', options: j.id ? [{ value: 'no', label: 'Keep current status' }] : [{ value: 'yes', label: 'Open now and notify employees' }, { value: 'no', label: 'Save as draft' }] }
      ], j.id ? 'Save' : 'Create').then(function (v) {
        if (!v) return;
        v.jobId = j.id; v.openNow = v.openNow === 'yes';
        return A.api('admin.recruit.jobs.save', v).then(function () { A.toast('Opening saved.', 'ok'); A.render(); });
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function moveStageForm(c) {
    A.prompt('Move ' + c.name, [
      { name: 'stage', label: 'Stage', type: 'select', value: c.stage, options: STAGES.filter(function (s) { return s !== 'HIRED'; }).map(function (s) { return { value: s, label: STAGE_LABEL[s] }; }) },
      { name: 'rating', label: 'Overall rating (1–5, optional)', type: 'number', value: c.rating || '' },
      { name: 'offerCTC', label: 'Offer CTC (₹ p.a.) — for Offered', value: c.offerCTC || '' },
      { name: 'joiningDate', label: 'Expected joining date — for Offered', type: 'date', value: c.joiningDate || '' },
      { name: 'reason', label: 'Reason — for Rejected / Withdrawn', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea', value: c.notes || '' }
    ], 'Move').then(function (v) {
      if (!v) return;
      v.candidateId = c.id;
      return A.api('admin.recruit.candidates.moveStage', v).then(function () { A.toast('Moved to ' + STAGE_LABEL[v.stage] + '.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function scheduleForm(c) {
    A.api('people.picklist').then(function (list) {
      var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0);
      var dflt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T11:00';
      return A.prompt('Schedule interview — ' + c.name, [
        { name: 'round', label: 'Round', type: 'select', value: 'Technical round', options: ['Screening call', 'Technical round', 'Design test', 'Managerial round', 'HR round', 'Final round'].map(function (r) { return { value: r, label: r }; }) },
        { name: 'interviewerId', label: 'Interviewer', type: 'select', options: list.map(function (p) { return { value: p.id, label: p.name + ' (' + p.code + ')' }; }) },
        { name: 'scheduledAt', label: 'Date & time', type: 'datetime-local', value: dflt },
        { name: 'mode', label: 'Mode', type: 'select', value: 'In person', options: ['In person', 'Video call', 'Phone'].map(function (m) { return { value: m, label: m }; }) },
        { name: 'location', label: 'Location / meeting link', value: '' }
      ], 'Schedule').then(function (v) {
        if (!v) return;
        v.candidateId = c.id; v.scheduledAt = String(v.scheduledAt).replace('T', ' ');
        return A.api('admin.recruit.interviews.schedule', v).then(function () { A.toast('Scheduled — interviewer notified.', 'ok'); A.render(); });
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function candidateDetail(c) {
    A.api('admin.recruit.interviews.list', { candidateId: c.id }).then(function (ivs) {
      A.modal({
        title: c.name + ' — ' + c.jobTitle, wide: true,
        body: '<div class="row wrap" style="gap:6px">' + stage(c.stage) + '<span class="small muted">' + A.esc(c.email || '') + (c.phone ? ' · ' + A.esc(c.phone) : '') + ' · ' + A.esc(c.source) + (c.referredByName ? ' by ' + A.esc(c.referredByName) : '') + '</span></div>' +
          '<div class="grid2 mt2" style="gap:0">' + [['Current company', c.currentCompany], ['Experience', c.experienceYears ? c.experienceYears + ' years' : ''], ['Current CTC', c.currentCTC], ['Expected CTC', c.expectedCTC], ['Notice period', c.noticePeriodDays ? c.noticePeriodDays + ' days' : ''], ['Offer', c.offerCTC ? '₹' + c.offerCTC + (c.joiningDate ? ' · joining ' + A.pretty(c.joiningDate) : '') : '']].map(function (f) {
            return '<div style="padding:8px 12px 8px 0;border-bottom:1px solid var(--line)"><div class="stat-label">' + f[0] + '</div><div style="font-size:14px;font-weight:600">' + (f[1] ? A.esc(String(f[1])) : '—') + '</div></div>';
          }).join('') + '</div>' + (c.notes ? '<div class="panel tight small mt2" style="white-space:pre-wrap">' + A.esc(c.notes) + '</div>' : '') +
          '<div class="sect mt3"><h3 style="font-size:15px">Interviews</h3></div>' + (ivs.length ? ivs.map(function (i) {
            return '<div class="rowline" style="align-items:flex-start"><div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(i.round) + ' · ' + A.esc(i.interviewerName) + ' <span class="small muted">' + A.esc(i.scheduledAt) + '</span></div>' +
              (i.feedback ? '<div class="small mt1" style="white-space:pre-wrap">' + A.esc(i.feedback) + '</div>' : '<div class="small muted">No feedback yet</div>') + '</div>' +
              '<div>' + (i.recommendation ? '<span class="tag ' + (i.recommendation === 'HIRE' ? 'tag-ok' : i.recommendation === 'NO_HIRE' ? 'tag-err' : 'tag-warn') + '">' + A.esc(i.recommendation.replace('_', ' ').toLowerCase()) + (i.rating ? ' · ' + i.rating + '★' : '') + '</span>' : '<span class="tag tag-neutral">' + A.esc(i.status.toLowerCase()) + '</span>') + '</div></div>';
          }).join('') : '<div class="empty">No interviews yet.</div>'),
        footer: '<button class="btn btn-secondary" data-close="btn">Close</button><button class="btn btn-secondary" id="cd-edit">Edit</button>' + (c.hasResume ? '<button class="btn btn-primary" id="cd-cv">Open resume</button>' : ''),
        onMount: function (root) {
          root.querySelector('#cd-edit').onclick = function () { A.close(); candidateForm({ id: c.jobId, title: c.jobTitle }, c, false); };
          var cv = root.querySelector('#cd-cv'); if (cv) cv.onclick = function () { A.api('recruit.resume', { candidateId: c.id }).then(A.openBlob).catch(function (e) { A.toast(e.message, 'err'); }); };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function convertForm(c) {
    Promise.all([A.api('people.picklist'), A.api('admin.locations')]).then(function (r) {
      var people = r[0], locs = r[1];
      return A.prompt('Hire ' + c.name + ' — create employee record', [
        { name: 'employeeCode', label: 'Employee code', placeholder: 'e.g. EMP101' },
        { name: 'joinDate', label: 'Date of joining', type: 'date', value: c.joiningDate || A.todayStr() },
        { name: 'designation', label: 'Designation', value: c.jobTitle },
        { name: 'department', label: 'Department', type: 'select', value: '', options: [{ value: '', label: 'As per opening' }].concat(((A.S.boot && A.S.boot.departments) || []).map(function (d) { return { value: d, label: d }; })) },
        { name: 'gender', label: 'Gender', type: 'select', value: 'MALE', options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }] },
        { name: 'reportingManagerId', label: 'Reporting manager', type: 'select', value: '', options: [{ value: '', label: 'Hiring manager of the opening' }].concat(people.filter(function (p) { return p.role !== 'EMPLOYEE'; }).map(function (p) { return { value: p.id, label: p.name + ' (' + p.code + ')' }; })) },
        { name: 'locationId', label: 'Work location', type: 'select', value: locs[0] ? locs[0].id : '', options: locs.map(function (l) { return { value: l.id, label: l.name }; }) }
      ], 'Create employee').then(function (v) {
        if (!v) return;
        v.candidateId = c.id;
        return A.api('admin.recruit.candidates.convert', v).then(function (res) {
          A.modal({ title: 'Welcome aboard — ' + c.name, body: '<p>Employee <b>' + A.esc(res.employeeCode) + '</b> created. They will complete the onboarding wizard at first sign-in.</p><p class="small muted">Share this one-time password with them in person — it is shown only once:</p><div class="outline" style="text-align:center;font-size:28px;font-weight:800;letter-spacing:.06em">' + A.esc(res.defaultPassword) + '</div>' });
          A.render();
        });
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

/* ==========================================================================
   Administration — geofenced locations, holidays, leave types, policy
   settings, employee data and the audit trail. HR / admin only.
   ========================================================================== */
(function () {
  var A = App;
  /* Built-in tabs: [id, label, group]. Modules add theirs with App.registerAdminTab(). */
  var TABS = [
    ['data', 'Overview', 'Workforce'], ['onboarding', 'Onboarding', 'Workforce'],
    ['locations', 'Locations & geofence', 'Time'], ['holidays', 'Holiday calendar', 'Time'], ['leavetypes', 'Leave types', 'Time'], ['devices', 'Device anomalies', 'Time'],
    /* 'letters' moved to ViewsLetters.html (v1.6.0) — it registers itself via App.registerAdminTab */
    ['settings', 'Policy settings', 'System'], ['audit', 'Audit trail', 'System']
  ];
  var GROUPS = ['Workforce', 'Time', 'Pay', 'Growth', 'Engagement', 'Documents', 'System'];

  function allTabs() {
    var built = TABS.map(function (t) { return { id: t[0], label: t[1], group: t[2] }; });
    return built.concat(A.S.adminTabs.map(function (d) { return { id: d.id, label: d.label, group: d.group || 'Engagement', def: d }; }));
  }

  A.registerView('admin', {
    title: 'Administration',
    render: function (params) {
      var tabs = allTabs();
      var tab = params.tab || 'data';
      var cur = tabs.filter(function (t) { return t.id === tab; })[0] || tabs[0];
      tab = cur.id;
      var groups = GROUPS.filter(function (g) { return tabs.some(function (t) { return t.group === g; }); });
      var head =
        '<div class="spread wrap" style="align-items:flex-end;margin-bottom:14px">' +
        '<div><div class="kicker">Workspace configuration</div><h1 style="margin:0">Administration</h1></div></div>' +
        '<div class="seg" style="margin-bottom:10px;overflow:auto">' +
        groups.map(function (g) {
          var first = tabs.filter(function (t) { return t.group === g; })[0];
          return '<button data-act="tab" data-tab="' + (g === cur.group ? tab : first.id) + '" class="' + (g === cur.group ? 'on' : '') + '">' + A.esc(g) + '</button>';
        }).join('') + '</div>' +
        '<div class="row wrap" style="gap:6px;margin-bottom:22px">' +
        tabs.filter(function (t) { return t.group === cur.group; }).map(function (t) {
          return '<span class="tag ' + (t.id === tab ? 'tag-dark' : 'tag-neutral') + '" data-act="tab" data-tab="' + t.id + '" style="cursor:pointer;padding:6px 12px;font-size:12px">' + A.esc(t.label) + '</span>';
        }).join('') + '</div>';

      A.S.adminActive = cur.def || null;
      if (cur.def) return Promise.resolve(cur.def.render(params)).then(function (html) { return head + html; });

      if (tab === 'holidays') return A.api('leave.holidays', {}).then(function (l) { return head + holidaysTab(l); });
      if (tab === 'leavetypes') return A.api('leave.types').then(function (l) { return head + leaveTypesTab(l); });
      if (tab === 'settings') return A.api('admin.settings').then(function (g) { return head + settingsTab(g); });
      if (tab === 'audit') return A.api('admin.audit', { limit: 200 }).then(function (l) { return head + auditTab(l); });
      if (tab === 'data') return A.api('admin.stats').then(function (s) { return head + dataTab(s); });
      if (tab === 'devices') return A.api('admin.deviceAnomalies', { days: params.days ? parseInt(params.days, 10) : 30 }).then(function (r) { return head + devicesTab(r); });
      if (tab === 'onboarding') return Promise.all([A.api('admin.probationList'), A.api('admin.documentsQueue')])
        .then(function (r) { return head + onboardingTab(r[0], r[1]); });
      return A.api('admin.locations').then(function (list) { return head + locationsTab(list); });
    },
    actions: {
      tab: function (el) { A.go('admin', { tab: el.getAttribute('data-tab') }); },
      addLoc: function () { locationForm(null); },
      editLoc: function (el) { locationForm(JSON.parse(el.getAttribute('data-json'))); },
      delLoc: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Delete location', 'Delete this location permanently?', 'Delete').then(function (ok) {
          if (!ok) return;
          return A.api('admin.deleteLocation', { id: id }).then(function () { A.toast('Deleted.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      assign: function (el) { assignForm(el.getAttribute('data-id'), el.getAttribute('data-name')); },
      addHoliday: function () { holidayForm(); },
      delHoliday: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Remove holiday', 'Remove this holiday from the calendar?', 'Remove').then(function (ok) {
          if (!ok) return;
          return A.api('admin.deleteHoliday', { id: id }).then(function () { A.toast('Removed.', 'ok'); A.render(); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      saveSettings: function () { saveSettings(); },
      importEmp: function () {
        A.confirm('Re-sync employees', 'Import new employees from the source spreadsheet and refresh existing records? Passwords, roles and locations are preserved.', 'Import')
          .then(function (ok) {
            if (!ok) return;
            return A.api('admin.importEmployees', {}).then(function (r) {
              A.toast('Imported ' + r.imported + ', updated ' + r.updated + '.', 'ok'); A.render();
            });
          }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      resetPw: function () { resetPasswordForm(); },
      editLeaveType: function (el) { leaveTypeForm(JSON.parse(el.getAttribute('data-json'))); },
      devicesRange: function (el) { A.go('admin', { tab: 'devices', days: el.value }); },
      trustDevice: function (el) { trustDeviceForm(el.getAttribute('data-id')); },
      untrustDevice: function (el) {
        var id = el.getAttribute('data-id');
        A.confirm('Remove from trusted devices', 'This device will start showing up on the anomalies report again if it keeps punching in for more than one employee.', 'Remove')
          .then(function (ok) {
            if (!ok) return;
            return A.api('admin.setDeviceTrust', { deviceId: id, trusted: false }).then(function () { A.toast('Removed.', 'ok'); A.render(); });
          }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      viewOnbDocs: function (el) { A.showDocumentsModal(el.getAttribute('data-id'), true); },
      confirmEmp: function (el) {
        var id = el.getAttribute('data-id'), name = el.getAttribute('data-name');
        A.confirm('Confirm ' + name, 'This switches their status to Confirmed and notifies them. Make sure the probation evaluation is done first.', 'Confirm')
          .then(function (ok) {
            if (!ok) return;
            return A.api('admin.confirmEmployee', { employeeId: id }).then(function () { A.toast('Confirmed.', 'ok'); A.render(); });
          }).catch(function (e) { A.toast(e.message, 'err'); });
      },

      assignManager: function () { assignManagerForm(); }
    }
  });

  /* ------------------------------------------------------------- locations */
  function locationsTab(list) {
    return '' +
      '<div class="sect"><h3>Sites and geofences</h3>' +
      '<button class="btn btn-primary btn-sm" data-act="addLoc">' + icon('plus') + ' Add location</button></div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">' +
      'Each site has a centre point and a radius. Employees mapped to a site can only mark attendance inside that circle. ' +
      'Use <b>Use my current location</b> while standing at the site, or paste coordinates from Google Maps (right-click a point → the first item is “lat, lng”).' +
      '</div>' +
      (list.length ? '<div class="tablewrap mt3"><table class="tbl"><thead><tr>' +
        '<th>Site</th><th>Type</th><th>Coordinates</th><th>Radius</th><th>Shift</th><th>People</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map(function (l) {
          var json = A.esc(JSON.stringify(l));
          return '<tr><td><div style="font-weight:600">' + A.esc(l.name) + '</div><div class="small muted">' + A.esc(l.address || '') + '</div></td>' +
            '<td class="small">' + A.esc(l.type || '') + '</td>' +
            '<td class="small mono">' + (l.lat && l.lng ? l.lat.toFixed(6) + ', ' + l.lng.toFixed(6) : '<span class="tag tag-warn">not set</span>') + '</td>' +
            '<td>' + l.radius + ' m</td>' +
            '<td class="small">' + A.esc(l.shiftStart || '') + '–' + A.esc(l.shiftEnd || '') + '</td>' +
            '<td>' + l.headcount + '</td>' +
            '<td>' + (l.active ? '<span class="tag tag-ok">Active</span>' : '<span class="tag tag-neutral">Inactive</span>') + '</td>' +
            '<td class="right nowrap">' +
            '<button class="btn btn-ghost btn-sm" data-act="assign" data-id="' + l.id + '" data-name="' + A.esc(l.name) + '">Assign</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="editLoc" data-json="' + json + '">Edit</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="delLoc" data-id="' + l.id + '">Delete</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">No locations yet.</div>');
  }

  function locationForm(loc) {
    loc = loc || {};
    A.modal({
      title: loc.id ? 'Edit location' : 'Add location',
      body: '<form id="locf">' +
        '<div class="field"><label>Site name</label><input class="input" name="name" value="' + A.esc(loc.name || '') + '" required></div>' +
        '<div class="grid2">' +
        '<div class="field"><label>Type</label><select class="input" name="type">' +
        ['OFFICE', 'SITE', 'CLIENT', 'WAREHOUSE'].map(function (t) {
          return '<option value="' + t + '"' + (loc.type === t ? ' selected' : '') + '>' + t.charAt(0) + t.slice(1).toLowerCase() + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>Geofence radius (metres)</label><input class="input" type="number" name="radius" min="30" max="5000" value="' + (loc.radius || 150) + '"></div>' +
        '</div>' +
        '<div class="field"><label>Address</label><input class="input" name="address" value="' + A.esc(loc.address || '') + '"></div>' +
        '<div class="grid2">' +
        '<div class="field"><label>Latitude</label><input class="input" name="lat" id="locLat" value="' + (loc.lat || '') + '" placeholder="19.076090"></div>' +
        '<div class="field"><label>Longitude</label><input class="input" name="lng" id="locLng" value="' + (loc.lng || '') + '" placeholder="72.877426"></div>' +
        '</div>' +
        '<div class="field"><label>Paste “lat, lng” from Google Maps</label><input class="input" id="locPaste" placeholder="19.076090, 72.877426"></div>' +
        '<button type="button" class="btn btn-secondary btn-block" id="locHere">' + icon('pin') + ' Use my current location</button>' +
        '<div class="grid2 mt2">' +
        '<div class="field"><label>Shift start</label><input class="input" type="time" name="shiftStart" value="' + A.esc(loc.shiftStart || '09:30') + '"></div>' +
        '<div class="field"><label>Shift end</label><input class="input" type="time" name="shiftEnd" value="' + A.esc(loc.shiftEnd || '18:30') + '"></div>' +
        '</div>' +
        '<div class="field"><label>Late-mark grace (minutes)</label><input class="input" type="number" name="grace" value="' + (loc.grace || 15) + '"></div>' +
        '<label class="row small"><input type="checkbox" name="active" ' + (loc.active === false ? '' : 'checked') + '> Active</label>' +
        '</form>',
      footer: '<button class="btn btn-secondary" onclick="App.close()">Cancel</button>' +
        '<button class="btn btn-primary" id="loc-save">Save location</button>',
      onMount: function (root) {
        root.querySelector('#locHere').onclick = function () {
          var b = this; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Reading GPS…';
          A.getPosition().then(function (p) {
            root.querySelector('#locLat').value = p.lat.toFixed(6);
            root.querySelector('#locLng').value = p.lng.toFixed(6);
            b.disabled = false; b.innerHTML = icon('check') + ' Captured (±' + Math.round(p.accuracy) + ' m)';
          }).catch(function (e) {
            b.disabled = false; b.innerHTML = icon('pin') + ' Use my current location';
            A.toast(e.message, 'err');
          });
        };
        root.querySelector('#locPaste').addEventListener('input', function () {
          var m = this.value.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
          if (m) { root.querySelector('#locLat').value = m[1]; root.querySelector('#locLng').value = m[2]; }
        });
        root.querySelector('#loc-save').onclick = function () {
          var f = root.querySelector('#locf');
          A.api('admin.saveLocation', {
            id: loc.id, name: f.name.value, type: f.type.value, address: f.address.value,
            lat: parseFloat(f.lat.value) || 0, lng: parseFloat(f.lng.value) || 0,
            radius: parseInt(f.radius.value, 10) || 150,
            shiftStart: f.shiftStart.value, shiftEnd: f.shiftEnd.value,
            grace: parseInt(f.grace.value, 10) || 0, active: f.active.checked
          }).then(function () { A.close(); A.toast('Location saved.', 'ok'); A.render(); })
            .catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  }

  function assignForm(locationId, name) {
    A.api('people.directory', {}).then(function (list) {
      A.modal({
        title: 'Assign people to ' + name,
        wide: true,
        body: '<p class="small muted">Tick everyone who marks attendance at this site.</p>' +
          '<div style="max-height:52vh;overflow:auto">' + list.map(function (p) {
            return '<label class="rowline" style="cursor:pointer"><input type="checkbox" value="' + p.employeeId + '" ' +
              (p.locationId === locationId ? 'checked' : '') + '>' +
              '<div class="avatar sm">' + A.esc(p.initials) + '</div>' +
              '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(p.name) + '</div>' +
              '<div class="small muted">' + A.esc(p.code) + ' · ' + A.esc(p.designation || '') + ' · now: ' + A.esc(p.locationName || 'unassigned') + '</div></div></label>';
          }).join('') + '</div>',
        footer: '<button class="btn btn-secondary" onclick="App.close()">Cancel</button>' +
          '<button class="btn btn-primary" id="as-save">Assign selected</button>',
        onMount: function (root) {
          root.querySelector('#as-save').onclick = function () {
            var ids = [];
            root.querySelectorAll('input[type=checkbox]:checked').forEach(function (c) { ids.push(c.value); });
            A.api('admin.assignLocation', { employeeIds: ids, locationId: locationId })
              .then(function (r) { A.close(); A.toast(r.count + ' employee(s) mapped.', 'ok'); A.render(); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    });
  }

  /* -------------------------------------------------------------- holidays */
  function holidaysTab(list) {
    return '<div class="sect"><h3>Holiday calendar</h3>' +
      '<button class="btn btn-primary btn-sm" data-act="addHoliday">' + icon('plus') + ' Add holiday</button></div>' +
      '<div class="panel tight small mt1">The holiday list must be published by 15 January each year (policy §9). Holidays here drive the attendance register and the sandwich-leave rule.</div>' +
      (list.length ? '<div class="tablewrap mt3"><table class="tbl"><thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th>Type</th><th></th></tr></thead><tbody>' +
        list.map(function (h) {
          return '<tr><td class="nowrap">' + A.pretty(h.date) + '</td><td>' + A.dow(h.date) + '</td>' +
            '<td style="font-weight:600">' + A.esc(h.name) + '</td>' +
            '<td><span class="tag tag-neutral">' + A.esc(h.optional ? 'Optional' : h.type) + '</span></td>' +
            '<td class="right"><button class="btn btn-ghost btn-sm" data-act="delHoliday" data-id="' + h.id + '">Remove</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">No holidays declared yet.</div>');
  }

  function holidayForm() {
    A.prompt('Add holiday', [
      { name: 'date', label: 'Date', type: 'date', value: A.todayStr() },
      { name: 'name', label: 'Holiday name', placeholder: 'Diwali' },
      { name: 'type', label: 'Type', type: 'select', value: 'PUBLIC', options: [{ value: 'PUBLIC', label: 'Public / festival holiday' }, { value: 'COMPANY', label: 'Company holiday' }] }
    ], 'Add').then(function (v) {
      if (!v) return;
      return A.api('admin.saveHoliday', v).then(function () { A.toast('Holiday added.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ----------------------------------------------------------- leave types */
  function leaveTypesTab(list) {
    return '<div class="sect"><h3>Leave types</h3></div>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>Paid</th><th>Half day</th><th>Description</th><th></th></tr></thead><tbody>' +
      list.map(function (t) {
        return '<tr><td><span class="tag" style="background:' + A.esc(t.color || '#eee') + ';color:#fff">' + A.esc(t.code) + '</span></td>' +
          '<td style="font-weight:600">' + A.esc(t.name) + '</td>' +
          '<td>' + (t.isPaid ? 'Yes' : 'No') + '</td><td>' + (t.allowHalfDay ? 'Yes' : 'No') + '</td>' +
          '<td class="small">' + A.esc(t.description || '') + '</td>' +
          '<td class="right"><button class="btn btn-ghost btn-sm" data-act="editLeaveType" data-json="' + A.esc(JSON.stringify(t)) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function leaveTypeForm(t) {
    A.prompt('Edit leave type ' + t.code, [
      { name: 'name', label: 'Name', value: t.name },
      { name: 'description', label: 'Description', type: 'textarea', value: t.description },
      { name: 'isPaid', label: 'Paid leave', type: 'select', value: t.isPaid ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
      { name: 'allowHalfDay', label: 'Allow half day', type: 'select', value: t.allowHalfDay ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }
    ], 'Save').then(function (v) {
      if (!v) return;
      return A.api('admin.saveLeaveType', {
        code: t.code, name: v.name, description: v.description,
        isPaid: v.isPaid === 'yes', allowHalfDay: v.allowHalfDay === 'yes', color: t.color
      }).then(function () { A.toast('Saved.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* -------------------------------------------------------------- settings */
  function settingsTab(groups) {
    return '<div class="sect"><h3>Policy settings</h3>' +
      '<button class="btn btn-primary btn-sm" data-act="saveSettings">Save changes</button></div>' +
      '<form id="setf">' + Object.keys(groups).map(function (cat) {
        return '<div class="mt3"><div class="tiny" style="margin-bottom:8px">' + A.esc(cat) + '</div>' +
          groups[cat].map(function (s) {
            var input;
            if (s.type === 'boolean') {
              input = '<select class="input" data-key="' + A.esc(s.key) + '">' +
                '<option value="true"' + (String(s.value) === 'true' ? ' selected' : '') + '>Yes</option>' +
                '<option value="false"' + (String(s.value) !== 'true' ? ' selected' : '') + '>No</option></select>';
            } else if (s.type === 'time') {
              input = '<input class="input" type="time" data-key="' + A.esc(s.key) + '" value="' + A.esc(s.value) + '">';
            } else if (s.type === 'number') {
              input = '<input class="input" type="number" step="any" data-key="' + A.esc(s.key) + '" value="' + A.esc(s.value) + '">';
            } else {
              input = '<input class="input" data-key="' + A.esc(s.key) + '" value="' + A.esc(s.value) + '">';
            }
            return '<div class="spread" style="border-bottom:1px solid var(--line);padding:10px 0;gap:16px;align-items:center">' +
              '<div style="min-width:0"><div style="font-size:14px;font-weight:600">' + A.esc(s.label || s.key) + '</div>' +
              '<div class="small muted mono">' + A.esc(s.key) + '</div></div>' +
              '<div style="width:220px;max-width:45%">' + input + '</div></div>';
          }).join('') + '</div>';
      }).join('') + '</form>';
  }

  function saveSettings() {
    var changes = {};
    document.querySelectorAll('#setf [data-key]').forEach(function (i) { changes[i.getAttribute('data-key')] = i.value; });
    A.api('admin.saveSettings', { changes: changes })
      .then(function () { A.toast('Settings saved.', 'ok'); })
      .catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ------------------------------------------------------------------ data */
  function dataTab(s) {
    function tile(label, value, sub, route, params) {
      return '<div' + (route ? ' data-act="goto" data-route="' + route + '" data-params=\'' + A.esc(JSON.stringify(params || {})) + '\' style="cursor:pointer"' : '') + '>' +
        '<div class="stat-label">' + A.esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + A.esc(sub || '') + '</div></div>';
    }
    return '<div class="statstrip">' +
      tile('Headcount', String(s.headcount), s.probation + ' on probation · ' + s.exited + ' exited', 'people') +
      tile('Present today', String(s.today.present), s.today.absent + ' absent · ' + s.today.leave + ' on leave', 'reports', { tab: 'today' }) +
      tile('Pending approvals', String(s.pendingLeave + s.pendingRegularization + (s.pendingExpenses || 0)), s.pendingLeave + ' leave · ' + s.pendingRegularization + ' regularization · ' + (s.pendingExpenses || 0) + ' expense', 'approvals') +
      tile('Geofenced sites', s.geofenced + ' <small>of ' + s.locations + '</small>', 'with coordinates', 'admin', { tab: 'locations' }) +
      '</div>' +
      '<div class="statstrip mt2" style="border-top:0">' +
      tile('Helpdesk', String(s.openTickets || 0), 'open tickets', 'admin', { tab: 'helpdesk' }) +
      tile('Hiring', String(s.openJobs || 0), 'open positions', 'admin', { tab: 'recruitment' }) +
      tile('Exits in progress', String(s.exitsInProgress || 0), 'resignations being processed', 'admin', { tab: 'exit' }) +
      tile('Payroll readiness', (s.missingSalaryStructures ? '<span style="color:var(--accent)">' + s.missingSalaryStructures + '</span>' : '0'), 'employees without a salary structure', 'admin', { tab: 'payroll' }) +
      '</div>' +
      '<div class="split even mt4"><div>' +
      '<div class="sect"><h3>Employee data</h3></div>' +
      '<div class="panel tight"><div style="font-size:14px;font-weight:600">Re-sync from the source spreadsheet</div>' +
      '<p class="small muted mt1">Adds employees that are new in the master sheet and refreshes names, departments, designations and dates. Passwords, roles, and site mapping are never overwritten.</p>' +
      '<button class="btn btn-secondary" data-act="importEmp">' + icon('refresh') + ' Import / refresh employees</button></div>' +
      '<div class="panel tight mt2"><div style="font-size:14px;font-weight:600">Reset a password</div>' +
      '<p class="small muted mt1">Generates a temporary password the employee must change at next sign-in.</p>' +
      '<button class="btn btn-secondary" data-act="resetPw">' + icon('user') + ' Reset employee password</button></div>' +
      '<div class="panel tight mt2"><div style="font-size:14px;font-weight:600">Reporting managers</div>' +
      '<p class="small muted mt1">Map a manager to several employees at once. Managers approve leave, regularization and expense claims for their team and review their appraisals.</p>' +
      '<button class="btn btn-secondary" data-act="assignManager">' + icon('users') + ' Assign reporting manager</button></div>' +
      '</div><div>' +
      '<div class="sect"><h3>Headcount by department</h3></div>' +
      s.departments.map(function (d) {
        var pct = Math.round(d.count / s.headcount * 100);
        return '<div style="padding:9px 0;border-bottom:1px solid var(--line)">' +
          '<div class="spread"><span style="font-size:14px">' + A.esc(d.name) + '</span><span style="font-weight:700">' + d.count + '</span></div>' +
          '<div class="bar thin mt1"><i style="width:' + pct + '%;background:var(--text)"></i></div></div>';
      }).join('') +
      '</div></div>';
  }

  function assignManagerForm() {
    A.api('people.picklist').then(function (list) {
      var mgrOpts = list.map(function (p) { return '<option value="' + p.id + '">' + A.esc(p.name + ' (' + p.code + ')') + '</option>'; }).join('');
      A.modal({
        title: 'Assign reporting manager', wide: true,
        body: '<div class="field"><label>Manager</label><select class="input" id="am-mgr"><option value="">— No manager (clear) —</option>' + mgrOpts + '</select></div>' +
          '<div class="field"><label>Filter</label><input class="input" id="am-q" placeholder="Search name, code, department…"></div>' +
          '<div style="max-height:46vh;overflow:auto" id="am-list">' + list.map(function (p) {
            return '<label class="rowline am-row" data-hay="' + A.esc((p.name + ' ' + p.code + ' ' + (p.department || '')).toLowerCase()) + '" style="cursor:pointer"><input type="checkbox" value="' + p.id + '">' +
              '<div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(p.name) + '</div>' +
              '<div class="small muted">' + A.esc(p.code) + ' · ' + A.esc(p.department || '') + ' · now: ' + A.esc(p.managerName || 'no manager') + '</div></div></label>';
          }).join('') + '</div>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="am-save">Assign to selected</button>',
        onMount: function (root) {
          root.querySelector('#am-q').addEventListener('input', function () {
            var q = this.value.toLowerCase();
            root.querySelectorAll('.am-row').forEach(function (r) { r.style.display = !q || r.getAttribute('data-hay').indexOf(q) > -1 ? '' : 'none'; });
          });
          root.querySelector('#am-save').onclick = function () {
            var ids = []; root.querySelectorAll('#am-list input:checked').forEach(function (c) { ids.push(c.value); });
            if (!ids.length) return A.toast('Tick at least one employee.', 'err');
            A.api('admin.assignManager', { employeeIds: ids, managerId: root.querySelector('#am-mgr').value })
              .then(function (r) { A.close(); A.toast(r.count + ' employee(s) updated.', 'ok'); A.render(); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  function resetPasswordForm() {
    A.api('people.picklist').then(function (list) {
      A.prompt('Reset password', [{
        name: 'employeeId', label: 'Employee', type: 'select',
        options: list.map(function (p) { return { value: p.id, label: p.name + ' (' + p.code + ')' }; })
      }], 'Reset').then(function (v) {
        if (!v) return;
        return A.api('admin.resetPassword', { employeeId: v.employeeId }).then(function (r) {
          A.modal({
            title: 'Temporary password',
            body: '<p>Share this with the employee. They must change it at next sign-in.</p>' +
              '<div class="outline" style="text-align:center;font-size:28px;font-weight:800;letter-spacing:.04em">' + A.esc(r.password) + '</div>'
          });
        });
      }).catch(function (e) { A.toast(e.message, 'err'); });
    });
  }

  /* ------------------------------------------------------- device anomalies */
  /* -------------------------------------------------------------- onboarding */
  function onboardingTab(list, queue) {
    return '<div class="sect"><h3>Probation pipeline</h3><span class="small muted">' + list.length + ' on probation</span></div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">' +
      'Six-month probation per the Office Policy manual. Confirm an employee once their evaluation is done — ' +
      'that switches their status to Confirmed and notifies them. "Onboarding" below is their self-service Employee ' +
      'Information Form + document checklist, separate from the probation clock.' +
      '</div>' +
      (list.length ? '<div class="tablewrap mt3"><table class="tbl"><thead><tr>' +
        '<th>Employee</th><th>Joined</th><th>Probation ends</th><th>Onboarding</th><th>Documents</th><th></th></tr></thead><tbody>' +
        list.map(function (e) {
          var days = e.daysLeft;
          var dueTag = days === null ? '<span class="tag tag-neutral">No date set</span>'
            : days < 0 ? '<span class="tag tag-err">' + Math.abs(days) + ' day(s) overdue</span>'
              : days <= 14 ? '<span class="tag tag-warn">' + days + ' day(s) left</span>'
                : '<span class="tag tag-neutral">' + days + ' day(s) left</span>';
          return '<tr><td><div style="font-weight:600">' + A.esc(e.name) + '</div><div class="small muted">' + A.esc(e.code) + ' · ' + A.esc(e.designation || '') + '</div></td>' +
            '<td class="small">' + A.pretty(e.joinDate) + '</td>' +
            '<td class="small">' + (e.probationEndDate ? A.pretty(e.probationEndDate) + ' ' : '—') + dueTag + '</td>' +
            '<td>' + (e.onboardingDone ? '<span class="tag tag-ok">Done</span>' : '<span class="tag tag-warn">Pending</span>') + '</td>' +
            '<td class="small">' + e.docsVerified + '/' + e.docsTotal + ' verified' + (e.docsRejected ? ', ' + e.docsRejected + ' rejected' : '') + '</td>' +
            '<td class="right nowrap">' +
            '<button class="btn btn-ghost btn-sm" data-act="viewOnbDocs" data-id="' + e.employeeId + '">Documents</button>' +
            '<button class="btn btn-secondary btn-sm" data-act="confirmEmp" data-id="' + e.employeeId + '" data-name="' + A.esc(e.name) + '">Confirm</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">No one is currently on probation.</div>') +

      '<div class="sect mt4"><h3>Documents pending review</h3><span class="small muted">' + queue.length + ' pending</span></div>' +
      (queue.length ? '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Employee</th><th>Document</th><th>Uploaded</th><th></th></tr></thead><tbody>' +
        queue.map(function (q) {
          return '<tr><td style="font-weight:600">' + A.esc(q.employeeName) + ' <span class="small muted">(' + A.esc(q.employeeCode) + ')</span></td>' +
            '<td class="small">' + A.esc(q.label) + '</td>' +
            '<td class="small">' + A.esc(q.uploadedAt) + '</td>' +
            '<td class="right"><button class="btn btn-ghost btn-sm" data-act="viewOnbDocs" data-id="' + q.employeeId + '">Review</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nothing waiting on HR right now.</div>');
  }

  function devicesTab(r) {
    var rangeSel = '<select class="input" style="width:auto;display:inline-block" data-act="devicesRange">' +
      [7, 14, 30, 60, 90].map(function (n) {
        return '<option value="' + n + '"' + (r.days === n ? ' selected' : '') + '>Last ' + n + ' days</option>';
      }).join('') + '</select>';

    return '<div class="sect"><h3>Device anomalies</h3>' + rangeSel + '</div>' +
      '<div class="panel tight small mt1" style="line-height:1.65">' +
      'Geofencing proves a phone was on site — it cannot prove whose thumb pressed the button. Every punch also records a private id for the ' +
      'device it came from. If the same device punches in or out for more than one employee, it shows up here: either someone is marking ' +
      'attendance for a colleague, or it is a legitimately shared site tablet — mark those as trusted so they stop reappearing.' +
      '</div>' +
      '<div class="mt3">' +
      (r.flagged.length
        ? '<div class="sect"><h3 style="font-size:15px">Needs review (' + r.flagged.length + ')</h3></div>' + deviceCards(r.flagged, false)
        : '<div class="empty">No unreviewed devices used by more than one employee in this window.</div>') +
      '</div>' +
      (r.trusted.length ? '<div class="mt4"><div class="sect"><h3 style="font-size:15px">Trusted shared devices (' + r.trusted.length + ')</h3></div>' + deviceCards(r.trusted, true) + '</div>' : '');
  }

  function deviceCards(list, isTrusted) {
    return list.map(function (d) {
      var short = d.deviceId.slice(0, 8);
      return '<div class="panel tight mt2">' +
        '<div class="spread wrap" style="align-items:flex-start;gap:12px">' +
        '<div><div style="font-weight:700">' + d.distinctEmployees + ' employees on one device</div>' +
        '<div class="small muted mono">device ' + A.esc(short) + '…</div></div>' +
        '<div>' + (isTrusted
          ? '<button class="btn btn-ghost btn-sm" data-act="untrustDevice" data-id="' + A.esc(d.deviceId) + '">Remove trust</button>'
          : '<button class="btn btn-secondary btn-sm" data-act="trustDevice" data-id="' + A.esc(d.deviceId) + '">Mark as trusted device</button>') +
        '</div></div>' +
        '<div class="tablewrap mt2"><table class="tbl"><thead><tr><th>Employee</th><th>Punches</th><th>Last used</th></tr></thead><tbody>' +
        d.employees.map(function (e) {
          return '<tr><td style="font-weight:600">' + A.esc(e.name) + '</td><td>' + e.punches + '</td><td class="small">' + A.esc(e.lastAt) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '</div>';
    }).join('');
  }

  function trustDeviceForm(deviceId) {
    A.prompt('Mark as trusted device', [
      { name: 'note', label: 'Why is this device shared? (e.g. site supervisor\'s tablet)', placeholder: 'Shared kiosk at Site X, used under supervision' }
    ], 'Mark trusted').then(function (v) {
      if (!v) return;
      return A.api('admin.setDeviceTrust', { deviceId: deviceId, trusted: true, note: v.note })
        .then(function () { A.toast('Marked as trusted.', 'ok'); A.render(); });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }

  /* ----------------------------------------------------------------- audit */
  function auditTab(list) {
    return '<div class="sect"><h3>Audit trail</h3><span class="small muted">Last ' + list.length + ' events</span></div>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Reference</th></tr></thead><tbody>' +
      list.map(function (a) {
        return '<tr><td class="small nowrap">' + A.esc(a.at) + '</td><td class="small">' + A.esc(a.actor) + '</td>' +
          '<td><span class="tag tag-neutral">' + A.esc(a.action) + '</span></td>' +
          '<td class="small">' + A.esc(a.entity) + '</td><td class="small mono">' + A.esc(a.entityId) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

})();

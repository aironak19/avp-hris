/* ==========================================================================
   Roles & permissions (v3.0) — Administration → System → Roles
   Define custom roles as a matrix of capabilities per module, assign them to
   people, and preview the app as any member.
   ========================================================================== */
(function () {
  var A = App;
  var draft = null;          // { roleId, name, description, color, caps: {capId:true} } for the role being edited
  var LEVELS = [['Self', 0], ['Team', 1], ['Manage', 2]];
  var PALETTE = ['#ec3013', '#1d5fd8', '#158a52', '#a86a00', '#7b5ce0', '#0e9f9a', '#e85c4a', '#f28c1b', '#b08fc7', '#2eb5b7', '#8dbf2e', '#1f1c1b'];

  A.registerAdminTab({
    id: 'roles', label: 'Roles & permissions', group: 'System', icon: 'shield', cap: 'admin.roles',
    blurb: 'Define roles, permissions and preview the app as anyone',
    render: function (params) {
      return A.api('admin.roles.list').then(function (data) {
        var roles = data.roles || [], caps = data.caps || [];
        var sel = roles.filter(function (r) { return r.roleId === (params.role || (draft && draft.roleId)); })[0] || roles[0];
        if (!draft || draft.roleId !== sel.roleId) draft = fromRole(sel);
        var members = sel.members || 0;
        var byModule = {};
        caps.forEach(function (c) { (byModule[c.module] = byModule[c.module] || []).push(c); });
        var modules = Object.keys(byModule).filter(function (m) { return !byModule[m].every(function (c) { return c.single; }); });
        var singles = caps.filter(function (c) { return c.single; });
        var editable = data.canEdit && !sel.isSystem;
        var cosmetic = data.canEdit && sel.isSystem && sel.roleId !== 'SUPER_ADMIN';

        var left = '<div class="stack" style="gap:8px">' +
          '<div class="spread"><div class="tiny">' + roles.length + ' roles</div>' + (data.canEdit ? '<button class="btn btn-primary btn-sm" data-act="newRole">' + icon('plus') + ' New role</button>' : '') + '</div>' +
          roles.map(function (r) {
            return '<button class="rolecard' + (r.roleId === sel.roleId ? ' on' : '') + '" data-act="pickRole" data-role="' + A.esc(r.roleId) + '">' +
              '<span class="sw" style="background:' + A.esc(r.color) + '"></span><span class="grow"><b>' + A.esc(r.name) + '</b><small>' + (r.members || 0) + ' ' + (r.members === 1 ? 'person' : 'people') + (r.isSystem ? ' · system' : ' · custom') + '</small></span>' +
              (r.roleId === sel.roleId ? icon('chevron') : '') + '</button>';
          }).join('') +
          '<div class="panel soft small mt1" style="line-height:1.6"><b>How it works.</b> System roles are fixed ladders (Employee → Manager → HR admin → Administrator). ' +
          'A custom role starts as an Employee and gains exactly the capabilities you switch on — for example a <i>Payroll clerk</i> with Payroll · Manage, or a <i>Recruiter</i> with Recruitment · Manage. Changes apply the moment the person next loads a screen.</div>' +
          '</div>';

        var right = '' +
          '<div class="panel">' +
          '<div class="spread wrap" style="align-items:flex-start">' +
          '<div class="row" style="gap:14px;align-items:flex-start"><div class="avatar lg" style="background:' + A.esc(draft.color) + ';border-radius:14px">' + icon('shield') + '</div>' +
          '<div style="min-width:0">' + (editable || cosmetic
            ? '<input class="input" id="rl-name" value="' + A.esc(draft.name) + '" style="font-weight:700;font-size:18px;font-family:var(--font-display);max-width:340px">' +
              '<input class="input mt1" id="rl-desc" value="' + A.esc(draft.description) + '" placeholder="What is this role for?" style="max-width:520px">'
            : '<h2 style="margin:0">' + A.esc(draft.name) + '</h2><div class="muted" style="max-width:520px">' + A.esc(draft.description) + '</div>') +
          '<div class="row wrap mt2"><span class="tag ' + (sel.isSystem ? 'tag-dark' : 'tag-accent') + '">' + (sel.isSystem ? 'System role' : 'Custom role') + '</span><span class="tag tag-neutral">' + members + ' ' + (members === 1 ? 'member' : 'members') + '</span>' +
          (sel.isSystem ? '<span class="tag tag-neutral">Rank ' + sel.baseRank + '</span>' : '<span class="tag tag-neutral">' + Object.keys(draft.caps).length + ' capabilities</span>') + '</div></div></div>' +
          '<div class="row wrap">' +
          (data.canViewAs && members ? '<button class="btn btn-secondary btn-sm" data-act="previewRole">' + icon('eye') + ' Preview as a member</button>' : '') +
          (data.canEdit ? '<button class="btn btn-secondary btn-sm" data-act="assignPeople">' + icon('userplus') + ' Assign people</button>' : '') +
          (editable ? '<button class="btn btn-danger btn-sm" data-act="deleteRole">' + icon('trash') + '</button>' : '') +
          ((editable || cosmetic) ? '<button class="btn btn-primary btn-sm" data-act="saveRole" id="rl-save">' + icon('check') + ' Save changes</button>' : '') +
          '</div></div>' +
          ((editable || cosmetic) ? '<div class="mt3"><div class="tiny" style="margin-bottom:6px">Colour</div><div class="colorpick">' + PALETTE.map(function (c) { return '<button style="background:' + c + '" class="' + (c === draft.color ? 'on' : '') + '" data-act="pickColor" data-color="' + c + '" aria-label="' + c + '"></button>'; }).join('') + '</div></div>' : '') +
          '<div class="mt3" id="rl-members"><div class="tiny" style="margin-bottom:8px">Members</div><div class="row wrap" style="gap:6px"><span class="spinner"></span></div></div>' +
          '</div>' +

          '<div class="sect mt4"><h3>Permissions</h3><span class="small muted">' + (sel.isSystem ? 'Fixed for system roles' : 'Switch on what this role can do') + '</span></div>' +
          '<div class="matrix mt2">' +
          '<div class="mrow head"><div>Module</div>' + LEVELS.map(function (l) { return '<div>' + l[0] + '</div>'; }).join('') + '</div>' +
          modules.map(function (m) {
            var list = byModule[m];
            return '<div class="mrow"><div class="lbl"><b>' + A.esc(m) + '</b><small>' + A.esc((list.filter(function (c) { return c.level === 2; })[0] || list[0]).label) + '</small></div>' +
              LEVELS.map(function (l) {
                var cap = list.filter(function (c) { return c.level === l[1]; })[0];
                if (!cap || cap.hidden) return '<div class="cell na">—</div>';
                var on = !!draft.caps[cap.id], dis = !editable || l[1] === 0;
                return '<div class="cell" title="' + A.esc(cap.label) + '"><label class="switch"><input type="checkbox" data-change="toggleCap" data-cap="' + cap.id + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '><i></i></label></div>';
              }).join('') + '</div>';
          }).join('') + '</div>' +

          '<div class="sect mt4"><h3>System &amp; reports</h3></div>' +
          '<div class="matrix mt2">' + singles.map(function (c) {
            var on = !!draft.caps[c.id];
            var locked = c.id === 'admin.roles' && !sel.isSystem;
            return '<div class="mrow" style="grid-template-columns:1fr 92px"><div class="lbl"><b>' + A.esc(c.label) + '</b><small>' + A.esc(c.module) + (locked ? ' · Administrator only' : '') + '</small></div>' +
              '<div class="cell"><label class="switch"><input type="checkbox" data-change="toggleCap" data-cap="' + c.id + '"' + (on ? ' checked' : '') + ((!editable || locked) ? ' disabled' : '') + '><i></i></label></div></div>';
          }).join('') + '</div>' +
          (sel.isSystem ? '<p class="small muted mt2">System roles cannot have their permissions changed — create a custom role to tailor access.</p>' : '<p class="small muted mt2">Everyone keeps self-service access (own attendance, leave, payslips, claims, tickets). <b>Team</b> covers direct reports; <b>Manage</b> covers everyone and opens the module under Administration.</p>');

        setTimeout(function () { loadMembers(sel.roleId, data.canEdit); }, 0);
        return '<div style="display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start" class="roles-grid">' + left + '<div>' + right + '</div></div>' +
          '<style>@media (max-width:1000px){.roles-grid{grid-template-columns:1fr !important}}</style>';
      });
    },
    actions: {
      pickRole: function (el) { draft = null; A.go('admin', { tab: 'roles', role: el.getAttribute('data-role') }); },
      pickColor: function (el) { draft.color = el.getAttribute('data-color'); document.querySelectorAll('.colorpick button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-color') === draft.color); }); var av = document.querySelector('.roles-grid .avatar.lg'); if (av) av.style.background = draft.color; },
      toggleCap: function (el) {
        var cap = el.getAttribute('data-cap');
        if (el.checked) draft.caps[cap] = true; else delete draft.caps[cap];
        // Manage implies Team: switching Manage on lights Team; switching Team off drops Manage.
        var m = cap.split('.')[0];
        if (el.checked && /\.(manage|review)$/.test(cap)) { var teamCap = document.querySelector('[data-cap="' + m + '.team"], [data-cap="' + m + '.approve"]'); if (teamCap && !teamCap.disabled) { teamCap.checked = true; draft.caps[teamCap.getAttribute('data-cap')] = true; } }
        if (!el.checked && /\.(team|approve)$/.test(cap)) { var mg = document.querySelector('[data-cap="' + m + '.manage"], [data-cap="' + m + '.review"]'); if (mg) { mg.checked = false; delete draft.caps[mg.getAttribute('data-cap')]; } }
        var s = document.getElementById('rl-save'); if (s) { s.classList.add('pop'); setTimeout(function () { s.classList.remove('pop'); }, 400); }
      },
      saveRole: function (el) {
        var name = (document.getElementById('rl-name') || {}).value, desc = (document.getElementById('rl-desc') || {}).value;
        el.classList.add('is-busy');
        A.api('admin.roles.saveRole', { roleId: draft.roleId, name: name, description: desc, color: draft.color, caps: Object.keys(draft.caps) })
          .then(function (r) { A.toast('Role saved.', 'ok'); draft = null; A.S.roles = null; A.refreshSession(); A.go('admin', { tab: 'roles', role: r.roleId }); })
          .catch(function (e) { el.classList.remove('is-busy'); A.toast(e.message, 'err'); });
      },
      newRole: function () { newRoleForm(); },
      deleteRole: function () {
        A.confirm('Delete role', 'Delete <b>' + A.esc(draft.name) + '</b>? People holding it must be moved to another role first.', 'Delete', true).then(function (ok) {
          if (!ok) return;
          return A.api('admin.roles.deleteRole', { roleId: draft.roleId }).then(function () { A.toast('Role deleted.', 'ok'); draft = null; A.refreshSession(); A.go('admin', { tab: 'roles' }); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      assignPeople: function () { assignForm(draft.roleId, draft.name); },
      previewRole: function () {
        A.api('admin.roles.members', { roleId: draft.roleId }).then(function (list) {
          if (!list.length) return A.toast('Nobody holds this role yet.', 'err');
          if (list.length === 1) return A.enterViewAs({ id: list[0].id, name: list[0].name, role: draft.roleId, roleName: draft.name });
          A.modal({ title: 'Preview as…', body: '<div class="list">' + list.map(function (p) {
            return '<div class="item" data-vid="' + A.esc(p.id) + '" style="cursor:pointer"><div class="avatar sm ghost">' + A.esc(p.initials) + '</div><div><div class="t">' + A.esc(p.name) + '</div><div class="s">' + A.esc([p.code, p.designation, p.department].filter(Boolean).join(' · ')) + '</div></div>' + icon('chevron') + '</div>';
          }).join('') + '</div>', footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button>',
            onMount: function (root) { root.querySelectorAll('[data-vid]').forEach(function (row) { row.onclick = function () { var p = list.filter(function (x) { return String(x.id) === row.getAttribute('data-vid'); })[0]; A.close(); A.enterViewAs({ id: p.id, name: p.name, role: draft.roleId, roleName: draft.name }); }; }); } });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      },
      removeMember: function (el) {
        var id = el.getAttribute('data-id'), name = el.getAttribute('data-name');
        A.confirm('Move to Employee', 'Remove <b>' + A.esc(name) + '</b> from ' + A.esc(draft.name) + '? They become a plain Employee.', 'Remove').then(function (ok) {
          if (!ok) return;
          return A.api('admin.roles.assignRole', { employeeIds: [id], roleId: 'EMPLOYEE' }).then(function () { A.toast('Moved to Employee.', 'ok'); A.render({ quiet: true }); });
        }).catch(function (e) { A.toast(e.message, 'err'); });
      }
    }
  });

  function fromRole(r) {
    var caps = {}; (r.caps || []).forEach(function (c) { caps[c] = true; });
    return { roleId: r.roleId, name: r.name, description: r.description || '', color: r.color || '#2eb5b7', caps: caps, isSystem: r.isSystem };
  }
  function loadMembers(roleId, canEdit) {
    var host = document.getElementById('rl-members'); if (!host) return;
    A.api('admin.roles.members', { roleId: roleId }).then(function (list) {
      if (!document.getElementById('rl-members')) return;
      host.innerHTML = '<div class="tiny" style="margin-bottom:8px">Members · ' + list.length + '</div>' + (list.length
        ? '<div class="row wrap" style="gap:6px">' + list.slice(0, 24).map(function (p) {
          return '<span class="tag tag-neutral" style="padding-left:3px;gap:7px" title="' + A.esc(p.designation || '') + '"><span class="avatar" style="width:20px;height:20px;font-size:8px">' + A.esc(p.initials) + '</span>' + A.esc(p.name) +
            (canEdit && roleId !== 'EMPLOYEE' ? '<button class="iconbtn sm" style="width:18px;height:18px;margin:-2px -4px -2px 0" data-act="removeMember" data-id="' + A.esc(p.id) + '" data-name="' + A.esc(p.name) + '" title="Move to Employee">' + icon('x', 11) + '</button>' : '') + '</span>';
        }).join('') + (list.length > 24 ? '<span class="tag tag-neutral">+' + (list.length - 24) + ' more</span>' : '') + '</div>'
        : '<div class="small muted">Nobody holds this role yet.' + (canEdit ? ' Use <b>Assign people</b> to add members.' : '') + '</div>');
    }).catch(function () { host.innerHTML = ''; });
  }
  function newRoleForm() {
    var templates = (A.S.roles || []).filter(function (r) { return r.isSystem && r.roleId !== 'SUPER_ADMIN'; });
    A.modal({
      title: 'New role',
      body: '<div class="field"><label>Name</label><input class="input" id="nr-name" placeholder="e.g. Payroll clerk, Recruiter, Site supervisor" autofocus></div>' +
        '<div class="field"><label>Description</label><input class="input" id="nr-desc" placeholder="What is this role for?"></div>' +
        '<div class="field"><label>Start from</label><select class="input" id="nr-tpl"><option value="">Employee (self-service only)</option>' + templates.filter(function (t) { return t.roleId !== 'EMPLOYEE'; }).map(function (t) { return '<option value="' + t.roleId + '">' + A.esc(t.name) + ' — copy its permissions</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Colour</label><div class="colorpick" id="nr-colors">' + PALETTE.map(function (c, i) { return '<button type="button" style="background:' + c + '" class="' + (i === 9 ? 'on' : '') + '" data-color="' + c + '"></button>'; }).join('') + '</div></div>',
      footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="nr-go">Create role</button>',
      onMount: function (root) {
        var color = PALETTE[9];
        root.querySelectorAll('#nr-colors button').forEach(function (b) { b.onclick = function () { color = b.getAttribute('data-color'); root.querySelectorAll('#nr-colors button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
        root.querySelector('#nr-go').onclick = function () {
          var name = root.querySelector('#nr-name').value.trim(); if (!name) return A.toast('Give the role a name.', 'err');
          var tplId = root.querySelector('#nr-tpl').value, tpl = templates.filter(function (t) { return t.roleId === tplId; })[0];
          var caps = tpl ? (tpl.caps || []).filter(function (c) { return c !== 'admin.roles'; }) : [];
          this.classList.add('is-busy');
          A.api('admin.roles.saveRole', { name: name, description: root.querySelector('#nr-desc').value, color: color, caps: caps })
            .then(function (r) { A.close(); A.toast('Role created — now choose its permissions.', 'ok'); draft = null; A.refreshSession(); A.go('admin', { tab: 'roles', role: r.roleId }); })
            .catch(function (e) { A.toast(e.message, 'err'); });
        };
      }
    });
  }
  function assignForm(roleId, roleName) {
    A.api('people.picklist').then(function (list) {
      A.modal({
        title: 'Assign people to ' + roleName, wide: true,
        body: '<input class="input" id="ar-q" placeholder="Search name, code, department…" autocomplete="off">' +
          '<div style="max-height:52vh;overflow:auto" class="mt2" id="ar-list">' + list.map(function (p) {
            var has = String(p.role) === String(roleId);
            return '<label class="rowline ar-row" data-hay="' + A.esc((p.name + ' ' + p.code + ' ' + (p.department || '')).toLowerCase()) + '" style="cursor:pointer"><input type="checkbox" value="' + p.id + '"' + (has ? ' checked disabled' : '') + '>' +
              '<div class="avatar sm ghost">' + A.esc(A.initials(p.name)) + '</div><div class="grow"><div style="font-size:14px;font-weight:600">' + A.esc(p.name) + '</div>' +
              '<div class="small muted">' + A.esc(p.code) + ' · ' + A.esc(p.department || '') + ' · now: ' + A.esc(p.roleName || A.roleLabel(p.role)) + '</div></div></label>';
          }).join('') + '</div>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button><button class="btn btn-primary" id="ar-save">Assign to selected</button>',
        onMount: function (root) {
          root.querySelector('#ar-q').addEventListener('input', function () {
            var q = this.value.toLowerCase();
            root.querySelectorAll('.ar-row').forEach(function (r) { r.style.display = !q || r.getAttribute('data-hay').indexOf(q) > -1 ? '' : 'none'; });
          });
          root.querySelector('#ar-save').onclick = function () {
            var ids = []; root.querySelectorAll('#ar-list input:checked:not(:disabled)').forEach(function (c) { ids.push(c.value); });
            if (!ids.length) return A.toast('Tick at least one person.', 'err');
            this.classList.add('is-busy');
            A.api('admin.roles.assignRole', { employeeIds: ids, roleId: roleId }).then(function (r) { A.close(); A.toast('Assigned to ' + r.count + ' ' + (r.count === 1 ? 'person' : 'people') + '.', 'ok'); A.render({ quiet: true }); })
              .catch(function (e) { A.toast(e.message, 'err'); });
          };
        }
      });
    }).catch(function (e) { A.toast(e.message, 'err'); });
  }
})();

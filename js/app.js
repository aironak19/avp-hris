/* ==========================================================================
   AVP HRIS — client core
   State, RPC bridge, router, shell, and the shared UI primitives used by the
   view modules (ViewsHome / ViewsAttendance / ViewsLeave / ViewsPeople /
   ViewsAdmin).
   ========================================================================== */
var App = (function () {

  var S = {
    token: null, user: null, boot: null, route: '', params: {},
    views: {}, current: null, loading: false, navOpen: false,
    adminTabs: [], adminActive: null, pendingAcks: 0,
    // v1.6.0
    homePayload: null, pendingSign: 0, snapshotAt: 0, refreshing: false, signMode: false
  };

  /* ------------------------------------------------------------- storage */
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return store._m[k] || null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { store._m[k] = v; } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { delete store._m[k]; } },
    getJson: function (k) { try { return JSON.parse(store.get(k) || 'null'); } catch (e) { return null; } },
    setJson: function (k, v) { try { store.set(k, JSON.stringify(v)); } catch (e) {} },
    _m: {}
  };
  var SNAP_KEY = 'hris_snapshot_v1';
  var SNAP_MAX_AGE_MS = 12 * 3600 * 1000;

  /* ----------------------------------------------------------------- rpc */
  function api(action, payload) {
    payload = payload || {};
    if (S.token) payload.token = S.token;
    var sentToken = S.token; // v1.6.0: a late reply for a token that is no longer current must not log the new user out
    return new Promise(function (resolve, reject) {
      HRIS.transport(action, payload).then(
        function (res) {
          if (!res) return reject(new Error('No response from the server.'));
          if (res.ok) return resolve(res.data);
          var err = new Error(res.error || 'Something went wrong.');
          err.code = res.code; err.details = res.details;
          var current = sentToken && sentToken === S.token;
          if (res.code === 'SESSION_EXPIRED' && current) { signOutLocal(); renderLogin('Your session expired — please sign in again.'); }
          if (res.code === 'PASSWORD_CHANGE_REQUIRED' && current) { renderChangePassword(true); }
          if (res.code === 'ONBOARDING_REQUIRED' && current) { renderOnboarding(true); }
          reject(err);
        },
        function (e) { reject(new Error(e && e.message ? e.message : String(e))); }
      );
    });
  }

  /* ------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function d(ymd) { if (!ymd) return null; var p = String(ymd).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function pretty(ymd) { var x = d(ymd); return x ? x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear() : '—'; }
  function shortD(ymd) { var x = d(ymd); return x ? x.getDate() + ' ' + MON[x.getMonth()] : '—'; }
  function dow(ymd) { var x = d(ymd); return x ? DOW[x.getDay()] : ''; }
  function todayStr() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }
  function monthKey(ymd) { return String(ymd || todayStr()).slice(0, 7); }
  function monthLabel(k) { var p = String(k).split('-'); return MON[(+p[1]) - 1] + ' ' + p[0]; }
  function addMonthKey(k, n) {
    var p = String(k).split('-'); var dt = new Date(+p[0], (+p[1] - 1) + n, 1);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  }
  function hm(mins) { mins = Math.max(0, Math.round(mins || 0)); return Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm'; }
  function initials(n) {
    var p = String(n || '').replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function days(n) { return n === 1 ? '1 day' : (n + ' days'); }

  var STATUS_LABEL = {
    PRESENT: 'Present', HALF_DAY: 'Half day', ABSENT: 'Absent', ON_LEAVE: 'On leave',
    HALF_DAY_LEAVE: 'Half leave', WEEKLY_OFF: 'Weekly off', HOLIDAY: 'Holiday',
    ON_DUTY: 'On duty', WFH: 'Work from home', MISSING_PUNCH: 'Missing punch', NOT_MARKED: '—'
  };
  var STATUS_TAG = {
    PRESENT: 'tag-ok', HALF_DAY: 'tag-warn', ABSENT: 'tag-err', ON_LEAVE: 'tag-accent',
    HALF_DAY_LEAVE: 'tag-accent', WEEKLY_OFF: 'tag-neutral', HOLIDAY: 'tag-neutral',
    ON_DUTY: 'tag-ok', WFH: 'tag-ok', MISSING_PUNCH: 'tag-warn', NOT_MARKED: 'tag-neutral',
    PENDING: 'tag-warn', APPROVED: 'tag-ok', REJECTED: 'tag-err', CANCELLED: 'tag-neutral', LAPSED: 'tag-neutral'
  };
  function statusTag(s) {
    return '<span class="tag ' + (STATUS_TAG[s] || 'tag-neutral') + '">' +
      esc(STATUS_LABEL[s] || String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); })) + '</span>';
  }

  /* --------------------------------------------------------------- toasts */
  function toast(msg, kind, ms) {
    var host = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = esc(msg);
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s'; el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, ms || (kind === 'err' ? 6000 : 3200));
  }

  /* --------------------------------------------------------------- modals */
  function modal(opts) {
    close();
    var root = document.getElementById('modal-root');
    root.innerHTML =
      '<div class="backdrop" data-close="1">' +
      '<div class="modal' + (opts.wide ? ' wide' : '') + '">' +
      '<div class="modal-head"><h4>' + esc(opts.title || '') + '</h4>' +
      '<button class="iconbtn" data-close="btn">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer === null ? '' : '<div class="modal-foot">' + (opts.footer ||
        ('<button class="btn btn-secondary" data-close="btn">Close</button>')) + '</div>') +
      '</div></div>';
    root.querySelectorAll('[data-close]').forEach(function (n) {
      var mode = n.getAttribute('data-close');
      n.addEventListener('click', function (ev) {
        if (mode === 'btn' || ev.target === n) close();
      });
    });
    if (opts.onMount) opts.onMount(root);
    return root;
  }
  function close() { document.getElementById('modal-root').innerHTML = ''; }

  function confirmDialog(title, message, confirmLabel) {
    return new Promise(function (resolve) {
      modal({
        title: title,
        body: '<div style="font-size:14px">' + message + '</div>',
        footer: '<button class="btn btn-secondary" id="cf-no">Cancel</button>' +
          '<button class="btn btn-primary" id="cf-yes">' + esc(confirmLabel || 'Confirm') + '</button>',
        onMount: function (root) {
          root.querySelector('#cf-no').onclick = function () { close(); resolve(false); };
          root.querySelector('#cf-yes').onclick = function () { close(); resolve(true); };
        }
      });
    });
  }

  function prompt(title, fields, submitLabel) {
    return new Promise(function (resolve) {
      var body = fields.map(function (f) {
        if (f.type === 'textarea') {
          return '<div class="field"><label>' + esc(f.label) + '</label><textarea class="input" name="' + f.name + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea></div>';
        }
        if (f.type === 'select') {
          return '<div class="field"><label>' + esc(f.label) + '</label><select class="input" name="' + f.name + '">' +
            f.options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
            '</select></div>';
        }
        return '<div class="field"><label>' + esc(f.label) + '</label><input class="input" type="' + (f.type || 'text') + '" name="' + f.name + '" value="' + esc(f.value || '') + '" placeholder="' + esc(f.placeholder || '') + '"></div>';
      }).join('');
      modal({
        title: title, body: '<form id="pf">' + body + '</form>',
        footer: '<button class="btn btn-secondary" id="p-no">Cancel</button><button class="btn btn-primary" id="p-yes">' + esc(submitLabel || 'Save') + '</button>',
        onMount: function (root) {
          root.querySelector('#p-no').onclick = function () { close(); resolve(null); };
          root.querySelector('#p-yes').onclick = function () {
            var out = {};
            root.querySelectorAll('#pf [name]').forEach(function (i) { out[i.name] = i.value; });
            close(); resolve(out);
          };
        }
      });
    });
  }

  /* ------------------------------------------------------------ geolocation */
  function getPosition(opts) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        return reject(new Error('This browser cannot share your location. Please use Chrome or Safari on your phone.'));
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        function (err) {
          var msg = 'We could not read your location.';
          if (err.code === 1) msg = 'Location permission is blocked. Allow location for this site in your browser settings and try again.';
          else if (err.code === 2) msg = 'Your location is unavailable right now. Move to an open area and try again.';
          else if (err.code === 3) msg = 'Getting your location timed out. Please try again.';
          reject(new Error(msg));
        },
        Object.assign({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }, opts || {})
      );
    });
  }

  /* --------------------------------------------------------------- routing */
  function registerView(name, def) { S.views[name] = def; def.name = name; }

  /**
   * Modules register their Administration tab here instead of editing
   * ViewsAdmin.html: { id, label, group, render(params) -> Promise<html>, actions: {} }.
   */
  function registerAdminTab(def) { S.adminTabs.push(def); return def; }

  /* ------------------------------------------------------- shared helpers */
  function money(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100, neg = v < 0; v = Math.abs(v);
    var p = v.toFixed(2).split('.'), s = p[0], last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    return (neg ? '-' : '') + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3 + (p[1] === '00' ? '' : '.' + p[1]);
  }
  /** Open a { dataBase64, mimeType } RPC result in a new tab. */
  function openBlob(r) {
    var bin = atob(r.dataBase64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType || 'application/octet-stream' }));
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  /** Read an <input type=file> into the { fileName, mimeType, dataBase64 } upload shape (max 4 MB). */
  function readUpload(input) {
    return new Promise(function (resolve, reject) {
      var file = input && input.files && input.files[0];
      if (!file) return resolve(null);
      if (file.size > 4 * 1024 * 1024) return reject(new Error('That file is too large (max 4 MB).'));
      var reader = new FileReader();
      reader.onload = function () { resolve({ fileName: file.name, mimeType: file.type, dataBase64: String(reader.result).split(',')[1] || '' }); };
      reader.onerror = function () { reject(new Error('Could not read the file.')); };
      reader.readAsDataURL(file);
    });
  }
  function fileField(name, label, accept) {
    return '<div class="field"><label>' + esc(label) + '</label><input class="input" type="file" name="' + name + '" accept="' + (accept || 'image/jpeg,image/png,image/webp,application/pdf') + '"></div>';
  }
  function relTime(stamp) {
    if (!stamp) return '';
    var m = String(stamp).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return String(stamp);
    var dt = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    var diff = Math.round((Date.now() - dt.getTime()) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return diff + ' min ago';
    if (diff < 60 * 24) return Math.floor(diff / 60) + ' h ago';
    if (diff < 60 * 24 * 7) return Math.floor(diff / 1440) + ' d ago';
    return pretty(String(stamp).slice(0, 10));
  }

  function navItems() {
    var u = S.user || {};
    var items = [
      { id: 'home', label: 'Home', icon: 'home', mobile: 1 },
      { id: 'attendance', label: 'Attendance', icon: 'clock', mobile: 2 },
      { id: 'leave', label: 'Leave', icon: 'calendar', mobile: 3 }
    ];
    if (u.isManager) items.push({ id: 'approvals', label: 'Approvals', icon: 'inbox', mobile: 4, badge: S.pending || 0 });
    if (S.pendingSign) items.push({ id: 'signatures', label: 'To sign', icon: 'pen', badge: S.pendingSign });
    items.push({ id: 'people', label: 'People', icon: 'users', mobile: u.isManager ? 0 : 4 });
    items.push({ id: 'notices', label: 'Notices', icon: 'megaphone', badge: S.pendingAcks || 0 });
    items.push({ id: 'payslips', label: 'Payslips', icon: 'file' });
    items.push({ id: 'expenses', label: 'Expenses', icon: 'receipt' });
    items.push({ id: 'performance', label: 'Performance', icon: 'target' });
    items.push({ id: 'helpdesk', label: 'Helpdesk', icon: 'lifebuoy' });
    items.push({ id: 'exit', label: 'Resignation', icon: 'logout' });
    if (u.isManager) items.push({ id: 'reports', label: 'Reports', icon: 'chart' });
    if (u.isHR) items.push({ id: 'admin', label: 'Administration', icon: 'settings' });
    items.push({ id: 'me', label: 'My profile', icon: 'user', mobile: 5 });
    return items;
  }

  function go(route, params) {
    var hash = '#/' + route + (params && Object.keys(params).length
      ? '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '');
    if (window.location.hash === hash) render();
    else window.location.hash = hash;
  }

  function parseHash() {
    var h = String(window.location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('?');
    var route = parts[0] || 'home';
    var params = {};
    (parts[1] || '').split('&').filter(Boolean).forEach(function (kv) {
      var p = kv.split('=');
      params[p[0]] = decodeURIComponent(p[1] || '');
    });
    return { route: route, params: params };
  }

  /* ----------------------------------------------------------------- shell */
  function shellHtml() {
    var u = S.user;
    var items = navItems();
    var nav = items.map(function (i) {
      return '<button data-nav="' + i.id + '" class="' + (i.id === S.route ? 'on' : '') + '">' +
        icon(i.icon) + '<span>' + esc(i.label) + '</span>' +
        (i.badge ? '<span class="badge">' + i.badge + '</span>' : '') + '</button>';
    }).join('');

    var mob = items.filter(function (i) { return i.mobile; })
      .sort(function (a, b) { return a.mobile - b.mobile; }).slice(0, 5)
      .map(function (i) {
        return '<button data-nav="' + i.id + '" class="' + (i.id === S.route ? 'on' : '') + '">' +
          icon(i.icon) + '<span>' + esc(i.label.split(' ')[0]) + '</span></button>';
      }).join('');

    return '' +
      '<div class="layout">' +
      '  <aside class="sidebar' + (S.navOpen ? ' open' : '') + '" id="sidebar">' +
      '    <div class="brand">' + brandMark() + '<div class="name">AVP <span>HRIS</span></div></div>' +
      '    <nav class="nav">' + nav + '</nav>' +
      '    <div class="sidefoot" data-nav="me">' +
      '      <div class="avatar">' + esc(u.initials) + '</div>' +
      '      <div style="line-height:1.2;min-width:0">' +
      '        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(u.name) + '</div>' +
      '        <div style="font-size:11px;color:var(--n600)">' + esc(roleLabel(u.role)) + '</div>' +
      '      </div>' +
      '    </div>' +
      '  </aside>' +
      (S.navOpen ? '<div class="scrim" id="scrim"></div>' : '') +
      '  <div class="main">' +
      '    <header class="topbar noprint">' +
      '      <div class="title" id="page-title"></div>' +
      '      <div class="grow"></div>' +
      '      <button class="iconbtn" data-act="notifications" title="Notifications">' + icon('bell') +
      (S.notifCount ? '<span class="dot"></span>' : '') + '</button>' +
      '      <button class="btn btn-primary btn-sm" data-act="quick">Quick action ' + icon('arrow') + '</button>' +
      '    </header>' +
      '    <header class="mobhead noprint">' +
      '      <button class="iconbtn" id="burger">' + icon('menu') + '</button>' +
      '      <div class="brand" style="border:0;padding:0;height:auto">' + brandMark(16) +
      '        <div class="name" style="font-size:15px">AVP <span>HRIS</span></div></div>' +
      '      <div class="grow"></div>' +
      '      <button class="iconbtn" data-act="notifications">' + icon('bell') + (S.notifCount ? '<span class="dot"></span>' : '') + '</button>' +
      '      <div class="avatar sm" data-nav="me">' + esc(u.initials) + '</div>' +
      '    </header>' +
      '    <main class="view" id="view"></main>' +
      '  </div>' +
      '</div>' +
      '<nav class="mobnav noprint">' + mob + '</nav>';
  }

  function roleLabel(r) {
    return { EMPLOYEE: 'Employee', MANAGER: 'Manager', HR_ADMIN: 'HR admin', SUPER_ADMIN: 'Administrator' }[r] || 'Employee';
  }

  /* v1.6.0 — brand assets injected by Index.html (data URIs, no network). */
  function brandMark(px) {
    if (typeof BRAND_MARK !== 'undefined' && BRAND_MARK) return '<img class="logo-mark" src="' + BRAND_MARK + '" alt="" style="width:' + (px || 20) + 'px">';
    return '<div class="mark"' + (px ? ' style="width:' + px + 'px;height:' + px + 'px"' : '') + '></div>';
  }
  function brandLogo(width) {
    if (typeof BRAND_LOGO !== 'undefined' && BRAND_LOGO) return '<img src="' + BRAND_LOGO + '" alt="AVP Structural Consultants" style="width:' + (width || 200) + 'px;max-width:80vw;display:block">';
    return '<div class="brand"><div class="mark"></div><div class="name">AVP <span>HRIS</span></div></div>';
  }

  function wireShell() {
    document.querySelectorAll('[data-nav]').forEach(function (n) {
      n.addEventListener('click', function () { S.navOpen = false; go(n.getAttribute('data-nav')); });
    });
    var b = document.getElementById('burger');
    if (b) b.onclick = function () { S.navOpen = true; render(); };
    var sc = document.getElementById('scrim');
    if (sc) sc.onclick = function () { S.navOpen = false; render(); };
    document.querySelectorAll('[data-act]').forEach(function (n) {
      n.addEventListener('click', function () { handleAction(n.getAttribute('data-act'), n); });
    });
  }

  /** Global click delegation for elements rendered inside a view. */
  function delegate(container) {
    container.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-act]');
      if (!el || !container.contains(el)) return;
      handleAction(el.getAttribute('data-act'), el, ev);
    });
    container.addEventListener('change', function (ev) {
      var el = ev.target.closest('[data-change]');
      if (!el) return;
      handleAction(el.getAttribute('data-change'), el, ev);
    });
    container.addEventListener('submit', function (ev) {
      var el = ev.target.closest('form[data-submit]');
      if (!el) return;
      ev.preventDefault();
      handleAction(el.getAttribute('data-submit'), el, ev);
    });
  }

  function handleAction(act, el, ev) {
    var view = S.current;
    if (view && view.actions && view.actions[act]) return view.actions[act](el, ev);
    if (S.adminActive && S.adminActive.actions && S.adminActive.actions[act]) return S.adminActive.actions[act](el, ev);
    if (globalActions[act]) return globalActions[act](el, ev);
    console.warn('No handler for action ' + act);
  }

  var globalActions = {
    quick: function () { showQuickActions(); },
    notifications: function () { showNotifications(); },
    logout: function () { signOut(); },
    goto: function (el) { go(el.getAttribute('data-route'), JSON.parse(el.getAttribute('data-params') || '{}')); }
  };

  function showQuickActions() {
    modal({
      title: 'Quick action',
      body: '<div class="stack" style="gap:8px">' +
        '<button class="btn btn-secondary btn-block" data-qa="attendance" style="justify-content:flex-start">' + icon('clock') + ' Mark attendance</button>' +
        '<button class="btn btn-secondary btn-block" data-qa="leave-apply" style="justify-content:flex-start">' + icon('calendar') + ' Apply for leave</button>' +
        '<button class="btn btn-secondary btn-block" data-qa="regularize" style="justify-content:flex-start">' + icon('edit') + ' Regularize attendance</button>' +
        '<button class="btn btn-secondary btn-block" data-qa="compoff" style="justify-content:flex-start">' + icon('sun') + ' Claim compensatory off</button>' +
        '<button class="btn btn-secondary btn-block" data-qa="expense" style="justify-content:flex-start">' + icon('receipt') + ' Claim an expense</button>' +
        '<button class="btn btn-secondary btn-block" data-qa="ticket" style="justify-content:flex-start">' + icon('lifebuoy') + ' Ask HR / raise a ticket</button>' +
        '</div>',
      footer: null,
      onMount: function (root) {
        root.querySelectorAll('[data-qa]').forEach(function (b) {
          b.onclick = function () {
            var k = b.getAttribute('data-qa');
            close();
            if (k === 'attendance') go('attendance');
            if (k === 'leave-apply') go('leave', { tab: 'apply' });
            if (k === 'regularize') go('attendance', { tab: 'regularize' });
            if (k === 'compoff') go('leave', { tab: 'compoff' });
            if (k === 'expense') go('expenses', { action: 'new' });
            if (k === 'ticket') go('helpdesk', { action: 'new' });
          };
        });
      }
    });
  }

  function showNotifications() {
    api('notify.list').then(function (list) {
      modal({
        title: 'Notifications',
        body: list.length ? '<div class="list">' + list.map(function (n) {
          return '<div class="item" style="grid-template-columns:1fr">' +
            '<div><div class="t">' + esc(n.title) + '</div>' +
            '<div class="s">' + esc(n.body || '').replace(/\n/g, '<br>') + '</div>' +
            '<div class="tiny mt1">' + esc(n.at) + '</div></div></div>';
        }).join('') + '</div>' : '<div class="empty">Nothing new.</div>',
        footer: '<button class="btn btn-secondary" id="nt-close">Close</button>' +
          (list.length ? '<button class="btn btn-primary" id="nt-read">Mark all read</button>' : ''),
        onMount: function (root) {
          root.querySelector('#nt-close').onclick = close;
          var r = root.querySelector('#nt-read');
          if (r) r.onclick = function () { api('notify.read', { ids: [] }).then(function () { S.notifCount = 0; close(); render(); }); };
        }
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  /* ------------------------------------------------------------- rendering */
  function render() {
    if (!S.user) return renderLogin();
    var h = parseHash();
    S.route = h.route; S.params = h.params;
    if (S.route !== 'admin') S.adminActive = null;

    document.getElementById('app').innerHTML = shellHtml();
    wireShell();
    var host = document.getElementById('view');
    delegate(host);
    host.innerHTML = '<div class="stack" style="gap:10px;max-width:520px"><div class="skeleton" style="height:26px;width:40%"></div>' +
      '<div class="skeleton" style="height:14px;width:70%"></div><div class="skeleton" style="height:14px;width:55%"></div></div>';

    ensureRouteLoaded(S.route).then(function () {
      var view = S.views[S.route] || S.views.home;
      S.current = view;
      var title = document.getElementById('page-title');
      if (title) title.textContent = view.title || '';
      return Promise.resolve(view.render(S.params));
    })
      .then(function (html) {
        host.innerHTML = html;
        if (S.current.mount) S.current.mount(host, S.params);
      })
      .catch(function (e) {
        host.innerHTML = '<div class="panel"><h3>Something went wrong</h3><p class="muted">' + esc(e.message) + '</p>' +
          '<button class="btn btn-secondary" onclick="App.render()">Try again</button></div>';
      });
  }

  /* -------------------------------------------------------- lazy modules */
  /** Route -> the ViewsX.html module that must be loaded before it can render.
   *  Assets has no employee-facing route (only an admin tab), so it is not listed here. */
  var LAZY_VIEW_ROUTES = {
    /* Core views were inlined into the server-rendered page in the Apps Script
       build. On a static host every view is an ordinary file, so they all load
       on demand and the first paint ships only what the landing route needs. */
    home: 'ViewsHome', me: 'ViewsHome',
    attendance: 'ViewsAttendance', leave: 'ViewsLeave',
    people: 'ViewsPeople', approvals: 'ViewsPeople', reports: 'ViewsPeople',
    payslips: 'ViewsPayroll', performance: 'ViewsPerformance', exit: 'ViewsExit',
    expenses: 'ViewsExpenses', notices: 'ViewsNotices', helpdesk: 'ViewsHelpdesk',
    openings: 'ViewsRecruitment', signatures: 'ViewsLetters', sign: 'ViewsLetters'
  };
  /** Every module that can register an Administration tab. Loaded together, once,
   *  the first time the admin route is opened (regardless of which tab) so the
   *  tab list built from S.adminTabs is exactly as complete as it is today. */
  var ADMIN_LAZY_MODULES = ['ViewsAdmin', 'ViewsPayroll', 'ViewsPerformance', 'ViewsExit', 'ViewsExpenses', 'ViewsAssets', 'ViewsNotices', 'ViewsHelpdesk', 'ViewsRecruitment', 'ViewsLetters'];
  var _loadedModules = {};

  /** Fetches a deferred view's script from the server and runs it (which calls
   *  registerView/registerAdminTab exactly as it would have if it had been inlined
   *  at page load). Cached per module name; a failed load clears the cache entry
   *  so the next render() attempt (e.g. via the "Try again" button) retries it. */
  function loadModule(name) {
    if (_loadedModules[name]) return _loadedModules[name];
    var p = HRIS.loadViewModule(name).catch(function (e) { delete _loadedModules[name]; throw e; });
    _loadedModules[name] = p;
    return p;
  }

  function ensureRouteLoaded(route) {
    if (route === 'admin') return Promise.all(ADMIN_LAZY_MODULES.map(loadModule));
    // render() falls back to S.views.home for anything unrecognised, so Home
    // has to be on disk before that fallback can be taken.
    var mod = LAZY_VIEW_ROUTES[route] || 'ViewsHome';
    return loadModule(mod);
  }

  /** Warm the modules a person is most likely to open next while the browser is idle,
   *  one at a time so the server is never hit with a burst. */
  function prefetchModules() {
    var list = ['ViewsNotices', 'ViewsExpenses', 'ViewsHelpdesk', 'ViewsPayroll'];
    if (S.user && S.user.isHR) list.unshift('ViewsLetters');
    if (S.pendingSign) list.unshift('ViewsLetters');
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
    (function next() {
      var name = list.shift();
      if (!name || !S.token) return;
      idle(function () { if (!S.token) return; loadModule(name).catch(function () {}).then(function () { setTimeout(next, 400); }); });
    })();
  }

  /* ---------------------------------------------------------------- login */
  function loginArt() {
    return '  <div class="art">' +
      '    <div><div class="logo-card">' + brandLogo(230) + '</div></div>' +
      '    <div><h1>Human<br>Resource<br>Information<br>System.</h1>' +
      '      <p style="opacity:.75;max-width:420px;margin-top:16px">People, attendance, leave, payroll, letters and more — one place, on any device.</p></div>' +
      '    <div style="font-size:11px;opacity:.6">AVP HRIS · v' + esc((S.boot && S.boot.settings && S.boot.settings.appVersion) || (typeof APP_VERSION !== 'undefined' && APP_VERSION) || '1.6.0') + '</div>' +
      '  </div>';
  }

  function googleButton(label) {
    if (typeof GOOGLE_AUTH_URL === 'undefined' || !GOOGLE_AUTH_URL) return '';
    return '<a class="btn-google" href="' + GOOGLE_AUTH_URL + '" target="_top">' + (typeof GOOGLE_G !== 'undefined' ? GOOGLE_G : '') + '<span>' + esc(label || 'Continue with Google') + '</span></a>';
  }

  function renderLogin(message, kind) {
    var hasGoogle = typeof GOOGLE_AUTH_URL !== 'undefined' && !!GOOGLE_AUTH_URL;
    var hint = (typeof LOGIN_HINT !== 'undefined' && LOGIN_HINT) || '';
    var lastId = store.get('hris_last_id') || '';
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt() +
      '  <div class="form"><div class="box">' +
      '    <div class="kicker">Sign in</div>' +
      '    <h2 style="margin-bottom:6px">Welcome back.</h2>' +
      '    <p class="small muted" style="margin-bottom:18px">Sign in with your Google account (the AVP or personal address HR has on file) — no password needed.</p>' +
      (message ? '<div class="geo ' + (kind === 'ok' ? 'ok' : 'bad') + '" style="margin-bottom:16px">' + esc(message) + '</div>' : '') +
      (hasGoogle ? googleButton('Continue with Google') + '<div class="divider"><span>or use your employee code</span></div>' : '') +
      '    <form id="loginForm" autocomplete="on">' +
      '      <div class="field"><label>Employee code or email</label>' +
      '        <input class="input" name="identifier" autocomplete="username" placeholder="EMP095" autocapitalize="characters" value="' + esc(lastId) + '" required></div>' +
      '      <div class="field"><label>Password</label>' +
      '        <input class="input" type="password" name="password" autocomplete="current-password" required></div>' +
      '      <button class="btn btn-primary btn-xl" type="submit" id="loginBtn">Sign in</button>' +
      '    </form>' +
      '    <div class="spread mt2" style="font-size:13px"><a href="#" id="forgotLink">Forgot password?</a>' +
      '      <span class="small muted">Stays signed in on this device</span></div>' +
      (hint ? '<div class="hintbox mt3"><b>Password help.</b> ' + esc(hint) + '</div>' : '') +
      '  </div></div>' +
      '</div>';

    document.getElementById('forgotLink').onclick = function (ev) { ev.preventDefault(); renderForgot(document.querySelector('#loginForm [name=identifier]').value.trim()); };
    document.getElementById('loginForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var btn = document.getElementById('loginBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Signing in…';
      var identifier = f.identifier.value.trim();
      api('auth.login', {
        identifier: identifier,
        password: f.password.value,
        userAgent: navigator.userAgent
      }).then(function (res) {
        store.set('hris_last_id', identifier);
        return afterLogin(res);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Sign in';
        toast(e.message, 'err');
      });
    };
  }

  /** Common tail of every sign-in path (password, Google claim, password reset). */
  function afterLogin(res) {
    S.token = res.token; store.set('hris_token', res.token);
    store.del(SNAP_KEY);
    if (res.mustChangePassword) { S.user = res.user; return renderChangePassword(true); }
    if (res.needsOnboarding) { S.user = res.user; return renderOnboarding(true); }
    return start();
  }

  /* --------------------------------------------- forgot password (v1.6.0) */
  function renderForgot(prefill) {
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt() +
      '  <div class="form"><div class="box">' +
      '    <div class="kicker">Forgot password</div>' +
      '    <h2 style="margin-bottom:8px">Get a one-time code.</h2>' +
      '    <p class="small muted" style="margin-bottom:18px">We will email a 6-digit code to the address HR has on file for you. It works for 15 minutes.</p>' +
      '    <form id="fpForm">' +
      '      <div class="field"><label>Employee code or email</label>' +
      '        <input class="input" name="identifier" placeholder="EMP095" autocapitalize="characters" value="' + esc(prefill || '') + '" required></div>' +
      '      <button class="btn btn-primary btn-xl" type="submit" id="fpBtn">Email me a code</button>' +
      '    </form>' +
      '    <button class="btn btn-ghost mt2" id="fpBack">Back to sign in</button>' +
      (typeof GOOGLE_AUTH_URL !== 'undefined' && GOOGLE_AUTH_URL ? '<div class="divider"><span>or</span></div>' + googleButton('Skip passwords — continue with Google') : '') +
      '  </div></div></div>';
    document.getElementById('fpBack').onclick = function () { renderLogin(); };
    document.getElementById('fpForm').onsubmit = function (ev) {
      ev.preventDefault();
      var id = ev.target.identifier.value.trim();
      var btn = document.getElementById('fpBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';
      api('auth.requestReset', { identifier: id, userAgent: navigator.userAgent }).then(function (r) {
        renderResetCode(id, r);
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'Email me a code'; toast(e.message, 'err'); });
    };
  }

  function renderResetCode(identifier, info) {
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt() +
      '  <div class="form"><div class="box">' +
      '    <div class="kicker">Check your email</div>' +
      '    <h2 style="margin-bottom:8px">Enter the code.</h2>' +
      '    <p class="small muted" style="margin-bottom:18px">Sent to ' + esc((info && info.sentTo || []).join(', ') || 'your email') + '. Check the spam folder if it does not arrive within a minute.</p>' +
      '    <form id="rcForm">' +
      '      <div class="field"><label>6-digit code</label>' +
      '        <input class="input otp" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required></div>' +
      '      <div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="6" autocomplete="new-password" required></div>' +
      '      <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="6" autocomplete="new-password" required></div>' +
      '      <button class="btn btn-primary btn-xl" type="submit" id="rcBtn">Set password and sign in</button>' +
      '    </form>' +
      '    <div class="spread mt2" style="font-size:13px"><a href="#" id="rcResend">Send a new code</a><a href="#" id="rcBack">Back to sign in</a></div>' +
      '  </div></div></div>';
    document.getElementById('rcBack').onclick = function (ev) { ev.preventDefault(); renderLogin(); };
    document.getElementById('rcResend').onclick = function (ev) { ev.preventDefault(); renderForgot(identifier); };
    document.getElementById('rcForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target;
      if (f.newPassword.value !== f.confirm.value) return toast('The two new passwords do not match.', 'err');
      var btn = document.getElementById('rcBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
      api('auth.completeReset', { identifier: identifier, code: f.code.value.trim(), newPassword: f.newPassword.value, userAgent: navigator.userAgent })
        .then(function (res) { store.set('hris_last_id', identifier); toast('Password updated — you are signed in.', 'ok'); return afterLogin(res); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Set password and sign in'; toast(e.message, 'err'); });
    };
  }

  function renderChangePassword(forced) {
    document.getElementById('app').innerHTML =
      '<div class="login"><div class="art">' +
      '  <div><div class="logo-card">' + brandLogo(230) + '</div></div>' +
      '  <div><h1>Set your<br>password.</h1><p style="opacity:.75;max-width:400px;margin-top:14px">' +
      'Choose something only you know. You will use it every day to mark attendance.</p></div><div></div>' +
      '</div><div class="form"><div class="box">' +
      '  <div class="kicker">Security</div><h2 style="margin-bottom:18px">Change password</h2>' +
      '  <form id="cpForm">' +
      '    <div class="field"><label>Current password</label><input class="input" type="password" name="oldPassword" required></div>' +
      '    <div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="6" required></div>' +
      '    <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="6" required></div>' +
      '    <button class="btn btn-primary btn-xl" type="submit">Save and continue</button>' +
      '  </form>' +
      (forced ? '' : '<button class="btn btn-ghost mt2" onclick="App.go(\'me\')">Cancel</button>') +
      '</div></div></div>';

    document.getElementById('cpForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target;
      if (f.newPassword.value !== f.confirm.value) return toast('The two new passwords do not match.', 'err');
      api('auth.changePassword', { oldPassword: f.oldPassword.value, newPassword: f.newPassword.value })
        .then(function () { toast('Password updated.', 'ok'); return start(); })
        .catch(function (e) { toast(e.message, 'err'); });
    };
  }

  /* -------------------------------------------------------- onboarding UI */
  /**
   * Forced, full-page wizard shown once per employee — mirrors
   * renderChangePassword() structurally but gathers the digital equivalent
   * of AVP's paper Employee Information Form plus the document checklist.
   * Not dismissible while incomplete; see Api.gs's ONBOARDING_REQUIRED gate.
   */
  function renderOnboarding() {
    document.getElementById('app').innerHTML =
      '<div class="stack" id="onbRoot" style="min-height:100vh">' +
      '<div class="topbar noprint" style="justify-content:space-between">' +
      '<div class="brand" style="border:0;padding:0;height:auto">' + brandMark() +
      '<div class="name">AVP <span>HRIS</span></div></div>' +
      '<button class="btn btn-ghost btn-sm" id="onbSignOut">Sign out</button>' +
      '</div>' +
      '<div id="onbBody" style="max-width:840px;margin:0 auto;padding:32px 20px 100px;width:100%">' +
      '<div class="empty">Loading…</div></div></div>';
    var so = document.getElementById('onbSignOut');
    if (so) so.onclick = function () { signOut(); };
    loadOnboarding();
  }

  function loadOnboarding() {
    api('onboarding.myStatus').then(paintOnboarding).catch(function (e) { toast(e.message, 'err'); });
  }

  function obField(name, label, value, type, placeholder) {
    return '<div class="field"><label>' + esc(label) + '</label><input class="input" type="' + (type || 'text') +
      '" name="' + name + '" value="' + esc(value || '') + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '></div>';
  }

  function paintOnboarding(st) {
    var host = document.getElementById('onbBody');
    if (!host) return; // navigated away mid-request
    if (st.done) {
      host.innerHTML =
        '<div class="panel" style="text-align:center;padding:56px 24px">' +
        '<div class="kicker">All set</div><h1 style="margin:8px 0">You’re onboarded.</h1>' +
        '<p class="muted" style="max-width:440px;margin:0 auto 22px">Your details are on file. Any documents still pending review will be checked by HR — you don’t need to wait for that.</p>' +
        '<button class="btn btn-primary btn-xl" style="width:auto;padding-inline:32px" id="onbContinue">Continue to AVP HRIS</button>' +
        '</div>';
      document.getElementById('onbContinue').onclick = function () { start(); };
      return;
    }

    var p = st.profile;
    var missing = (st.missingProfile || []).concat(st.missingDocs || []);
    var missingBanner = missing.length
      ? '<div class="geo bad" style="margin-bottom:20px">Still needed: ' + missing.map(esc).join(', ') + '.</div>' : '';

    host.innerHTML =
      '<div class="kicker">Welcome' + (S.user && S.user.name ? ', ' + esc(S.user.name.split(' ')[0]) : '') + '</div>' +
      '<h1 style="margin:0 0 8px">Let’s get you set up.</h1>' +
      '<p class="muted" style="max-width:600px;margin-bottom:24px">Before you can mark attendance or apply for leave, we need a few details and a handful of documents — the same information AVP’s Employee Information Form asks for. This only takes a few minutes.</p>' +
      missingBanner +

      '<form id="onbForm">' +
      '<div class="sect"><h3>Personal &amp; statutory</h3></div>' +
      '<div class="grid2">' + obField('Nationality', 'Nationality', p.nationality) + obField('DateOfBirth', 'Date of birth', p.dateOfBirth, 'date') + '</div>' +
      '<div class="grid2">' + obField('PAN', 'PAN number', p.pan, 'text', 'ABCDE1234F') +
      '<div class="field"><label>Aadhaar number</label><input class="input" name="aadhaarNumber" placeholder="' +
      (p.aadhaarLast4 ? 'On file ending ' + esc(p.aadhaarLast4) + ' — leave blank to keep it' : '12-digit Aadhaar number') +
      '" maxlength="14"></div></div>' +
      obField('UAN', 'PF UAN (if you have one from a previous employer)', p.uan) +
      '<div class="field"><label>Permanent address</label><textarea class="input" name="PermanentAddress">' + esc(p.permanentAddress || '') + '</textarea></div>' +

      '<div class="sect mt4"><h3>Emergency contact</h3></div>' +
      '<div class="grid2">' + obField('EmergencyContactName', 'Name', p.emergencyName) + obField('EmergencyContactRelation', 'Relationship', p.emergencyRelation) + '</div>' +
      obField('EmergencyContactPhone', 'Contact number', p.emergencyPhone) +

      '<div class="sect mt4"><h3>Family details <span class="small muted" style="font-weight:400">(optional)</span></h3></div>' +
      '<div class="grid2">' + obField('FamilyMember1Name', 'Family member 1 — name', p.family1Name) + obField('FamilyMember1Relation', 'Relation', p.family1Relation) + '</div>' +
      obField('FamilyMember1Phone', 'Contact number', p.family1Phone) +
      '<div class="grid2 mt1">' + obField('FamilyMember2Name', 'Family member 2 — name', p.family2Name) + obField('FamilyMember2Relation', 'Relation', p.family2Relation) + '</div>' +
      obField('FamilyMember2Phone', 'Contact number', p.family2Phone) +

      '<div class="sect mt4"><h3>Bank details for payroll</h3></div>' +
      '<div class="grid2">' + obField('BankName', 'Bank name', p.bankName) + obField('BankAccountNumber', 'Account number', p.bankAccountNumber) + '</div>' +
      '<div class="grid2">' + obField('BankIFSC', 'IFSC code', p.bankIFSC, 'text', 'ABCD0123456') + obField('BankBranch', 'Branch', p.bankBranch) + '</div>' +
      obField('BankMMID', 'MMID (optional)', p.bankMMID) +

      '<div class="sect mt4"><h3>Education &amp; experience</h3></div>' +
      obField('Qualification', 'Educational qualification', p.qualification) +
      obField('PreviousExperience', 'Previous work experience', p.previousExperience) +
      obField('Skills', 'Special skills or certifications', p.skills) +

      '<button class="btn btn-primary btn-xl mt3" type="submit">Save my details</button>' +
      '</form>' +

      '<div class="sect mt4"><h3>Documents</h3></div>' +
      '<div class="panel tight small mt1" style="line-height:1.6">Upload clear photos or scans (JPG, PNG or PDF, up to 4 MB each). HR will review each one — you can carry on using AVP HRIS while that happens.</div>' +
      '<div id="onbDocs" class="mt2">' + docRows(st.documents) + '</div>';

    document.getElementById('onbForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var b = {};
      ['Nationality', 'DateOfBirth', 'PermanentAddress', 'EmergencyContactName', 'EmergencyContactRelation',
        'EmergencyContactPhone', 'FamilyMember1Name', 'FamilyMember1Relation', 'FamilyMember1Phone',
        'FamilyMember2Name', 'FamilyMember2Relation', 'FamilyMember2Phone', 'BankName', 'BankAccountNumber',
        'BankIFSC', 'BankBranch', 'BankMMID', 'PAN', 'UAN', 'Qualification', 'PreviousExperience', 'Skills'
      ].forEach(function (n) { b[n] = f[n] ? f[n].value : ''; });
      if (f.aadhaarNumber && f.aadhaarNumber.value.trim()) b.aadhaarNumber = f.aadhaarNumber.value.trim();
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      api('onboarding.submitProfile', b).then(function () {
        toast('Details saved.', 'ok');
        return loadOnboarding();
      }).catch(function (e) { btn.disabled = false; toast(e.message, 'err'); });
    };

    wireDocRows(document.getElementById('onbDocs'), null, function () { loadOnboarding(); });
  }

  /* ------------------------------------------------- document checklist (shared with 'me' profile + admin review) */
  var DOC_STATUS_LABEL = { NOT_UPLOADED: 'Not uploaded', PENDING_REVIEW: 'Pending review', VERIFIED: 'Verified', REJECTED: 'Needs re-upload' };
  var DOC_STATUS_TAG = { NOT_UPLOADED: 'tag-neutral', PENDING_REVIEW: 'tag-warn', VERIFIED: 'tag-ok', REJECTED: 'tag-err' };

  function docRows(list, opts) {
    opts = opts || {};
    return list.map(function (d) {
      var tag = '<span class="tag ' + (DOC_STATUS_TAG[d.status] || 'tag-neutral') + '">' + esc(DOC_STATUS_LABEL[d.status] || d.status) + '</span>';
      return '<div class="rowline" style="align-items:flex-start;flex-wrap:wrap;gap:10px;padding:14px 0">' +
        '<div class="grow" style="min-width:200px">' +
        '<div style="font-weight:600">' + esc(d.label) + (d.required ? '' : ' <span class="small muted">(optional)</span>') + '</div>' +
        '<div class="row wrap mt1" style="gap:8px;align-items:center">' + tag +
        (d.status === 'REJECTED' && d.verifyRemark ? '<span class="small muted">' + esc(d.verifyRemark) + '</span>' : '') +
        (d.fileName && d.status !== 'NOT_UPLOADED' ? '<span class="small muted mono">' + esc(d.fileName) + '</span>' : '') +
        '</div></div>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap">' +
        (d.documentId ? '<button class="btn btn-ghost btn-sm" data-doc-view="' + esc(d.documentId) + '">' + icon('download') + ' View</button>' : '') +
        (opts.canVerify && d.status === 'PENDING_REVIEW'
          ? '<button class="btn btn-secondary btn-sm" data-doc-verify="' + esc(d.documentId) + '">Verify</button>' +
          '<button class="btn btn-danger btn-sm" data-doc-reject="' + esc(d.documentId) + '">Reject</button>' : '') +
        '<label class="btn btn-secondary btn-sm" style="cursor:pointer">' + icon('plus') + ' ' + (d.status === 'NOT_UPLOADED' ? 'Upload' : 'Replace') +
        '<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-doc-input="' + esc(d.code) + '" style="display:none"></label>' +
        '</div></div>';
    }).join('');
  }

  function wireDocRows(root, employeeId, onChange) {
    root.querySelectorAll('[data-doc-input]').forEach(function (input) {
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { toast('That file is too large (max 4 MB).', 'err'); input.value = ''; return; }
        var reader = new FileReader();
        reader.onload = function () {
          var b64 = String(reader.result).split(',')[1] || '';
          api('onboarding.uploadDocument', {
            employeeId: employeeId || undefined, docType: input.getAttribute('data-doc-input'),
            fileName: file.name, mimeType: file.type, dataBase64: b64
          }).then(function () {
            toast('Uploaded — pending HR review.', 'ok');
            if (onChange) onChange();
          }).catch(function (e) { toast(e.message, 'err'); input.value = ''; });
        };
        reader.readAsDataURL(file);
      };
    });
    root.querySelectorAll('[data-doc-view]').forEach(function (btn) {
      btn.onclick = function () { viewDocument(btn.getAttribute('data-doc-view')); };
    });
    root.querySelectorAll('[data-doc-verify]').forEach(function (btn) {
      btn.onclick = function () {
        api('admin.verifyDocument', { documentId: btn.getAttribute('data-doc-verify'), decision: 'VERIFY' })
          .then(function () { toast('Verified.', 'ok'); if (onChange) onChange(); })
          .catch(function (e) { toast(e.message, 'err'); });
      };
    });
    root.querySelectorAll('[data-doc-reject]').forEach(function (btn) {
      btn.onclick = function () {
        prompt('Reject document', [{ name: 'remark', label: 'What needs to be fixed?', type: 'textarea' }], 'Reject').then(function (v) {
          if (!v) return;
          return api('admin.verifyDocument', { documentId: btn.getAttribute('data-doc-reject'), decision: 'REJECT', remark: v.remark })
            .then(function () { toast('Sent back for re-upload.', 'ok'); if (onChange) onChange(); });
        }).catch(function (e) { toast(e.message, 'err'); });
      };
    });
  }

  function viewDocument(documentId) {
    api('onboarding.downloadDocument', { documentId: documentId }).then(function (r) {
      var bin = atob(r.dataBase64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var blob = new Blob([bytes], { type: r.mimeType });
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  /** Reusable "Documents" modal — self re-upload from My profile, or HR review from Administration. */
  function showDocumentsModal(employeeId, canVerify) {
    modal({
      title: 'Documents', wide: true,
      body: '<div id="docsModalBody" class="empty">Loading…</div>',
      footer: '<button class="btn btn-secondary" data-close="btn">Close</button>',
      onMount: function (root) {
        api('onboarding.documents', { employeeId: employeeId }).then(function (list) {
          var dhost = root.querySelector('#docsModalBody');
          dhost.innerHTML = docRows(list, { canVerify: canVerify });
          wireDocRows(dhost, employeeId, function () { showDocumentsModal(employeeId, canVerify); });
        }).catch(function (e) { toast(e.message, 'err'); });
      }
    });
  }

  /* ------------------------------------------------------------ lifecycle */
  /**
   * v1.6.0 boot path. One RPC (app.session) instead of three, and — for a
   * returning user — an instant paint from the last snapshot kept in
   * localStorage while that RPC is in flight (stale-while-revalidate).
   */
  function applySession(sess) {
    S.boot = sess.boot; S.user = sess.boot.user;
    S.homePayload = sess.home || null;
    S.notifCount = (sess.notifications || []).length;
    if (sess.home) {
      S.pending = sess.home.pendingCount || 0;
      S.pendingAcks = sess.home.pendingAcks || 0;
      S.pendingSign = (sess.home.signRequests || []).length;
    }
  }

  function saveSnapshot(sess) {
    store.setJson(SNAP_KEY, { at: Date.now(), tokenTail: String(S.token).slice(-8), sess: sess });
  }

  function loadSnapshot() {
    var snap = store.getJson(SNAP_KEY);
    if (!snap || !snap.sess || !snap.sess.boot || !snap.sess.boot.user) return null;
    if (snap.tokenTail !== String(S.token).slice(-8)) return null;
    if (Date.now() - (snap.at || 0) > SNAP_MAX_AGE_MS) return null;
    return snap.sess;
  }

  function start() {
    return api('app.session').then(function (sess) {
      applySession(sess);
      saveSnapshot(sess);
      if (!window.location.hash) window.location.hash = '#/home';
      render();
      prefetchModules();
    });
  }

  /** Background refresh after an instant snapshot paint. */
  function refreshSession() {
    if (S.refreshing) return;
    S.refreshing = true;
    api('app.session').then(function (sess) {
      S.refreshing = false;
      var wasUser = S.user;
      applySession(sess);
      saveSnapshot(sess);
      // Re-render Home (and the shell badges) with fresh numbers; other views keep their own data.
      if (S.route === 'home' || !S.route) render();
      else if (wasUser && (wasUser.role !== S.user.role)) render();
      else syncShellBadges();
    }).catch(function (e) {
      S.refreshing = false;
      // SESSION_EXPIRED etc. are already handled inside api(); anything else is silent.
    });
  }

  function syncShellBadges() {
    // Cheap DOM patch instead of a full re-render.
    try {
      var items = navItems();
      document.querySelectorAll('.nav [data-nav]').forEach(function (btn) {
        var it = items.filter(function (i) { return i.id === btn.getAttribute('data-nav'); })[0];
        var badge = btn.querySelector('.badge');
        if (!it) return;
        if (it.badge && !badge) btn.insertAdjacentHTML('beforeend', '<span class="badge">' + it.badge + '</span>');
        else if (it.badge && badge) badge.textContent = it.badge;
        else if (!it.badge && badge) badge.remove();
      });
      var dots = document.querySelectorAll('[data-act="notifications"] .dot');
      if (S.notifCount && !dots.length) document.querySelectorAll('[data-act="notifications"]').forEach(function (b) { b.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); });
      if (!S.notifCount) dots.forEach(function (d) { d.remove(); });
    } catch (e) {}
  }

  function signOutLocal() { S.token = null; S.user = null; S.boot = null; S.homePayload = null; store.del('hris_token'); store.del(SNAP_KEY); }

  function signOut() {
    var t = S.token;
    signOutLocal();
    api('auth.logout', { token: t }).catch(function () {});
    window.location.hash = '';
    renderLogin('You have been signed out.', 'ok');
  }

  function boot() {
    window.addEventListener('hashchange', function () { if (S.user) render(); });

    // Standalone signing page (link from a "please sign" email) — no HRIS login involved.
    if (typeof SIGN_TOKEN !== 'undefined' && SIGN_TOKEN) {
      S.signMode = true;
      if (App.signStandalone) return App.signStandalone(SIGN_TOKEN);
      document.getElementById('app').innerHTML = '<div class="empty">The signing page could not be loaded. Please reload.</div>';
      return;
    }

    // Landing back from a completed Google sign-in: trade the one-time
    // claim code for a real session, then continue exactly like a normal
    // login response. See Auth.gs's claimGoogleSession().
    if (typeof GOOGLE_CLAIM_CODE !== 'undefined' && GOOGLE_CLAIM_CODE) {
      return api('auth.claimGoogleSession', { code: GOOGLE_CLAIM_CODE }).then(function (res) {
        if (res.user && res.user.code) store.set('hris_last_id', res.user.code);
        return afterLogin(res);
      }).catch(function (e) { renderLogin(e.message); });
    }

    var t = store.get('hris_token');
    if (!t) {
      var msg = typeof GOOGLE_LOGIN_ERROR !== 'undefined' ? (GOOGLE_LOGIN_ERROR || undefined) : undefined;
      return renderLogin(msg);
    }
    S.token = t;

    // Google-account link round trip lands here while signed in.
    if (typeof GOOGLE_LINKED !== 'undefined' && GOOGLE_LINKED) setTimeout(function () { toast('Google account linked: ' + GOOGLE_LINKED + '. You can now sign in with it.', 'ok', 6000); window.location.hash = '#/me'; }, 400);
    if (typeof GOOGLE_LINK_ERROR !== 'undefined' && GOOGLE_LINK_ERROR) setTimeout(function () { toast(GOOGLE_LINK_ERROR, 'err', 8000); }, 400);

    var snap = loadSnapshot();
    if (snap) {
      // Instant paint from the last known state, then refresh quietly.
      applySession(snap);
      if (!window.location.hash) window.location.hash = '#/home';
      render();
      refreshSession();
      prefetchModules();
      return;
    }
    start().catch(function (e) {
      // SESSION_EXPIRED / PASSWORD_CHANGE_REQUIRED / ONBOARDING_REQUIRED are routed by api() itself.
      if (['SESSION_EXPIRED', 'PASSWORD_CHANGE_REQUIRED', 'ONBOARDING_REQUIRED'].indexOf(e.code) !== -1) return;
      document.getElementById('app').innerHTML =
        '<div style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="panel" style="max-width:420px">' +
        brandLogo(160) + '<h3 class="mt3">Could not load AVP HRIS</h3><p class="muted">' + esc(e.message) + '</p>' +
        '<div class="row mt2"><button class="btn btn-primary" onclick="location.reload()">Try again</button>' +
        '<button class="btn btn-ghost" onclick="App.signOut()">Sign out</button></div></div></div>';
    });
  }

  return {
    S: S, api: api, boot: boot, render: render, go: go, esc: esc,
    toast: toast, modal: modal, close: close, confirm: confirmDialog, prompt: prompt,
    getPosition: getPosition, registerView: registerView, registerAdminTab: registerAdminTab,
    money: money, openBlob: openBlob, readUpload: readUpload, fileField: fileField, relTime: relTime,
    pretty: pretty, shortD: shortD, dow: dow, todayStr: todayStr, monthKey: monthKey,
    monthLabel: monthLabel, addMonthKey: addMonthKey, hm: hm, initials: initials, days: days,
    statusTag: statusTag, STATUS_LABEL: STATUS_LABEL, roleLabel: roleLabel,
    renderChangePassword: renderChangePassword, signOut: signOut, store: store,
    renderOnboarding: renderOnboarding, showDocumentsModal: showDocumentsModal,
    // v1.6.0
    brandLogo: brandLogo, brandMark: brandMark, refreshSession: refreshSession, loadModule: loadModule, icon: typeof icon === 'function' ? icon : null
  };
})();

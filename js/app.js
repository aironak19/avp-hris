/* ==========================================================================
   AVP HRIS — client core (v3.0)
   State, RPC bridge, router, shell, and the shared UI primitives used by the
   view modules. The public surface of v2 (App.*) is unchanged; v3 adds the
   grouped/collapsible sidebar, glass top bar with search, persona menu,
   notification drawer, quick-action menu, "View as", capability-aware
   navigation and a few visual helpers (spark, ring, countUp, confetti).
   ========================================================================== */
var App = (function () {

  var S = {
    token: null, user: null, boot: null, route: '', params: {},
    views: {}, current: null, loading: false, navOpen: false,
    adminTabs: [], adminActive: null, pendingAcks: 0,
    homePayload: null, pendingSign: 0, snapshotAt: 0, refreshing: false, signMode: false,
    // v3
    collapsed: false, viewAs: null, roles: [], caps: [], notifOpen: false, shellDrawn: false
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
  var SNAP_KEY = 'hris_snapshot_v3';
  var SNAP_MAX_AGE_MS = 12 * 3600 * 1000;
  S.collapsed = store.get('hris_sidebar') === 'collapsed';

  /* ----------------------------------------------------------------- rpc */
  function api(action, payload) {
    payload = payload || {};
    if (S.token) payload.token = S.token;
    if (S.viewAs && S.viewAs.employeeId && !payload.viewAs && action !== 'auth.logout') payload.viewAs = S.viewAs.employeeId;
    var sentToken = S.token;
    return new Promise(function (resolve, reject) {
      HRIS.transport(action, payload).then(function (res) {
        if (!res) return reject(new Error('No response from the server.'));
        if (res.ok) return resolve(res.data);
        var err = new Error(res.error || 'Something went wrong.');
        err.code = res.code; err.details = res.details;
        var current = sentToken && sentToken === S.token;
        if (res.code === 'SESSION_EXPIRED' && current) { signOutLocal(); renderLogin('Your session expired — please sign in again.'); }
        if (res.code === 'PASSWORD_CHANGE_REQUIRED' && current && !S.viewAs) { renderChangePassword(true); }
        if (res.code === 'ONBOARDING_REQUIRED' && current && !S.viewAs) { renderOnboarding(true); }
        if ((res.code === 'ONBOARDING_REQUIRED' || res.code === 'PASSWORD_CHANGE_REQUIRED') && S.viewAs) { err.message = 'This person still has to finish ' + (res.code === 'ONBOARDING_REQUIRED' ? 'onboarding' : 'setting a password') + ' — their screens are not available in preview.'; }
        if (res.code === 'VIEW_AS_READONLY') { toast(res.error || 'Read-only while viewing as someone else.', 'err'); }
        reject(err);
      }, function (e) { reject(new Error(e && e.message ? e.message : String(e))); });
    });
  }

  /* ------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function d(ymd) { if (!ymd) return null; var p = String(ymd).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function pretty(ymd) { var x = d(ymd); return x ? x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear() : '—'; }
  function shortD(ymd) { var x = d(ymd); return x ? x.getDate() + ' ' + MON[x.getMonth()] : '—'; }
  function dow(ymd) { var x = d(ymd); return x ? DOW[x.getDay()] : ''; }
  function todayStr() { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  function monthKey(ymd) { return String(ymd || todayStr()).slice(0, 7); }
  function monthLabel(k) { var p = String(k).split('-'); return MON[(+p[1]) - 1] + ' ' + p[0]; }
  function addMonthKey(k, n) { var p = String(k).split('-'); var dt = new Date(+p[0], (+p[1] - 1) + n, 1); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); }
  function hm(mins) { mins = Math.max(0, Math.round(mins || 0)); return Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm'; }
  function initials(n) {
    var p = String(n || '').replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function days(n) { return n === 1 ? '1 day' : (n + ' days'); }
  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function firstName(n) { return String(n || '').replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(/\s+/)[0] || ''; }

  var STATUS_LABEL = {
    PRESENT: 'Present', HALF_DAY: 'Half day', ABSENT: 'Absent', ON_LEAVE: 'On leave', HALF_DAY_LEAVE: 'Half leave',
    WEEKLY_OFF: 'Weekly off', HOLIDAY: 'Holiday', ON_DUTY: 'On duty', WFH: 'Work from home', MISSING_PUNCH: 'Missing punch', NOT_MARKED: '—'
  };
  var STATUS_TAG = {
    PRESENT: 'tag-ok', HALF_DAY: 'tag-warn', ABSENT: 'tag-err', ON_LEAVE: 'tag-accent', HALF_DAY_LEAVE: 'tag-accent',
    WEEKLY_OFF: 'tag-neutral', HOLIDAY: 'tag-neutral', ON_DUTY: 'tag-info', WFH: 'tag-info', MISSING_PUNCH: 'tag-warn', NOT_MARKED: 'tag-neutral',
    PENDING: 'tag-warn', APPROVED: 'tag-ok', REJECTED: 'tag-err', CANCELLED: 'tag-neutral', LAPSED: 'tag-neutral'
  };
  function statusTag(s) {
    return '<span class="tag ' + (STATUS_TAG[s] || 'tag-neutral') + '">' +
      esc(STATUS_LABEL[s] || String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); })) + '</span>';
  }
  function ic(name, size) { return typeof icon === 'function' ? icon(name, size) : ''; }

  /* --------------------------------------------------------------- toasts */
  function toast(msg, kind, ms) {
    var host = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = esc(msg);
    host.appendChild(el);
    if (kind === 'err' && navigator.vibrate) { try { navigator.vibrate([10, 30, 10]); } catch (e) {} }
    setTimeout(function () { el.classList.add('is-closing'); setTimeout(function () { el.remove(); }, 200); }, ms || (kind === 'err' ? 6000 : 3000));
  }

  /* --------------------------------------------------------------- modals */
  function modal(opts) {
    close(true);
    var root = document.getElementById('modal-root');
    root.innerHTML =
      '<div class="backdrop" data-close="1"><div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h4>' + esc(opts.title || '') + '</h4><button class="iconbtn" data-close="btn" aria-label="Close">' + ic('x') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer === null ? '' : '<div class="modal-foot">' + (opts.footer || '<button class="btn btn-secondary" data-close="btn">Close</button>') + '</div>') +
      '</div></div>';
    root.querySelectorAll('[data-close]').forEach(function (n) {
      var mode = n.getAttribute('data-close');
      n.addEventListener('click', function (ev) { if (mode === 'btn' || ev.target === n) close(); });
    });
    var first = root.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea, .modal-body button');
    if (first && !('ontouchstart' in window)) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 60);
    if (opts.onMount) opts.onMount(root);
    return root;
  }
  function close(immediate) {
    var root = document.getElementById('modal-root');
    var bd = root.querySelector('.backdrop');
    if (!bd || immediate) { root.innerHTML = ''; return; }
    bd.classList.add('is-closing');
    setTimeout(function () { if (bd.parentNode === root) root.innerHTML = ''; }, 170);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.querySelector('#modal-root .backdrop:not(.is-closing)')) close();
  });

  function confirmDialog(title, message, confirmLabel, danger) {
    return new Promise(function (resolve) {
      modal({
        title: title, body: '<div style="font-size:14px;line-height:1.55">' + message + '</div>',
        footer: '<button class="btn btn-secondary" id="cf-no">Cancel</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="cf-yes">' + esc(confirmLabel || 'Confirm') + '</button>',
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
        if (f.type === 'textarea') return '<div class="field"><label>' + esc(f.label) + '</label><textarea class="input" name="' + f.name + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea></div>';
        if (f.type === 'select') return '<div class="field"><label>' + esc(f.label) + '</label><select class="input" name="' + f.name + '">' +
          f.options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select></div>';
        return '<div class="field"><label>' + esc(f.label) + '</label><input class="input" type="' + (f.type || 'text') + '" name="' + f.name + '" value="' + esc(f.value || '') + '" placeholder="' + esc(f.placeholder || '') + '"></div>';
      }).join('');
      modal({
        title: title, body: '<form id="pf">' + body + '</form>',
        footer: '<button class="btn btn-secondary" id="p-no">Cancel</button><button class="btn btn-primary" id="p-yes">' + esc(submitLabel || 'Save') + '</button>',
        onMount: function (root) {
          root.querySelector('#p-no').onclick = function () { close(); resolve(null); };
          var submit = function () { var out = {}; root.querySelectorAll('#pf [name]').forEach(function (i) { out[i.name] = i.value; }); close(); resolve(out); };
          root.querySelector('#p-yes').onclick = submit;
          root.querySelector('#pf').onsubmit = function (ev) { ev.preventDefault(); submit(); };
        }
      });
    });
  }

  /* ------------------------------------------------------------ geolocation */
  function getPosition(opts) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('This browser cannot share your location. Please use Chrome or Safari on your phone.'));
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
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
  function registerAdminTab(def) { S.adminTabs.push(def); return def; }

  /* ------------------------------------------------------- shared helpers */
  function money(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100, neg = v < 0; v = Math.abs(v);
    var p = v.toFixed(2).split('.'), s = p[0], last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    return (neg ? '-' : '') + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3 + (p[1] === '00' ? '' : '.' + p[1]);
  }
  function openBlob(r) {
    var bin = atob(r.dataBase64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType || 'application/octet-stream' }));
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
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

  /* ---- v3 visual helpers (used by the redesigned screens) ---- */
  /** Inline sparkline. values: number[]; opts: { cls, h } */
  function spark(values, opts) {
    opts = opts || {};
    var vals = (values || []).map(Number).filter(function (v) { return !isNaN(v); });
    if (vals.length < 2) vals = [0, 0];
    var w = 100, h = opts.h || 36, max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), span = (max - min) || 1;
    var pts = vals.map(function (v, i) { return [(i / (vals.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]; });
    var dd = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var id = 'sf' + Math.random().toString(36).slice(2, 7);
    var stroke = opts.color || 'var(--accent)';
    return '<svg class="spark ' + (opts.cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + stroke + '" stop-opacity=".35"/><stop offset="1" stop-color="' + stroke + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + dd + ' L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="url(#' + id + ')"/>' +
      '<path class="l" d="' + dd + '" style="stroke:' + stroke + '"/></svg>';
  }
  /** Progress ring. pct 0..100; inner html in the middle. */
  function ring(pct, inner, cls) {
    var r = 66, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct || 0)) / 100);
    return '<div class="ring ' + (cls || '') + '"><svg viewBox="0 0 156 156"><circle class="track" cx="78" cy="78" r="' + r + '"/>' +
      '<circle class="prog" cx="78" cy="78" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
      '<div class="in"><div>' + (inner || '') + '</div></div></div>';
  }
  /** Animate numbers inside [data-countup] elements within root. */
  function countUp(root) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    (root || document).querySelectorAll('[data-countup]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-countup')), dec = (String(el.getAttribute('data-countup')).split('.')[1] || '').length;
      if (isNaN(target) || el.__counted) return;
      el.__counted = true;
      var start = performance.now(), dur = 720, from = 0;
      (function tick(now) {
        var t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
        el.textContent = (from + (target - from) * e).toFixed(dec);
        if (t < 1) requestAnimationFrame(tick); else el.textContent = target.toFixed(dec);
      })(start);
    });
  }
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function confetti(n) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var host = document.createElement('div'); host.className = 'confetti';
    var colors = ['#ec3013', '#f5b41f', '#2eb5b7', '#8dbf2e', '#b08fc7', '#f28c1b'];
    for (var i = 0; i < (n || 60); i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw'; p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 350) + 'ms'; p.style.animationDuration = (1200 + Math.random() * 900) + 'ms';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(function () { host.remove(); }, 2600);
  }
  function emptyState(iconName, text) { return '<div class="empty"><div class="ei">' + ic(iconName || 'inbox') + '</div>' + esc(text || 'Nothing here yet.') + '</div>'; }
  function pageHead(title, sub, actions, kicker) {
    return '<div class="page-head"><div>' + (kicker ? '<div class="kicker">' + esc(kicker) + '</div>' : '') + '<h1>' + esc(title) + '</h1>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' + (actions ? '<div class="row wrap">' + actions + '</div>' : '') + '</div>';
  }

  /* --------------------------------------------------------- capabilities */
  function can(cap) {
    var u = S.user || {};
    if (u.caps && u.caps.length) return u.caps.indexOf(cap) !== -1 || u.caps.indexOf('*') !== -1;
    // Fallback for a backend that predates Roles.gs: derive from the rank flags.
    var lvl = /\.(manage|review|settings|audit|roles|viewAs)$/.test(cap) ? 2 : /\.(approve|team|view)$/.test(cap) && cap !== 'people.view' && cap !== 'notices.view' ? 1 : 0;
    if (cap === 'reports.view') lvl = 1;
    if (/^admin\.(roles|viewAs)$/.test(cap)) lvl = 3;
    return lvl === 0 || (lvl === 1 && u.isManager) || (lvl === 2 && u.isHR) || (lvl === 3 && u.isAdmin);
  }
  function canAny(list) { return list.some(can); }
  function hasAdminAccess() {
    return !!(S.user && (S.user.isHR || canAny(['people.manage', 'attendance.manage', 'leave.manage', 'payroll.manage', 'performance.manage', 'expenses.manage',
      'helpdesk.manage', 'notices.manage', 'assets.manage', 'recruitment.manage', 'letters.manage', 'exit.manage', 'onboarding.review', 'admin.settings', 'admin.audit', 'admin.roles'])));
  }

  function navGroups() {
    var u = S.user || {};
    var approver = u.isManager || canAny(['leave.approve', 'expenses.approve', 'attendance.team']);
    var groups = [
      { label: 'Workspace', items: [
        { id: 'home', label: 'Home', icon: 'home', mobile: 1 },
        { id: 'attendance', label: 'Attendance', icon: 'clock', mobile: 2 },
        { id: 'leave', label: 'Leave', icon: 'calendar', mobile: 3 }
      ] },
      { label: 'People', items: [
        { id: 'people', label: 'People', icon: 'users', mobile: approver ? 0 : 4 },
        { id: 'notices', label: 'Notices', icon: 'megaphone', badge: S.pendingAcks || 0 },
        { id: 'helpdesk', label: 'Helpdesk', icon: 'lifebuoy' }
      ] },
      { label: 'Pay & growth', items: [
        { id: 'payslips', label: 'Payslips', icon: 'file' },
        { id: 'expenses', label: 'Expenses', icon: 'receipt' },
        { id: 'performance', label: 'Performance', icon: 'target' }
      ] },
      { label: 'Organisation', items: [] },
      { label: 'Me', items: [
        { id: 'exit', label: 'Resignation', icon: 'logout' },
        { id: 'me', label: 'My profile', icon: 'user', mobile: 5 }
      ] }
    ];
    if (approver) groups[0].items.push({ id: 'approvals', label: 'Approvals', icon: 'inbox', mobile: 4, badge: S.pending || 0 });
    if (S.pendingSign) groups[0].items.push({ id: 'signatures', label: 'To sign', icon: 'pen', badge: S.pendingSign });
    if (u.isManager || can('reports.view') || can('attendance.team')) groups[3].items.push({ id: 'reports', label: 'Reports', icon: 'chart' });
    if (hasAdminAccess()) groups[3].items.push({ id: 'admin', label: 'Administration', icon: 'settings' });
    return groups.filter(function (g) { return g.items.length; });
  }
  function navItems() { return navGroups().reduce(function (a, g) { return a.concat(g.items); }, []); }
  function routeMeta(route) {
    var it = navItems().filter(function (i) { return i.id === route; })[0];
    var extra = { sign: { label: 'Sign document', icon: 'pen' }, signatures: { label: 'Documents to sign', icon: 'pen' }, openings: { label: 'Job openings', icon: 'briefcase' }, reports: { label: 'Reports', icon: 'chart' }, approvals: { label: 'Approvals', icon: 'inbox' }, admin: { label: 'Administration', icon: 'settings' } };
    return it || extra[route] || { label: route, icon: 'home' };
  }

  function go(route, params) {
    var hash = '#/' + route + (params && Object.keys(params).length ? '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '');
    if (window.location.hash === hash) render(); else window.location.hash = hash;
  }
  function parseHash() {
    var h = String(window.location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('?'), route = parts[0] || 'home', params = {};
    (parts[1] || '').split('&').filter(Boolean).forEach(function (kv) { var p = kv.split('='); params[p[0]] = decodeURIComponent(p[1] || ''); });
    return { route: route, params: params };
  }

  /* ----------------------------------------------------------------- shell */
  function navButton(i, mobile) {
    return '<button data-nav="' + i.id + '" data-tip="' + esc(i.label) + '" class="' + (i.id === S.route ? 'on' : '') + '" aria-current="' + (i.id === S.route ? 'page' : 'false') + '">' +
      ic(i.icon) + '<span>' + esc(mobile ? i.label.split(' ')[0] : i.label) + '</span>' +
      (i.badge && !mobile ? '<span class="badge">' + i.badge + '</span>' : '') + (i.pill && !mobile ? '<span class="pill">' + esc(i.pill) + '</span>' : '') + '</button>';
  }
  function shellHtml() {
    var u = S.user, groups = navGroups(), items = navItems();
    var nav = groups.map(function (g) { return '<div class="nav-label">' + esc(g.label) + '</div>' + g.items.map(function (i) { return navButton(i, false); }).join(''); }).join('');
    var mob = items.filter(function (i) { return i.mobile; }).sort(function (a, b) { return a.mobile - b.mobile; }).slice(0, 5).map(function (i) { return navButton(i, true); }).join('');
    var sideCard = sideCardHtml();
    var meta = routeMeta(S.route);
    var roleName = u.roleName || roleLabel(u.role);
    var viewAsBar = S.viewAs ? '<div class="viewas-bar noprint">' + ic('eye') + '<span>Viewing as <b>' + esc(S.viewAs.name) + '</b> (' + esc(S.viewAs.roleName || roleLabel(S.viewAs.role)) + ') — read only. Nothing you do here is saved.</span>' +
      '<button class="btn btn-sm btn-dark" data-act="exitViewAs">Exit preview</button></div>' : '';

    return '' +
      '<div class="layout' + (S.collapsed ? ' collapsed' : '') + '">' +
      '  <aside class="sidebar' + (S.navOpen ? ' open' : '') + '" id="sidebar">' +
      '    <div class="brand" data-nav="home" style="cursor:pointer">' + brandMark(34) + '<div class="name">AVP <span>HRIS</span><small>' + esc((S.boot && S.boot.settings && S.boot.settings.orgName) || (typeof ORG_NAME !== 'undefined' ? ORG_NAME : 'AVP')) + '</small></div></div>' +
      '    <nav class="nav">' + nav + '</nav>' + sideCard +
      '    <div class="sidefoot" data-act="persona"><div class="avatar">' + esc(u.initials) + '</div><div class="who"><b>' + esc(u.name) + '</b><small>' + esc(roleName) + '</small></div>' + ic('chevron') + '</div>' +
      '    <button class="collapse-btn" data-act="collapse" title="Collapse sidebar">' + ic('collapse') + '<span>Collapse</span></button>' +
      '  </aside>' +
      (S.navOpen ? '<div class="scrim" id="scrim"></div>' : '') +
      '  <div class="main">' +
      '    <header class="topbar noprint">' +
      '      <div class="crumbs"><span>AVP HRIS</span>' + ic('chevron') + '<b id="page-title">' + esc(meta.label) + '</b></div>' +
      '      <button class="search" data-act="palette" aria-label="Search">' + ic('search') + '<span>Search people, screens, actions…</span><kbd>⌘K</kbd></button>' +
      '      <div class="grow" style="max-width:20px"></div>' +
      '      <button class="iconbtn" data-act="theme" title="Theme" aria-label="Theme">' + ic('sun') + '</button>' +
      '      <button class="iconbtn" data-act="notifications" title="Notifications" aria-label="Notifications">' + ic('bell') + (S.notifCount ? '<span class="dot"></span>' : '') + '</button>' +
      '      <div class="menu-anchor"><button class="btn btn-primary btn-sm" data-act="quick">' + ic('plus') + ' Quick action</button></div>' +
      '      <div class="menu-anchor"><button class="persona" data-act="persona"><div class="avatar sm">' + esc(u.initials) + '</div><div class="who"><b>' + esc(u.name) + '</b><small>' + esc(roleName) + '</small></div>' + ic('chevron') + '</button></div>' +
      '    </header>' +
      '    <header class="mobhead noprint">' +
      '      <button class="iconbtn" id="burger" aria-label="Menu">' + ic('menu') + '</button>' +
      '      <div class="brand" style="border:0;padding:0;height:auto;gap:8px">' + brandMark(24) + '<div class="name" style="font-size:15px">AVP <span>HRIS</span></div></div>' +
      '      <div class="grow"></div>' +
      '      <button class="iconbtn" data-act="palette" aria-label="Search">' + ic('search') + '</button>' +
      '      <button class="iconbtn" data-act="notifications" aria-label="Notifications">' + ic('bell') + (S.notifCount ? '<span class="dot"></span>' : '') + '</button>' +
      '      <div class="avatar sm" data-act="persona">' + esc(u.initials) + '</div>' +
      '    </header>' + viewAsBar +
      '    <main class="view" id="view"></main>' +
      '  </div>' +
      '</div>' +
      '<nav class="mobnav noprint">' + mob + '</nav>';
  }
  function sideCardHtml() {
    var h = S.homePayload || {};
    var todayAtt = h.attendance || null;
    if (S.pending) return '<div class="side-card"><b>' + S.pending + ' item' + (S.pending === 1 ? '' : 's') + ' need you</b><p>Approvals, signatures and claims waiting for a decision.</p><button class="btn btn-sm" data-nav="approvals">Open inbox →</button></div>';
    if (todayAtt && !todayAtt.checkInAt && !todayAtt.checkedIn && S.route !== 'attendance') return '<div class="side-card"><b>Not checked in yet</b><p>Mark your attendance for today from the punch screen.</p><button class="btn btn-sm" data-nav="attendance">Check in →</button></div>';
    var bal = h.leave && (h.leave.available !== undefined ? h.leave.available : h.leave.balance);
    if (bal !== undefined && bal !== null) return '<div class="side-card"><b>' + esc(bal) + ' days of leave left</b><p>' + esc(h.financialYear ? 'Financial year ' + h.financialYear : 'Plan your time off early.') + '</p><button class="btn btn-sm" data-nav="leave">Apply →</button></div>';
    return '';
  }
  function roleLabel(r) { return { EMPLOYEE: 'Employee', MANAGER: 'Manager', HR_ADMIN: 'HR admin', SUPER_ADMIN: 'Administrator' }[r] || (S.roles || []).filter(function (x) { return x.roleId === r; }).map(function (x) { return x.name; })[0] || 'Employee'; }
  function brandMark(px) {
    if (typeof BRAND_MARK !== 'undefined' && BRAND_MARK) return '<img class="logo-mark" src="' + BRAND_MARK + '" alt="" style="width:' + (px || 34) + 'px;height:' + (px || 34) + 'px">';
    return '<div class="mark"' + (px ? ' style="width:' + px + 'px;height:' + px + 'px"' : '') + '></div>';
  }
  function brandLogo(width) {
    if (typeof BRAND_LOGO !== 'undefined' && BRAND_LOGO) return '<img src="' + BRAND_LOGO + '" alt="AVP Structural Consultants" style="width:' + (width || 200) + 'px;max-width:80vw;display:block">';
    return '<div class="brand"><div class="mark"></div><div class="name">AVP <span>HRIS</span></div></div>';
  }

  function wireShell() {
    document.querySelectorAll('[data-nav]').forEach(function (n) {
      n.addEventListener('click', function (ev) { ev.stopPropagation(); S.navOpen = false; go(n.getAttribute('data-nav')); });
      n.addEventListener('mouseenter', function () { var m = HRIS.moduleForRoute && HRIS.moduleForRoute(n.getAttribute('data-nav')); if (m) loadModule(m).catch(function () {}); });
    });
    var b = document.getElementById('burger');
    if (b) b.onclick = function () { S.navOpen = true; render({ shellOnly: true }); };
    var sc = document.getElementById('scrim');
    if (sc) sc.onclick = function () { S.navOpen = false; render({ shellOnly: true }); };
    document.querySelectorAll('.topbar [data-act], .mobhead [data-act], .sidebar [data-act], .viewas-bar [data-act]').forEach(function (n) {
      n.addEventListener('click', function (ev) { ev.stopPropagation(); handleAction(n.getAttribute('data-act'), n, ev); });
    });
  }
  function delegate(container) {
    container.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-act]');
      if (!el || !container.contains(el)) return;
      handleAction(el.getAttribute('data-act'), el, ev);
    });
    container.addEventListener('change', function (ev) {
      var el = ev.target.closest('[data-change]'); if (!el) return;
      handleAction(el.getAttribute('data-change'), el, ev);
    });
    container.addEventListener('submit', function (ev) {
      var el = ev.target.closest('form[data-submit]'); if (!el) return;
      ev.preventDefault(); handleAction(el.getAttribute('data-submit'), el, ev);
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
    quick: function (el) { showQuickActions(el); },
    notifications: function () { showNotifications(); },
    logout: function () { signOut(); },
    goto: function (el) { go(el.getAttribute('data-route'), JSON.parse(el.getAttribute('data-params') || '{}')); },
    palette: function () { if (window.HRIS && HRIS.palette) HRIS.palette.open(); },
    theme: function (el, ev) { if (window.HRIS && HRIS.theme) HRIS.theme.cycle(ev); },
    collapse: function () { S.collapsed = !S.collapsed; store.set('hris_sidebar', S.collapsed ? 'collapsed' : 'open'); var l = document.querySelector('.layout'); if (l) l.classList.toggle('collapsed', S.collapsed); },
    persona: function (el) { showPersonaMenu(el); },
    exitViewAs: function () { exitViewAs(); },
    viewAs: function () { pickViewAs(); }
  };

  /* --------------------------------------------------------------- menus */
  function closeMenus() { document.querySelectorAll('.menu').forEach(function (m) { m.remove(); }); document.removeEventListener('click', closeMenus); }
  function openMenu(anchor, html, align) {
    closeMenus();
    var m = document.createElement('div'); m.className = 'menu'; m.innerHTML = html;
    var r = anchor.getBoundingClientRect();
    var mobile = window.innerWidth <= 900;
    m.style.position = 'fixed';
    m.style.top = (r.bottom + 8) + 'px';
    if (align === 'left') m.style.left = Math.max(8, r.left) + 'px'; else m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    if (mobile) { m.style.left = '8px'; m.style.right = '8px'; }
    document.body.appendChild(m);
    m.addEventListener('click', function (ev) { ev.stopPropagation(); var b = ev.target.closest('[data-menu]'); if (!b) return; closeMenus(); menuActions[b.getAttribute('data-menu')] && menuActions[b.getAttribute('data-menu')](b); });
    setTimeout(function () { document.addEventListener('click', closeMenus); }, 0);
    return m;
  }
  var menuActions = {
    attendance: function () { go('attendance'); },
    'leave-apply': function () { go('leave', { tab: 'apply' }); },
    regularize: function () { go('attendance', { tab: 'regularize' }); },
    compoff: function () { go('leave', { tab: 'compoff' }); },
    expense: function () { go('expenses', { action: 'new' }); },
    ticket: function () { go('helpdesk', { action: 'new' }); },
    refer: function () { go('openings'); },
    me: function () { go('me'); },
    password: function () { renderChangePassword(false); },
    theme: function (b) { HRIS.theme && HRIS.theme.cycle(); },
    density: function () { var cur = document.documentElement.getAttribute('data-density'); var next = cur === 'comfortable' ? '' : 'comfortable'; if (next) document.documentElement.setAttribute('data-density', next); else document.documentElement.removeAttribute('data-density'); store.set('hris_density', next); toast(next ? 'Comfortable spacing' : 'Compact spacing', 'ok', 1400); },
    shortcuts: function () { showShortcuts(); },
    viewas: function () { pickViewAs(); },
    admin: function () { go('admin'); },
    signout: function () { signOut(); },
    refresh: function () { refreshSession(true); },
    install: function () { HRIS.pwa && HRIS.pwa.install(); }
  };
  function mi(key, iconName, label, kbd, cls) { return '<button class="mi ' + (cls || '') + '" data-menu="' + key + '">' + ic(iconName) + '<span>' + esc(label) + '</span>' + (kbd ? '<span class="kbd">' + esc(kbd) + '</span>' : '') + '</button>'; }
  function showQuickActions(anchor) {
    var html = '<div class="mh">Quick action</div>' +
      mi('attendance', 'clock', 'Mark attendance', 'g a') + mi('leave-apply', 'calendar', 'Apply for leave', 'g l') +
      mi('regularize', 'edit', 'Regularize attendance') + mi('compoff', 'sun', 'Claim compensatory off') +
      mi('expense', 'receipt', 'Claim an expense') + mi('ticket', 'lifebuoy', 'Ask HR / raise a ticket') + mi('refer', 'briefcase', 'Refer a candidate');
    openMenu(anchor, html, 'right');
  }
  function showPersonaMenu(anchor) {
    var u = S.user || {};
    var html = '<div class="mh">' + esc(u.name) + ' · ' + esc(u.roleName || roleLabel(u.role)) + '</div>' +
      mi('me', 'user', 'My profile') + mi('password', 'shield', 'Change password') +
      (HRIS.pwa && HRIS.pwa.offer() ? '<div class="msep"></div>' + mi('install', 'appinstall', 'Install the app') : '') +
      '<div class="msep"></div>' + mi('theme', 'sun', 'Switch theme') + mi('density', 'sliders', 'Toggle spacing') + mi('shortcuts', 'command', 'Keyboard shortcuts', '?') +
      (can('admin.viewAs') || u.isAdmin ? '<div class="msep"></div>' + mi('viewas', 'eye', 'View as someone…') : '') +
      (hasAdminAccess() ? mi('admin', 'settings', 'Administration') : '') +
      '<div class="msep"></div>' + mi('refresh', 'refresh', 'Refresh data') + mi('signout', 'logout', 'Sign out', '', 'danger');
    openMenu(anchor, html, 'right');
  }
  function showShortcuts() {
    var rows = [['⌘ K', 'Search & commands'], ['/', 'Search'], ['g h', 'Home'], ['g a', 'Attendance'], ['g l', 'Leave'], ['g p', 'People'], ['g i', 'Approvals inbox'], ['g m', 'My profile'], ['n', 'Quick action'], ['t', 'Toggle theme'], ['[', 'Collapse sidebar'], ['?', 'This sheet'], ['esc', 'Close dialog']];
    modal({ title: 'Keyboard shortcuts', body: '<div class="shortcuts">' + rows.map(function (r) { return '<div><span>' + esc(r[1]) + '</span><span>' + r[0].split(' ').map(function (k) { return '<span class="kbd">' + esc(k) + '</span>'; }).join('') + '</span></div>'; }).join('') + '</div>' });
  }

  /* ------------------------------------------------------- notifications */
  function showNotifications() {
    var bd = document.createElement('div'); bd.className = 'drawer-backdrop';
    var dr = document.createElement('div'); dr.className = 'drawer';
    dr.innerHTML = '<div class="drawer-head"><h4>Notifications</h4><button class="iconbtn sm" data-x="1">' + ic('x') + '</button></div><div class="drawer-body"><div class="empty"><span class="spinner"></span></div></div>' +
      '<div class="drawer-foot"><button class="btn btn-secondary btn-sm" data-x="1">Close</button><button class="btn btn-primary btn-sm hide" id="nt-read">Mark all read</button></div>';
    document.body.appendChild(bd); document.body.appendChild(dr);
    function closeDrawer() { dr.classList.add('is-closing'); setTimeout(function () { bd.remove(); dr.remove(); }, 180); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') closeDrawer(); }
    document.addEventListener('keydown', onKey);
    bd.onclick = closeDrawer;
    dr.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = closeDrawer; });
    api('notify.list').then(function (list) {
      var body = dr.querySelector('.drawer-body');
      var kindIcon = { WARN: 'alert', INFO: 'info', OK: 'check', LEAVE: 'calendar', ATTENDANCE: 'clock' };
      body.innerHTML = list.length ? '<div class="stagger">' + list.map(function (n) {
        var k = String(n.kind || '').toUpperCase();
        return '<div class="notif"><div class="ic ' + (k === 'WARN' ? 'warn' : k === 'OK' ? 'ok' : '') + '">' + ic(kindIcon[k] || 'bell') + '</div><div><div class="t">' + esc(n.title) + '</div>' +
          '<div class="s">' + esc(n.body || '').replace(/\n/g, '<br>') + '</div><div class="when">' + esc(relTime(n.at)) + '</div></div></div>';
      }).join('') + '</div>' : emptyState('bell', 'You are all caught up.');
      var r = dr.querySelector('#nt-read');
      if (list.length) { r.classList.remove('hide'); r.onclick = function () { r.classList.add('is-busy'); api('notify.read', { ids: [] }).then(function () { S.notifCount = 0; syncShellBadges(); closeDrawer(); toast('All read.', 'ok', 1400); }).catch(function (e) { r.classList.remove('is-busy'); toast(e.message, 'err'); }); }; }
    }).catch(function (e) { dr.querySelector('.drawer-body').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }

  /* --------------------------------------------------------------- view as */
  function pickViewAs() {
    api('people.picklist').then(function (list) {
      var people = Array.isArray(list) ? list : [];
      modal({
        title: 'View the app as…',
        body: '<p class="small muted" style="margin-top:0">Preview exactly what a person sees, based on their role and permissions. Everything is read only while previewing.</p>' +
          '<input class="input" id="va-q" placeholder="Search by name, code or department" autocomplete="off">' +
          '<div id="va-list" class="list mt2" style="max-height:48vh;overflow:auto"></div>',
        footer: '<button class="btn btn-secondary" data-close="btn">Cancel</button>',
        onMount: function (root) {
          var q = root.querySelector('#va-q'), host = root.querySelector('#va-list');
          function paint() {
            var t = q.value.trim().toLowerCase();
            var rows = people.filter(function (p) { return !t || [p.name, p.code, p.department, p.designation].join(' ').toLowerCase().indexOf(t) !== -1; }).slice(0, 40);
            host.innerHTML = rows.length ? rows.map(function (p) {
              return '<div class="item clickable" data-id="' + esc(p.id) + '" style="cursor:pointer"><div class="avatar sm ghost">' + esc(initials(p.name)) + '</div><div><div class="t">' + esc(p.name) + '</div><div class="s">' + esc([p.code, p.designation, p.department].filter(Boolean).join(' · ')) + '</div></div><span class="tag tag-neutral">' + esc(p.roleName || roleLabel(p.role)) + '</span></div>';
            }).join('') : '<div class="empty">No one matches.</div>';
            host.querySelectorAll('[data-id]').forEach(function (row) { row.onclick = function () { var p = people.filter(function (x) { return String(x.id) === row.getAttribute('data-id'); })[0]; close(); enterViewAs(p); }; });
          }
          q.oninput = paint; paint();
        }
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }
  function enterViewAs(p) {
    if (!p) return;
    S.viewAs = { employeeId: p.id, name: p.name, role: p.role, roleName: p.roleName };
    try { HRIS.clearReadCache(); } catch (e) {}
    S.realUser = S.user;
    api('app.session').then(function (sess) { applySession(sess); window.location.hash = '#/home'; render(); toast('Previewing as ' + p.name, 'ok', 2200); })
      .catch(function (e) { S.viewAs = null; toast(e.message, 'err'); });
  }
  function exitViewAs() {
    S.viewAs = null;
    try { HRIS.clearReadCache(); } catch (e) {}
    api('app.session').then(function (sess) { applySession(sess); saveSnapshot(sess); render(); toast('Back to your own view.', 'ok', 1600); }).catch(function (e) { toast(e.message, 'err'); });
  }

  /* ------------------------------------------------------------- rendering */
  var lastShellKey = '';
  function shellKey() { return [S.user && S.user.employeeId, S.route, S.navOpen, S.pending, S.pendingSign, S.pendingAcks, S.notifCount, !!S.viewAs, S.collapsed, (S.user && S.user.roleName)].join('|'); }

  function render(opts) {
    opts = opts || {};
    if (!S.user) return renderLogin();
    var h = parseHash();
    S.route = h.route; S.params = h.params;
    if (S.route !== 'admin') S.adminActive = null;
    closeMenus();

    var appEl = document.getElementById('app');
    var key = shellKey();
    var needShell = !document.querySelector('.layout') || key !== lastShellKey || opts.shellOnly;
    var prevView = document.getElementById('view');
    var keepHtml = (opts.shellOnly && prevView) ? prevView.innerHTML : null;
    if (needShell) {
      lastShellKey = key;
      appEl.innerHTML = shellHtml();
      wireShell();
      var host0 = document.getElementById('view');
      delegate(host0);
      if (keepHtml !== null) { host0.innerHTML = keepHtml; if (S.current && S.current.mount) { try { S.current.mount(host0, S.params); } catch (e) {} } return; }
    } else {
      var t = document.getElementById('page-title'); if (t) t.textContent = routeMeta(S.route).label;
    }
    var host = document.getElementById('view');
    if (!opts.quiet) {
      host.innerHTML = '<div class="stack" style="gap:12px;max-width:640px"><div class="skeleton" style="height:28px;width:40%"></div><div class="skeleton" style="height:14px;width:70%"></div><div class="skeleton" style="height:14px;width:55%"></div>' +
        '<div class="statstrip mt2"><div><div class="skeleton" style="width:50%"></div><div class="skeleton mt2" style="height:30px;width:40%"></div></div><div><div class="skeleton" style="width:50%"></div><div class="skeleton mt2" style="height:30px;width:40%"></div></div><div><div class="skeleton" style="width:50%"></div><div class="skeleton mt2" style="height:30px;width:40%"></div></div><div><div class="skeleton" style="width:50%"></div><div class="skeleton mt2" style="height:30px;width:40%"></div></div></div></div>';
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }
    var myRoute = S.route;
    ensureRouteLoaded(S.route).then(function () {
      if (LAZY_VIEW_ROUTES[S.route] && !S.views[S.route]) throw new Error('The ' + (S.route.charAt(0).toUpperCase() + S.route.slice(1)) + ' screen did not load correctly. Reload the page to try again.');
      var view = S.views[S.route] || S.views.home;
      if (!view) throw new Error('This screen could not be loaded. Reload the page to try again.');
      S.current = view;
      var title = document.getElementById('page-title');
      if (title) title.textContent = view.title || routeMeta(S.route).label || '';
      document.title = (view.title || 'AVP HRIS') + ' · AVP HRIS';
      return Promise.resolve(view.render(S.params));
    }).then(function (html) {
      if (S.route !== myRoute) return;
      var scrollY = opts.quiet ? window.scrollY : 0;
      host.innerHTML = html;
      if (S.current.mount) S.current.mount(host, S.params);
      countUp(host);
      if (opts.quiet) window.scrollTo(0, scrollY);
      if (window.HRIS && HRIS.onViewPainted) HRIS.onViewPainted(host);
    }).catch(function (e) {
      host.innerHTML = '<div class="panel"><h3>Something went wrong</h3><p class="muted">' + esc(e.message) + '</p><button class="btn btn-secondary" onclick="App.render()">Try again</button></div>';
    });
  }

  /* -------------------------------------------------------- lazy modules */
  var LAZY_VIEW_ROUTES = {
    home: 'ViewsHome', me: 'ViewsHome', attendance: 'ViewsAttendance', leave: 'ViewsLeave',
    people: 'ViewsPeople', approvals: 'ViewsPeople', reports: 'ViewsPeople', payslips: 'ViewsPayroll',
    performance: 'ViewsPerformance', exit: 'ViewsExit', expenses: 'ViewsExpenses', notices: 'ViewsNotices',
    helpdesk: 'ViewsHelpdesk', openings: 'ViewsRecruitment', signatures: 'ViewsLetters', sign: 'ViewsLetters'
  };
  var ADMIN_LAZY_MODULES = ['ViewsAdmin', 'ViewsRoles', 'ViewsPayroll', 'ViewsPerformance', 'ViewsExit', 'ViewsExpenses', 'ViewsAssets', 'ViewsNotices', 'ViewsHelpdesk', 'ViewsRecruitment', 'ViewsLetters'];
  var _loadedModules = {};
  function loadModule(name) {
    if (_loadedModules[name]) return _loadedModules[name];
    var p = HRIS.loadViewModule(name).catch(function (e) { delete _loadedModules[name]; throw e; });
    _loadedModules[name] = p;
    return p;
  }
  function ensureRouteLoaded(route) {
    if (route === 'admin') return Promise.all(ADMIN_LAZY_MODULES.map(function (m) { return loadModule(m).catch(function (e) { if (m === 'ViewsAdmin') throw e; }); }));
    return loadModule(LAZY_VIEW_ROUTES[route] || 'ViewsHome');
  }
  function prefetchModules() {
    var list = ['ViewsAttendance', 'ViewsLeave', 'ViewsPeople', 'ViewsNotices', 'ViewsExpenses', 'ViewsHelpdesk', 'ViewsPayroll'];
    if (S.user && (S.user.isHR || hasAdminAccess())) list.push('ViewsAdmin', 'ViewsRoles', 'ViewsLetters');
    if (S.pendingSign) list.unshift('ViewsLetters');
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
    (function next() {
      var name = list.shift(); if (!name || !S.token) return;
      idle(function () { if (!S.token) return; loadModule(name).catch(function () {}).then(function () { setTimeout(next, 350); }); });
    })();
  }

  /* ---------------------------------------------------------------- login */
  function loginArt(title, sub) {
    var ver = esc((S.boot && S.boot.settings && S.boot.settings.appVersion) || (typeof APP_VERSION !== 'undefined' && APP_VERSION) || '3.0.0');
    return '<div class="art">' +
      '<div class="orb" style="width:420px;height:420px;right:-140px;top:-160px;background:rgba(236,48,19,.45)"></div>' +
      '<div class="orb" style="width:300px;height:300px;left:-120px;bottom:-120px;background:rgba(255,255,255,.08)"></div>' +
      '<div class="float" style="right:60px;top:120px"><b>09:28</b>Checked in · Head office</div>' +
      '<div class="float" style="right:34px;top:210px"><b>Leave approved</b>3 days · 12–14 Oct</div>' +
      '<div class="float" style="right:120px;top:300px"><b>Payslip ready</b>September 2026</div>' +
      '<div><div class="logo-card">' + brandLogo(220) + '</div></div>' +
      '<div><h1>' + (title || 'People,<br>attendance,<br>payroll —<br>one place.') + '</h1><p style="opacity:.75;max-width:420px;margin-top:16px">' + (sub || 'Attendance, leave, payslips, letters and more — on any device, in seconds.') + '</p></div>' +
      '<div style="font-size:11px;opacity:.55">AVP HRIS · v' + ver + '</div>' +
      '</div>';
  }
  function googleButton(label) {
    if (typeof GOOGLE_AUTH_URL === 'undefined' || !GOOGLE_AUTH_URL) return '';
    return '<a class="btn-google" data-google-signin href="' + GOOGLE_AUTH_URL + '" target="_top">' + (typeof GOOGLE_G !== 'undefined' ? GOOGLE_G : '') + '<span>' + esc(label || 'Continue with Google') + '</span></a>';
  }
  function renderLogin(message, kind) {
    lastShellKey = '';
    var hasGoogle = typeof GOOGLE_AUTH_URL !== 'undefined' && !!GOOGLE_AUTH_URL;
    var hint = (typeof LOGIN_HINT !== 'undefined' && LOGIN_HINT) || '';
    var lastId = store.get('hris_last_id') || '';
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt() +
      '<div class="form"><div class="box rise-in">' +
      '<div class="kicker">Sign in</div><h2 style="margin-bottom:6px">Welcome back.</h2>' +
      '<p class="small muted" style="margin-bottom:18px">' + (hasGoogle ? 'Use your Google account (the AVP or personal address HR has on file) — no password needed.' : 'Sign in with your employee code and password.') + '</p>' +
      (message ? '<div class="geo ' + (kind === 'ok' ? 'ok' : 'bad') + '" style="margin-bottom:16px">' + ic(kind === 'ok' ? 'check' : 'alert') + esc(message) + '</div>' : '') +
      (hasGoogle ? googleButton('Continue with Google') + '<div class="divider"><span>or use your employee code</span></div>' : '') +
      '<form id="loginForm" autocomplete="on">' +
      '<div class="field"><label>Employee code or email</label><input class="input" name="identifier" autocomplete="username" placeholder="EMP095" autocapitalize="characters" value="' + esc(lastId) + '" required></div>' +
      '<div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-primary btn-xl" type="submit" id="loginBtn">Sign in</button></form>' +
      '<div class="spread mt2" style="font-size:13px"><a href="#" id="forgotLink">Forgot password?</a><span class="small muted">Stays signed in on this device</span></div>' +
      (hint ? '<div class="hintbox mt3"><b>Password help.</b> ' + esc(hint) + '</div>' : '') +
      (HRIS.pwa ? HRIS.pwa.loginChip() : '') +
      '</div></div></div>';
    HRIS.splashOut && HRIS.splashOut();
    HRIS.pwa && HRIS.pwa.afterLoginPaint && HRIS.pwa.afterLoginPaint();
    document.getElementById('forgotLink').onclick = function (ev) { ev.preventDefault(); renderForgot(document.querySelector('#loginForm [name=identifier]').value.trim()); };
    document.getElementById('loginForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target, btn = document.getElementById('loginBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Signing in…';
      var identifier = f.identifier.value.trim();
      api('auth.login', { identifier: identifier, password: f.password.value, userAgent: navigator.userAgent })
        .then(function (res) { store.set('hris_last_id', identifier); return afterLogin(res); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Sign in'; var box = document.querySelector('.login .box'); if (box) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); } toast(e.message, 'err'); });
    };
  }
  /* Google sign-in finished: exchange the one-time claim code for a session. */
  function claimGoogle(code) {
    return api('auth.claimGoogleSession', { code: code }).then(function (res) {
      if (res.user && res.user.code) store.set('hris_last_id', res.user.code);
      return afterLogin(res);
    }).catch(function (e) { renderLogin(e.message); });
  }
  function afterLogin(res) {
    S.token = res.token; store.set('hris_token', res.token);
    store.del(SNAP_KEY);
    if (res.mustChangePassword) { S.user = res.user; return renderChangePassword(true); }
    if (res.needsOnboarding) { S.user = res.user; return renderOnboarding(true); }
    return start();
  }
  function renderForgot(prefill) {
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt('Forgot your<br>password?', 'We will email a one-time code to the address HR has on file for you.') +
      '<div class="form"><div class="box rise-in"><div class="kicker">Forgot password</div><h2 style="margin-bottom:8px">Get a one-time code.</h2>' +
      '<p class="small muted" style="margin-bottom:18px">We will email a 6-digit code to the address HR has on file for you. It works for 15 minutes.</p>' +
      '<form id="fpForm"><div class="field"><label>Employee code or email</label><input class="input" name="identifier" placeholder="EMP095" autocapitalize="characters" value="' + esc(prefill || '') + '" required></div>' +
      '<button class="btn btn-primary btn-xl" type="submit" id="fpBtn">Email me a code</button></form>' +
      '<button class="btn btn-ghost mt2" id="fpBack">Back to sign in</button>' +
      (typeof GOOGLE_AUTH_URL !== 'undefined' && GOOGLE_AUTH_URL ? '<div class="divider"><span>or</span></div>' + googleButton('Skip passwords — continue with Google') : '') +
      '</div></div></div>';
    document.getElementById('fpBack').onclick = function () { renderLogin(); };
    document.getElementById('fpForm').onsubmit = function (ev) {
      ev.preventDefault();
      var id = ev.target.identifier.value.trim(), btn = document.getElementById('fpBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';
      api('auth.requestReset', { identifier: id, userAgent: navigator.userAgent }).then(function (r) { renderResetCode(id, r); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Email me a code'; toast(e.message, 'err'); });
    };
  }
  function renderResetCode(identifier, info) {
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt('Check your<br>email.', 'Enter the 6-digit code and choose a new password.') +
      '<div class="form"><div class="box rise-in"><div class="kicker">Check your email</div><h2 style="margin-bottom:8px">Enter the code.</h2>' +
      '<p class="small muted" style="margin-bottom:18px">Sent to ' + esc((info && info.sentTo || []).join(', ') || 'your email') + '. Check the spam folder if it does not arrive within a minute.</p>' +
      '<form id="rcForm"><div class="field"><label>6-digit code</label><input class="input otp" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required></div>' +
      '<div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="6" autocomplete="new-password" required></div>' +
      '<div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="6" autocomplete="new-password" required></div>' +
      '<button class="btn btn-primary btn-xl" type="submit" id="rcBtn">Set password and sign in</button></form>' +
      '<div class="spread mt2" style="font-size:13px"><a href="#" id="rcResend">Send a new code</a><a href="#" id="rcBack">Back to sign in</a></div></div></div></div>';
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
    lastShellKey = '';
    document.getElementById('app').innerHTML =
      '<div class="login">' + loginArt('Set your<br>password.', 'Choose something only you know. You will use it to mark attendance every day.') +
      '<div class="form"><div class="box rise-in"><div class="kicker">Security</div><h2 style="margin-bottom:18px">Change password</h2>' +
      '<form id="cpForm"><div class="field"><label>Current password</label><input class="input" type="password" name="oldPassword" required></div>' +
      '<div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="6" required></div>' +
      '<div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="6" required></div>' +
      '<button class="btn btn-primary btn-xl" type="submit">Save and continue</button></form>' +
      (forced ? '' : '<button class="btn btn-ghost mt2" onclick="App.go(\'me\')">Cancel</button>') + '</div></div></div>';
    HRIS.splashOut && HRIS.splashOut();
    document.getElementById('cpForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target;
      if (f.newPassword.value !== f.confirm.value) return toast('The two new passwords do not match.', 'err');
      api('auth.changePassword', { oldPassword: f.oldPassword.value, newPassword: f.newPassword.value })
        .then(function () { toast('Password updated.', 'ok'); return start(); }).catch(function (e) { toast(e.message, 'err'); });
    };
  }

  /* -------------------------------------------------------- onboarding UI */
  function renderOnboarding() {
    lastShellKey = '';
    document.getElementById('app').innerHTML =
      '<div class="stack" id="onbRoot" style="min-height:100vh">' +
      '<div class="topbar noprint" style="justify-content:space-between"><div class="brand" style="border:0;padding:0;height:auto">' + brandMark(28) + '<div class="name">AVP <span>HRIS</span></div></div>' +
      '<button class="btn btn-ghost btn-sm" id="onbSignOut">Sign out</button></div>' +
      '<div id="onbBody" style="max-width:860px;margin:0 auto;padding:32px 20px 100px;width:100%"><div class="empty"><span class="spinner"></span></div></div></div>';
    HRIS.splashOut && HRIS.splashOut();
    var so = document.getElementById('onbSignOut'); if (so) so.onclick = function () { signOut(); };
    loadOnboarding();
  }
  function loadOnboarding() { api('onboarding.myStatus').then(paintOnboarding).catch(function (e) { toast(e.message, 'err'); }); }
  function obField(name, label, value, type, placeholder) {
    return '<div class="field"><label>' + esc(label) + '</label><input class="input" type="' + (type || 'text') + '" name="' + name + '" value="' + esc(value || '') + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '></div>';
  }
  function paintOnboarding(st) {
    var host = document.getElementById('onbBody'); if (!host) return;
    if (st.done) {
      host.innerHTML = '<div class="panel" style="text-align:center;padding:56px 24px"><div class="check-burst">' + ic('check') + '</div><div class="kicker mt3">All set</div><h1 style="margin:8px 0">You’re onboarded.</h1>' +
        '<p class="muted" style="max-width:440px;margin:0 auto 22px">Your details are on file. Any documents still pending review will be checked by HR — you don’t need to wait for that.</p>' +
        '<button class="btn btn-primary btn-xl" style="width:auto;padding-inline:32px" id="onbContinue">Continue to AVP HRIS</button></div>';
      document.getElementById('onbContinue').onclick = function () { start(); };
      confetti(70);
      return;
    }
    var p = st.profile, missing = (st.missingProfile || []).concat(st.missingDocs || []);
    var pct = Math.max(4, Math.round(100 * (1 - Math.min(1, missing.length / 12))));
    host.innerHTML =
      '<div class="kicker">Welcome' + (S.user && S.user.name ? ', ' + esc(firstName(S.user.name)) : '') + '</div><h1 style="margin:0 0 8px">Let’s get you set up.</h1>' +
      '<p class="muted" style="max-width:600px;margin-bottom:16px">Before you can mark attendance or apply for leave, we need a few details and a handful of documents — the same information AVP’s Employee Information Form asks for. This only takes a few minutes.</p>' +
      '<div class="row" style="gap:12px;margin-bottom:22px"><div class="bar grow ok"><i style="width:' + pct + '%"></i></div><span class="small muted mono">' + pct + '%</span></div>' +
      (missing.length ? '<div class="geo bad" style="margin-bottom:20px">' + ic('alert') + '<span>Still needed: ' + missing.map(esc).join(', ') + '.</span></div>' : '') +
      '<form id="onbForm"><div class="panel"><div class="sect"><h3>Personal &amp; statutory</h3></div>' +
      '<div class="grid2 mt2">' + obField('Nationality', 'Nationality', p.nationality) + obField('DateOfBirth', 'Date of birth', p.dateOfBirth, 'date') + '</div>' +
      '<div class="grid2">' + obField('PAN', 'PAN number', p.pan, 'text', 'ABCDE1234F') + '<div class="field"><label>Aadhaar number</label><input class="input" name="aadhaarNumber" placeholder="' + (p.aadhaarLast4 ? 'On file ending ' + esc(p.aadhaarLast4) + ' — leave blank to keep it' : '12-digit Aadhaar number') + '" maxlength="14"></div></div>' +
      obField('UAN', 'PF UAN (if you have one from a previous employer)', p.uan) +
      '<div class="field"><label>Permanent address</label><textarea class="input" name="PermanentAddress">' + esc(p.permanentAddress || '') + '</textarea></div></div>' +
      '<div class="panel mt2"><div class="sect"><h3>Emergency contact</h3></div><div class="grid2 mt2">' + obField('EmergencyContactName', 'Name', p.emergencyName) + obField('EmergencyContactRelation', 'Relationship', p.emergencyRelation) + '</div>' + obField('EmergencyContactPhone', 'Contact number', p.emergencyPhone) + '</div>' +
      '<div class="panel mt2"><div class="sect"><h3>Family details <span class="small muted" style="font-weight:400">(optional)</span></h3></div>' +
      '<div class="grid2 mt2">' + obField('FamilyMember1Name', 'Family member 1 — name', p.family1Name) + obField('FamilyMember1Relation', 'Relation', p.family1Relation) + '</div>' + obField('FamilyMember1Phone', 'Contact number', p.family1Phone) +
      '<div class="grid2 mt1">' + obField('FamilyMember2Name', 'Family member 2 — name', p.family2Name) + obField('FamilyMember2Relation', 'Relation', p.family2Relation) + '</div>' + obField('FamilyMember2Phone', 'Contact number', p.family2Phone) + '</div>' +
      '<div class="panel mt2"><div class="sect"><h3>Bank details for payroll</h3></div><div class="grid2 mt2">' + obField('BankName', 'Bank name', p.bankName) + obField('BankAccountNumber', 'Account number', p.bankAccountNumber) + '</div>' +
      '<div class="grid2">' + obField('BankIFSC', 'IFSC code', p.bankIFSC, 'text', 'ABCD0123456') + obField('BankBranch', 'Branch', p.bankBranch) + '</div>' + obField('BankMMID', 'MMID (optional)', p.bankMMID) + '</div>' +
      '<div class="panel mt2"><div class="sect"><h3>Education &amp; experience</h3></div><div class="mt2">' + obField('Qualification', 'Educational qualification', p.qualification) + obField('PreviousExperience', 'Previous work experience', p.previousExperience) + obField('Skills', 'Special skills or certifications', p.skills) + '</div></div>' +
      '<button class="btn btn-primary btn-xl mt3" type="submit">Save my details</button></form>' +
      '<div class="panel mt3"><div class="sect"><h3>Documents</h3></div><div class="small muted mt1" style="line-height:1.6">Upload clear photos or scans (JPG, PNG or PDF, up to 4 MB each). HR will review each one — you can carry on using AVP HRIS while that happens.</div>' +
      '<div id="onbDocs" class="mt2">' + docRows(st.documents) + '</div></div>';
    document.getElementById('onbForm').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target, b = {};
      ['Nationality', 'DateOfBirth', 'PermanentAddress', 'EmergencyContactName', 'EmergencyContactRelation', 'EmergencyContactPhone', 'FamilyMember1Name', 'FamilyMember1Relation', 'FamilyMember1Phone',
        'FamilyMember2Name', 'FamilyMember2Relation', 'FamilyMember2Phone', 'BankName', 'BankAccountNumber', 'BankIFSC', 'BankBranch', 'BankMMID', 'PAN', 'UAN', 'Qualification', 'PreviousExperience', 'Skills'
      ].forEach(function (n) { b[n] = f[n] ? f[n].value : ''; });
      if (f.aadhaarNumber && f.aadhaarNumber.value.trim()) b.aadhaarNumber = f.aadhaarNumber.value.trim();
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      api('onboarding.submitProfile', b).then(function () { toast('Details saved.', 'ok'); return loadOnboarding(); }).catch(function (e) { btn.disabled = false; toast(e.message, 'err'); });
    };
    wireDocRows(document.getElementById('onbDocs'), null, function () { loadOnboarding(); });
  }

  /* ------------------------------------------------- document checklist */
  var DOC_STATUS_LABEL = { NOT_UPLOADED: 'Not uploaded', PENDING_REVIEW: 'Pending review', VERIFIED: 'Verified', REJECTED: 'Needs re-upload' };
  var DOC_STATUS_TAG = { NOT_UPLOADED: 'tag-neutral', PENDING_REVIEW: 'tag-warn', VERIFIED: 'tag-ok', REJECTED: 'tag-err' };
  function docRows(list, opts) {
    opts = opts || {};
    return list.map(function (dd) {
      var tag = '<span class="tag ' + (DOC_STATUS_TAG[dd.status] || 'tag-neutral') + '">' + esc(DOC_STATUS_LABEL[dd.status] || dd.status) + '</span>';
      return '<div class="rowline" style="align-items:flex-start;flex-wrap:wrap;gap:10px;padding:14px 0">' +
        '<div class="grow" style="min-width:200px"><div style="font-weight:600">' + esc(dd.label) + (dd.required ? '' : ' <span class="small muted">(optional)</span>') + '</div>' +
        '<div class="row wrap mt1" style="gap:8px;align-items:center">' + tag + (dd.status === 'REJECTED' && dd.verifyRemark ? '<span class="small muted">' + esc(dd.verifyRemark) + '</span>' : '') +
        (dd.fileName && dd.status !== 'NOT_UPLOADED' ? '<span class="small muted mono">' + esc(dd.fileName) + '</span>' : '') + '</div></div>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap">' +
        (dd.documentId ? '<button class="btn btn-ghost btn-sm" data-doc-view="' + esc(dd.documentId) + '">' + ic('download') + ' View</button>' : '') +
        (opts.canVerify && dd.status === 'PENDING_REVIEW' ? '<button class="btn btn-secondary btn-sm" data-doc-verify="' + esc(dd.documentId) + '">Verify</button><button class="btn btn-danger btn-sm" data-doc-reject="' + esc(dd.documentId) + '">Reject</button>' : '') +
        '<label class="btn btn-secondary btn-sm" style="cursor:pointer">' + ic('plus') + ' ' + (dd.status === 'NOT_UPLOADED' ? 'Upload' : 'Replace') + '<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-doc-input="' + esc(dd.code) + '" style="display:none"></label></div></div>';
    }).join('');
  }
  function wireDocRows(root, employeeId, onChange) {
    root.querySelectorAll('[data-doc-input]').forEach(function (input) {
      input.onchange = function () {
        var file = input.files && input.files[0]; if (!file) return;
        if (file.size > 4 * 1024 * 1024) { toast('That file is too large (max 4 MB).', 'err'); input.value = ''; return; }
        var reader = new FileReader();
        reader.onload = function () {
          api('onboarding.uploadDocument', { employeeId: employeeId || undefined, docType: input.getAttribute('data-doc-input'), fileName: file.name, mimeType: file.type, dataBase64: String(reader.result).split(',')[1] || '' })
            .then(function () { toast('Uploaded — pending HR review.', 'ok'); if (onChange) onChange(); }).catch(function (e) { toast(e.message, 'err'); input.value = ''; });
        };
        reader.readAsDataURL(file);
      };
    });
    root.querySelectorAll('[data-doc-view]').forEach(function (btn) { btn.onclick = function () { viewDocument(btn.getAttribute('data-doc-view')); }; });
    root.querySelectorAll('[data-doc-verify]').forEach(function (btn) {
      btn.onclick = function () { api('admin.verifyDocument', { documentId: btn.getAttribute('data-doc-verify'), decision: 'VERIFY' }).then(function () { toast('Verified.', 'ok'); if (onChange) onChange(); }).catch(function (e) { toast(e.message, 'err'); }); };
    });
    root.querySelectorAll('[data-doc-reject]').forEach(function (btn) {
      btn.onclick = function () {
        prompt('Reject document', [{ name: 'remark', label: 'What needs to be fixed?', type: 'textarea' }], 'Reject').then(function (v) {
          if (!v) return;
          return api('admin.verifyDocument', { documentId: btn.getAttribute('data-doc-reject'), decision: 'REJECT', remark: v.remark }).then(function () { toast('Sent back for re-upload.', 'ok'); if (onChange) onChange(); });
        }).catch(function (e) { toast(e.message, 'err'); });
      };
    });
  }
  function viewDocument(documentId) {
    api('onboarding.downloadDocument', { documentId: documentId }).then(function (r) { openBlob(r); }).catch(function (e) { toast(e.message, 'err'); });
  }
  function showDocumentsModal(employeeId, canVerify) {
    modal({
      title: 'Documents', wide: true, body: '<div id="docsModalBody" class="empty"><span class="spinner"></span></div>',
      footer: '<button class="btn btn-secondary" data-close="btn">Close</button>',
      onMount: function (root) {
        api('onboarding.documents', { employeeId: employeeId }).then(function (list) {
          var dhost = root.querySelector('#docsModalBody'); dhost.className = '';
          dhost.innerHTML = docRows(list, { canVerify: canVerify });
          wireDocRows(dhost, employeeId, function () { showDocumentsModal(employeeId, canVerify); });
        }).catch(function (e) { toast(e.message, 'err'); });
      }
    });
  }

  /* ------------------------------------------------------------ lifecycle */
  function applySession(sess) {
    S.boot = sess.boot; S.user = sess.boot.user;
    S.roles = (sess.boot && sess.boot.roles) || S.roles || [];
    S.homePayload = sess.home || null;
    S.notifCount = (sess.notifications || []).length;
    if (sess.home) {
      S.pending = sess.home.pendingCount || 0;
      S.pendingAcks = sess.home.pendingAcks || 0;
      S.pendingSign = (sess.home.signRequests || []).length;
    }
  }
  function saveSnapshot(sess) { if (S.viewAs) return; store.setJson(SNAP_KEY, { at: Date.now(), tokenTail: String(S.token).slice(-8), sess: sess }); }
  function loadSnapshot() {
    var snap = store.getJson(SNAP_KEY);
    if (!snap || !snap.sess || !snap.sess.boot || !snap.sess.boot.user) return null;
    if (snap.tokenTail !== String(S.token).slice(-8)) return null;
    if (Date.now() - (snap.at || 0) > SNAP_MAX_AGE_MS) return null;
    return snap.sess;
  }
  function start() {
    return api('app.session').then(function (sess) {
      applySession(sess); saveSnapshot(sess);
      if (!window.location.hash) window.location.hash = '#/home';
      render(); prefetchModules();
      HRIS.splashOut && HRIS.splashOut();
    });
  }
  function refreshSession(loud) {
    if (S.refreshing) return;
    S.refreshing = true;
    try { HRIS.clearReadCache(); } catch (e) {}
    api('app.session').then(function (sess) {
      S.refreshing = false;
      var wasUser = S.user;
      applySession(sess); saveSnapshot(sess);
      if (S.route === 'home' || !S.route || loud) render({ quiet: !loud });
      else if (wasUser && (wasUser.role !== S.user.role)) render();
      else syncShellBadges();
      if (loud) toast('Up to date.', 'ok', 1400);
    }).catch(function () { S.refreshing = false; });
  }
  function syncShellBadges() {
    try {
      var items = navItems();
      document.querySelectorAll('.nav [data-nav]').forEach(function (btn) {
        var it = items.filter(function (i) { return i.id === btn.getAttribute('data-nav'); })[0];
        var badge = btn.querySelector('.badge'); if (!it) return;
        if (it.badge && !badge) btn.insertAdjacentHTML('beforeend', '<span class="badge">' + it.badge + '</span>');
        else if (it.badge && badge) badge.textContent = it.badge;
        else if (!it.badge && badge) badge.remove();
      });
      var dots = document.querySelectorAll('[data-act="notifications"] .dot');
      if (S.notifCount && !dots.length) document.querySelectorAll('[data-act="notifications"]').forEach(function (b) { b.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); });
      if (!S.notifCount) dots.forEach(function (x) { x.remove(); });
      lastShellKey = shellKey();
    } catch (e) {}
  }
  function signOutLocal() {
    S.token = null; S.user = null; S.boot = null; S.homePayload = null; S.viewAs = null;
    store.del('hris_token'); store.del(SNAP_KEY);
    try { HRIS.clearReadCache(); } catch (e) {}
  }
  function signOut() {
    var t = S.token;
    signOutLocal();
    api('auth.logout', { token: t }).catch(function () {});
    window.location.hash = '';
    renderLogin('You have been signed out.', 'ok');
  }
  function boot() {
    window.addEventListener('hashchange', function () { if (S.user) render(); });
    if (typeof SIGN_TOKEN !== 'undefined' && SIGN_TOKEN) {
      S.signMode = true;
      var run = function () { if (App.signStandalone) return App.signStandalone(SIGN_TOKEN); document.getElementById('app').innerHTML = '<div class="empty">The signing page could not be loaded. Please reload.</div>'; };
      HRIS.splashOut && HRIS.splashOut();
      if (App.signStandalone) return run();
      return loadModule('ViewsLetters').then(run, run);
    }
    if (typeof GOOGLE_CLAIM_CODE !== 'undefined' && GOOGLE_CLAIM_CODE) {
      // Finished in a browser tab while the installed app is waiting for it? Hand it back.
      if (HRIS.pwa && HRIS.pwa.deferClaim()) { HRIS.splashOut && HRIS.splashOut(); return HRIS.pwa.renderHandoff(GOOGLE_CLAIM_CODE); }
      HRIS.pwa && HRIS.pwa.clearPending();   // claimed right here — nothing left for the app to collect
      return claimGoogle(GOOGLE_CLAIM_CODE);
    }
    var t = store.get('hris_token');
    if (!t) { var msg = typeof GOOGLE_LOGIN_ERROR !== 'undefined' ? (GOOGLE_LOGIN_ERROR || undefined) : undefined; return renderLogin(msg); }
    S.token = t;
    if (typeof GOOGLE_LINKED !== 'undefined' && GOOGLE_LINKED) setTimeout(function () { toast('Google account linked: ' + GOOGLE_LINKED + '. You can now sign in with it.', 'ok', 6000); window.location.hash = '#/me'; }, 400);
    if (typeof GOOGLE_LINK_ERROR !== 'undefined' && GOOGLE_LINK_ERROR) setTimeout(function () { toast(GOOGLE_LINK_ERROR, 'err', 8000); }, 400);
    var snap = loadSnapshot();
    if (snap) {
      applySession(snap);
      if (!window.location.hash) window.location.hash = '#/home';
      render(); refreshSession(); prefetchModules();
      HRIS.splashOut && HRIS.splashOut();
      return;
    }
    start().catch(function (e) {
      if (['SESSION_EXPIRED', 'PASSWORD_CHANGE_REQUIRED', 'ONBOARDING_REQUIRED'].indexOf(e.code) !== -1) return;
      HRIS.splashOut && HRIS.splashOut();
      document.getElementById('app').innerHTML =
        '<div style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="panel" style="max-width:420px">' + brandLogo(160) +
        '<h3 class="mt3">Could not load AVP HRIS</h3><p class="muted">' + esc(e.message) + '</p><div class="row mt2"><button class="btn btn-primary" onclick="location.reload()">Try again</button><button class="btn btn-ghost" onclick="App.signOut()">Sign out</button></div></div></div>';
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
    brandLogo: brandLogo, brandMark: brandMark, refreshSession: refreshSession, loadModule: loadModule, icon: typeof icon === 'function' ? icon : null,
    renderLoginAgain: function () { if (!S.user) renderLogin(); },
    claimGoogle: claimGoogle, renderLogin: renderLogin,
    // v3
    can: can, canAny: canAny, hasAdminAccess: hasAdminAccess, navItems: navItems, greeting: greeting, firstName: firstName,
    spark: spark, ring: ring, countUp: countUp, flash: flash, confetti: confetti, emptyState: emptyState, pageHead: pageHead,
    openMenu: openMenu, closeMenus: closeMenus, showNotifications: showNotifications, showQuickActions: showQuickActions,
    pickViewAs: pickViewAs, enterViewAs: enterViewAs, exitViewAs: exitViewAs, syncShellBadges: syncShellBadges, applySession: applySession, showShortcuts: showShortcuts
  };
})();

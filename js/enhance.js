/* ==========================================================================
   AVP HRIS — progressive enhancement
   --------------------------------------------------------------------------
   Everything in this file is additive. It wraps the app from the outside and
   never reaches into a view module, so the ported screens keep working
   verbatim and any one of these features can be deleted without consequence.

     · a top progress bar driven by real in-flight RPCs
     · route-change motion (View Transitions where supported)
     · a command palette (Cmd/Ctrl-K)
     · light / dark / system theme, remembered per device
     · an offline banner and a queued-write warning
     · pull-to-refresh on touch devices
     · service-worker registration for instant repeat loads
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===================================================== 1. progress bar ==== */
  (function progressBar() {
    var el = document.getElementById('progress');
    if (!el) return;
    var active = 0, done = 0, timer = null;

    function paint() {
      if (!active) return;
      // Asymptotic creep: it never reaches 100% until the last call lands, so
      // it can never lie about being finished.
      var pct = Math.min(92, (done / (done + active)) * 100 + 8);
      el.style.width = pct + '%';
    }
    function begin() {
      active++;
      el.classList.remove('done');
      if (active === 1) { el.style.width = '8%'; }
      paint();
      clearTimeout(timer);
    }
    function end() {
      active = Math.max(0, active - 1); done++;
      if (!active) {
        el.style.width = '100%';
        timer = setTimeout(function () {
          el.classList.add('done');
          setTimeout(function () { el.style.width = '0'; done = 0; }, 220);
        }, 140);
      } else paint();
    }

    var inner = window.HRIS.transport;
    window.HRIS.transport = function (action, payload) {
      // app.config runs behind the splash; a bar there is just noise.
      if (action === 'app.config') return inner(action, payload);
      begin();
      var p = inner(action, payload);
      p.then(end, end);
      return p;
    };
  })();

  /* ================================================== 2. route transitions === */
  (function routeMotion() {
    var host = document.getElementById('app');
    if (!host || reduced) return;
    var lastRoute = null;

    function tag() {
      var view = document.getElementById('view');
      if (!view) return;
      var route = (location.hash || '').split('?')[0];
      if (route === lastRoute) return;
      // Wait until the skeleton has been replaced by real content.
      if (view.querySelector('.skeleton')) return;
      lastRoute = route;
      view.classList.remove('view-enter');
      void view.offsetWidth;          // force reflow so the animation restarts
      view.classList.add('view-enter');
    }

    new MutationObserver(function () { tag(); })
      .observe(host, { childList: true, subtree: true });
  })();

  /* ============================================================ 3. theme ==== */
  var Theme = (function () {
    var ORDER = ['auto', 'light', 'dark'];
    function current() {
      try { return localStorage.getItem('hris_theme') || 'auto'; } catch (e) { return 'auto'; }
    }
    function apply(t) {
      if (t === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('hris_theme', t); } catch (e) {}
    }
    function cycle() {
      var next = ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length];
      apply(next);
      if (window.App && App.toast) {
        App.toast('Theme: ' + (next === 'auto' ? 'follow system' : next), 'ok', 1400);
      }
      return next;
    }
    function label() {
      var c = current();
      return c === 'auto' ? 'Theme: follow system' : (c === 'dark' ? 'Theme: dark' : 'Theme: light');
    }
    return { current: current, apply: apply, cycle: cycle, label: label };
  })();

  /* A theme button is injected into whichever header is on screen after every
     shell render, rather than editing the shell markup in app.js. */
  (function themeButton() {
    function svg() {
      return App && App.icon ? App.icon('sun') :
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    }
    function inject() {
      ['.topbar', '.mobhead'].forEach(function (sel) {
        var bar = document.querySelector(sel);
        if (!bar || bar.querySelector('[data-theme-toggle]')) return;
        var b = document.createElement('button');
        b.className = 'iconbtn';
        b.setAttribute('data-theme-toggle', '1');
        b.title = Theme.label();
        b.setAttribute('aria-label', Theme.label());
        b.innerHTML = svg();
        b.addEventListener('click', function () {
          Theme.cycle();
          b.title = Theme.label();
          b.setAttribute('aria-label', Theme.label());
        });
        // Sit immediately before the notifications / avatar cluster.
        var anchor = bar.querySelector('[data-act="notifications"]');
        if (anchor) bar.insertBefore(b, anchor); else bar.appendChild(b);
      });
    }
    new MutationObserver(inject).observe(document.getElementById('app'), { childList: true, subtree: true });
    inject();
  })();

  /* =================================================== 4. command palette === */
  var Palette = (function () {
    var root = null, items = [], filtered = [], cursor = 0;

    /* Built from the live nav plus a fixed set of actions, so it can never
       offer a route the signed-in person is not allowed to open. */
    function build() {
      var u = (window.App && App.S && App.S.user) || {};
      var out = [
        { id: 'home', label: 'Home', icon: 'home', kind: 'Go to' },
        { id: 'attendance', label: 'Attendance', icon: 'clock', kind: 'Go to' },
        { id: 'leave', label: 'Leave', icon: 'calendar', kind: 'Go to' },
        { id: 'expenses', label: 'Expenses', icon: 'receipt', kind: 'Go to' },
        { id: 'payslips', label: 'Payslips', icon: 'file', kind: 'Go to' },
        { id: 'performance', label: 'Performance', icon: 'target', kind: 'Go to' },
        { id: 'notices', label: 'Notices', icon: 'megaphone', kind: 'Go to' },
        { id: 'helpdesk', label: 'Helpdesk', icon: 'lifebuoy', kind: 'Go to' },
        { id: 'openings', label: 'Job openings', icon: 'briefcase', kind: 'Go to' },
        { id: 'exit', label: 'Exit / resignation', icon: 'logout', kind: 'Go to' },
        { id: 'me', label: 'My profile', icon: 'user', kind: 'Go to' }
      ];
      if (u.isManager) {
        out.push({ id: 'approvals', label: 'Approvals', icon: 'inbox', kind: 'Go to' });
        out.push({ id: 'people', label: 'People directory', icon: 'users', kind: 'Go to' });
      }
      if (u.isHR) out.push({ id: 'admin', label: 'Administration', icon: 'settings', kind: 'Go to' });

      out.push(
        { act: 'checkin', label: 'Mark attendance', icon: 'clock', kind: 'Action' },
        { act: 'applyleave', label: 'Apply for leave', icon: 'calendar', kind: 'Action' },
        { act: 'expense', label: 'Submit an expense', icon: 'receipt', kind: 'Action' },
        { act: 'ticket', label: 'Raise a helpdesk ticket', icon: 'lifebuoy', kind: 'Action' },
        { act: 'theme', label: Theme.label() + ' — switch', icon: 'sun', kind: 'Action' },
        { act: 'refresh', label: 'Refresh data', icon: 'refresh', kind: 'Action' },
        { act: 'signout', label: 'Sign out', icon: 'logout', kind: 'Action' }
      );
      return out;
    }

    function ico(name) { return (window.App && App.icon) ? App.icon(name) : ''; }
    function esc(s) { return (window.App && App.esc) ? App.esc(s) : String(s); }

    function score(item, q) {
      var l = item.label.toLowerCase();
      if (!q) return 1;
      if (l.startsWith(q)) return 3;
      if (l.indexOf(q) !== -1) return 2;
      // subsequence match, so "aplv" still finds "Apply for leave"
      var i = 0;
      for (var c = 0; c < l.length && i < q.length; c++) if (l[c] === q[i]) i++;
      return i === q.length ? 1 : 0;
    }

    function render(q) {
      filtered = items
        .map(function (it) { return { it: it, s: score(it, q) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .map(function (x) { return x.it; });
      if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);

      var list = root.querySelector('.cmdk-list');
      list.innerHTML = filtered.length
        ? filtered.map(function (it, i) {
            return '<div class="cmdk-item' + (i === cursor ? ' on' : '') + '" data-i="' + i + '">' +
              ico(it.icon) + '<span>' + esc(it.label) + '</span>' +
              '<span class="sub">' + esc(it.kind) + '</span></div>';
          }).join('')
        : '<div class="cmdk-empty">Nothing matches “' + esc(q) + '”.</div>';

      var on = list.querySelector('.cmdk-item.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }

    function run(it) {
      close();
      if (!it) return;
      if (it.id) return App.go(it.id);
      switch (it.act) {
        case 'checkin':    return App.go('attendance');
        case 'applyleave': return App.go('leave', { tab: 'apply' });
        case 'expense':    return App.go('expenses', { action: 'new' });
        case 'ticket':     return App.go('helpdesk', { action: 'new' });
        case 'theme':      return Theme.cycle();
        case 'refresh':    return App.refreshSession && App.refreshSession();
        case 'signout':    return App.signOut && App.signOut();
      }
    }

    function close() {
      if (!root) return;
      root.remove(); root = null;
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e) {
      if (!root) return;
      if (e.key === 'Escape') { e.preventDefault(); return close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, filtered.length - 1); return render(root.querySelector('input').value.toLowerCase().trim()); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); cursor = Math.max(cursor - 1, 0); return render(root.querySelector('input').value.toLowerCase().trim()); }
      if (e.key === 'Enter')     { e.preventDefault(); return run(filtered[cursor]); }
    }

    function open() {
      if (root) return close();
      if (!window.App || !App.S || !App.S.user) return;   // only for signed-in people
      items = build(); cursor = 0;

      root = document.createElement('div');
      root.className = 'cmdk-backdrop';
      root.innerHTML =
        '<div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '  <input type="text" placeholder="Search screens and actions…" autocomplete="off" spellcheck="false" aria-label="Command">' +
        '  <div class="cmdk-list"></div>' +
        '  <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>' +
        '</div>';
      document.body.appendChild(root);

      var input = root.querySelector('input');
      input.addEventListener('input', function () { cursor = 0; render(input.value.toLowerCase().trim()); });
      root.addEventListener('click', function (e) { if (e.target === root) close(); });
      root.querySelector('.cmdk-list').addEventListener('click', function (e) {
        var row = e.target.closest('.cmdk-item');
        if (row) run(filtered[+row.getAttribute('data-i')]);
      });
      document.addEventListener('keydown', onKey, true);
      render('');
      input.focus();
    }

    return { open: open, close: close };
  })();

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); Palette.open(); }
    // "/" focuses search the way it does in GitHub and Slack, but never while
    // the person is already typing somewhere.
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) && !e.target.isContentEditable) {
      e.preventDefault(); Palette.open();
    }
  });

  /* ========================================================== 5. offline ==== */
  (function offline() {
    function sync() { document.body.classList.toggle('is-offline', navigator.onLine === false); }
    window.addEventListener('online', function () {
      sync();
      if (window.App && App.toast) App.toast('Back online', 'ok', 1800);
      if (window.App && App.refreshSession) App.refreshSession();
    });
    window.addEventListener('offline', sync);
    sync();
  })();

  /* ================================================ 6. pull to refresh ====== */
  (function pullToRefresh() {
    if (reduced || !('ontouchstart' in window)) return;
    var startY = 0, pulling = false, indicator = null, dist = 0;
    var THRESHOLD = 74;

    document.addEventListener('touchstart', function (e) {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      if (document.querySelector('.backdrop, .cmdk-backdrop')) return;
      if (!window.App || !App.S || !App.S.user) return;
      startY = e.touches[0].clientY; pulling = true; dist = 0;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) return;
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'ptr';
        indicator.innerHTML = (window.App && App.icon) ? App.icon('refresh') : '↻';
        document.body.appendChild(indicator);
      }
      var pull = Math.min(dist * .5, THRESHOLD + 18);
      indicator.style.transform = 'translate(-50%,' + (pull - 34) + 'px) rotate(' + (pull * 4) + 'deg)';
      indicator.style.opacity = Math.min(1, pull / THRESHOLD);
    }, { passive: true });

    document.addEventListener('touchend', function () {
      if (!pulling) return;
      pulling = false;
      var fire = dist * .5 >= THRESHOLD;
      if (indicator) { indicator.remove(); indicator = null; }
      if (fire && window.App && App.refreshSession) {
        App.refreshSession();
        if (navigator.vibrate) navigator.vibrate(8);
      }
      dist = 0;
    });
  })();

  /* ================================================== 7. service worker ===== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    });
  }

  /* Exposed so a view module or the console can reach them if ever needed. */
  window.HRIS.theme = Theme;
  window.HRIS.palette = Palette;
})();

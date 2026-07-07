/**
 * TOTP MFA — Hermes WebUI Extension
 *
 * Adds a TOTP multi-factor authentication management panel to Settings.
 * Requires core server support (api/auth_mfa.py + modified login flow).
 *
 * API surface (absolute same-origin fetch):
 *   GET  /api/auth/mfa/status  → {mfa_enabled, auth_enabled}
 *   GET  /api/auth/mfa/setup   → {secret, provisioning_uri, qr_code_data_url}
 *   POST /api/auth/mfa/enable  → {ok} (body: {secret, code})
 *   POST /api/auth/mfa/disable → {ok} (body: {password})
 */
(function () {
  'use strict';

  var EXT_ID = 'totp-mfa';
  var EXT_NAME = 'TOTP MFA';

  // ── Duplicate-injection guard ─────────────────────────────────────────
  if (document.getElementById('hwx-mfa-section')) return;

  // ── State ─────────────────────────────────────────────────────────────
  var _currentState = null;
  var _setupSecret = '';
  var _sectionEl = null;
  var _busy = false;

  // ── Helpers ───────────────────────────────────────────────────────────

  function q(sel, ctx) { return (ctx || document).querySelector(sel); }

  function showErr(msg) {
    var err = q('.hwx-mfa-error', _sectionEl);
    if (err) { err.textContent = msg; err.style.display = 'block'; }
  }
  function hideErr() {
    var err = q('.hwx-mfa-error', _sectionEl);
    if (err) err.style.display = 'none';
  }
  function showSuccess(msg) {
    var el = q('.hwx-mfa-success', _sectionEl);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    setTimeout(function () { if (el) el.style.display = 'none'; }, 4000);
  }
  function setLoading(el, loading) {
    if (!el) return;
    el.disabled = loading;
    if (loading) {
      if (!el.dataset.restoreText) el.dataset.restoreText = el.textContent;
      el.textContent = el.dataset.loadingText || 'Working…';
    } else {
      if (el.dataset.restoreText) el.textContent = el.dataset.restoreText;
    }
  }
  function escText(s) {
    var el = document.createElement('span');
    el.textContent = String(s);
    return el.innerHTML;
  }
  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── API calls (absolute same-origin) ─────────────────────────────────

  function mfaApi(path, opts) {
    opts = opts || {};
    return window.fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (d) {
          throw new Error(d && d.error ? d.error : 'Request failed (' + r.status + ')');
        }).catch(function (e) {
          if (e instanceof SyntaxError) throw new Error('Request failed (' + r.status + ')');
          throw e;
        });
      }
      return r.json();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────

  function renderStatus() {
    if (!_sectionEl || !_currentState) return;
    var body = q('.hwx-mfa-body', _sectionEl);
    if (!body) return;
    body.innerHTML = '';

    if (!_currentState.auth_enabled) {
      body.innerHTML =
        '<div class="hwx-mfa-message" style="padding:16px;text-align:center;color:var(--muted,#8888aa)">' +
        '<p>A password must be configured before MFA can be enabled.</p>' +
        '<p style="margin-top:8px;font-size:12px">' +
        'Go to <strong>Settings → Change Password</strong> to set one up.</p></div>';
      return;
    }

    if (_currentState.mfa_enabled) {
      renderEnabled(body);
    } else {
      renderDisabled(body);
    }
  }

  function renderDisabled(body) {
    body.innerHTML =
      '<div class="hwx-mfa-setup-intro" style="padding:12px 0">' +
      '<p style="color:var(--muted,#aaaacc);font-size:13px;line-height:1.5">' +
      'Two-factor authentication adds an extra security layer. After signing in ' +
      'with your password, you\'ll need a 6-digit code from an authenticator app ' +
      '(Google Authenticator, Authy, Microsoft Authenticator, etc.).</p></div>' +
      '<div id="hwx-mfa-setup-area">' +
      '<button class="hwx-mfa-setup-btn" data-loading-text="Generating…">Set up TOTP</button></div>' +
      '<div class="hwx-mfa-error" style="display:none;margin-top:12px;padding:8px 12px;' +
      'background:rgba(233,69,96,.12);border-radius:8px;color:#e94560;font-size:12px"></div>' +
      '<div class="hwx-mfa-success" style="display:none;margin-top:12px;padding:8px 12px;' +
      'background:rgba(111,214,164,.12);border-radius:8px;color:#6fd6a4;font-size:12px"></div>';
    var btn = q('.hwx-mfa-setup-btn', body);
    if (btn) btn.addEventListener('click', startSetup);
  }

  function renderEnabled(body) {
    body.innerHTML =
      '<div class="hwx-mfa-enabled-status" style="padding:12px 0">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:12px;' +
      'background:rgba(111,214,164,.1);border:1px solid rgba(111,214,164,.25);border-radius:10px">' +
      '<span style="font-size:20px;flex-shrink:0">&#x2705;</span>' +
      '<div><strong style="color:#6fd6a4">MFA is enabled</strong>' +
      '<p style="font-size:12px;color:var(--muted,#8888aa);margin-top:2px">' +
      'Your account requires a TOTP code in addition to your password.</p></div></div></div>' +
      '<div class="hwx-mfa-disable-area">' +
      '<details style="margin-top:8px"><summary style="cursor:pointer;color:#e94560;font-size:13px;padding:4px 0">' +
      'Disable two-factor authentication</summary>' +
      '<div style="margin-top:8px;padding:12px;background:rgba(233,69,96,.06);border-radius:8px">' +
      '<p style="font-size:12px;color:var(--muted,#8888aa);margin-bottom:8px">' +
      'Enter your password to confirm disabling MFA.</p>' +
      '<input type="password" id="hwx-mfa-disable-pw" placeholder="Password" ' +
      'style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);' +
      'background:rgba(255,255,255,.04);color:var(--text,#e8e8f0);font-size:13px;outline:none;margin-bottom:8px">' +
      '<button id="hwx-mfa-disable-btn" data-loading-text="Disabling…">Disable MFA</button>' +
      '</div></details></div>' +
      '<div class="hwx-mfa-error" style="display:none;margin-top:8px;padding:8px 12px;' +
      'background:rgba(233,69,96,.12);border-radius:8px;color:#e94560;font-size:12px"></div>' +
      '<div class="hwx-mfa-success" style="display:none;margin-top:8px;padding:8px 12px;' +
      'background:rgba(111,214,164,.12);border-radius:8px;color:#6fd6a4;font-size:12px"></div>';
    var btn = document.getElementById('hwx-mfa-disable-btn');
    if (btn) btn.addEventListener('click', doDisable);
  }

  // ── Setup flow ────────────────────────────────────────────────────────

  function startSetup() {
    if (_busy) return;
    hideErr();
    var btn = q('.hwx-mfa-setup-btn', _sectionEl);
    if (!btn) return;
    _busy = true; setLoading(btn, true);

    mfaApi('/api/auth/mfa/setup').then(function (data) {
      _setupSecret = data.secret;
      showSetupForm(data);
    }).catch(function (err) {
      showErr(err.message || 'Failed to generate TOTP secret');
    }).finally(function () {
      setLoading(btn, false); _busy = false;
    });
  }

  function showSetupForm(data) {
    var area = document.getElementById('hwx-mfa-setup-area');
    if (!area) return;

    area.innerHTML =
      '<div class="hwx-mfa-qr-section" style="text-align:center;padding:8px 0">' +
      '<p style="font-size:13px;color:var(--muted,#aaaacc);margin-bottom:8px">' +
      'Scan this QR code with your authenticator app:</p>' +
      (data.qr_code_data_url
        ? '<img src="' + escAttr(data.qr_code_data_url) + '" alt="TOTP QR Code" ' +
          'style="width:180px;height:180px;border-radius:8px;margin:0 auto 12px;display:block">'
        : '<p style="color:var(--muted,#8888aa);padding:20px 0">QR code unavailable — ' +
          'install <code>qrcode[pil]</code> on the server for visual QR codes.</p>') +
      '<p style="font-size:11px;color:var(--muted,#666688);margin-bottom:4px">' +
      'Or enter this key manually:</p>' +
      '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);' +
      'border-radius:6px;padding:8px 12px;margin:0 auto 12px;display:inline-block;' +
      'font-family:monospace;font-size:13px;color:#e8a030;word-break:break-all;max-width:260px">' +
      escText(_setupSecret) + '</div>' +
      '<input type="text" id="hwx-mfa-verify-code" placeholder="Enter 6-digit code" ' +
      'maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" ' +
      'style="width:160px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);' +
      'background:rgba(255,255,255,.04);color:var(--text,#e8e8f0);font-size:16px;' +
      'letter-spacing:4px;text-align:center;outline:none;display:block;margin:0 auto 8px">' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<button id="hwx-mfa-verify-btn" data-loading-text="Verifying…">Verify &amp; Enable</button>' +
      '<button id="hwx-mfa-cancel-setup" ' +
      'style="padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.1);' +
      'background:transparent;color:var(--muted,#8888aa);font-size:13px;cursor:pointer">Cancel</button></div></div>' +
      '<div class="hwx-mfa-error" style="display:none;margin-top:8px;padding:8px 12px;' +
      'background:rgba(233,69,96,.12);border-radius:8px;color:#e94560;font-size:12px"></div>' +
      '<div class="hwx-mfa-success" style="display:none;margin-top:8px;padding:8px 12px;' +
      'background:rgba(111,214,164,.12);border-radius:8px;color:#6fd6a4;font-size:12px"></div>';

    var verifyBtn = document.getElementById('hwx-mfa-verify-btn');
    if (verifyBtn) verifyBtn.addEventListener('click', doEnable);

    var cancelBtn = document.getElementById('hwx-mfa-cancel-setup');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      _setupSecret = ''; refreshStatus();
    });

    var ci = document.getElementById('hwx-mfa-verify-code');
    if (ci) {
      ci.focus();
      ci.addEventListener('keydown', function (e) { if (e.key === 'Enter') doEnable(); });
      ci.addEventListener('input', function () {
        if (this.value.length === 6 && /^\d{6}$/.test(this.value)) doEnable();
      });
    }
  }

  // ── Enable / Disable ──────────────────────────────────────────────────

  function doEnable() {
    if (_busy) return;
    var codeInput = document.getElementById('hwx-mfa-verify-code');
    if (!codeInput) return;
    var code = codeInput.value.trim();
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      showErr('Please enter a valid 6-digit code'); return;
    }
    hideErr(); _busy = true;
    var btn = document.getElementById('hwx-mfa-verify-btn');
    setLoading(btn, true);

    mfaApi('/api/auth/mfa/enable', {
      method: 'POST', body: { secret: _setupSecret, code: code },
    }).then(function () {
      showSuccess('MFA enabled successfully! Your next login will require a TOTP code.');
      _setupSecret = ''; refreshStatus();
    }).catch(function (err) {
      showErr(err.message || 'Failed to enable MFA');
    }).finally(function () {
      setLoading(btn, false); _busy = false;
    });
  }

  function doDisable() {
    if (_busy) return;
    var pwInput = document.getElementById('hwx-mfa-disable-pw');
    if (!pwInput) return;
    if (!pwInput.value) { showErr('Please enter your password to disable MFA'); return; }

    hideErr(); _busy = true;
    var btn = document.getElementById('hwx-mfa-disable-btn');
    setLoading(btn, true);

    mfaApi('/api/auth/mfa/disable', {
      method: 'POST', body: { password: pwInput.value },
    }).then(function () {
      showSuccess('MFA disabled successfully.');
      pwInput.value = ''; refreshStatus();
    }).catch(function (err) {
      showErr(err.message || 'Failed to disable MFA');
    }).finally(function () {
      setLoading(btn, false); _busy = false;
    });
  }

  // ── Status poll ───────────────────────────────────────────────────────

  function refreshStatus() {
    hideErr();
    mfaApi('/api/auth/mfa/status').then(function (data) {
      _currentState = data; renderStatus();
    }).catch(function (err) {
      var body = q('.hwx-mfa-body', _sectionEl);
      if (body) {
        body.innerHTML =
          '<div class="hwx-mfa-message" style="padding:16px;text-align:center;color:#e94560">' +
          '<p>Failed to check MFA status.</p>' +
          '<p style="font-size:12px;margin-top:4px">Ensure the server has ' +
          '<code>pyotp</code> and <code>qrcode[pil]</code> installed.</p>' +
          '<p style="font-size:11px;color:var(--muted,#8888aa);margin-top:4px">' +
          escText(err.message || '') + '</p></div>';
      }
    });
  }

  // ── Panel visibility ─────────────────────────────────────────────────

  function showMfaPanel() {
    if (!_sectionEl) return;
    ['Conversation','Appearance','Preferences','Providers','Plugins','Extensions','System','Help'].forEach(function (id) {
      var p = document.getElementById('settingsPane' + id);
      if (p) p.classList.remove('active');
    });
    _sectionEl.style.display = 'block';
    document.querySelectorAll('#settingsMenu .side-menu-item').forEach(function (it) {
      it.classList.toggle('active', it.dataset.settingsSection === EXT_ID);
    });
    refreshStatus();
  }

  // ── Inject ────────────────────────────────────────────────────────────

  function inject() {
    _sectionEl = document.createElement('div');
    _sectionEl.id = 'hwx-mfa-section';
    _sectionEl.setAttribute('data-settings-section', EXT_ID);
    _sectionEl.style.display = 'none';
    _sectionEl.style.padding = '0 16px 24px';

    var h3 = document.createElement('h3');
    h3.textContent = EXT_NAME;
    _sectionEl.appendChild(h3);

    var body = document.createElement('div');
    body.className = 'hwx-mfa-body';
    body.textContent = 'Checking MFA status…';
    _sectionEl.appendChild(body);

    var main = document.querySelector('main');
    if (!main) { setTimeout(inject, 200); return; }
    main.appendChild(_sectionEl);

    // Add sidebar nav item (settings menu may lazy-load)
    function addSidebarItem() {
      var menu = document.getElementById('settingsMenu');
      if (!menu || menu.querySelector('[data-settings-section="' + EXT_ID + '"]')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'side-menu-item';
      btn.setAttribute('data-settings-section', EXT_ID);
      btn.textContent = EXT_NAME;
      btn.addEventListener('click', showMfaPanel);
      menu.appendChild(btn);
    }
    var menuPoll = setInterval(function () {
      addSidebarItem();
      if (document.getElementById('settingsMenu')) clearInterval(menuPoll);
    }, 200);
    setTimeout(function () { clearInterval(menuPoll); }, 5000);

    // Wrap switchSettingsSection to intercept our custom section
    if (typeof window.switchSettingsSection === 'function') {
      var _orig = window.switchSettingsSection;
      window.switchSettingsSection = function (name, opts) {
        if (name === EXT_ID) {
          // Open settings first (use a known section as entry)
          if (typeof window.switchPanel === 'function') window.switchPanel('settings');
          _orig('conversation', opts);
          showMfaPanel();
          return;
        }
        _orig(name, opts);
        if (_sectionEl) _sectionEl.style.display = 'none';
      };
    }

    refreshStatus();
  }

  // ── Boot: probe API, then inject if available ─────────────────────────

  function boot() {
    mfaApi('/api/auth/mfa/status').then(function () {
      inject();
    }).catch(function () {
      console.log('[totp-mfa] MFA API not available — extension not injected');
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 200);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 200); });
  }
})();

(function (window, document) {
  'use strict';
  var state = {
    view: 'home',
    query: '',
    items: TZ.readJson('tz_last_items', []),
    queue: [],
    index: -1,
    current: null,
    player: TidalPlayer.snapshot(),
    busy: false,
    toastTimer: null
  };
  var nav = [
    ['home', '⌂', 'Home'],
    ['search', '⌕', 'Search'],
    ['library', '♡', 'Library'],
    ['now', '♪', 'Now Playing'],
    ['settings', '⚙', 'Settings'],
    ['diagnostics', 'ⓘ', 'Diagnostics']
  ];
  function $(id) { return document.getElementById(id); }
  function boot() {
    TZ.registerRemoteKeys();
    renderShell();
    bindGlobalKeys();
    window.addEventListener('tz-player-state', function (e) { state.player = e.detail || TidalPlayer.snapshot(); state.current = state.player.current || state.current; renderPlayer(); });
    window.addEventListener('tz-track-ended', next);
    window.addEventListener('tz-player-error', function (e) { toast('Playback error: ' + JSON.stringify(e.detail || {})); });
    if (TidalApi.token()) {
      TidalApi.session().then(function () { renderShell(); }).catch(function (e) { TZ.log('initial_session_failed', { message: e.message }); renderShell(); });
    }
    setTimeout(focusFirst, 150);
  }
  function authState() { return TidalApi.token() ? 'AUTH OK' : 'OFFLINE'; }
  function runtimeState() {
    if (!navigator.onLine) return 'network unavailable';
    var cfg = TidalApi.cfg();
    if (!cfg.clientId && !TidalApi.token()) return 'no credentials';
    if (!TidalApi.token()) return 'login required';
    if (!TZ.isTizen()) return 'dev/browser fallback mode';
    var snap = TidalPlayer.snapshot ? TidalPlayer.snapshot() : {};
    if (snap && snap.engine === 'error') return 'playback unsupported';
    return 'online';
  }
  function showFatalOverlay(category, message) {
    var old = $('fatalOverlay'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var d = document.createElement('div');
    d.id = 'fatalOverlay'; d.className = 'modal';
    d.innerHTML = '<div class="modal-card glass"><h1>Startup error</h1><p class="meta">' + TZ.esc(category) + '</p><div class="notice">' + TZ.esc(message || 'Unknown error') + '</div><div class="actions" style="margin-top:22px"><button class="primary focusable" id="fatalRetry">Retry</button><button class="secondary focusable" id="fatalDiag">Diagnostics</button></div></div>';
    document.body.appendChild(d);
    $('fatalRetry').onclick = function () { window.location.reload(); };
    $('fatalDiag').onclick = function () { state.view = 'diagnostics'; renderShell(); if (d.parentNode) d.parentNode.removeChild(d); };
    focusFirst();
  }
  function renderShell() {
    $('app').className = 'app-shell';
    $('app').innerHTML = sidebar() + topbar() + '<main class="main glass"><div class="scroll" id="content"></div></main><footer class="player glass" id="player"></footer>';
    bindShell();
    renderView();
    renderPlayer();
  }
  function sidebar() {
    var h = '<aside class="sidebar glass"><div class="brand"><img class="brand-logo" src="assets/icons/icon-128.png"><div><div class="brand-title">Tidalizen</div><div class="brand-subtitle">native Tizen WGT · v' + TZ.version + '</div></div></div><nav class="nav">';
    for (var i = 0; i < nav.length; i++) h += '<button class="nav-btn focusable ' + (state.view === nav[i][0] ? 'active' : '') + '" data-view="' + nav[i][0] + '"><span class="nav-icon">' + nav[i][1] + '</span><span>' + nav[i][2] + '</span></button>';
    h += '</nav><div class="side-footer"><div class="badge">' + authState() + '</div><div class="meta" style="margin-top:10px">State: ' + TZ.esc(runtimeState()) + '</div><br>Remote: arrows + OK<br>Blue: diagnostics<br>Yellow: refresh<br>Green: favorites</div></aside>';
    return h;
  }
  function topbar() {
    return '<header class="topbar glass"><button class="icon-btn focusable" id="backBtn">‹</button><div class="search-box focusable" id="searchBox"><span>⌕</span><input id="searchInput" value="' + TZ.esc(state.query) + '" placeholder="Search TIDAL tracks, albums, artists"></div><button class="secondary focusable" id="loginQuick">' + (TidalApi.token() ? 'Session' : 'Login') + '</button><div class="status-pill" id="statusPill">' + authState() + '</div></header>';
  }
  function bindShell() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) { b.onclick = function () { state.view = this.getAttribute('data-view'); renderShell(); setTimeout(focusFirst, 40); }; });
    $('backBtn').onclick = function () { state.view = 'home'; renderShell(); };
    $('loginQuick').onclick = function () { state.view = 'settings'; renderShell(); };
    var input = $('searchInput');
    input.onkeydown = function (e) { if ((e.keyCode || e.which) === 13) { e.preventDefault(); state.query = input.value; doSearch(state.query); input.blur(); } };
    $('searchBox').onclick = function () { input.focus(); };
  }
  function renderView() {
    var c = $('content');
    if (!c) return;
    if (state.view === 'home') renderHome(c);
    else if (state.view === 'search') renderSearch(c);
    else if (state.view === 'library') renderLibrary(c);
    else if (state.view === 'now') renderNow(c);
    else if (state.view === 'settings') renderSettings(c);
    else renderDiagnostics(c);
  }
  function renderHome(c) {
    c.innerHTML = '<section class="hero"><h1>TV-first TIDAL listening.</h1><p>Native Tizen WGT shell, AVPlay playback adapter, TIDAL SDK-aligned auth/API flow, full diagnostics, and no TizenBrew dependency.</p><img class="hero-mark" src="assets/icons/icon-512.png"></section>' +
      '<div class="section-head"><h2>Quick picks</h2><button class="secondary focusable" id="loadFavBtn">Load favorites</button></div><div class="grid" id="tileGrid"></div>' +
      '<div class="section-head"><h2>Tracks</h2><span class="badge">' + state.items.length + ' items</span></div><div class="track-list" id="trackList"></div>';
    $('loadFavBtn').onclick = loadFavorites;
    renderTiles(); renderTracks();
  }
  function renderSearch(c) {
    c.innerHTML = '<section class="hero"><h1>Search.</h1><p>Use the top search box or type here. OK starts playback, media keys control the queue.</p></section>' +
      '<div class="form"><div class="field"><label>Search query</label><input class="focusable" id="searchPageInput" value="' + TZ.esc(state.query) + '" placeholder="Daft Punk, Hans Zimmer, playlist..."></div><div class="actions"><button class="primary focusable" id="searchPageBtn">Search</button><button class="secondary focusable" id="clearBtn">Clear</button></div></div>' +
      '<div class="section-head"><h2>Results</h2><span class="badge">' + TZ.esc(state.query || 'empty') + '</span></div><div class="track-list" id="trackList"></div>';
    $('searchPageBtn').onclick = function () { state.query = $('searchPageInput').value; doSearch(state.query); };
    $('searchPageInput').onkeydown = function (e) { if ((e.keyCode || e.which) === 13) $('searchPageBtn').click(); };
    $('clearBtn').onclick = function () { state.items = []; state.queue = []; TZ.writeJson('tz_last_items', []); renderShell(); };
    renderTracks();
  }
  function renderLibrary(c) {
    c.innerHTML = '<section class="hero"><h1>Your library.</h1><p>Loads favorite tracks through the configured TIDAL session. Green remote key refreshes this screen.</p></section><div class="actions"><button class="primary focusable" id="favBtn">Refresh favorites</button><button class="secondary focusable" id="sessionBtn">Refresh session</button></div><div class="section-head"><h2>Favorite tracks</h2><span class="badge">' + state.items.length + '</span></div><div class="track-list" id="trackList"></div>';
    $('favBtn').onclick = loadFavorites;
    $('sessionBtn').onclick = function () { TidalApi.session().then(function () { toast('Session refreshed'); renderShell(); }).catch(showError); };
    renderTracks();
  }
  function renderNow(c) {
    var p = state.player || {};
    var t = state.current || p.current || {};
    c.innerHTML = '<section class="hero"><h1>' + TZ.esc(t.title || 'Nothing playing') + '</h1><p>' + TZ.esc(t.artist || 'Select a track from Search or Library.') + '</p></section><div class="grid"><div class="tile"><img src="' + TZ.esc(TZ.imageUrl(t.image, 512)) + '"><b>' + TZ.esc(t.title || 'Idle') + '</b><span>' + TZ.esc(t.album || '') + '</span></div><div class="tile"><b>Engine</b><span>' + TZ.esc(p.engine || 'idle') + '</span><br><b>Position</b><span>' + TZ.fmt(p.position) + ' / ' + TZ.fmt(p.duration || t.duration) + '</span><br><b>Manifest</b><span>' + TZ.esc(p.manifest && (p.manifest.source || p.manifest.error || 'loaded')) + '</span></div></div><div class="actions" style="margin-top:24px"><button class="primary focusable" id="toggleNow">Play / Pause</button><button class="secondary focusable" id="prevNow">Previous</button><button class="secondary focusable" id="nextNow">Next</button><button class="danger focusable" id="stopNow">Stop</button></div>';
    $('toggleNow').onclick = TidalPlayer.toggle; $('prevNow').onclick = prev; $('nextNow').onclick = next; $('stopNow').onclick = TidalPlayer.stop;
  }
  function renderSettings(c) {
    var cfg = TidalApi.cfg();
    var a = TidalApi.auth();
    c.innerHTML = '<section class="hero"><h1>Settings.</h1><p>Store only your own TIDAL developer/client values. Device login works only for client IDs that TIDAL permits for limited-input devices.</p></section>' +
      '<div class="notice">No private TIDAL credentials are bundled. This app does not bypass TIDAL DRM or subscription controls. For physical TV installs, sign the WGT with a Samsung/Tizen certificate valid for that TV.</div>' +
      '<div class="form" style="margin-top:22px">' +
      field('clientId', 'TIDAL clientId', cfg.clientId) + field('clientSecret', 'TIDAL clientSecret optional', cfg.clientSecret, 'password') + field('countryCode', 'Country code', cfg.countryCode) +
      '<div class="field"><label>Quality</label><select class="focusable" id="quality"><option>LOW</option><option>HIGH</option><option>LOSSLESS</option><option>MAX</option></select></div>' +
      '<div class="field"><label>Manual access token JSON/string</label><textarea class="focusable" id="tokenImport" placeholder="Paste access token or JSON with access_token / refresh_token"></textarea></div>' +
      '<div class="actions"><button class="primary focusable" id="saveSettings">Save settings</button><button class="secondary focusable" id="deviceLogin">Device login</button><button class="secondary focusable" id="importToken">Import token</button><button class="danger focusable" id="logoutBtn">Logout</button></div>' +
      '<div class="meta">Current auth: ' + TZ.esc(a ? 'stored at ' + new Date(a.savedAt || Date.now()).toLocaleString() : 'none') + '</div></div>';
    $('quality').value = cfg.quality;
    $('saveSettings').onclick = function () { TidalApi.saveConfig({ clientId: val('clientId'), clientSecret: val('clientSecret'), countryCode: val('countryCode') || 'HU', quality: val('quality') || 'HIGH' }); toast('Settings saved'); renderShell(); };
    $('deviceLogin').onclick = startDeviceLogin;
    $('importToken').onclick = function () { try { var raw = val('tokenImport'); var obj; try { obj = JSON.parse(raw); } catch (_) { obj = raw; } TidalApi.importAuth(obj); toast('Token imported'); renderShell(); } catch (e) { showError(e); } };
    $('logoutBtn').onclick = function () { TidalApi.clearAuth(); TZ.removeJson('tz_session'); toast('Logged out'); renderShell(); };
  }
  function field(id, label, value, type) { return '<div class="field"><label>' + TZ.esc(label) + '</label><input class="focusable" id="' + id + '" type="' + (type || 'text') + '" value="' + TZ.esc(value || '') + '"></div>'; }
  function val(id) { var e = $(id); return e ? e.value : ''; }
  function renderDiagnostics(c) {
    var payload = diagnosticPayload();
    c.innerHTML = '<section class="hero"><h1>Diagnostics.</h1><p>Everything needed for TV-side debugging. Blue remote key opens this overlay anywhere.</p></section><div class="actions"><button class="primary focusable" id="openLog">Open full log</button><button class="secondary focusable" id="copyDiag">Refresh</button><button class="danger focusable" id="clearLogs">Clear logs</button></div><pre class="log-pre" style="height:520px;border-radius:24px;background:rgba(0,0,0,.26);margin-top:22px">' + TZ.esc(JSON.stringify(payload, null, 2)) + '</pre>';
    $('openLog').onclick = function () { showLog('Diagnostics'); };
    $('copyDiag').onclick = function () { renderShell(); };
    $('clearLogs').onclick = function () { localStorage.removeItem('tz_logs'); toast('Logs cleared'); renderShell(); };
  }
  function renderTiles() {
    var g = $('tileGrid'); if (!g) return;
    var arr = state.items.slice(0, 10);
    if (!arr.length) { g.innerHTML = '<div class="empty">No items yet. Configure auth, then search or load favorites.</div>'; return; }
    g.innerHTML = arr.map(function (t, i) { return '<button class="tile focusable" data-track="' + i + '"><img src="' + TZ.esc(TZ.imageUrl(t.image, 320)) + '"><b>' + TZ.esc(t.title) + '</b><span>' + TZ.esc(t.artist) + '</span></button>'; }).join('');
    bindTrackButtons(g);
  }
  function renderTracks() {
    var list = $('trackList'); if (!list) return;
    var arr = state.items || [];
    if (!arr.length) { list.innerHTML = '<div class="empty">No tracks loaded.</div>'; return; }
    list.innerHTML = arr.map(function (t, i) { return '<button class="track-row focusable" data-track="' + i + '"><div class="track-no">' + (i + 1) + '</div><img class="cover" src="' + TZ.esc(TZ.imageUrl(t.image, 160)) + '"><div><div class="track-title">' + TZ.esc(t.title) + '</div><div class="artist">' + TZ.esc(t.artist) + '</div></div><div class="album">' + TZ.esc(t.album || '') + '</div><div class="duration">' + TZ.fmt(t.duration) + '</div></button>'; }).join('');
    bindTrackButtons(list);
  }
  function bindTrackButtons(root) { Array.prototype.forEach.call(root.querySelectorAll('[data-track]'), function (el) { el.onclick = function () { playIndex(parseInt(this.getAttribute('data-track'), 10)); }; }); }
  function renderPlayer() {
    var p = $('player'); if (!p) return;
    var snap = state.player || TidalPlayer.snapshot();
    var t = state.current || snap.current || {};
    var dur = snap.duration || t.duration || 0;
    var pos = snap.position || 0;
    p.innerHTML = '<div class="now"><img class="now-cover" src="' + TZ.esc(TZ.imageUrl(t.image, 160)) + '"><div><div class="now-kicker">Now playing</div><div class="now-title">' + TZ.esc(t.title || 'Nothing selected') + '</div><div class="now-artist">' + TZ.esc(t.artist || 'Search or load favorites') + '</div></div></div><div class="controls"><div class="control-buttons"><button class="ctrl focusable" id="prevBtn">⏮</button><button class="ctrl play focusable" id="playBtn">' + (snap.playing ? '⏸' : '▶') + '</button><button class="ctrl focusable" id="nextBtn">⏭</button></div><div class="progress"><span>' + TZ.fmt(pos) + '</span><div class="bar"><div class="bar-fill" style="width:' + (dur ? Math.min(100, pos / dur * 100) : 0) + '%"></div></div><span>' + TZ.fmt(dur) + '</span></div></div><div class="engine"><b>Engine:</b> ' + TZ.esc(snap.engine || 'idle') + '<br><b>Quality:</b> ' + TZ.esc(TidalApi.cfg().quality) + '<br><b>Blue:</b> diagnostics</div>';
    $('prevBtn').onclick = prev; $('nextBtn').onclick = next; $('playBtn').onclick = function () { if (state.current) TidalPlayer.toggle(); else if (state.items.length) playIndex(0); };
  }
  function doSearch(q) {
    q = String(q || '').trim(); if (!q) return toast('Search query is empty');
    state.view = 'search'; state.query = q; state.busy = true; renderShell(); toast('Searching: ' + q);
    TidalApi.search(q, 50).then(function (items) { state.items = items; state.queue = items.slice(); TZ.writeJson('tz_last_items', items); state.busy = false; renderShell(); focusFirst(); }).catch(showError);
  }
  function loadFavorites() {
    state.busy = true; toast('Loading favorites...');
    TidalApi.favorites(80).then(function (items) { state.items = items; state.queue = items.slice(); TZ.writeJson('tz_last_items', items); state.busy = false; state.view = 'library'; renderShell(); }).catch(showError);
  }
  function playIndex(i) {
    var arr = state.items || []; if (!arr[i]) return;
    state.queue = arr.slice(); state.index = i; state.current = arr[i]; renderPlayer(); toast('Opening: ' + arr[i].title);
    TidalPlayer.playTrack(arr[i]).catch(function (e) { showError(e); });
  }
  function next() { if (!state.queue.length) return; var n = state.index + 1; if (n >= state.queue.length) n = 0; playIndex(n); }
  function prev() { if (!state.queue.length) return; var n = state.index - 1; if (n < 0) n = state.queue.length - 1; playIndex(n); }
  function startDeviceLogin() {
    TidalApi.saveConfig({ clientId: val('clientId'), clientSecret: val('clientSecret'), countryCode: val('countryCode') || 'HU', quality: val('quality') || 'HIGH' });
    toast('Requesting device code...');
    TidalApi.startDeviceLogin().then(function (dev) { showDeviceModal(dev); pollDevice(dev, 0); }).catch(showError);
  }
  function showDeviceModal(dev) {
    var url = dev.verification_uri_complete || dev.verificationUriComplete || dev.verification_uri || dev.verificationUri || 'https://link.tidal.com';
    var code = dev.user_code || dev.userCode || '------';
    var old = $('deviceModal'); if (old) old.parentNode.removeChild(old);
    var div = document.createElement('div'); div.className = 'modal'; div.id = 'deviceModal'; div.innerHTML = '<div class="modal-card glass"><h1>Login on your phone</h1><p class="meta">Open this URL and enter the code. Device login only works for TIDAL clients that are permitted to use limited-input auth.</p><div class="code">' + TZ.esc(code) + '</div><div class="notice">' + TZ.esc(url) + '</div><div class="actions" style="margin-top:22px"><button class="primary focusable" id="closeDevice">Close</button></div></div>'; document.body.appendChild(div); $('closeDevice').onclick = function () { div.parentNode.removeChild(div); }; focusFirst();
  }
  function pollDevice(dev, tries) {
    var interval = Math.max(2, dev.interval || 3) * 1000;
    setTimeout(function () {
      TidalApi.pollDeviceLogin(dev).then(function () { var m = $('deviceModal'); if (m) m.parentNode.removeChild(m); toast('Login successful'); TidalApi.session().finally(renderShell); }).catch(function (e) { var status = e.response && e.response.status; var txt = e.response && e.response.text || e.message || ''; if ((status === 400 || status === 428) && /authorization_pending|slow_down/i.test(txt) && tries < 180) return pollDevice(dev, tries + 1); TZ.log('device_poll_error', { status: status, text: txt }); if (tries < 180) return pollDevice(dev, tries + 1); showError(e); });
    }, interval);
  }
  function diagnosticPayload() { return { version: TZ.version, tv: TZ.tvInfo(), auth: TidalApi.auth() ? 'stored' : 'missing', config: TZ.redact(TidalApi.cfg()), session: TZ.readJson('tz_session', null), player: TidalPlayer.snapshot(), queueLength: state.queue.length, currentView: state.view, logs: TZ.logs().slice(-80) }; }
  function showLog(title) {
    var old = $('fullLog'); if (old) old.parentNode.removeChild(old);
    var d = document.createElement('div'); d.id = 'fullLog'; d.className = 'log-overlay'; d.innerHTML = '<div class="log-head"><b>' + TZ.esc(title || 'Diagnostics') + '</b><span>Back / Red closes · Yellow clears · Blue refreshes</span></div><pre class="log-pre">' + TZ.esc(JSON.stringify(diagnosticPayload(), null, 2)) + '</pre>'; document.body.appendChild(d);
  }
  function closeLog() { var d = $('fullLog'); if (d && d.parentNode) d.parentNode.removeChild(d); }
  function showError(e) { TZ.log('error', { message: e && e.message, response: e && e.response }); toast((e && e.message) || String(e)); state.busy = false; renderPlayer(); }
  function toast(msg) { var old = document.querySelector('.toast'); if (old) old.parentNode.removeChild(old); var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4200); }
  function focusables() { return Array.prototype.slice.call(document.querySelectorAll('.focusable, button, input, textarea, select')).filter(function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled; }); }
  function focusFirst() { var f = focusables(); if (f[0]) f[0].focus(); }
  function moveFocus(dir) { var cur = document.activeElement, items = focusables(); if (!items.length) return; if (items.indexOf(cur) < 0) return items[0].focus(); var cr = cur.getBoundingClientRect(), cx = cr.left + cr.width/2, cy = cr.top + cr.height/2, best = null, score = 1e12; items.forEach(function (el) { if (el === cur) return; var r = el.getBoundingClientRect(), x = r.left + r.width/2, y = r.top + r.height/2, dx = x - cx, dy = y - cy; if (dir === 'left' && dx >= -4) return; if (dir === 'right' && dx <= 4) return; if (dir === 'up' && dy >= -4) return; if (dir === 'down' && dy <= 4) return; var primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy); var secondary = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx); var s = primary * primary + secondary * secondary * 2; if (s < score) { score = s; best = el; } }); if (best) best.focus(); }
  function bindGlobalKeys() {
    document.addEventListener('keydown', function (e) {
      var k = e.keyCode || e.which;
      if (k === 406) { e.preventDefault(); showLog('Blue key diagnostics'); return; }
      if (k === 403) { e.preventDefault(); closeLog(); return; }
      if (k === 405) { e.preventDefault(); localStorage.removeItem('tz_logs'); toast('Logs cleared'); return; }
      if (k === 404) { e.preventDefault(); loadFavorites(); return; }
      if (k === 415 || k === 19) { e.preventDefault(); if (state.current) TidalPlayer.toggle(); return; }
      if (k === 412) { e.preventDefault(); prev(); return; }
      if (k === 417) { e.preventDefault(); next(); return; }
      if (k === 413) { e.preventDefault(); TidalPlayer.stop(); return; }
      if (k === 461 || k === 10009 || k === 27) { if ($('fullLog')) { e.preventDefault(); closeLog(); return; } var tag = document.activeElement && document.activeElement.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { document.activeElement.blur(); e.preventDefault(); return; } if (state.view !== 'home') { state.view = 'home'; renderShell(); e.preventDefault(); } return; }
      var activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
      if (k === 37) { e.preventDefault(); moveFocus('left'); }
      else if (k === 39) { e.preventDefault(); moveFocus('right'); }
      else if (k === 38) { e.preventDefault(); moveFocus('up'); }
      else if (k === 40) { e.preventDefault(); moveFocus('down'); }
      else if (k === 13 && document.activeElement && document.activeElement.click) { e.preventDefault(); document.activeElement.click(); }
    });
  }
  window.addEventListener('error', function (e) { TZ.log('window_error', { message: e.message, source: e.filename, line: e.lineno }); showFatalOverlay('runtime', e.message || 'Unhandled runtime error'); });
  window.addEventListener('unhandledrejection', function (e) { var msg = e && e.reason && (e.reason.message || String(e.reason)) || 'Unhandled promise rejection'; TZ.log('unhandled_rejection', { message: msg }); showFatalOverlay('promise', msg); });
  window.addEventListener('load', function () { try { boot(); } catch (e) { TZ.log('boot_failed', { message: e.message }); showFatalOverlay('boot', e.message); } });
})(window, document);

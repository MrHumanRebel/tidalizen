(function (window) {
  'use strict';
  var logs = [];
  function now() { return new Date().toISOString(); }
  function redact(value) {
    try {
      return JSON.parse(JSON.stringify(value, function (k, v) {
        if (/token|secret|password|authorization|challenge|license/i.test(k)) return '[redacted]';
        if (typeof v === 'string' && v.length > 1600) return v.slice(0, 1600) + '…[' + v.length + ']';
        return v;
      }));
    } catch (e) { return String(value); }
  }
  function log(type, payload) {
    var item = { time: now(), type: type, payload: redact(payload) };
    logs.push(item);
    if (logs.length > 260) logs.shift();
    try { console.log('[Tidalizen]', type, payload); } catch (_) {}
    try { localStorage.setItem('tz_logs', JSON.stringify(logs.slice(-90))); } catch (_) {}
  }
  function storedLogs() {
    try {
      var old = JSON.parse(localStorage.getItem('tz_logs') || '[]');
      return old.concat(logs).slice(-220);
    } catch (_) { return logs.slice(); }
  }
  function isTizen() { return !!(window.tizen || window.webapis); }
  function getTvInfo() {
    var out = { isTizen: isTizen(), userAgent: navigator.userAgent };
    try { if (window.webapis && webapis.productinfo) out.model = webapis.productinfo.getModel(); } catch (e) { out.productInfoError = e.message; }
    try { if (window.tizen && tizen.systeminfo) out.platform = 'tizen'; } catch (_) {}
    return out;
  }
  function registerRemoteKeys() {
    var keys = ['MediaPlayPause','MediaPlay','MediaPause','MediaStop','MediaFastForward','MediaRewind','MediaTrackNext','MediaTrackPrevious','ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue','Exit','Back'];
    try {
      if (window.tizen && tizen.tvinputdevice) {
        for (var i = 0; i < keys.length; i++) {
          try { tizen.tvinputdevice.registerKey(keys[i]); } catch (e) { log('register_key_failed', { key: keys[i], message: e.message }); }
        }
      }
    } catch (e) { log('register_keys_failed', { message: e.message }); }
  }
  function imageUrl(id, size) {
    if (!id) return 'assets/icons/icon-256.png';
    return 'https://resources.tidal.com/images/' + String(id).replace(/-/g, '/') + '/' + (size || 320) + 'x' + (size || 320) + '.jpg';
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec || 0)));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
  }
  function readJson(k, fallback) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function removeJson(k) { try { localStorage.removeItem(k); } catch (_) {} }
  window.TZ = {
    version: '1.0.0',
    log: log,
    logs: storedLogs,
    redact: redact,
    isTizen: isTizen,
    tvInfo: getTvInfo,
    registerRemoteKeys: registerRemoteKeys,
    imageUrl: imageUrl,
    fmt: fmt,
    esc: escapeHtml,
    readJson: readJson,
    writeJson: writeJson,
    removeJson: removeJson
  };
})(window);

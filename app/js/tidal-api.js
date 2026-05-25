(function (window) {
  'use strict';
  var AUTH = 'https://auth.tidal.com/v1/oauth2';
  var API_V1 = 'https://api.tidal.com/v1';
  var API_V2 = 'https://api.tidal.com/v2';
  var OPENAPI = 'https://openapi.tidal.com/v2';
  var storageKey = 'tz_auth';
  var configKey = 'tz_config';

  function cfg() {
    var c = TZ.readJson(configKey, {});
    return {
      clientId: c.clientId || '',
      clientSecret: c.clientSecret || '',
      countryCode: (c.countryCode || 'HU').toUpperCase(),
      quality: (c.quality || 'HIGH').toUpperCase(),
      proxyBase: (c.proxyBase || '').replace(/\/+$/, '')
    };
  }
  function saveConfig(c) { TZ.writeJson(configKey, c || {}); }
  function auth() { return TZ.readJson(storageKey, null); }
  function saveAuth(a) { TZ.writeJson(storageKey, a || null); }
  function clearAuth() { TZ.removeJson(storageKey); }
  function token() {
    var a = auth();
    return a && (a.access_token || a.accessToken || a.token || a.oAuthAccessToken) || '';
  }
  function userId() { var s = TZ.readJson('tz_session', null); return s && (s.userId || s.user_id || (s.user && s.user.id)); }
  function headers(hasBody) {
    var h = { 'Accept': 'application/json' };
    if (hasBody) h['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    var t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  function encodeForm(o) {
    var a = [];
    Object.keys(o || {}).forEach(function (k) {
      if (o[k] === undefined || o[k] === null || o[k] === '') return;
      if (Array.isArray(o[k])) {
        for (var i = 0; i < o[k].length; i++) a.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k][i]));
      } else a.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k]));
    });
    return a.join('&');
  }
  function request(method, url, opts) {
    opts = opts || {};
    var started = Date.now();
    TZ.log('http_start', { method: method, url: url, body: opts.body });
    return fetch(url, {
      method: method,
      headers: opts.headers || headers(!!opts.body),
      body: opts.body,
      cache: 'no-store',
      credentials: 'omit'
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) {}
        var out = { status: res.status, ok: res.ok, json: json, text: text };
        TZ.log('http_done', { url: url, status: res.status, ms: Date.now() - started, preview: text && text.slice(0, 300) });
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status + ' for ' + url);
          err.response = out;
          throw err;
        }
        return out;
      });
    });
  }
  function get(base, path, params) {
    params = params || {};
    var q = Object.keys(params).map(function (k) {
      var v = params[k];
      if (Array.isArray(v)) return v.map(function (x) { return encodeURIComponent(k) + '=' + encodeURIComponent(x); }).join('&');
      if (v === undefined || v === null || v === '') return '';
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }).filter(Boolean).join('&');
    return request('GET', base + path + (q ? '?' + q : '')).then(function (r) { return r.json; });
  }
  function postForm(url, payload, bearer) {
    var h = { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
    if (bearer) h.Authorization = 'Bearer ' + bearer;
    return request('POST', url, { headers: h, body: encodeForm(payload) }).then(function (r) { return r.json; });
  }
  function startDeviceLogin() {
    var c = cfg();
    if (!c.clientId) return Promise.reject(new Error('Missing TIDAL clientId'));
    return postForm(AUTH + '/device_authorization', {
      client_id: c.clientId,
      scope: 'r_usr w_usr'
    }).then(function (r) {
      r.createdAt = Date.now();
      TZ.writeJson('tz_device_login', r);
      return r;
    });
  }
  function pollDeviceLogin(device) {
    var c = cfg();
    var code = device && (device.device_code || device.deviceCode);
    if (!code) return Promise.reject(new Error('Missing device_code'));
    return postForm(AUTH + '/token', {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      device_code: code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    }).then(function (r) {
      r.savedAt = Date.now();
      saveAuth(r);
      return r;
    });
  }
  function refresh() {
    var c = cfg(), a = auth(), rt = a && (a.refresh_token || a.refreshToken || a.oAuthRefreshToken);
    if (!rt) return Promise.reject(new Error('No refresh token available'));
    return postForm(AUTH + '/token', {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: rt,
      grant_type: 'refresh_token'
    }).then(function (r) {
      if (!r.refresh_token) r.refresh_token = rt;
      r.savedAt = Date.now();
      saveAuth(r);
      return r;
    });
  }
  function withAuth(fn) {
    if (!token()) return Promise.reject(new Error('Not authenticated. Configure token/client in Settings.'));
    return fn().catch(function (err) {
      var status = err && err.response && err.response.status;
      if (status === 401) return refresh().then(fn);
      throw err;
    });
  }
  function session() {
    return withAuth(function () { return get(API_V1, '/sessions', {}); }).then(function (s) { TZ.writeJson('tz_session', s || null); return s; });
  }
  function normalizeSearch(raw) {
    var items = [];
    function addTrack(t) { if (!t) return; items.push(normalizeTrack(t)); }
    if (!raw) return items;
    if (raw.tracks && raw.tracks.items) raw.tracks.items.forEach(addTrack);
    if (raw.tracks && Array.isArray(raw.tracks)) raw.tracks.forEach(addTrack);
    if (raw.data && Array.isArray(raw.data)) raw.data.forEach(function (item) { if (item.type === 'tracks' || item.type === 'track') addTrack(item); });
    if (raw.included && Array.isArray(raw.included)) raw.included.forEach(function (item) { if (item.type === 'tracks' || item.type === 'track') addTrack(item); });
    return dedupe(items);
  }
  function dedupe(items) {
    var seen = {}, out = [];
    for (var i = 0; i < items.length; i++) { var id = String(items[i].id || ''); if (!id || seen[id]) continue; seen[id] = true; out.push(items[i]); }
    return out;
  }
  function normalizeTrack(t) {
    var a = t.attributes || t;
    var rel = t.relationships || {};
    var album = a.album || (rel.albums && rel.albums.data && rel.albums.data[0]) || {};
    var artists = a.artists || a.artist || [];
    if (!Array.isArray(artists)) artists = artists ? [artists] : [];
    var image = a.imageCover || a.cover || a.albumCover || (album && (album.imageCover || album.cover));
    return {
      id: t.id || a.id || a.trackId,
      title: a.title || a.name || 'Unknown track',
      artist: artists.map(function (x) { return x.name || (x.attributes && x.attributes.name) || ''; }).filter(Boolean).join(', ') || a.artistName || 'Unknown artist',
      album: (a.album && (a.album.title || a.album.name)) || a.albumTitle || (album && album.title) || '',
      duration: a.duration || a.durationSeconds || a.durationInSeconds || 0,
      image: image || '',
      explicit: !!(a.explicit || a.explicitContent),
      raw: t
    };
  }
  function search(q, limit) {
    var c = cfg();
    return withAuth(function () {
      return get(API_V2, '/search', {
        query: q,
        countryCode: c.countryCode,
        limit: limit || 40,
        types: 'ARTISTS,ALBUMS,TRACKS,PLAYLISTS',
        includeContributors: 'true',
        includeUserPlaylists: 'true',
        supportsUserData: 'true',
        locale: 'en_US',
        deviceType: 'BROWSER'
      }).catch(function () {
        return get(API_V1, '/search', {
          query: q,
          countryCode: c.countryCode,
          limit: limit || 40,
          offset: 0,
          types: 'ARTISTS,ALBUMS,TRACKS,PLAYLISTS',
          includeContributors: 'true',
          includeUserPlaylists: 'true',
          supportsUserData: 'true'
        });
      });
    }).then(normalizeSearch);
  }
  function favorites(limit) {
    var uid = userId();
    if (!uid) return session().then(function () { return favorites(limit); });
    var c = cfg();
    return withAuth(function () {
      return get(API_V1, '/users/' + encodeURIComponent(uid) + '/favorites/tracks', {
        countryCode: c.countryCode,
        limit: limit || 80,
        offset: 0
      });
    }).then(function (raw) {
      var arr = raw && (raw.items || raw.tracks || raw.data || []);
      return dedupe(arr.map(function (x) { return normalizeTrack(x.item || x.track || x); }));
    });
  }
  function formatsForQuality(q) {
    q = String(q || 'HIGH').toUpperCase();
    var out = ['HEAACV1'];
    if (q === 'LOW') return out;
    out.push('AACLC');
    if (q === 'HIGH') return out;
    out.push('FLAC');
    if (q === 'MAX' || q === 'HI_RES' || q === 'HI_RES_LOSSLESS') out.push('FLAC_HIRES');
    return out;
  }
  function b64decode(s) {
    try {
      s = String(s || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return decodeURIComponent(escape(atob(s)));
    } catch (e) { return ''; }
  }
  function manifestFromPayload(p) {
    if (!p) return { error: 'empty_manifest_payload' };
    var a = p.data && p.data.attributes ? p.data.attributes : p;
    var uri = a.uri || a.manifest || a.manifestData || a.mpd || '';
    var license = (a.drmData && (a.drmData.licenseUrl || a.drmData.license_url)) || a.licenseUrl || a.license_url || '';
    if (/^https?:\/\//i.test(uri)) return { manifestUrl: uri, licenseUrl: license, raw: p, source: 'https-uri' };
    if (/^data:/i.test(uri)) {
      var body = uri.slice(uri.indexOf(',') + 1);
      var decoded = /;base64,/i.test(uri) ? b64decode(body) : decodeURIComponent(body);
      return { manifestText: decoded, manifestBlobUrl: makeBlobUrl(decoded, 'application/dash+xml'), licenseUrl: license, raw: p, source: 'data-uri' };
    }
    if (String(uri).indexOf('<MPD') >= 0) return { manifestText: uri, manifestBlobUrl: makeBlobUrl(uri, 'application/dash+xml'), licenseUrl: license, raw: p, source: 'plain-mpd' };
    var decoded2 = b64decode(uri);
    if (decoded2 && decoded2.indexOf('<MPD') >= 0) return { manifestText: decoded2, manifestBlobUrl: makeBlobUrl(decoded2, 'application/dash+xml'), licenseUrl: license, raw: p, source: 'base64-mpd' };
    return { error: 'unsupported_manifest_shape', raw: p, availableKeys: Object.keys(a || {}) };
  }
  function makeBlobUrl(text, type) {
    try { return URL.createObjectURL(new Blob([text || ''], { type: type || 'text/plain' })); } catch (_) { return ''; }
  }
  function trackManifest(trackId, quality) {
    var c = cfg(), q = quality || c.quality;
    return withAuth(function () {
      return get(OPENAPI, '/trackManifests/' + encodeURIComponent(trackId), {
        manifestType: 'MPEG_DASH',
        formats: formatsForQuality(q),
        uriScheme: 'HTTPS',
        usage: 'PLAYBACK',
        adaptive: 'false'
      }).catch(function () {
        return get(OPENAPI, '/trackManifests/' + encodeURIComponent(trackId), {
          manifestType: 'MPEG_DASH',
          formats: formatsForQuality(q),
          uriScheme: 'DATA',
          usage: 'PLAYBACK',
          adaptive: 'false'
        });
      }).catch(function () {
        return get(API_V1, '/tracks/' + encodeURIComponent(trackId) + '/playbackinfo', {
          countryCode: c.countryCode,
          audioquality: q,
          playbackmode: 'STREAM',
          assetpresentation: 'FULL',
          deviceType: 'BROWSER'
        });
      });
    }).then(function (payload) {
      var m = manifestFromPayload(payload);
      m.trackId = trackId;
      m.quality = q;
      return m;
    });
  }
  function importAuth(obj) {
    obj = obj || {};
    if (typeof obj === 'string') obj = { access_token: obj };
    if (!obj.access_token && !obj.accessToken && !obj.token && !obj.oAuthAccessToken) throw new Error('Missing access token');
    obj.savedAt = Date.now();
    saveAuth(obj);
    return obj;
  }
  window.TidalApi = {
    cfg: cfg,
    saveConfig: saveConfig,
    auth: auth,
    saveAuth: saveAuth,
    clearAuth: clearAuth,
    token: token,
    importAuth: importAuth,
    startDeviceLogin: startDeviceLogin,
    pollDeviceLogin: pollDeviceLogin,
    refresh: refresh,
    session: session,
    search: search,
    favorites: favorites,
    trackManifest: trackManifest,
    normalizeTrack: normalizeTrack
  };
})(window);

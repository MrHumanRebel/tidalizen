(function (window) {
  'use strict';
  var av = null;
  var state = { playing: false, prepared: false, duration: 0, position: 0, timer: null, current: null, manifest: null, engine: 'idle' };
  function getAv() { return window.webapis && window.webapis.avplay ? window.webapis.avplay : null; }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); }
  function setEngine(v, extra) { state.engine = v; TZ.log('player_engine', { engine: v, extra: extra }); emit('tz-player-state', snapshot()); }
  function snapshot() { return { playing: state.playing, prepared: state.prepared, duration: state.duration, position: state.position, current: state.current, engine: state.engine, manifest: TZ.redact(state.manifest) }; }
  function clearTimer() { if (state.timer) clearInterval(state.timer); state.timer = null; }
  function startTimer() {
    clearTimer();
    state.timer = setInterval(function () {
      try { if (av && av.getCurrentTime) state.position = Math.floor(av.getCurrentTime() / 1000); } catch (_) { if (state.playing) state.position++; }
      emit('tz-player-state', snapshot());
    }, 1000);
  }
  function setupListeners(manifest) {
    if (!av || !av.setListener) return;
    av.setListener({
      onbufferingstart: function () { setEngine('buffering'); },
      onbufferingprogress: function (p) { emit('tz-buffering', { percent: p }); },
      onbufferingcomplete: function () { setEngine('buffered'); },
      oncurrentplaytime: function (ms) { state.position = Math.floor((ms || 0) / 1000); emit('tz-player-state', snapshot()); },
      onstreamcompleted: function () { state.playing = false; setEngine('ended'); emit('tz-track-ended', {}); },
      onerror: function (eventType) { setEngine('error', { eventType: eventType }); emit('tz-player-error', { eventType: eventType }); },
      onevent: function (eventType, eventData) { TZ.log('avplay_event', { eventType: eventType, eventData: eventData }); },
      ondrmevent: function (drmEvent, drmData) { handleDrm(drmEvent, drmData, manifest); }
    });
  }
  function handleDrm(event, data, manifest) {
    TZ.log('drm_event', { event: event, data: data, manifest: manifest });
    if (!manifest || !manifest.licenseUrl) return;
    var challenge = data && (data.challenge || data.Challenge || data.challengeData);
    if (!challenge && typeof data === 'string') challenge = data;
    if (!challenge) return;
    var body;
    try { body = typeof challenge === 'string' ? Uint8Array.from(atob(challenge), function (c) { return c.charCodeAt(0); }) : challenge; } catch (_) { body = challenge; }
    fetch(manifest.licenseUrl, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TidalApi.token(), 'Content-Type': 'application/octet-stream' },
      body: body
    }).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var bin = ''; var bytes = new Uint8Array(buf);
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      var license = btoa(bin);
      try {
        var type = /widevine/i.test(String(event) + JSON.stringify(data || {})) ? 'WIDEVINE_CDM' : 'PLAYREADY';
        if (type === 'WIDEVINE_CDM') av.setDrm('WIDEVINE_CDM', 'widevine_license_data', license);
        else av.setDrm('PLAYREADY', 'InstallLicense', license);
        TZ.log('drm_license_installed', { type: type, bytes: bytes.length });
      } catch (e) { TZ.log('drm_install_failed', { message: e.message }); emit('tz-player-error', { error: e.message }); }
    }).catch(function (e) { TZ.log('drm_license_failed', { message: e.message }); emit('tz-player-error', { error: e.message }); });
  }
  function openAvplay(url, manifest) {
    av = getAv();
    if (!av) return Promise.reject(new Error('Samsung AVPlay is not available in this environment'));
    return new Promise(function (resolve, reject) {
      try {
        try { av.stop(); } catch (_) {}
        try { av.close(); } catch (_) {}
        av.open(url);
        setupListeners(manifest);
        if (manifest && manifest.licenseUrl) {
          try { av.setDrm('PLAYREADY', 'SetProperties', JSON.stringify({ LicenseServer: manifest.licenseUrl })); } catch (e) { TZ.log('playready_props_failed', { message: e.message }); }
          try { av.setDrm('WIDEVINE_CDM', 'SetProperties', JSON.stringify({ LicenseServer: manifest.licenseUrl })); } catch (e2) { TZ.log('widevine_props_failed', { message: e2.message }); }
        }
        av.prepareAsync(function () {
          state.prepared = true;
          try { state.duration = Math.floor((av.getDuration && av.getDuration() || 0) / 1000); } catch (_) { state.duration = 0; }
          av.play();
          state.playing = true;
          startTimer();
          setEngine('avplay');
          resolve(snapshot());
        }, function (err) {
          reject(new Error('AVPlay prepare failed: ' + JSON.stringify(err)));
        });
      } catch (e) { reject(e); }
    });
  }
  function openHtmlAudio(url, track) {
    return new Promise(function (resolve, reject) {
      var old = document.getElementById('tzHtmlAudio');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var audio = document.createElement('audio');
      audio.id = 'tzHtmlAudio';
      audio.style.display = 'none';
      audio.src = url;
      audio.autoplay = true;
      document.body.appendChild(audio);
      audio.onloadedmetadata = function () { state.duration = Math.floor(audio.duration || track.duration || 0); };
      audio.ontimeupdate = function () { state.position = Math.floor(audio.currentTime || 0); emit('tz-player-state', snapshot()); };
      audio.onended = function () { state.playing = false; emit('tz-track-ended', {}); };
      audio.onerror = function () { reject(new Error('HTMLAudio playback failed')); };
      audio.play().then(function () { state.playing = true; state.prepared = true; setEngine('html-audio'); resolve(snapshot()); }).catch(reject);
      window.__tzAudio = audio;
    });
  }
  function playTrack(track) {
    state.current = track;
    state.position = 0;
    state.duration = track && track.duration || 0;
    state.manifest = null;
    setEngine('loading-manifest', { trackId: track && track.id });
    return TidalApi.trackManifest(track.id).then(function (manifest) {
      state.manifest = manifest;
      if (manifest.error) throw new Error('Manifest error: ' + manifest.error);
      var url = manifest.manifestUrl || manifest.manifestBlobUrl || manifest.url || manifest.directUrl;
      if (!url) throw new Error('No playable manifest URL in TIDAL response');
      setEngine('opening', { source: manifest.source, hasLicense: !!manifest.licenseUrl });
      return openAvplay(url, manifest).catch(function (avErr) {
        TZ.log('avplay_failed_try_html_audio', { message: avErr.message, url: url });
        if (/^blob:|^https?:/.test(url)) return openHtmlAudio(url, track);
        throw avErr;
      });
    });
  }
  function pause() { try { if (av) av.pause(); if (window.__tzAudio) window.__tzAudio.pause(); } catch (_) {} state.playing = false; setEngine('paused'); }
  function resume() { try { if (av) av.play(); if (window.__tzAudio) window.__tzAudio.play(); } catch (_) {} state.playing = true; setEngine(state.engine === 'paused' ? 'playing' : state.engine); startTimer(); }
  function toggle() { state.playing ? pause() : resume(); }
  function stop() { clearTimer(); try { if (av) { av.stop(); av.close(); } if (window.__tzAudio) window.__tzAudio.pause(); } catch (_) {} state.playing = false; state.prepared = false; setEngine('stopped'); }
  function seek(seconds) { try { if (av && av.seekTo) av.seekTo(Math.max(0, seconds) * 1000); if (window.__tzAudio) window.__tzAudio.currentTime = Math.max(0, seconds); state.position = Math.max(0, seconds); } catch (e) { TZ.log('seek_failed', { message: e.message }); } emit('tz-player-state', snapshot()); }
  window.TidalPlayer = { playTrack: playTrack, pause: pause, resume: resume, toggle: toggle, stop: stop, seek: seek, snapshot: snapshot };
})(window);

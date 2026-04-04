(function () {
  'use strict';

  // API URL: use parent origin's env or fall back to production Railway URL
  var API_BASE = 'https://chatbox-production-d06b.up.railway.app';
  var sessionId = 'demo-session';

  function getSessionId() {
    return sessionId;
  }

  function checkAuth() {
    var sessionId = getSessionId();
    fetch(API_BASE + '/api/oauth/spotify/token?session_id=' + sessionId)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.authenticated) {
          document.getElementById('auth-prompt').style.display = 'none';
          document.getElementById('connected').style.display = 'block';
        } else {
          document.getElementById('auth-prompt').style.display = 'flex';
          document.getElementById('connected').style.display = 'none';
        }
      })
      .catch(function () {
        document.getElementById('auth-prompt').style.display = 'flex';
        document.getElementById('connected').style.display = 'none';
      });
  }

  function renderTracks(tracks, containerId) {
    var container = document.getElementById(containerId);
    // Ensure results are visible even if auth check hasn't completed
    document.getElementById('connected').style.display = 'block';
    document.getElementById('auth-prompt').style.display = 'none';
    while (container.firstChild) container.removeChild(container.firstChild);
    tracks.forEach(function (track) {
      var card = document.createElement('div');
      card.className = 'track-card';
      card.style.cursor = 'pointer';

      var spotifyUrl = track.spotify_url || (track.external_urls && track.external_urls.spotify);
      if (spotifyUrl) {
        card.title = 'Open in Spotify';
        card.addEventListener('click', function () {
          window.open(spotifyUrl, '_blank', 'noopener');
        });
      }

      var img = document.createElement('img');
      var albumImages = track.album && track.album.images;
      img.src = (albumImages && albumImages[2] && albumImages[2].url) || 'https://via.placeholder.com/40';
      img.alt = track.name;

      var info = document.createElement('div');
      info.className = 'track-info';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = track.name;

      var artist = document.createElement('span');
      artist.className = 'artist';
      artist.textContent = track.artists && track.artists[0] ? track.artists[0].name : '';

      info.appendChild(name);
      info.appendChild(artist);
      card.appendChild(img);
      card.appendChild(info);
      container.appendChild(card);
    });
  }

  function initConnectButton() {
    var btn = document.getElementById('connect-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = API_BASE + '/api/oauth/spotify/authorize?session_id=' + getSessionId();
      var popup = window.open(url, 'spotify-auth', 'width=500,height=700');
      var interval = setInterval(function () {
        fetch(API_BASE + '/api/oauth/spotify/token?session_id=' + getSessionId())
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.authenticated) {
              clearInterval(interval);
              if (popup && !popup.closed) popup.close();
              checkAuth();
            }
          })
          .catch(function () {});
      }, 2000);
    });
  }

  ChatBridge.on('toolInvoke', function (payload, requestId) {
    var sessionId = getSessionId();

    if (payload.name === 'search_tracks') {
      fetch(API_BASE + '/api/spotify/search?q=' + encodeURIComponent(payload.arguments.query) + '&session_id=' + sessionId)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var tracks = data.tracks || [];
          renderTracks(tracks, 'search-results');
          var top5 = tracks.slice(0, 5).map(function (t) {
            return { id: t.id, name: t.name, artist: t.artists && t.artists[0] ? t.artists[0].name : '' };
          });
          ChatBridge.respondToTool(requestId, { tracks: top5 });
        })
        .catch(function (err) {
          ChatBridge.respondToTool(requestId, { error: err.message });
        });

    } else if (payload.name === 'create_playlist') {
      fetch(API_BASE + '/api/spotify/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: payload.arguments.name, session_id: sessionId })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          ChatBridge.respondToTool(requestId, result);
        })
        .catch(function (err) {
          ChatBridge.respondToTool(requestId, { error: err.message });
        });

    } else if (payload.name === 'add_to_playlist') {
      fetch(API_BASE + '/api/spotify/playlist/' + payload.arguments.playlist_id + '/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_ids: payload.arguments.track_ids, session_id: sessionId })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          ChatBridge.respondToTool(requestId, result);
          ChatBridge.complete();
        })
        .catch(function (err) {
          ChatBridge.respondToTool(requestId, { error: err.message });
        });

    } else if (payload.name === 'get_recommendations') {
      var seeds = payload.arguments.seed_track_ids.join(',');
      fetch(API_BASE + '/api/spotify/recommendations?seeds=' + encodeURIComponent(seeds) + '&session_id=' + sessionId)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var tracks = data.tracks || [];
          ChatBridge.respondToTool(requestId, { tracks: tracks });
        })
        .catch(function (err) {
          ChatBridge.respondToTool(requestId, { error: err.message });
        });
    }
  });

  ChatBridge.onStateRequest(function () {
    return { authenticated: document.getElementById('connected').style.display === 'block' };
  });

  ChatBridge.on('launch', function (payload) {
    if (payload && payload.sessionId) {
      sessionId = payload.sessionId;
    }
    checkAuth();
    ChatBridge.resize(400);
  });

  // Auto-init
  checkAuth();
  initConnectButton();
})();

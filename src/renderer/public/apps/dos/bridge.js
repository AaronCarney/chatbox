/* DOS Arcade — ChatBridge bridge + launcher logic */
(function () {
  var GAMES = window.DOS_GAMES || [];
  var catalog = document.getElementById('catalog');
  var emulator = document.getElementById('emulator');
  var grid = document.getElementById('game-grid');
  var dosContainer = document.getElementById('dos-container');
  var emuTitle = document.getElementById('emu-title');
  var btnBack = document.getElementById('btn-back');

  var currentGame = null;
  var dosInstance = null;
  var jsDosLoaded = false;

  // --- Catalog rendering (safe DOM construction, no innerHTML) ---
  function renderCatalog() {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    GAMES.forEach(function (g) {
      var card = document.createElement('div');
      card.className = 'game-card';
      card.dataset.id = g.id;

      var img = document.createElement('img');
      img.src = 'covers/' + g.id + '.' + g.cover;
      img.alt = g.name;
      card.appendChild(img);

      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = g.name;
      card.appendChild(label);

      card.addEventListener('click', function () { launchGame(g.id); });
      grid.appendChild(card);
    });
  }

  // --- Load js-dos on demand ---
  function loadJsDos(callback) {
    if (jsDosLoaded) return callback();

    // Load CSS
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://v8.js-dos.com/latest/js-dos.css';
    document.head.appendChild(link);

    // Load JS
    var script = document.createElement('script');
    script.src = 'https://v8.js-dos.com/latest/js-dos.js';
    script.onload = function () {
      jsDosLoaded = true;
      callback();
    };
    script.onerror = function () {
      callback(new Error('Failed to load js-dos emulator'));
    };
    document.body.appendChild(script);
  }

  // --- Game launch ---
  function launchGame(gameId) {
    var game = GAMES.find(function (g) { return g.id === gameId; });
    if (!game) return;

    currentGame = game;
    catalog.style.display = 'none';
    emulator.style.display = 'flex';
    emuTitle.textContent = game.name;

    // Clear previous instance
    while (dosContainer.firstChild) dosContainer.removeChild(dosContainer.firstChild);
    dosInstance = null;

    // Show loading state
    var loading = document.createElement('p');
    loading.className = 'loading';
    loading.textContent = 'Loading emulator...';
    dosContainer.appendChild(loading);

    loadJsDos(function (err) {
      while (dosContainer.firstChild) dosContainer.removeChild(dosContainer.firstChild);

      if (err) {
        var errMsg = document.createElement('p');
        errMsg.style.cssText = 'color:#ff4444;padding:20px;';
        errMsg.textContent = err.message;
        dosContainer.appendChild(errMsg);
        return;
      }

      try {
        dosInstance = Dos(dosContainer, {
          url: 'games/' + game.id + '.zip',
        });
      } catch (e) {
        var errMsg2 = document.createElement('p');
        errMsg2.style.cssText = 'color:#ff4444;padding:20px;';
        errMsg2.textContent = 'Failed to load: ' + e.message;
        dosContainer.appendChild(errMsg2);
      }
    });
  }

  // --- Back to catalog ---
  function goBack() {
    if (dosInstance && dosInstance.stop) {
      try { dosInstance.stop(); } catch (_) {}
    }
    dosInstance = null;
    currentGame = null;
    while (dosContainer.firstChild) dosContainer.removeChild(dosContainer.firstChild);
    emulator.style.display = 'none';
    catalog.style.display = 'block';
  }

  btnBack.addEventListener('click', goBack);

  // --- ChatBridge SDK ---
  ChatBridge.on('toolInvoke', function (payload, requestId) {
    var args = payload.arguments || {};
    switch (payload.name) {
      case 'list_games':
        ChatBridge.respondToTool(requestId, {
          games: GAMES.map(function (g) {
            return { id: g.id, name: g.name, category: g.category };
          }),
        });
        break;
      case 'launch_game':
        var id = args.game_id;
        var found = GAMES.find(function (g) { return g.id === id; });
        if (!found) {
          ChatBridge.respondToTool(requestId, { error: 'Game not found: ' + id });
        } else {
          launchGame(id);
          ChatBridge.respondToTool(requestId, { status: 'launched', game: found.name });
        }
        break;
      default:
        ChatBridge.respondToTool(requestId, { error: 'Unknown tool: ' + payload.name });
    }
  });

  ChatBridge.onStateRequest(function () {
    return {
      view: currentGame ? 'playing' : 'catalog',
      current_game: currentGame ? { id: currentGame.id, name: currentGame.name } : null,
      available_games: GAMES.length,
    };
  });

  // --- Init ---
  renderCatalog();

  // Check URL params for direct game launch
  var params = new URLSearchParams(window.location.search);
  var directGame = params.get('game');
  if (directGame) launchGame(directGame);
})();

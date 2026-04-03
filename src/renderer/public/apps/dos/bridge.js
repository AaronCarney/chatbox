/* DOS Arcade — ChatBridge bridge + launcher logic */
(function () {
  var GAMES = window.DOS_GAMES;
  var catalog = document.getElementById('catalog');
  var emulator = document.getElementById('emulator');
  var grid = document.getElementById('game-grid');
  var dosContainer = document.getElementById('dos-container');
  var emuTitle = document.getElementById('emu-title');
  var btnBack = document.getElementById('btn-back');

  var currentGame = null;
  var dosInstance = null;

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

    try {
      dosInstance = Dos(dosContainer, {
        url: 'games/' + game.id + '.zip',
      });
    } catch (e) {
      var errMsg = document.createElement('p');
      errMsg.style.cssText = 'color:#ff4444;padding:20px;';
      errMsg.textContent = 'Failed to load: ' + e.message;
      dosContainer.appendChild(errMsg);
    }
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
  if (window.ChatBridge) {
    ChatBridge.onToolInvoke(function (tool, args) {
      if (tool === 'list_games') {
        return {
          games: GAMES.map(function (g) {
            return { id: g.id, name: g.name, category: g.category };
          }),
        };
      }
      if (tool === 'launch_game') {
        var id = args && args.game_id;
        var game = GAMES.find(function (g) { return g.id === id; });
        if (!game) return { error: 'Game not found: ' + id };
        launchGame(id);
        return { status: 'launched', game: game.name };
      }
      return { error: 'Unknown tool: ' + tool };
    });

    ChatBridge.onStateRequest(function () {
      return {
        view: currentGame ? 'playing' : 'catalog',
        current_game: currentGame ? { id: currentGame.id, name: currentGame.name } : null,
        available_games: GAMES.length,
      };
    });
  }

  // --- Init ---
  renderCatalog();

  // Check URL params for direct game launch
  var params = new URLSearchParams(window.location.search);
  var directGame = params.get('game');
  if (directGame) launchGame(directGame);
})();

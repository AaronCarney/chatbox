var engine = null;

function saveGame() {
  if (engine) ChatBridge.saveState(GoEngine.serialize(engine));
}

function init(boardSize, savedState) {
  if (savedState) {
    var restored = GoEngine.deserialize(savedState);
    if (restored) {
      engine = restored;
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      ChatBridge.resize(500);
      return;
    }
  }
  engine = GoEngine.newGame(boardSize || 9);
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  ChatBridge.resize(500);
}

function setupCanvasListener() {
  var canvas = document.getElementById('board');
  if (!canvas) return;

  canvas.addEventListener('click', function(event) {
    if (!engine || engine.over) return;
    var pos = GoBoard.onClick(event, engine);
    if (!pos) return;
    var result = GoEngine.placeStone(engine, pos.x, pos.y);
    if (result.success) {
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      saveGame();
      ChatBridge.sendState(GoEngine.getState(engine));
    }
  });
}

// UI buttons
document.getElementById('btn-new-game').addEventListener('click', function() {
  var size = engine ? engine.size : 9;
  engine = GoEngine.newGame(size);
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  saveGame();
  ChatBridge.sendState(GoEngine.getState(engine));
});

document.getElementById('btn-pass').addEventListener('click', function() {
  if (!engine || engine.over) return;
  var result = GoEngine.passTurn(engine);
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  saveGame();
  ChatBridge.sendState(GoEngine.getState(engine));
  if (result.gameOver) {
    ChatBridge.complete('completed', { score: result.score });
  }
});

// Size selector
document.getElementById('size-select').addEventListener('change', function(e) {
  var size = parseInt(e.target.value, 10);
  engine = GoEngine.newGame(size);
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  saveGame();
});

// Tool handlers
ChatBridge.on('toolInvoke', function(payload, requestId) {
  if (!payload || !payload.name) return;

  switch (payload.name) {
    case 'start_game':
      init(payload.arguments && payload.arguments.board_size);
      saveGame();
      ChatBridge.respondToTool(requestId, { success: true, state: GoEngine.getState(engine) });
      break;

    case 'place_stone': {
      var x = payload.arguments && payload.arguments.x;
      var y = payload.arguments && payload.arguments.y;
      var result = GoEngine.placeStone(engine, x, y);
      if (result.error) {
        ChatBridge.respondToTool(requestId, { error: result.error });
      } else {
        GoBoard.render(engine);
        GoBoard.updateStatus(engine);
        saveGame();
        ChatBridge.respondToTool(requestId, { success: true, state: GoEngine.getState(engine) });
      }
      break;
    }

    case 'get_board_state':
      ChatBridge.respondToTool(requestId, GoEngine.getState(engine));
      break;

    case 'pass_turn': {
      var result = GoEngine.passTurn(engine);
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      saveGame();
      ChatBridge.respondToTool(requestId, result);
      if (result.gameOver) {
        ChatBridge.complete('completed', { score: result.score });
      }
      break;
    }

    case 'get_hint':
      ChatBridge.respondToTool(requestId, {
        ...GoEngine.getState(engine),
        currentTurn: engine.turn === 1 ? 'black' : 'white',
      });
      break;

    default:
      ChatBridge.respondToTool(requestId, { error: 'Unknown tool: ' + payload.name });
  }
});

ChatBridge.onStateRequest(function() {
  return engine ? GoEngine.getState(engine) : { error: 'No game active' };
});

ChatBridge.on('launch', function(config) {
  init(config && config.board_size, config && config.savedState);
  setupCanvasListener();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCanvasListener);
} else {
  setupCanvasListener();
}

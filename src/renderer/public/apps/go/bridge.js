var engine = null;
var humanMoveCount = 0;
var mode = '1p'; // '1p' or '2p'

function saveGame() {
  if (engine) ChatBridge.saveState(GoEngine.serialize(engine));
}

function updateUndoState() {
  var btn = document.getElementById('btn-undo');
  if (btn) btn.disabled = humanMoveCount === 0;
}

function init(boardSize, savedState) {
  if (savedState) {
    var restored = GoEngine.deserialize(savedState);
    if (restored) {
      engine = restored;
      var sel = document.getElementById('size-select');
      if (sel) sel.value = String(engine.size);
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      humanMoveCount = 0;
      updateUndoState();
      ChatBridge.resize(500);
      return;
    }
  }
  engine = GoEngine.newGame(boardSize || 9);
  humanMoveCount = 0;
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  updateUndoState();
  ChatBridge.resize(500);
}

function computerMove() {
  if (!engine || engine.over || engine.turn !== 2) return;
  var size = engine.size;
  var board = engine.board;
  var me = 2, opp = 1;
  var center = (size - 1) / 2;

  // Score each empty cell
  var candidates = [];
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      if (board[GoEngine.idx(x, y, size)] !== 0) continue;
      // Test legality
      var result = GoEngine.placeStone(engine, x, y);
      if (!result.success) continue;
      var captured = result.captured || 0;
      GoEngine.undo(engine);

      var score = 0;
      // Captures are high value
      score += captured * 50;
      // Adjacency to friendly stones (builds territory)
      var adj = GoEngine.neighbors(x, y, size);
      for (var i = 0; i < adj.length; i++) {
        var nv = board[GoEngine.idx(adj[i][0], adj[i][1], size)];
        if (nv === me) score += 10;
        if (nv === opp) score += 5; // contact play
      }
      // Center preference (closer to center = better in opening)
      var distCenter = Math.abs(x - center) + Math.abs(y - center);
      score += Math.max(0, size - distCenter);
      // Star points bonus (3-3, 3-5 etc on 9x9)
      if (size === 9 && (x === 2 || x === 4 || x === 6) && (y === 2 || y === 4 || y === 6)) score += 8;
      // Avoid edges in opening
      if (engine.moveCount < size && (x === 0 || x === size - 1 || y === 0 || y === size - 1)) score -= 15;

      candidates.push({ x: x, y: y, score: score });
    }
  }

  if (candidates.length === 0) {
    GoEngine.passTurn(engine);
    GoBoard.render(engine);
    GoBoard.updateStatus(engine);
    saveGame();
    ChatBridge.sendState(GoEngine.getState(engine));
    return;
  }

  // Pick best (with small randomness among top 3 for variety)
  candidates.sort(function(a, b) { return b.score - a.score; });
  var topN = Math.min(3, candidates.length);
  var pick = candidates[Math.floor(Math.random() * topN)];

  GoEngine.placeStone(engine, pick.x, pick.y);
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  saveGame();
  ChatBridge.sendState(GoEngine.getState(engine));
}

var canvasListenerAttached = false;
function setupCanvasListener() {
  if (canvasListenerAttached) return;
  var canvas = document.getElementById('board');
  if (!canvas) return;
  canvasListenerAttached = true;

  canvas.addEventListener('click', function(event) {
    if (!engine || engine.over) return;
    // In 1P mode, only allow human to play on their turn
    if (mode === '1p' && engine.turn !== 1) return;
    // Ensure canvas listener has an initialized engine
    if (!engine.board) return;
    var pos = GoBoard.onClick(event, engine);
    if (!pos) return;
    var result = GoEngine.placeStone(engine, pos.x, pos.y);
    if (result.success) {
      humanMoveCount++;
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      updateUndoState();
      saveGame();
      ChatBridge.sendState(GoEngine.getState(engine));
      // Computer plays white after human move in 1P mode
      if (mode === '1p' && !engine.over && engine.turn === 2) {
        setTimeout(computerMove, 400);
      }
    } else {
      GoBoard.flashInvalid(engine, pos.x, pos.y);
    }
  });
}

// UI buttons
document.getElementById('btn-new-game').addEventListener('click', function() {
  var sel = document.getElementById('size-select');
  var size = sel ? parseInt(sel.value, 10) : (engine ? engine.size : 9);
  engine = GoEngine.newGame(size);
  humanMoveCount = 0;
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  updateUndoState();
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

document.getElementById('btn-undo').addEventListener('click', function() {
  if (!engine || humanMoveCount === 0) return;
  var ok = GoEngine.undo(engine);
  if (ok) {
    humanMoveCount--;
    GoBoard.render(engine);
    GoBoard.updateStatus(engine);
    updateUndoState();
    saveGame();
    ChatBridge.sendState(GoEngine.getState(engine));
  }
});

// Save/Load
var SAVE_KEY = 'chatbridge:go:save';

function updateLoadButton() {
  var btn = document.getElementById('btn-load');
  if (btn) btn.disabled = !localStorage.getItem(SAVE_KEY);
}

document.getElementById('btn-save').addEventListener('click', function() {
  if (!engine) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(GoEngine.serialize(engine)));
  updateLoadButton();
  var statusEl = document.getElementById('status');
  statusEl.textContent = 'Game saved!';
  setTimeout(function() { GoBoard.updateStatus(engine); }, 1200);
});

document.getElementById('btn-load').addEventListener('click', function() {
  var saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return;
  try {
    var data = JSON.parse(saved);
    var restored = GoEngine.deserialize(data);
    if (restored) {
      engine = restored;
      humanMoveCount = 0;
      var sel = document.getElementById('size-select');
      if (sel) sel.value = String(engine.size);
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      updateUndoState();
      saveGame();
    }
  } catch (e) { console.error('Load failed:', e); }
});

updateLoadButton();

document.getElementById('size-select').addEventListener('change', function(e) {
  var size = parseInt(e.target.value, 10);
  engine = GoEngine.newGame(size);
  humanMoveCount = 0;
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  updateUndoState();
  saveGame();
});

document.getElementById('mode-select').addEventListener('change', function(e) {
  mode = e.target.value;
  var size = engine ? engine.size : 9;
  engine = GoEngine.newGame(size);
  humanMoveCount = 0;
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  updateUndoState();
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
        // LLM move — don't increment humanMoveCount
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

// Re-render on resize so board fills the panel
window.addEventListener('resize', function() {
  if (engine) GoBoard.render(engine);
});

// Initialize on load (ChatBridge.on('launch') re-inits with saved state if available)
init();
// Deferred re-render in case iframe wasn't sized yet
setTimeout(function() { if (engine) GoBoard.render(engine); }, 200);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCanvasListener);
} else {
  setupCanvasListener();
}

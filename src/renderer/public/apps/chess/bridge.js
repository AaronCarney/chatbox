(function() {
  var game = null;
  var humanMoveCount = 0;
  var mode = '1p'; // '1p' or '2p'

  // --- Clock state ---
  var clockMinutes = 5;
  var whiteTime = 300; // seconds
  var blackTime = 300;
  var clockInterval = null;
  var clockEnabled = true;

  function formatTime(secs) {
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateClockDisplay() {
    var wEl = document.getElementById('clock-white');
    var bEl = document.getElementById('clock-black');
    if (!wEl || !bEl) return;
    wEl.textContent = formatTime(whiteTime);
    bEl.textContent = formatTime(blackTime);
    wEl.classList.toggle('active-clock', game && game.turn() === 'w' && !game.game_over());
    bEl.classList.toggle('active-clock', game && game.turn() === 'b' && !game.game_over());
    wEl.classList.toggle('low-time', whiteTime <= 30);
    bEl.classList.toggle('low-time', blackTime <= 30);
  }

  function startClock() {
    stopClock();
    if (!clockEnabled || !game || game.game_over()) return;
    clockInterval = setInterval(function() {
      if (!game || game.game_over()) { stopClock(); return; }
      if (game.turn() === 'w') {
        whiteTime = Math.max(0, whiteTime - 1);
        if (whiteTime === 0) {
          stopClock();
          var statusEl = document.getElementById('status');
          statusEl.textContent = 'White ran out of time — Black wins!';
          statusEl.className = 'status game-over';
        }
      } else {
        blackTime = Math.max(0, blackTime - 1);
        if (blackTime === 0) {
          stopClock();
          var statusEl = document.getElementById('status');
          statusEl.textContent = 'Black ran out of time — White wins!';
          statusEl.className = 'status game-over';
        }
      }
      updateClockDisplay();
    }, 1000);
  }

  function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  }

  function resetClock() {
    stopClock();
    var sel = document.getElementById('clock-select');
    clockMinutes = parseInt(sel ? sel.value : '5', 10);
    clockEnabled = clockMinutes > 0;
    whiteTime = clockMinutes * 60;
    blackTime = clockMinutes * 60;
    var bar = document.querySelector('.clock-bar');
    if (bar) bar.style.display = clockEnabled ? 'flex' : 'none';
    updateClockDisplay();
  }

  function saveGame() {
    if (game) ChatBridge.saveState(ChessEngine.serialize(game));
  }

  function afterMove() {
    saveGame();
    ChatBridge.sendState(ChessEngine.getState(game));
    if (game.game_over()) {
      stopClock();
      ChatBridge.complete('success', {
        fen: game.fen(),
        result: game.in_checkmate() ? 'Checkmate' : 'Draw',
        moves: game.history().length,
      });
      return;
    }
    updateClockDisplay();
    if (clockEnabled) startClock();
    // Computer plays black in 1P mode
    if (mode === '1p' && game.turn() === 'b') {
      setTimeout(computerMove, 300);
    }
  }

  // --- Simple chess AI (minimax, depth 2) ---
  var PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  function evaluate(g) {
    if (g.in_checkmate()) return g.turn() === 'b' ? 99999 : -99999;
    if (g.in_draw() || g.in_stalemate()) return 0;
    var score = 0;
    var board = g.board();
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var piece = board[r][c];
        if (!piece) continue;
        var val = PIECE_VALUES[piece.type] || 0;
        if ((piece.type === 'n' || piece.type === 'b') && c >= 2 && c <= 5 && r >= 2 && r <= 5) val += 20;
        score += piece.color === 'w' ? val : -val;
      }
    }
    return score;
  }

  function minimax(g, depth, alpha, beta, maximizing) {
    if (depth === 0 || g.game_over()) return evaluate(g);
    var moves = g.moves();
    if (maximizing) {
      var maxEval = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        g.move(moves[i]);
        var ev = minimax(g, depth - 1, alpha, beta, false);
        g.undo();
        if (ev > maxEval) maxEval = ev;
        if (ev > alpha) alpha = ev;
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      var minEval = Infinity;
      for (var i = 0; i < moves.length; i++) {
        g.move(moves[i]);
        var ev = minimax(g, depth - 1, alpha, beta, true);
        g.undo();
        if (ev < minEval) minEval = ev;
        if (ev < beta) beta = ev;
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function computerMove() {
    if (!game || game.game_over() || game.turn() !== 'b') return;
    var moves = game.moves({ verbose: true });
    if (moves.length === 0) return;
    var bestScore = Infinity;
    var bestMove = moves[0];
    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i].san);
      var score = minimax(game, 2, -Infinity, Infinity, true);
      game.undo();
      if (score < bestScore) {
        bestScore = score;
        bestMove = moves[i];
      }
    }
    ChessEngine.makeMove(game, bestMove.from, bestMove.to, bestMove.promotion);
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    afterMove();
  }

  function updateUndoState() {
    var btn = document.getElementById('btn-undo');
    if (btn) btn.disabled = humanMoveCount === 0;
  }

  function init(savedState) {
    if (savedState && savedState.fen) {
      game = ChessEngine.loadGame(savedState.fen);
    } else {
      game = ChessEngine.newGame();
    }
    humanMoveCount = 0;
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    updateUndoState();
    resetClock();
    ChatBridge.resize(520);
  }

  // Callback for promotion moves
  window._chessMoveCallback = function(result) {
    if (result) {
      humanMoveCount++;
      updateUndoState();
      afterMove();
    }
  };

  // New game button
  document.getElementById('btn-new-game').addEventListener('click', function() {
    game = ChessEngine.newGame();
    humanMoveCount = 0;
    ChessBoard.clearSelection();
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    updateUndoState();
    resetClock();
    if (clockEnabled) startClock();
    saveGame();
    ChatBridge.sendState(ChessEngine.getState(game));
  });

  // Undo button
  document.getElementById('btn-undo').addEventListener('click', function() {
    if (!game || humanMoveCount === 0 || game.game_over()) return;
    // In 1P mode, undo both computer and human move
    if (mode === '1p' && game.history().length >= 2) {
      ChessEngine.undoMove(game);
      ChessEngine.undoMove(game);
      humanMoveCount--;
    } else {
      ChessEngine.undoMove(game);
      humanMoveCount--;
    }
    ChessBoard.clearSelection();
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    updateUndoState();
    saveGame();
    ChatBridge.sendState(ChessEngine.getState(game));
  });

  // Save/Load
  var SAVE_KEY = 'chatbridge:chess:save';

  function updateLoadButton() {
    var btn = document.getElementById('btn-load');
    if (btn) btn.disabled = !localStorage.getItem(SAVE_KEY);
  }

  document.getElementById('btn-save').addEventListener('click', function() {
    if (!game) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(ChessEngine.serialize(game)));
    updateLoadButton();
    var statusEl = document.getElementById('status');
    statusEl.textContent = 'Game saved!';
    setTimeout(function() { ChessBoard.updateStatus(game); }, 1200);
  });

  document.getElementById('btn-load').addEventListener('click', function() {
    var saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return;
    try {
      var data = JSON.parse(saved);
      game = ChessEngine.loadGame(data.fen);
      humanMoveCount = 0;
      ChessBoard.clearSelection();
      ChessBoard.render(game);
      ChessBoard.updateStatus(game);
      updateUndoState();
      resetClock();
      saveGame();
    } catch (e) { console.error('Load failed:', e); }
  });

  updateLoadButton();

  // Mode toggle
  document.getElementById('mode-select').addEventListener('change', function(e) {
    mode = e.target.value;
    game = ChessEngine.newGame();
    humanMoveCount = 0;
    ChessBoard.clearSelection();
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    updateUndoState();
    resetClock();
    if (clockEnabled) startClock();
    saveGame();
  });

  // Clock select
  document.getElementById('clock-select').addEventListener('change', function() {
    resetClock();
    if (clockEnabled && game && !game.game_over()) startClock();
  });

  // Click handler
  var originalOnSquareClick = ChessBoard.onSquareClick;
  ChessBoard.onSquareClick = function(name, gameObj) {
    // In 1P mode, only allow moves on white's turn
    if (mode === '1p' && game.turn() === 'b') return null;

    var result = originalOnSquareClick.call(ChessBoard, name, gameObj);
    if (result === 'pending_promotion') return result;
    if (result) {
      humanMoveCount++;
      updateUndoState();
      afterMove();
    }
    return result;
  };

  // Tool handlers
  ChatBridge.on('toolInvoke', function(payload, requestId) {
    switch (payload.name) {
      case 'start_game':
        game = ChessEngine.newGame();
        humanMoveCount = 0;
        ChessBoard.clearSelection();
        ChessBoard.render(game);
        ChessBoard.updateStatus(game);
        updateUndoState();
        resetClock();
        if (clockEnabled) startClock();
        saveGame();
        ChatBridge.respondToTool(requestId, ChessEngine.getState(game));
        break;

      case 'make_move':
        var result = ChessEngine.makeMove(game, payload.arguments.from, payload.arguments.to);
        if (result) {
          ChessBoard.render(game);
          ChessBoard.updateStatus(game);
          saveGame();
          ChatBridge.respondToTool(requestId, ChessEngine.getState(game));
          if (game.game_over()) {
            stopClock();
            ChatBridge.complete('success', {
              fen: game.fen(),
              result: game.in_checkmate() ? 'Checkmate' : 'Draw',
              moves: game.history().length,
            });
          }
        } else {
          ChatBridge.respondToTool(requestId, { error: 'Invalid move' });
        }
        break;

      case 'get_board_state':
        ChatBridge.respondToTool(requestId, ChessEngine.getState(game));
        break;

      case 'get_hint':
        ChatBridge.respondToTool(requestId, {
          fen: game.fen(),
          turn: game.turn(),
          legalMoves: ChessEngine.getLegalMoves(game),
          moveCount: game.history().length,
        });
        break;

      default:
        ChatBridge.respondToTool(requestId, { error: 'Unknown tool: ' + payload.name });
    }
  });

  ChatBridge.onStateRequest(function() {
    return game ? ChessEngine.getState(game) : { error: 'No game active' };
  });

  ChatBridge.on('launch', function(config) {
    init(config && config.savedState);
  });

  // Re-render on resize so board fills panel
  window.addEventListener('resize', function() {
    if (game) ChessBoard.render(game);
  });

  init();
  // Deferred re-renders — iframe may not be sized yet on first paint
  setTimeout(function() { if (game) ChessBoard.render(game); }, 300);
  setTimeout(function() { if (game) ChessBoard.render(game); }, 800);
})();

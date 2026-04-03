(function() {
  var game = null;
  // Track which moves were made by human (UI clicks) vs LLM (tool calls)
  var humanMoveCount = 0;

  function saveGame() {
    if (game) ChatBridge.saveState(ChessEngine.serialize(game));
  }

  function afterMove() {
    saveGame();
    ChatBridge.sendState(ChessEngine.getState(game));
    if (game.game_over()) {
      ChatBridge.complete('success', {
        fen: game.fen(),
        result: game.in_checkmate() ? 'Checkmate' : 'Draw',
        moves: game.history().length,
      });
    }
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
    ChatBridge.resize(520);
  }

  // Callback for promotion moves (async from picker)
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
    saveGame();
    ChatBridge.sendState(ChessEngine.getState(game));
  });

  // Undo button — only undoes human moves
  document.getElementById('btn-undo').addEventListener('click', function() {
    if (!game || humanMoveCount === 0 || game.game_over()) return;
    var undone = ChessEngine.undoMove(game);
    if (undone) {
      humanMoveCount--;
      ChessBoard.clearSelection();
      ChessBoard.render(game);
      ChessBoard.updateStatus(game);
      updateUndoState();
      saveGame();
      ChatBridge.sendState(ChessEngine.getState(game));
    }
  });

  // Wrap click handler for save + state after human moves
  var originalOnSquareClick = ChessBoard.onSquareClick;
  ChessBoard.onSquareClick = function(name, gameObj) {
    var result = originalOnSquareClick.call(ChessBoard, name, gameObj);
    if (result === 'pending_promotion') {
      // Promotion picker is showing — callback handles afterMove
      return result;
    }
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
        saveGame();
        ChatBridge.respondToTool(requestId, ChessEngine.getState(game));
        break;

      case 'make_move':
        var result = ChessEngine.makeMove(game, payload.arguments.from, payload.arguments.to);
        if (result) {
          // LLM move — don't increment humanMoveCount
          ChessBoard.render(game);
          ChessBoard.updateStatus(game);
          saveGame();
          ChatBridge.respondToTool(requestId, ChessEngine.getState(game));
          if (game.game_over()) {
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

  init();
})();

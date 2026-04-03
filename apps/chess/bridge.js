(function() {
  var game = null;

  function saveGame() {
    if (game) ChatBridge.saveState(ChessEngine.serialize(game));
  }

  function init(savedState) {
    if (savedState && savedState.fen) {
      game = ChessEngine.loadGame(savedState.fen);
    } else {
      game = ChessEngine.newGame();
    }
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    ChatBridge.resize(500);
  }

  // New game button
  document.getElementById('btn-new-game').addEventListener('click', function() {
    game = ChessEngine.newGame();
    ChessBoard.clearSelection();
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    saveGame();
    ChatBridge.sendState(ChessEngine.getState(game));
  });

  // Wrap click handler to save + send state after moves
  var originalOnSquareClick = ChessBoard.onSquareClick;
  ChessBoard.onSquareClick = function(name, gameObj) {
    var result = originalOnSquareClick.call(ChessBoard, name, gameObj);
    if (result) {
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
    return result;
  };

  // Handle tool invocations
  ChatBridge.on('toolInvoke', function(payload, requestId) {
    switch (payload.name) {
      case 'start_game':
        game = ChessEngine.newGame();
        ChessBoard.clearSelection();
        ChessBoard.render(game);
        ChessBoard.updateStatus(game);
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

  // Auto-init without saved state (will be re-initialized on launch with state)
  init();
})();

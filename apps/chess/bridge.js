(function() {
  var game = null;

  function init() {
    game = ChessEngine.newGame();
    ChessBoard.render(game);
    ChessBoard.updateStatus(game);
    ChatBridge.resize(500);
  }

  // Wrap the ChessBoard click handler to send state updates
  const originalOnSquareClick = ChessBoard.onSquareClick;
  ChessBoard.onSquareClick = function(name, gameObj) {
    const result = originalOnSquareClick.call(ChessBoard, name, gameObj);

    // If a move was made (result is truthy), send state update
    if (result) {
      ChatBridge.sendState(ChessEngine.getState(game));

      // Check if game is over after the move
      if (game.isGameOver()) {
        ChatBridge.complete('success', {
          fen: game.fen(),
          result: 'Game Over',
          moves: game.history().length
        });
      }
    }

    return result;
  };

  // Handle tool invocations from ChatBridge
  ChatBridge.on('toolInvoke', function(payload, requestId) {
    switch (payload.name) {
      case 'start_game':
        game = ChessEngine.newGame();
        ChessBoard.render(game);
        ChessBoard.updateStatus(game);
        ChatBridge.respondToTool(requestId, ChessEngine.getState(game));
        break;

      case 'make_move':
        var result = ChessEngine.makeMove(game, payload.arguments.from, payload.arguments.to);
        if (result) {
          ChessBoard.render(game);
          ChessBoard.updateStatus(game);
          ChatBridge.respondToTool(requestId, ChessEngine.getState(game));

          // Check if game is over after the move
          if (game.isGameOver()) {
            ChatBridge.complete('success', {
              fen: game.fen(),
              result: 'Game Over',
              moves: game.history().length
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
          moveCount: game.history().length
        });
        break;

      default:
        ChatBridge.respondToTool(requestId, { error: 'Unknown tool: ' + payload.name });
    }
  });

  // Register state provider
  ChatBridge.onStateRequest(() => game ? ChessEngine.getState(game) : { error: 'No game active' });

  // Register launch handler
  ChatBridge.on('launch', init);

  // Auto-init on script load
  init();
})();

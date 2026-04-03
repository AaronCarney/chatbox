(function() {
  if (!window.Chess) {
    throw new Error('Chess.js not found on window.Chess. Ensure chess.js is loaded via CDN.');
  }

  window.ChessEngine = {
    newGame() {
      return new Chess();
    },

    loadGame(fen) {
      var game = new Chess();
      if (fen && game.load(fen)) return game;
      return new Chess();
    },

    makeMove(game, from, to, promotion) {
      return game.move({ from, to, promotion: promotion || 'q' });
    },

    undoMove(game) {
      return game.undo();
    },

    /**
     * Check if a move to `to` from `from` would be a pawn promotion
     */
    isPromotion(game, from, to) {
      var moves = game.moves({ square: from, verbose: true });
      for (var i = 0; i < moves.length; i++) {
        if (moves[i].to === to && moves[i].flags.indexOf('p') !== -1) return true;
      }
      return false;
    },

    getState(game) {
      return {
        fen: game.fen(),
        turn: game.turn(),
        moveCount: game.history().length,
        isCheck: game.in_check(),
        isGameOver: game.game_over(),
        history: game.history().slice(-10),
        lastMove: game.history().length > 0 ? game.history({ verbose: true }).slice(-1)[0] : null,
      };
    },

    getLegalMoves(game) {
      return game.moves();
    },

    serialize(game) {
      return { fen: game.fen(), history: game.history() };
    },
  };
})();

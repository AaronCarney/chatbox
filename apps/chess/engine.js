(function() {
  if (!window.Chess) {
    throw new Error('Chess.js not found on window.Chess. Ensure chess.js is loaded via CDN.');
  }

  window.ChessEngine = {
    newGame() {
      return new Chess();
    },

    makeMove(game, from, to) {
      return game.move({ from, to, promotion: 'q' });
    },

    getState(game) {
      return {
        fen: game.fen(),
        turn: game.turn(),
        moveCount: game.history().length,
        isCheck: game.in_check(),
        isGameOver: game.game_over(),
        history: game.history().slice(-5),
      };
    },

    getLegalMoves(game) {
      return game.moves();
    },
  };
})();

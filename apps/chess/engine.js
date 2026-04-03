(function() {
  if (!window.Chess) {
    throw new Error('Chess.js not found on window.Chess. Ensure chess.js is loaded via CDN.');
  }

  window.ChessEngine = {
    newGame() {
      return new Chess();
    },

    loadGame(fen) {
      const game = new Chess();
      if (fen && game.load(fen)) return game;
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

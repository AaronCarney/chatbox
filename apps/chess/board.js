window.ChessBoard = (function () {
  const PIECE_CHARS = {
    k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
    K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  };

  let selectedSquare = null;

  function squareName(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  function render(game) {
    const container = document.getElementById('board-container');
    container.innerHTML = '';

    const board = document.createElement('div');
    board.className = 'board';

    const legalTargets = selectedSquare
      ? game.moves({ square: selectedSquare, verbose: true }).map(m => m.to)
      : [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const name = squareName(row, col);
        const sq = document.createElement('div');
        sq.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = name;

        if (name === selectedSquare) sq.classList.add('selected');
        if (legalTargets.includes(name)) sq.classList.add('legal-move');

        const piece = game.get(name);
        if (piece) sq.textContent = PIECE_CHARS[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] || '';

        sq.addEventListener('click', () => onSquareClick(name, game));
        board.appendChild(sq);
      }
    }

    container.appendChild(board);
  }

  function updateStatus(game) {
    const statusEl = document.getElementById('status');
    const historyEl = document.getElementById('move-history');

    if (game.in_checkmate()) {
      statusEl.textContent = (game.turn() === 'w' ? 'Black' : 'White') + ' wins by checkmate!';
    } else if (game.in_draw()) {
      statusEl.textContent = 'Draw';
    } else if (game.in_check()) {
      statusEl.textContent = (game.turn() === 'w' ? 'White' : 'Black') + ' is in check. ' +
        (game.turn() === 'w' ? 'White' : 'Black') + "'s turn.";
    } else {
      statusEl.textContent = (game.turn() === 'w' ? 'White' : 'Black') + "'s turn.";
    }

    historyEl.textContent = game.history().join(', ');
  }

  function onSquareClick(name, game) {
    // Attempt move if a square is already selected and we click a different square
    if (selectedSquare && selectedSquare !== name) {
      const result = ChessEngine.makeMove(game, selectedSquare, name);
      selectedSquare = null;
      render(game);
      updateStatus(game);
      return result;
    }

    // Select own piece
    const piece = game.get(name);
    if (piece && piece.color === game.turn()) {
      selectedSquare = name;
    } else {
      selectedSquare = null;
    }

    render(game);
    updateStatus(game);
    return null;
  }

  return { render, updateStatus, onSquareClick };
})();

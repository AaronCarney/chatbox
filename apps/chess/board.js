window.ChessBoard = (function () {
  const PIECE_CHARS = {
    k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
    K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  };

  let selectedSquare = null;
  let lastMoveFrom = null;
  let lastMoveTo = null;

  function squareName(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  function render(game) {
    const container = document.getElementById('board-container');
    // Clear by removing children (avoids innerHTML)
    while (container.firstChild) container.removeChild(container.firstChild);

    const board = document.createElement('div');
    board.className = 'board';

    const legalTargets = selectedSquare
      ? game.moves({ square: selectedSquare, verbose: true }).map(m => m.to)
      : [];

    // Get last move for highlight
    const hist = game.history({ verbose: true });
    if (hist.length > 0) {
      const last = hist[hist.length - 1];
      lastMoveFrom = last.from;
      lastMoveTo = last.to;
    }

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const name = squareName(row, col);
        const sq = document.createElement('div');
        sq.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = name;

        if (name === selectedSquare) sq.classList.add('selected');
        if (legalTargets.includes(name)) sq.classList.add('legal-move');
        if (name === lastMoveFrom || name === lastMoveTo) sq.classList.add('last-move');

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
      statusEl.className = 'status game-over';
    } else if (game.in_draw()) {
      statusEl.textContent = 'Draw';
      statusEl.className = 'status game-over';
    } else if (game.in_check()) {
      statusEl.textContent = (game.turn() === 'w' ? 'White' : 'Black') + ' is in check.';
      statusEl.className = 'status in-check';
    } else {
      statusEl.textContent = (game.turn() === 'w' ? 'White' : 'Black') + "'s turn";
      statusEl.className = 'status';
    }

    // Format move history as numbered pairs
    var moves = game.history();
    var formatted = [];
    for (var i = 0; i < moves.length; i += 2) {
      var num = Math.floor(i / 2) + 1;
      formatted.push(num + '. ' + moves[i] + (moves[i + 1] ? ' ' + moves[i + 1] : ''));
    }
    historyEl.textContent = formatted.join('  ');
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function onSquareClick(name, game) {
    if (game.game_over()) return null;

    if (selectedSquare && selectedSquare !== name) {
      var result = ChessEngine.makeMove(game, selectedSquare, name);
      selectedSquare = null;
      render(game);
      updateStatus(game);
      return result;
    }

    var piece = game.get(name);
    if (piece && piece.color === game.turn()) {
      selectedSquare = name;
    } else {
      selectedSquare = null;
    }

    render(game);
    updateStatus(game);
    return null;
  }

  function clearSelection() {
    selectedSquare = null;
  }

  return { render, updateStatus, onSquareClick, clearSelection };
})();

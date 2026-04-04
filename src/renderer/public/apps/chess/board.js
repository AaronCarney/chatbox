window.ChessBoard = (function () {
  var PIECE_CHARS = {
    k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
    K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  };

  var selectedSquare = null;
  var lastMoveFrom = null;
  var lastMoveTo = null;
  var promotionCallback = null;

  function squareName(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  function render(game) {
    var container = document.getElementById('board-container');
    while (container.firstChild) container.removeChild(container.firstChild);

    var board = document.createElement('div');
    board.className = 'board';

    var legalTargets = selectedSquare
      ? game.moves({ square: selectedSquare, verbose: true }).map(function(m) { return m.to; })
      : [];

    // Get last move for highlight
    var hist = game.history({ verbose: true });
    if (hist.length > 0) {
      var last = hist[hist.length - 1];
      lastMoveFrom = last.from;
      lastMoveTo = last.to;
    }

    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) {
        var name = squareName(row, col);
        var sq = document.createElement('div');
        sq.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = name;

        if (name === selectedSquare) sq.classList.add('selected');
        if (legalTargets.indexOf(name) !== -1) sq.classList.add('legal-move');
        if (name === lastMoveFrom || name === lastMoveTo) sq.classList.add('last-move');

        var piece = game.get(name);
        if (piece) {
          var span = document.createElement('span');
          span.className = piece.color === 'w' ? 'piece-white' : 'piece-black';
          span.textContent = PIECE_CHARS[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] || '';
          sq.appendChild(span);
        }

        (function(n) {
          sq.addEventListener('click', function() { onSquareClick(n, game); });
        })(name);
        board.appendChild(sq);
      }
    }

    container.appendChild(board);
  }

  function showPromotionPicker(color, callback) {
    var overlay = document.getElementById('promotion-overlay');
    var picker = document.getElementById('promotion-picker');
    while (picker.firstChild) picker.removeChild(picker.firstChild);

    var pieces = ['q', 'r', 'b', 'n'];
    var chars = color === 'w'
      ? ['\u2655', '\u2656', '\u2657', '\u2658']
      : ['\u265B', '\u265C', '\u265D', '\u265E'];

    for (var i = 0; i < pieces.length; i++) {
      (function(p, ch) {
        var btn = document.createElement('button');
        btn.className = 'promo-btn';
        btn.textContent = ch;
        btn.addEventListener('click', function() {
          overlay.style.display = 'none';
          promotionCallback = null;
          callback(p);
        });
        picker.appendChild(btn);
      })(pieces[i], chars[i]);
    }

    overlay.style.display = 'flex';
    promotionCallback = callback;
  }

  function updateStatus(game) {
    var statusEl = document.getElementById('status');
    var historyEl = document.getElementById('move-history');

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

    var moves = game.history();
    var formatted = [];
    for (var i = 0; i < moves.length; i += 2) {
      var num = Math.floor(i / 2) + 1;
      formatted.push(num + '. ' + moves[i] + (moves[i + 1] ? ' ' + moves[i + 1] : ''));
    }
    historyEl.textContent = formatted.join('  ');
    historyEl.scrollTop = historyEl.scrollHeight;

    // Update undo button state
    var undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = moves.length === 0;
  }

  function onSquareClick(name, game) {
    if (game.game_over()) return null;

    // Deselect on re-click
    if (selectedSquare && selectedSquare === name) {
      selectedSquare = null;
      render(game);
      updateStatus(game);
      return null;
    }

    if (selectedSquare && selectedSquare !== name) {
      // Check for promotion
      if (ChessEngine.isPromotion(game, selectedSquare, name)) {
        var from = selectedSquare;
        selectedSquare = null;
        showPromotionPicker(game.turn(), function(piece) {
          var result = ChessEngine.makeMove(game, from, name, piece);
          render(game);
          updateStatus(game);
          if (result && window._chessMoveCallback) window._chessMoveCallback(result);
        });
        return 'pending_promotion';
      }

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
    lastMoveFrom = null;
    lastMoveTo = null;
  }

  return { render, updateStatus, onSquareClick, clearSelection, showPromotionPicker };
})();

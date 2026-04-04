window.GoBoard = {
  _cellSize(canvas, size) {
    return canvas.width / (size + 1);
  },

  // Column labels: A-T skipping I (Go convention)
  _colLabel(x) {
    var c = x < 8 ? x + 65 : x + 66; // skip 'I'
    return String.fromCharCode(c);
  },

  render(game) {
    var canvas = document.getElementById('board');
    var ctx = canvas.getContext('2d');
    var size = game.size;

    var maxByWidth = window.innerWidth - 16;
    var maxByHeight = window.innerHeight - 90; // toolbar + status + captures
    var containerWidth = Math.min(maxByWidth, maxByHeight, 600);
    canvas.width = containerWidth;
    canvas.height = containerWidth;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerWidth + 'px';

    var cellSize = this._cellSize(canvas, size);

    // Background
    ctx.fillStyle = '#dcb35c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Coordinate labels
    ctx.fillStyle = '#8b7340';
    ctx.font = Math.max(9, cellSize * 0.35) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < size; i++) {
      // Column labels (top)
      ctx.fillText(this._colLabel(i), (i + 1) * cellSize, cellSize * 0.35);
      // Row labels (left) — Go uses 1-indexed from bottom
      ctx.fillText(String(size - i), cellSize * 0.35, (i + 1) * cellSize);
    }

    // Grid
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (var i = 0; i < size; i++) {
      var offset = (i + 1) * cellSize;
      ctx.beginPath();
      ctx.moveTo(cellSize, offset);
      ctx.lineTo(size * cellSize, offset);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offset, cellSize);
      ctx.lineTo(offset, size * cellSize);
      ctx.stroke();
    }

    // Star points
    var starPoints = size === 9
      ? [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]
      : size === 13
      ? [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]]
      : size === 19
      ? [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
      : [];

    ctx.fillStyle = '#000';
    for (var s = 0; s < starPoints.length; s++) {
      var sx = starPoints[s][0], sy = starPoints[s][1];
      ctx.beginPath();
      ctx.arc((sx + 1) * cellSize, (sy + 1) * cellSize, cellSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stones
    var radius = cellSize * 0.45;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var cell = game.board[y * size + x];
        if (!cell) continue;
        var cx = (x + 1) * cellSize;
        var cy = (y + 1) * cellSize;

        // Shadow
        ctx.beginPath();
        ctx.arc(cx + 1, cy + 1, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fill();

        // Stone
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        if (cell === 1) {
          ctx.fillStyle = '#222';
          ctx.fill();
        } else {
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Last move indicator
    if (game.lastMove) {
      var lx = (game.lastMove.x + 1) * cellSize;
      var ly = (game.lastMove.y + 1) * cellSize;
      var lastStone = game.board[game.lastMove.y * size + game.lastMove.x];
      ctx.beginPath();
      ctx.arc(lx, ly, radius * 0.35, 0, Math.PI * 2);
      ctx.strokeStyle = lastStone === 1 ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  /**
   * Flash a red X at board position to indicate invalid move
   */
  flashInvalid(game, x, y) {
    var canvas = document.getElementById('board');
    var ctx = canvas.getContext('2d');
    var cellSize = this._cellSize(canvas, game.size);
    var cx = (x + 1) * cellSize;
    var cy = (y + 1) * cellSize;
    var r = cellSize * 0.3;

    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();

    // Clear after 400ms by re-rendering
    var self = this;
    setTimeout(function() { self.render(game); }, 400);
  },

  onClick(event, game) {
    var canvas = document.getElementById('board');
    var rect = canvas.getBoundingClientRect();
    var scale = canvas.width / rect.width;
    var cellSize = this._cellSize(canvas, game.size);
    var x = Math.round((event.clientX - rect.left) * scale / cellSize - 1);
    var y = Math.round((event.clientY - rect.top) * scale / cellSize - 1);
    if (x < 0 || x >= game.size || y < 0 || y >= game.size) return null;
    return { x: x, y: y };
  },

  updateStatus(game) {
    var statusEl = document.getElementById('status');
    var capturesEl = document.getElementById('captures');
    if (game.over) {
      var score = GoEngine.simpleScore(game);
      statusEl.textContent = 'Game Over \u2014 ' + score.winner.charAt(0).toUpperCase() + score.winner.slice(1) + ' wins';
      statusEl.className = 'status game-over';
    } else {
      statusEl.textContent = (game.turn === 1 ? 'Black' : 'White') + "'s turn \u00B7 Move " + (game.moveCount + 1);
      statusEl.className = 'status';
    }
    capturesEl.textContent =
      '\u25CF ' + (game.captures[1] || 0) + '  \u25CB ' + (game.captures[2] || 0);
  },
};

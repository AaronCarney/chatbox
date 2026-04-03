window.GoBoard = {
  _cellSize(canvas, size) {
    return canvas.width / (size + 1);
  },

  render(game) {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const size = game.size;

    // Responsive canvas sizing
    const containerWidth = Math.min(400, window.innerWidth - 24);
    canvas.width = containerWidth;
    canvas.height = containerWidth;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerWidth + 'px';

    const cellSize = this._cellSize(canvas, size);

    // Background
    ctx.fillStyle = '#dcb35c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let i = 0; i < size; i++) {
      const offset = (i + 1) * cellSize;
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
    const starPoints = size === 9
      ? [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]
      : size === 13
      ? [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]]
      : size === 19
      ? [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
      : [];

    ctx.fillStyle = '#000';
    for (const [sx, sy] of starPoints) {
      ctx.beginPath();
      ctx.arc((sx + 1) * cellSize, (sy + 1) * cellSize, cellSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stones
    const radius = cellSize * 0.45;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = game.board[y * size + x];
        if (!cell) continue;
        const cx = (x + 1) * cellSize;
        const cy = (y + 1) * cellSize;

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
      const lx = (game.lastMove.x + 1) * cellSize;
      const ly = (game.lastMove.y + 1) * cellSize;
      const lastStone = game.board[game.lastMove.y * size + game.lastMove.x];
      ctx.beginPath();
      ctx.arc(lx, ly, radius * 0.35, 0, Math.PI * 2);
      ctx.strokeStyle = lastStone === 1 ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  onClick(event, game) {
    const canvas = document.getElementById('board');
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const cellSize = this._cellSize(canvas, game.size);
    const x = Math.round(((event.clientX - rect.left) * scale - cellSize / 2) / cellSize);
    const y = Math.round(((event.clientY - rect.top) * scale - cellSize / 2) / cellSize);
    if (x < 0 || x >= game.size || y < 0 || y >= game.size) return null;
    return { x, y };
  },

  updateStatus(game) {
    const statusEl = document.getElementById('status');
    const capturesEl = document.getElementById('captures');
    if (game.over) {
      const score = GoEngine.simpleScore(game);
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

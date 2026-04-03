window.GoEngine = (() => {
  const VALID_SIZES = [9, 13, 19];

  function idx(x, y, size) {
    return y * size + x;
  }

  function neighbors(x, y, size) {
    const result = [];
    if (x > 0) result.push([x - 1, y]);
    if (x < size - 1) result.push([x + 1, y]);
    if (y > 0) result.push([x, y - 1]);
    if (y < size - 1) result.push([x, y + 1]);
    return result;
  }

  function getGroup(board, x, y, size) {
    const color = board[idx(x, y, size)];
    if (!color) return { stones: [], liberties: 0 };

    const visited = new Set();
    const stones = [];
    const libertySet = new Set();
    const queue = [[x, y]];

    while (queue.length) {
      const [cx, cy] = queue.shift();
      const key = idx(cx, cy, size);
      if (visited.has(key)) continue;
      visited.add(key);

      if (board[key] !== color) continue;
      stones.push([cx, cy]);

      for (const [nx, ny] of neighbors(cx, cy, size)) {
        const nkey = idx(nx, ny, size);
        if (board[nkey] === 0) {
          libertySet.add(nkey);
        } else if (board[nkey] === color && !visited.has(nkey)) {
          queue.push([nx, ny]);
        }
      }
    }

    return { stones, liberties: libertySet.size };
  }

  function newGame(boardSize) {
    const size = VALID_SIZES.includes(boardSize) ? boardSize : 9;
    const board = new Array(size * size).fill(0);
    return {
      size, board, turn: 1,
      captures: { 1: 0, 2: 0 },
      passCount: 0, ko: null,
      lastMove: null, moveCount: 0,
      over: false,
    };
  }

  function placeStone(game, x, y) {
    const { board, size } = game;
    if (game.over) return { error: 'Game is over' };
    if (x < 0 || x >= size || y < 0 || y >= size) return { error: 'Out of bounds' };
    const pos = idx(x, y, size);
    if (board[pos] !== 0) return { error: 'Cell occupied' };
    if (game.ko === pos) return { error: 'Ko violation' };

    const opponent = game.turn === 1 ? 2 : 1;
    board[pos] = game.turn;

    let capturedCount = 0;
    let capturedPos = null;
    const seen = new Set();
    for (const [nx, ny] of neighbors(x, y, size)) {
      const npos = idx(nx, ny, size);
      if (board[npos] !== opponent || seen.has(npos)) continue;
      const group = getGroup(board, nx, ny, size);
      for (const [sx, sy] of group.stones) seen.add(idx(sx, sy, size));
      if (group.liberties === 0) {
        capturedCount += group.stones.length;
        if (group.stones.length === 1) capturedPos = npos;
        for (const [sx, sy] of group.stones) board[idx(sx, sy, size)] = 0;
      }
    }

    const ownGroup = getGroup(board, x, y, size);
    if (ownGroup.liberties === 0) {
      board[pos] = 0;
      return { error: 'Suicide move' };
    }

    game.ko = (capturedCount === 1 && ownGroup.stones.length === 1) ? capturedPos : null;
    game.captures[game.turn] += capturedCount;
    game.passCount = 0;
    game.lastMove = { x, y };
    game.moveCount++;
    game.turn = opponent;

    return { success: true, captured: capturedCount };
  }

  function simpleScore(game) {
    let black = 0, white = 0;
    for (const cell of game.board) {
      if (cell === 1) black++;
      else if (cell === 2) white++;
    }
    black += game.captures[1];
    white += game.captures[2];
    const whiteTotal = white + 6.5;
    return { black, white: whiteTotal, winner: black > whiteTotal ? 'black' : 'white' };
  }

  function passTurn(game) {
    if (game.over) return { gameOver: true, score: simpleScore(game) };
    game.passCount++;
    game.lastMove = null;
    game.turn = game.turn === 1 ? 2 : 1;
    if (game.passCount >= 2) {
      game.over = true;
      return { gameOver: true, score: simpleScore(game) };
    }
    return { gameOver: false };
  }

  function boardToString(game) {
    const { board, size } = game;
    const rows = [];
    for (let y = 0; y < size; y++) {
      let row = '';
      for (let x = 0; x < size; x++) {
        const cell = board[idx(x, y, size)];
        row += cell === 1 ? 'B' : cell === 2 ? 'W' : '.';
      }
      rows.push(row);
    }
    return rows.join('\n');
  }

  function getState(game) {
    return {
      board: boardToString(game),
      turn: game.turn,
      captures: game.captures,
      size: game.size,
      passCount: game.passCount,
      moveCount: game.moveCount,
      lastMove: game.lastMove,
      over: game.over,
    };
  }

  function serialize(game) {
    return {
      board: Array.from(game.board),
      size: game.size,
      turn: game.turn,
      captures: { 1: game.captures[1], 2: game.captures[2] },
      passCount: game.passCount,
      ko: game.ko,
      lastMove: game.lastMove,
      moveCount: game.moveCount,
      over: game.over,
    };
  }

  function deserialize(data) {
    if (!data || !data.board || !data.size) return null;
    return {
      board: Array.from(data.board),
      size: data.size,
      turn: data.turn || 1,
      captures: { 1: data.captures?.[1] || 0, 2: data.captures?.[2] || 0 },
      passCount: data.passCount || 0,
      ko: data.ko || null,
      lastMove: data.lastMove || null,
      moveCount: data.moveCount || 0,
      over: data.over || false,
    };
  }

  return { newGame, idx, neighbors, getGroup, placeStone, passTurn, simpleScore, boardToString, getState, serialize, deserialize };
})();

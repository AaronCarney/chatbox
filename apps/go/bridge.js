/**
 * Go ChatBridge Integration
 * Connects GoEngine and GoBoard to ChatBridge SDK
 */

var engine = null;

/**
 * Initialize the game
 * @param {number} boardSize - Board size (9, 13, or 19)
 */
function init(boardSize) {
  engine = GoEngine.newGame(boardSize || 9);
  GoBoard.render(engine);
  GoBoard.updateStatus(engine);
  ChatBridge.resize(500);
}

/**
 * Set up canvas click handler
 */
function setupCanvasListener() {
  const canvas = document.getElementById('board');
  if (!canvas) return;

  canvas.addEventListener('click', (event) => {
    if (!engine) return;

    const pos = GoBoard.onClick(event, engine);
    if (!pos) return;

    const result = GoEngine.placeStone(engine, pos.x, pos.y);

    if (result.success !== false && !result.error) {
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      ChatBridge.sendState(GoEngine.getState(engine));
    }
  });
}

/**
 * Register ChatBridge tool handlers
 */
ChatBridge.on('toolInvoke', function(payload, requestId) {
  if (!payload || !payload.name) return;

  switch (payload.name) {
    case 'start_game':
      init(payload.arguments?.board_size);
      ChatBridge.respondToTool(requestId, { success: true, state: GoEngine.getState(engine) });
      break;

    case 'place_stone': {
      const x = payload.arguments?.x;
      const y = payload.arguments?.y;
      const result = GoEngine.placeStone(engine, x, y);

      if (result.error) {
        ChatBridge.respondToTool(requestId, { error: result.error });
      } else {
        GoBoard.render(engine);
        GoBoard.updateStatus(engine);
        ChatBridge.respondToTool(requestId, { success: true, state: GoEngine.getState(engine) });
      }
      break;
    }

    case 'get_board_state':
      ChatBridge.respondToTool(requestId, GoEngine.getState(engine));
      break;

    case 'pass_turn': {
      const result = GoEngine.passTurn(engine);
      GoBoard.render(engine);
      GoBoard.updateStatus(engine);
      ChatBridge.respondToTool(requestId, result);

      if (result.gameOver) {
        ChatBridge.complete('completed', { score: result.score });
      }
      break;
    }

    case 'get_hint':
      ChatBridge.respondToTool(requestId, {
        ...GoEngine.getState(engine),
        currentTurn: engine.turn === 1 ? 'black' : 'white',
      });
      break;

    default:
      ChatBridge.respondToTool(requestId, { error: `Unknown tool: ${payload.name}` });
  }
});

/**
 * Register state provider
 */
ChatBridge.onStateRequest(() => engine ? GoEngine.getState(engine) : { error: 'No game active' });

/**
 * Register launch handler
 */
ChatBridge.on('launch', function(config) {
  init(config && config.board_size);
  setupCanvasListener();
});

/**
 * Set up canvas listener on page load
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCanvasListener);
} else {
  setupCanvasListener();
}

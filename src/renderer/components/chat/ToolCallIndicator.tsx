import React from 'react';

export interface ToolCallIndicatorProps {
  toolName: string;
  state: 'detected' | 'executing' | 'complete';
}

const TOOL_LABELS: Record<string, string> = {
  start_game: 'Getting the game ready...',
  make_move: 'Making your move...',
  search_tracks: 'Searching Spotify...',
  get_board_state: 'Checking the board...',
};

export const ToolCallIndicator: React.FC<ToolCallIndicatorProps> = ({
  toolName,
  state,
}) => {
  const label =
    TOOL_LABELS[toolName] || `Working with ${toolName}...`;
  const icon = state === 'complete' ? '✓' : '⏳';

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
      style={{
        backgroundColor: '#f3f4f6',
        padding: '4px 12px',
        fontSize: '13px',
        gap: '6px',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
};

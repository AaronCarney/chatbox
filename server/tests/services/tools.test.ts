import { describe, it, expect } from 'vitest';
import { buildToolsForTurn, PLATFORM_TOOLS } from '../../src/services/tools.js';

describe('tools service', () => {
  describe('PLATFORM_TOOLS', () => {
    it('exports 3 platform tools', () => {
      expect(PLATFORM_TOOLS).toHaveLength(3);
    });

    it('has launch_app tool with correct structure', () => {
      const tool = PLATFORM_TOOLS.find(t => t.function.name === 'launch_app');
      expect(tool).toBeDefined();
      expect(tool?.type).toBe('function');
      expect(tool?.function.strict).toBe(true);
      expect(tool?.function.parameters).toEqual({
        type: 'object',
        properties: { app_id: { type: 'string' } },
        required: ['app_id'],
        additionalProperties: false
      });
    });

    it('has get_app_state tool with correct structure', () => {
      const tool = PLATFORM_TOOLS.find(t => t.function.name === 'get_app_state');
      expect(tool).toBeDefined();
      expect(tool?.type).toBe('function');
      expect(tool?.function.strict).toBe(true);
      expect(tool?.function.parameters).toEqual({
        type: 'object',
        properties: { app_id: { type: 'string' } },
        required: ['app_id'],
        additionalProperties: false
      });
    });

    it('has get_available_apps tool with correct structure', () => {
      const tool = PLATFORM_TOOLS.find(t => t.function.name === 'get_available_apps');
      expect(tool).toBeDefined();
      expect(tool?.type).toBe('function');
      expect(tool?.function.strict).toBe(true);
      expect(tool?.function.parameters).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false
      });
    });
  });

  describe('buildToolsForTurn', () => {
    it('returns 3 platform tools when given empty apps array and null activeAppId', () => {
      const tools = buildToolsForTurn([], null);
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.function.name)).toEqual(['launch_app', 'get_app_state', 'get_available_apps']);
    });

    it('includes chess tools when activeAppId is chess and chessApp is in apps array', () => {
      const chessApp = {
        id: 'chess',
        tools: [
          {
            name: 'make_move',
            description: 'Make a move in chess',
            input_schema: {
              type: 'object',
              properties: { move: { type: 'string' } },
              required: ['move'],
              additionalProperties: false
            }
          },
          {
            name: 'get_board',
            description: 'Get current board state',
            input_schema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          }
        ]
      };

      const tools = buildToolsForTurn([chessApp], 'chess');

      expect(tools).toHaveLength(5); // 3 platform + 2 chess tools
      expect(tools.map(t => t.function.name)).toContain('launch_app');
      expect(tools.map(t => t.function.name)).toContain('get_app_state');
      expect(tools.map(t => t.function.name)).toContain('get_available_apps');
      expect(tools.map(t => t.function.name)).toContain('make_move');
      expect(tools.map(t => t.function.name)).toContain('get_board');

      // Verify chess tool structure
      const makeMoveToolObj = tools.find(t => t.function.name === 'make_move');
      expect(makeMoveToolObj?.type).toBe('function');
      expect(makeMoveToolObj?.function.strict).toBe(true);
      expect(makeMoveToolObj?.function.description).toBe('Make a move in chess');
      expect(makeMoveToolObj?.function.parameters).toEqual({
        type: 'object',
        properties: { move: { type: 'string' } },
        required: ['move'],
        additionalProperties: false
      });
    });

    it('excludes chess tools when activeAppId is null even if chessApp is in apps array', () => {
      const chessApp = {
        id: 'chess',
        tools: [
          {
            name: 'make_move',
            description: 'Make a move in chess',
            input_schema: {
              type: 'object',
              properties: { move: { type: 'string' } },
              required: ['move'],
              additionalProperties: false
            }
          }
        ]
      };

      const tools = buildToolsForTurn([chessApp], null);

      expect(tools).toHaveLength(3); // only platform tools
      expect(tools.map(t => t.function.name)).toEqual(['launch_app', 'get_app_state', 'get_available_apps']);
    });

    it('excludes chess tools when activeAppId does not match chessApp id', () => {
      const chessApp = {
        id: 'chess',
        tools: [
          {
            name: 'make_move',
            description: 'Make a move in chess',
            input_schema: {
              type: 'object',
              properties: { move: { type: 'string' } },
              required: ['move'],
              additionalProperties: false
            }
          }
        ]
      };

      const tools = buildToolsForTurn([chessApp], 'different_app');

      expect(tools).toHaveLength(3); // only platform tools
      expect(tools.map(t => t.function.name)).toEqual(['launch_app', 'get_app_state', 'get_available_apps']);
    });
  });
});

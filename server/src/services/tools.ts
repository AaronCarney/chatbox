interface ToolParameter {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolParameter;
}

interface AppWithTools {
  id: string;
  tools: ToolDefinition[];
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: ToolParameter;
    strict: boolean;
  };
}

export const PLATFORM_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'launch_app',
      description: 'Launch a third-party app in the chat. Available apps: chess, go, dos (DOS Arcade with 18 classic games), spotify. Use when the student asks to play a game or use an app.',
      parameters: {
        type: 'object',
        properties: { app_id: { type: 'string' } },
        required: ['app_id'],
        additionalProperties: false
      },
      strict: true
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_app_state',
      description: 'Get the current state of an active app (e.g. chess board position, game score). Use when the student asks about what is happening in the app.',
      parameters: {
        type: 'object',
        properties: { app_id: { type: 'string' } },
        required: ['app_id'],
        additionalProperties: false
      },
      strict: true
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_available_apps',
      description: 'List all available third-party apps the student can use. Use when the student asks what apps or games are available.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      strict: true
    }
  }
];

export function buildToolsForTurn(
  apps: AppWithTools[],
  activeAppId: string | null
): OpenAITool[] {
  const tools = [...PLATFORM_TOOLS];

  if (activeAppId) {
    const activeApp = apps.find(app => app.id === activeAppId);
    if (activeApp) {
      const appTools = activeApp.tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
          strict: true
        }
      }));
      tools.push(...appTools);
    }
  }

  return tools;
}

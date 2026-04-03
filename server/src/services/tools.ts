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

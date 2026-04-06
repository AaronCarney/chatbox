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
      description: 'Launch a third-party app in the chat. Available apps: chess, go, dos (DOS Arcade with 18 classic games), spotify, nature-explorer (discover animals and plants). Use when the student asks to play a game, use an app, or learn about animals/plants/nature.',
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
      description: 'List ALL available apps. ALWAYS call this tool when the student asks what games or apps are available, instead of answering from memory.',
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
      const appTools = activeApp.tools.map(tool => {
        const props = Object.keys(tool.input_schema.properties || {});
        const required = tool.input_schema.required || [];
        const hasOptional = props.length > required.length;
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: hasOptional
              ? { ...tool.input_schema, additionalProperties: undefined }
              : { ...tool.input_schema, additionalProperties: false },
            strict: !hasOptional,
          }
        };
      });
      tools.push(...appTools);
    }
  }

  return tools;
}

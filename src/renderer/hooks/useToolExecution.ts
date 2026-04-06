import { useState, useRef, useCallback } from 'react';

type ExecutionState =
  | 'idle'
  | 'streaming'
  | 'tool_call_detected'
  | 'tool_executing'
  | 'streaming_resumed'
  | 'complete';

interface ToolCall {
  id: string;
  name: string;
}

export function useToolExecution() {
  const [state, setState] = useState<ExecutionState>('idle');
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  const pendingResolves = useRef<Map<string, (result: any) => void>>(new Map());

  const startStreaming = () => {
    setState('streaming');
  };

  const complete = () => {
    setState('idle');
    setCurrentToolCall(null);
  };

  const handleToolCall = useCallback((tc: ToolCall): Promise<any> => {
    setState('tool_call_detected');
    setCurrentToolCall(tc);

    const promise = new Promise((resolve) => {
      pendingResolves.current.set(tc.id, resolve);
    });

    setState('tool_executing');

    return promise;
  }, []);

  const resolveToolCall = useCallback((result: any, toolCallId?: string) => {
    if (toolCallId && pendingResolves.current.has(toolCallId)) {
      pendingResolves.current.get(toolCallId)!(result);
      pendingResolves.current.delete(toolCallId);
    } else {
      // Fallback: resolve the most recent pending call (backwards compat)
      const entries = Array.from(pendingResolves.current.entries());
      if (entries.length > 0) {
        const [lastId, resolve] = entries[entries.length - 1];
        resolve(result);
        pendingResolves.current.delete(lastId);
      }
    }
    setState('streaming_resumed');
    setCurrentToolCall(null);
  }, []);

  return {
    state,
    currentToolCall,
    startStreaming,
    complete,
    handleToolCall,
    resolveToolCall,
  };
}

import { useState, useRef } from 'react';

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
  const pendingResolve = useRef<((result: any) => void) | null>(null);

  const startStreaming = () => {
    setState('streaming');
  };

  const complete = () => {
    setState('idle');
    setCurrentToolCall(null);
  };

  const handleToolCall = (tc: ToolCall): Promise<any> => {
    setState('tool_call_detected');
    setCurrentToolCall(tc);

    const promise = new Promise((resolve) => {
      pendingResolve.current = resolve;
    });

    setState('tool_executing');

    return promise;
  };

  const resolveToolCall = (result: any) => {
    if (pendingResolve.current) {
      pendingResolve.current(result);
    }
    setState('streaming_resumed');
    setCurrentToolCall(null);
    pendingResolve.current = null;
  };

  return {
    state,
    currentToolCall,
    startStreaming,
    complete,
    handleToolCall,
    resolveToolCall,
  };
}

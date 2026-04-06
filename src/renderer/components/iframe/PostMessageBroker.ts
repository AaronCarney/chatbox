export class PostMessageBroker {
  private allowedOrigins: Set<string>;
  private handlers: Map<string, Set<Function>> = new Map();
  private onMessageHandler: (event: MessageEvent) => void;

  constructor(allowedOrigins: string[] = []) {
    this.allowedOrigins = new Set(allowedOrigins);
    this.onMessageHandler = (event) => this.onMessage(event);
    window.addEventListener('message', this.onMessageHandler);
  }

  private onMessage(event: MessageEvent): void {
    // Validate origin if allowedOrigins is not empty
    if (this.allowedOrigins.size > 0) {
      const sameOrigin = event.origin === window.location.origin;
      const allowed = this.allowedOrigins.has(event.origin);
      // Sandboxed iframes without allow-same-origin have origin "null" — always allow
      const sandboxedOrigin = event.origin === 'null';
      if (!sameOrigin && !allowed && !sandboxedOrigin) {
        console.warn(`Rejected message from untrusted origin: ${event.origin}`);
        return;
      }
    }

    // Check for schema
    if (event.data?.schema !== 'CHATBRIDGE_V1') {
      return;
    }

    const { type, payload } = event.data;

    // Call type-specific handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(payload));
    }

    // Call wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => handler(event.data));
    }
  }

  on(type: string, handler: (data: any) => void): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: (data: any) => void): void {
    this.handlers.get(type)?.delete(handler);
  }

  sendToIframe(
    iframe: HTMLIFrameElement,
    type: string,
    payload: any,
    port?: MessagePort
  ): void {
    const envelope = {
      schema: 'CHATBRIDGE_V1',
      version: '1.0',
      type,
      timestamp: Date.now(),
      payload,
    };

    // Use '*' as targetOrigin — sandboxed iframes have null origin, so
    // window.location.origin would cause messages to be silently dropped.
    if (port) {
      iframe.contentWindow?.postMessage(envelope, '*', [port]);
    } else {
      iframe.contentWindow?.postMessage(envelope, '*');
    }
  }

  requestState(appId: string, iframe: HTMLIFrameElement): Promise<any> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        reject(new Error(`State request timed out for ${appId}`));
      }, 5000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data?.payload ?? event.data);
      };
      channel.port1.start();
      this.sendToIframe(iframe, 'state.request', { appId }, channel.port2);
    });
  }

  launchApp(
    iframe: HTMLIFrameElement,
    appId: string,
    extra?: Record<string, any>
  ): Promise<MessageEvent> {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const port1 = channel.port1;
      const port2 = channel.port2;

      // Set up listener for when iframe responds
      port1.onmessage = (event) => {
        resolve(event);
      };
      port1.start();

      // Send launch message with port2
      this.sendToIframe(iframe, 'task.launch', { appId, ...extra }, port2);
    });
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessageHandler);
    this.handlers.clear();
  }
}

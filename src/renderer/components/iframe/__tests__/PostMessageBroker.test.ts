// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostMessageBroker } from '../PostMessageBroker';

describe('PostMessageBroker', () => {
  let broker: PostMessageBroker;

  beforeEach(() => {
    broker = new PostMessageBroker(['https://trusted.example.com']);
  });

  afterEach(() => {
    broker.destroy();
  });

  function dispatchMessage(origin: string, data: any) {
    const event = new MessageEvent('message', { origin, data });
    window.dispatchEvent(event);
  }

  describe('origin validation', () => {
    it('accepts messages from null origin (sandboxed iframe)', () => {
      const handler = vi.fn();
      broker.on('test.event', handler);

      dispatchMessage('null', {
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'test.event',
        payload: { value: 42 },
      });

      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });

    it('rejects messages from unknown non-null origins', () => {
      const handler = vi.fn();
      broker.on('test.event', handler);

      dispatchMessage('https://evil.example.com', {
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'test.event',
        payload: { value: 99 },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('accepts messages from explicitly allowed origins', () => {
      const handler = vi.fn();
      broker.on('test.event', handler);

      dispatchMessage('https://trusted.example.com', {
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'test.event',
        payload: { value: 1 },
      });

      expect(handler).toHaveBeenCalledWith({ value: 1 });
    });

    it('accepts messages from same origin', () => {
      const handler = vi.fn();
      broker.on('test.event', handler);

      dispatchMessage(window.location.origin, {
        schema: 'CHATBRIDGE_V1',
        version: '1.0',
        type: 'test.event',
        payload: { value: 2 },
      });

      expect(handler).toHaveBeenCalledWith({ value: 2 });
    });
  });

  describe('sendToIframe', () => {
    it('sends with wildcard targetOrigin for sandboxed iframes', () => {
      const iframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      broker.sendToIframe(iframe, 'test.event', { foo: 'bar' });

      expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ schema: 'CHATBRIDGE_V1', type: 'test.event' }),
        '*'
      );
    });

    it('sends with wildcard targetOrigin when port is provided', () => {
      const mockPort = {} as MessagePort;
      const iframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      broker.sendToIframe(iframe, 'test.event', { foo: 'bar' }, mockPort);

      expect(iframe.contentWindow!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ schema: 'CHATBRIDGE_V1', type: 'test.event' }),
        '*',
        [mockPort]
      );
    });
  });
});

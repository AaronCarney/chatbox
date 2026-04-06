import type { PostMessageBroker } from '@/components/iframe/PostMessageBroker'

const CAPTURE_TIMEOUT = 3000

export function requestCapture(
  broker: PostMessageBroker,
  iframe: HTMLIFrameElement,
  requestId: string
): void {
  broker.sendToIframe(iframe, 'capture.request', { requestId })
}

export function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 224
        canvas.height = 224
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas 2D context unavailable'))
        ctx.drawImage(img, 0, 0, 224, 224)
        resolve(ctx.getImageData(0, 0, 224, 224))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('Failed to decode capture image'))
    img.src = dataUrl
  })
}

export { CAPTURE_TIMEOUT }

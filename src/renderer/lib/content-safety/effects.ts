export function applyBlur(iframeEl: HTMLIFrameElement): void {
  iframeEl.style.filter = 'blur(30px)'
  iframeEl.style.transition = 'filter 0.5s ease'
}

export function removeBlur(iframeEl: HTMLIFrameElement): void {
  iframeEl.style.filter = ''
}

export function applyHardBlock(iframeEl: HTMLIFrameElement): void {
  iframeEl.style.filter = 'blur(50px) brightness(0.3)'
  iframeEl.style.pointerEvents = 'none'
  iframeEl.style.transition = 'filter 0.5s ease'
}

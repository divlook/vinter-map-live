import {
  captureCanvas,
  captureCtx,
  ensureOCRReady,
  parseCoordinates,
  parseCoordinateString,
  prepareImageForOCR,
  scheduler,
} from '@/chrome/content'

export const parseTestImage = async (imageUrl: string) => {
  await ensureOCRReady()

  if (!scheduler) return null

  const imgEl = document.createElement('img')

  imgEl.src = imageUrl

  await new Promise((resolve) => {
    imgEl.onload = () => resolve(true)
  })

  const x = (imgEl.naturalWidth / 4) * 3
  const y = 0
  const width = imgEl.naturalWidth - x
  const height = imgEl.naturalHeight - (imgEl.naturalHeight / 4) * 3

  captureCanvas.width = width
  captureCanvas.height = height

  captureCtx.imageSmoothingEnabled = false
  captureCtx.clearRect(0, 0, width, height)
  captureCtx.drawImage(imgEl, x, y, width, height, 0, 0, width, height)

  const imageData = prepareImageForOCR(captureCanvas, captureCtx)
  const coordinates = (await parseCoordinates(scheduler, imageData)) || ''
  const parsedCoordinates = parseCoordinateString(coordinates.trim())

  imgEl.remove()

  return JSON.stringify(parsedCoordinates, null, 2)
}

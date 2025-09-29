import type { ImageLike } from '@/libs/types'

const OCR_UPSCALE_FACTOR = 3

export class ImageProcessor {
  static async toElement(input: ImageLike) {
    const img = new Image()

    let el: HTMLImageElement | HTMLVideoElement
    let width = 0
    let height = 0

    if (typeof input === 'string') {
      await new Promise<void>((resolve) => {
        img.src = input
        img.onload = () => {
          resolve()
        }
      })
      el = img
    } else {
      el = input
    }

    if (el instanceof HTMLImageElement) {
      width = el.naturalWidth
      height = el.naturalHeight
    } else if (el instanceof HTMLVideoElement) {
      width = el.videoWidth
      height = el.videoHeight
    }

    return {
      el,
      width,
      height,
    }
  }

  static async extractTopRightRegion(
    input: ImageLike,
  ): Promise<ImageProcessor.Result> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    const image = await ImageProcessor.toElement(input)
    const x = (image.width / 8) * 7
    const y = 0
    const width = image.width - x
    const height = image.height - (image.height / 10) * 9

    canvas.width = width
    canvas.height = height

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image.el, x, y, width, height, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const dataURL = canvas.toDataURL()

    canvas.remove()

    return {
      imageData,
      dataURL,
      width,
      height,
    }
  }

  static async upscale(
    image: ImageLike,
    {
      scale = OCR_UPSCALE_FACTOR,
    }: {
      scale?: number
    } = {},
  ): Promise<ImageProcessor.Result> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const img = await ImageProcessor.toElement(image)

    canvas.width = img.width * scale
    canvas.height = img.height * scale

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      img.el,
      0,
      0,
      img.width,
      img.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const dataURL = canvas.toDataURL()

    canvas.remove()

    return {
      imageData,
      dataURL,
      width: img.width,
      height: img.height,
    }
  }

  static async isolateTextColors(
    input: ImageLike,
  ): Promise<ImageProcessor.Result> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const img = await ImageProcessor.toElement(input)

    canvas.width = img.width
    canvas.height = img.height
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img.el, 0, 0)

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i]
      const g = imageData.data[i + 1]
      const b = imageData.data[i + 2]

      if (!(r >= 180 && g >= 180 && b >= 170)) {
        imageData.data[i] = 0
        imageData.data[i + 1] = 0
        imageData.data[i + 2] = 0
      }
    }

    ctx.putImageData(imageData, 0, 0)

    imageData = ctx.getImageData(0, 0, img.width, img.height)
    const dataURL = canvas.toDataURL()

    canvas.remove()

    return {
      imageData,
      dataURL,
      width: img.width,
      height: img.height,
    }
  }
}

export namespace ImageProcessor {
  export interface Result {
    imageData: ImageData
    dataURL: string
    width: number
    height: number
  }
}

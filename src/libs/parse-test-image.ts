import { CoordsParser } from '@/libs/coords-parser'
import { ImageProcessor } from '@/libs/image-processor'

const coordsParser = new CoordsParser()

export const parseTestImage = async (imageUrl: string) => {
  await coordsParser.ensureScheduler()

  const { dataURL } = await ImageProcessor.extractTopRightRegion(imageUrl)
    .then(({ dataURL }) => ImageProcessor.upscale(dataURL))
    .then(({ dataURL }) => ImageProcessor.isolateTextColors(dataURL))
  const coordinates = await coordsParser.recognizeCoordinates(dataURL)

  return {
    dataURL,
    result: JSON.stringify(coordinates, null, 2),
  }
}

import { ResultViewer } from '@/dev/ui/ResultViewer'
import { parseTestImage } from '@/libs/parse-test-image'
import { getTestImages } from '@/libs/test-image'
import { useCallback, useEffect, useState } from 'react'

export const App = () => {
  const [testImages, setTestImages] = useState<string[]>([])
  const [imageResults, setImageResults] = useState<
    Record<
      string,
      {
        dataURL: string
        result: string
      }
    >
  >({})

  const initialize = useCallback(async () => {
    const testImages = await getTestImages()

    setTestImages(testImages)
    runTests(testImages)
  }, [])

  const runTests = async (testImages: string[]) => {
    setImageResults({})
    testImages.forEach(async (imageUrl) => {
      const result = await parseTestImage(imageUrl)

      if (!result) return

      setImageResults((prev) => ({
        ...prev,
        [imageUrl]: result,
      }))
    })
  }

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <>
      <div>
        <button onClick={() => runTests(testImages)}>재실행</button>
      </div>
      <div>
        {testImages.map((imageUrl, index) => (
          <ResultViewer
            key={index}
            imageUrl={imageUrl}
            parsedImageUrl={imageResults[imageUrl]?.dataURL}
            result={imageResults[imageUrl]?.result}
          />
        ))}
      </div>
    </>
  )
}

import { action, type Action } from '@/libs/action'
import Tesseract, { createScheduler, type WorkerParams } from 'tesseract.js'

const video = document.createElement('video')
let captureTimeoutId: ReturnType<typeof setTimeout> | null = null
let scheduler: ReturnType<typeof createScheduler> | null = null
let ocrInitializationPromise: Promise<void> | null = null

const captureCanvas = document.createElement('canvas')
const captureCtx = captureCanvas.getContext('2d')!
const upscaleCanvas = document.createElement('canvas')
const upscaleCtx = upscaleCanvas.getContext('2d')!
const grayscaleCanvas = document.createElement('canvas')
const grayscaleCtx = grayscaleCanvas.getContext('2d')!

const CAPTURE_INTERVAL_MS = 1000
const OCR_WORKER_COUNT = 1
const OCR_PARAMETERS: Partial<WorkerParams> = {
  tessedit_char_whitelist: '0123456789/NSEW',
  tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
}
const OCR_UPSCALE_FACTOR = 3
const IMAGE_FILTER_OPTIONS = {
  contrast: 1.3,
  brightness: 1.1,
  gamma: 0.8,
  threshold: 180,
}
const COORDINATE_TOLERANCE = 10
const REMOTE_COORDINATE_CONFIRMATION_COUNT = 3

type ParsedCoordinates = {
  yValue: number
  yUnit: string
  xValue: number
  xUnit: string
}

type CoordinateOutlierCandidate = {
  coordinates: ParsedCoordinates
  count: number
}

/** 활성 상태: 캡처 루프와 OCR 처리가 정상 동작하고 있음을 의미 */
let isMonitoringActive = false
/** 시작 상태: 스트림 요청이나 워커 초기화 등 준비 단계가 진행 중임을 표시해 중복 호출을 막음 */
let isMonitoringStarting = false
/** 캡처 중복 실행을 방지하기 위한 상태 플래그 */
let isCaptureInProgress = false
/** 마지막으로 입력된 좌표를 기록해 허용 오차 내 변동만 반영한다. */
let lastSubmittedCoordinates: ParsedCoordinates | null = null
/** 허용 오차를 초과하지만 반복 감지되는 좌표 후보를 임시 저장한다. */
let pendingOutlierCoordinates: CoordinateOutlierCandidate | null = null

/** 모니터링 상태를 동기화해 content/background 간 일관성을 유지한다. */
const setMonitoringState = (isActive: boolean) => {
  if (isMonitoringActive === isActive) {
    console.log(
      `[Monitor] 모니터링 상태 유지: ${isActive ? '활성화' : '비활성화'}`,
    )
    return
  }

  isMonitoringActive = isActive

  chrome.runtime.sendMessage(
    action({
      type: 'set-monitoring-state',
      isMonitoring: isActive,
    }),
  )

  console.log(
    `[Monitor] 모니터링 상태 전송: ${isActive ? '활성화' : '비활성화'}`,
  )
}

const handleTrackEnded = () => {
  console.log('[Monitor] 화면 공유 트랙 종료 이벤트 감지')
  stopMonitoring()
}

const ensureOCRReady = async () => {
  if (scheduler) {
    console.log('[Monitor] OCR 이미 준비 완료 상태')
    return
  }

  if (!ocrInitializationPromise) {
    console.log('[Monitor] OCR 초기화 시작')
    ocrInitializationPromise = (async () => {
      try {
        scheduler = await createConfiguredScheduler()
        console.log('[Monitor] OCR 초기화 완료')
      } catch (error) {
        console.error('[Monitor] OCR 초기화 실패', error)
        throw error
      } finally {
        ocrInitializationPromise = null
      }
    })()
  }

  await ocrInitializationPromise
}

const cleanupOCR = async () => {
  if (ocrInitializationPromise) {
    try {
      await ocrInitializationPromise
    } catch (error) {
      console.error('[Monitor] 클린업 전에 OCR 초기화 실패', error)
    }
  }

  if (scheduler) {
    console.log('[Monitor] 스케줄러 종료')
    await scheduler.terminate()
    scheduler = null
  }
}

const createConfiguredScheduler = async () => {
  console.log('[Monitor] 워커 준비 시작')
  const nextScheduler = createScheduler()

  try {
    await Promise.all(
      Array.from({ length: OCR_WORKER_COUNT }).map(async () => {
        const worker = await Tesseract.createWorker(
          'eng',
          Tesseract.OEM.TESSERACT_LSTM_COMBINED,
        )
        await worker.setParameters(OCR_PARAMETERS)
        await nextScheduler.addWorker(worker)
        console.log('[Monitor] 워커 등록 완료')
      }),
    )

    return nextScheduler
  } catch (error) {
    await nextScheduler.terminate()
    throw error
  }
}

const attachStreamToVideo = async (stream: MediaStream) => {
  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', handleTrackEnded)
  })

  video.srcObject = stream
  await video.play()
  console.log('[Monitor] 비디오 재생 시작')
}

const prepareImageForOCR = (
  sourceCanvas: HTMLCanvasElement,
  sourceCtx: CanvasRenderingContext2D,
) => {
  const { width, height } = sourceCanvas

  grayscaleCanvas.width = width
  grayscaleCanvas.height = height

  const imageData = sourceCtx.getImageData(0, 0, width, height)
  const grayscaleData = grayscaleCtx.createImageData(width, height)

  const { contrast, brightness, gamma, threshold } = IMAGE_FILTER_OPTIONS

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]
    const alpha = imageData.data[i + 3]

    // standard luminance weights
    const grayscale = 0.299 * r + 0.587 * g + 0.114 * b
    const normalized = grayscale / 255
    const gammaCorrected = Math.pow(normalized, gamma)
    let value = gammaCorrected * 255

    value = (value - 128) * contrast + 128
    value *= brightness

    let clamped = Math.max(0, Math.min(255, value))

    if (typeof threshold === 'number') {
      clamped = clamped >= threshold ? 255 : 0
    }

    grayscaleData.data[i] = clamped
    grayscaleData.data[i + 1] = clamped
    grayscaleData.data[i + 2] = clamped
    grayscaleData.data[i + 3] = alpha
  }

  grayscaleCtx.putImageData(grayscaleData, 0, 0)

  return grayscaleCanvas.toDataURL('image/png')
}

const detachStreamFromVideo = () => {
  if (!video.srcObject) return

  const stream = video.srcObject as MediaStream

  stream.getTracks().forEach((track) => {
    track.removeEventListener('ended', handleTrackEnded)
    track.stop()
  })

  video.pause()
  video.srcObject = null
  console.log('[Monitor] 비디오 스트림 정리 완료')
}

const cleanupMonitoring = async () => {
  if (captureTimeoutId !== null) {
    console.log('[Monitor] 캡처 타이머 중지')
    clearTimeout(captureTimeoutId)
    captureTimeoutId = null
  }

  await cleanupOCR()

  detachStreamFromVideo()
  lastSubmittedCoordinates = null
  pendingOutlierCoordinates = null
}

const startMonitoring = async () => {
  if (isMonitoringStarting || isMonitoringActive || captureTimeoutId !== null) {
    console.warn('[Monitor] 이미 모니터링 시작이 진행 중이거나 활성 상태입니다')
    return
  }

  let currentStream: MediaStream | null = null

  try {
    isMonitoringStarting = true
    console.log('[Monitor] 모니터링 시작 시도')
    currentStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    })
    console.log('[Monitor] 화면 공유 스트림 획득')

    await attachStreamToVideo(currentStream)

    await ensureOCRReady()

    setMonitoringState(true)
    scheduleNextCapture(0)
    console.log('[Monitor] 캡처 타이머 시작')

    isMonitoringStarting = false
  } catch (error) {
    console.error('[Monitor] 모니터링 시작 실패', error)

    detachStreamFromVideo()

    await cleanupOCR()
    setMonitoringState(false)
    isMonitoringStarting = false
    console.log('[Monitor] 모니터링 시작 실패로 리소스 정리 완료')
  }
}

const stopMonitoring = async () => {
  if (!isMonitoringActive && !video.srcObject) return

  console.log('[Monitor] 모니터링 중지 요청')
  setMonitoringState(false)
  await cleanupMonitoring()
  isMonitoringStarting = false
}

const captureScreen = async () => {
  if (!scheduler) {
    console.warn('[Monitor] 스케줄러가 준비되지 않아 캡처를 건너뜀')
    return
  }

  if (isCaptureInProgress) {
    console.warn('[Monitor] 이전 캡처가 아직 완료되지 않아 건너뜀')
    return
  }

  isCaptureInProgress = true

  console.log('[Monitor] 화면 캡처 시작')

  try {
    const x = (video.videoWidth / 4) * 3
    const y = 0
    const width = video.videoWidth - x
    const height = video.videoHeight - (video.videoHeight / 4) * 3

    captureCanvas.width = width
    captureCanvas.height = height

    captureCtx.imageSmoothingEnabled = false
    captureCtx.clearRect(0, 0, width, height)
    captureCtx.drawImage(video, x, y, width, height, 0, 0, width, height)

    const imageData = prepareImageForOCR(captureCanvas, captureCtx)

    const coordinates = await parseCoordinates(scheduler, imageData)

    moveMap(coordinates)
    console.log('[Monitor] 좌표 파싱 결과', coordinates)
  } finally {
    isCaptureInProgress = false
  }
}

const runCaptureLoop = async (): Promise<void> => {
  if (!isMonitoringActive) return

  const startTime = performance.now()

  try {
    await captureScreen()
  } catch (error) {
    console.error('[Monitor] 캡처 루프 실행 중 오류', error)
  } finally {
    const elapsed = performance.now() - startTime

    if (isMonitoringActive) {
      const nextDelay = Math.max(0, CAPTURE_INTERVAL_MS - elapsed)
      scheduleNextCapture(nextDelay)
    }
  }
}

function scheduleNextCapture(delay: number) {
  if (!isMonitoringActive) return

  if (captureTimeoutId !== null) {
    clearTimeout(captureTimeoutId)
  }

  captureTimeoutId = window.setTimeout(() => {
    captureTimeoutId = null
    runCaptureLoop()
  }, delay)
}

const parseCoordinates = async (
  activeScheduler: ReturnType<typeof createScheduler>,
  imageData: string,
) => {
  console.log('[Monitor] OCR 파싱 시작')
  const originalImg = new Image()

  await new Promise<void>((resolve) => {
    originalImg.src = imageData
    originalImg.onload = () => {
      resolve()
    }
  })

  upscaleCanvas.width = originalImg.naturalWidth * OCR_UPSCALE_FACTOR
  upscaleCanvas.height = originalImg.naturalHeight * OCR_UPSCALE_FACTOR

  upscaleCtx.imageSmoothingEnabled = true
  upscaleCtx.imageSmoothingQuality = 'high'
  upscaleCtx.clearRect(0, 0, upscaleCanvas.width, upscaleCanvas.height)

  upscaleCtx.drawImage(
    originalImg,
    0,
    0,
    originalImg.naturalWidth,
    originalImg.naturalHeight,
    0,
    0,
    upscaleCanvas.width,
    upscaleCanvas.height,
  )

  const upscaledImageData = upscaleCanvas.toDataURL('image/png')

  const result = await activeScheduler.addJob('recognize', upscaledImageData)
  console.log('[Monitor] OCR 결과 텍스트', result.data.text)

  const parts =
    result.data.text
      .split('\n')
      .map((line) => line.trim().split(' '))
      .flat() ?? []
  const coordinates =
    parts.find((part) => /[0-9]+[SN]\/[0-9]+[EW]/.test(part)) ?? null

  return coordinates
}

const parseCoordinateString = (
  coordinates: string,
): ParsedCoordinates | null => {
  const [rawY, rawX] = coordinates.split('/')
  if (!rawY || !rawX) return null

  const parsePart = (part: string) => {
    const numericPart = part.replace(/[^\d]/g, '')
    const unitPart = part.replace(/[\d]/g, '').toUpperCase()

    if (!numericPart || !unitPart) return null

    return {
      value: getAdjustedInputValue(numericPart),
      unit: unitPart,
    }
  }

  const yPart = parsePart(rawY)
  const xPart = parsePart(rawX)

  if (!yPart || !xPart) return null

  return {
    yValue: yPart.value,
    yUnit: yPart.unit,
    xValue: xPart.value,
    xUnit: xPart.unit,
  }
}

const isWithinCoordinateTolerance = (
  previous: ParsedCoordinates,
  next: ParsedCoordinates,
) => {
  if (previous.yUnit !== next.yUnit || previous.xUnit !== next.xUnit) {
    return false
  }

  const isYWithinTolerance =
    Math.abs(previous.yValue - next.yValue) <= COORDINATE_TOLERANCE
  const isXWithinTolerance =
    Math.abs(previous.xValue - next.xValue) <= COORDINATE_TOLERANCE

  return isYWithinTolerance && isXWithinTolerance
}

const submitCoordinates = (parsedCoordinates: ParsedCoordinates) => {
  const form = document.querySelector('.map-search form')
  const yInput = (document.getElementById('YValue') as HTMLInputElement) || null
  const yUnit = (document.getElementById('Yunit') as HTMLSelectElement) || null
  const xInput = (document.getElementById('XValue') as HTMLInputElement) || null
  const xunit = (document.getElementById('Xunit') as HTMLSelectElement) || null
  const submitButton =
    (form?.querySelector('button[type="submit"]') as HTMLButtonElement) || null

  if (!form || !yInput || !yUnit || !xInput || !xunit || !submitButton) {
    console.warn('[Monitor] 좌표 제출 요소를 찾지 못해 입력을 건너뜀')
    return false
  }

  yInput.value = String(parsedCoordinates.yValue)
  yUnit.value = parsedCoordinates.yUnit
  xInput.value = String(parsedCoordinates.xValue)
  xunit.value = parsedCoordinates.xUnit
  submitButton.click()

  lastSubmittedCoordinates = parsedCoordinates
  pendingOutlierCoordinates = null

  return true
}

/**
 * @param coordinates ex) 37N/127E
 */
const moveMap = (coordinates: string | null) => {
  if (!coordinates) return

  const parsedCoordinates = parseCoordinateString(coordinates.trim())

  if (!parsedCoordinates) {
    console.warn('[Monitor] 좌표 문자열 파싱 실패', coordinates)
    return
  }

  if (!lastSubmittedCoordinates) {
    submitCoordinates(parsedCoordinates)
    return
  }

  if (
    isWithinCoordinateTolerance(lastSubmittedCoordinates, parsedCoordinates)
  ) {
    submitCoordinates(parsedCoordinates)
    return
  }

  const isContinuingOutlier =
    pendingOutlierCoordinates &&
    isWithinCoordinateTolerance(
      pendingOutlierCoordinates.coordinates,
      parsedCoordinates,
    )

  const nextOutlierCandidate: CoordinateOutlierCandidate = isContinuingOutlier
    ? {
        coordinates: parsedCoordinates,
        count: pendingOutlierCoordinates!.count + 1,
      }
    : {
        coordinates: parsedCoordinates,
        count: 1,
      }

  if (!isContinuingOutlier) {
    console.log('[Monitor] 원거리 좌표 후보 감지', parsedCoordinates)
  }

  pendingOutlierCoordinates = nextOutlierCandidate

  if (nextOutlierCandidate.count >= REMOTE_COORDINATE_CONFIRMATION_COUNT) {
    if (submitCoordinates(nextOutlierCandidate.coordinates)) {
      console.log('[Monitor] 원거리 좌표 확정으로 지도 이동', {
        coordinates: nextOutlierCandidate.coordinates,
        count: nextOutlierCandidate.count,
      })
    }

    return
  }

  if (nextOutlierCandidate.count > 1) {
    console.log('[Monitor] 원거리 좌표 후보 반복 감지', {
      count: nextOutlierCandidate.count,
      coordinates: nextOutlierCandidate.coordinates,
    })
  }
}

const getAdjustedInputValue = (input: string): number => {
  const arr = [
    Number(input.slice(-3)),
    Number(input.slice(-2)),
    Number(input.slice(-4, -1)),
    Number(input.slice(-3, -1)),
  ].sort()

  while (arr.length > 0) {
    const value = arr.pop()

    if (!!value && value < 120) return value
  }

  return 0
}

chrome.runtime.onMessage.addListener((payload: Action) => {
  switch (payload.type) {
    case 'start-monitoring': {
      console.log('[Monitor] 메시지 수신: start-monitoring')
      startMonitoring()
      break
    }
    case 'stop-monitoring': {
      console.log('[Monitor] 메시지 수신: stop-monitoring')
      stopMonitoring()
      break
    }
  }

  return true
})

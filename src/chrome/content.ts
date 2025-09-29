import { action, type Action } from '@/libs/action'
import { CoordsParser } from '@/libs/coords-parser'
import { ImageProcessor } from '@/libs/image-processor'
import { logger } from '@/libs/logger'
import type { ImageLike } from 'tesseract.js'

const coordsParser = new CoordsParser()

const video = document.createElement('video')
let captureTimeoutId: ReturnType<typeof setTimeout> | null = null

const CAPTURE_INTERVAL_MS = 2000
const COORDINATE_TOLERANCE = 20
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
    logger.log(`모니터링 상태 유지: ${isActive ? '활성화' : '비활성화'}`)
    return
  }

  isMonitoringActive = isActive

  chrome.runtime.sendMessage(
    action({
      type: 'set-monitoring-state',
      isMonitoring: isActive,
    }),
  )

  logger.log(`모니터링 상태 전송: ${isActive ? '활성화' : '비활성화'}`)
}

const handleTrackEnded = () => {
  logger.log('화면 공유 트랙 종료 이벤트 감지')
  /** 화면 공유 강제 종료 시에도 모든 상태를 완전히 초기화 */
  isMonitoringStarting = false
  isCaptureInProgress = false
  stopMonitoring()
}

const attachStreamToVideo = async (stream: MediaStream) => {
  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', handleTrackEnded)
  })

  video.srcObject = stream
  await video.play()
  logger.log('비디오 재생 시작')
}

export const prepareImageForOCR = async (input: ImageLike) => {
  let dataURL: string
  dataURL = await ImageProcessor.upscale(input).then(({ dataURL }) => dataURL)
  dataURL = await ImageProcessor.isolateTextColors(dataURL).then(
    ({ dataURL }) => dataURL,
  )
  return dataURL
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
  logger.log('비디오 스트림 정리 완료')
}

const cleanupMonitoring = async () => {
  if (captureTimeoutId !== null) {
    logger.log('캡처 타이머 중지')
    clearTimeout(captureTimeoutId)
    captureTimeoutId = null
  }

  await coordsParser.dispose()

  detachStreamFromVideo()

  /** 캡처 진행 상태 초기화 */
  isCaptureInProgress = false
  lastSubmittedCoordinates = null
  pendingOutlierCoordinates = null
}

const startMonitoring = async () => {
  if (isMonitoringStarting || isMonitoringActive || captureTimeoutId !== null) {
    logger.log('이미 모니터링 시작이 진행 중이거나 활성 상태입니다')
    return
  }

  let currentStream: MediaStream | null = null

  try {
    isMonitoringStarting = true
    /** 시작 전 상태 초기화 */
    isCaptureInProgress = false
    logger.log('모니터링 시작 시도')
    currentStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    })
    logger.log('화면 공유 스트림 획득')

    await attachStreamToVideo(currentStream)

    await coordsParser.ensureScheduler()

    setMonitoringState(true)
    scheduleNextCapture(0)
    logger.log('캡처 타이머 시작')

    isMonitoringStarting = false
  } catch (error) {
    logger.error('모니터링 시작 실패', error)

    detachStreamFromVideo()

    await coordsParser.dispose()
    setMonitoringState(false)
    isMonitoringStarting = false
    /** 실패 시에도 캡처 상태 초기화 */
    isCaptureInProgress = false
    logger.log('모니터링 시작 실패로 리소스 정리 완료')
  }
}

const stopMonitoring = async () => {
  if (!isMonitoringActive && !video.srcObject) return

  logger.log('모니터링 중지 요청')
  setMonitoringState(false)
  await cleanupMonitoring()
  isMonitoringStarting = false
}

const captureScreen = async () => {
  if (isCaptureInProgress) {
    logger.log('이전 캡처가 아직 완료되지 않아 건너뜀')
    return
  }

  isCaptureInProgress = true

  logger.log('화면 캡처 시작')

  try {
    const img = await ImageProcessor.extractTopRightRegion(video)
    const dataURL = await prepareImageForOCR(img.dataURL)
    const coordinates = await parseCoordinates(dataURL)

    moveMap(coordinates)
    logger.log('좌표 파싱 결과', coordinates)
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
    logger.error('캡처 루프 실행 중 오류', error)
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

export const parseCoordinates = async (imageURL: string) => {
  logger.log('OCR 파싱 시작')

  return await coordsParser.recognizeCoordinates(imageURL)
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
    logger.log('좌표 제출 요소를 찾지 못해 입력을 건너뜀')
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
const moveMap = (parsedCoordinates: ParsedCoordinates | null) => {
  if (!parsedCoordinates) return

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
    logger.log('원거리 좌표 후보 감지', parsedCoordinates)
  }

  pendingOutlierCoordinates = nextOutlierCandidate

  if (nextOutlierCandidate.count >= REMOTE_COORDINATE_CONFIRMATION_COUNT) {
    if (submitCoordinates(nextOutlierCandidate.coordinates)) {
      logger.log('원거리 좌표 확정으로 지도 이동', {
        coordinates: nextOutlierCandidate.coordinates,
        count: nextOutlierCandidate.count,
      })
    }

    return
  }

  if (nextOutlierCandidate.count > 1) {
    logger.log('원거리 좌표 후보 반복 감지', {
      count: nextOutlierCandidate.count,
      coordinates: nextOutlierCandidate.coordinates,
    })
  }
}

chrome?.runtime?.onMessage.addListener((payload: Action) => {
  switch (payload.type) {
    case 'start-monitoring': {
      logger.log('메시지 수신: start-monitoring')
      startMonitoring()
      break
    }
    case 'stop-monitoring': {
      logger.log('메시지 수신: stop-monitoring')
      stopMonitoring()
      break
    }
  }

  return true
})

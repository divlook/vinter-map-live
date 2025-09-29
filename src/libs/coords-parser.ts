import { logger } from '@/libs/logger'
import type { ImageLike } from '@/libs/types'
import Tesseract, { createScheduler, type WorkerParams } from 'tesseract.js'

type ParsedCoordinates = {
  yValue: number
  yUnit: string
  xValue: number
  xUnit: string
}

const OCR_WORKER_COUNT = 1
const OCR_PARAMETERS: Partial<WorkerParams> = {
  tessedit_char_whitelist: '0123456789/NSEW',
  tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
}

export class CoordsParser {
  #scheduler: Tesseract.Scheduler | null = null
  #setupPromise: Promise<void> | null = null

  get scheduler() {
    return this.#scheduler
  }

  ensureScheduler() {
    if (this.#scheduler) {
      logger.log('scheduler 준비 완료 상태')
      return
    }

    if (this.#setupPromise) {
      logger.log('scheduler 초기화 진행 중...')
      return this.#setupPromise
    }

    logger.log('scheduler 초기화 시작')

    this.#setupPromise = (async () => {
      try {
        this.#scheduler = await CoordsParser.initializeScheduler()
        this.#setupPromise = null
        logger.log('scheduler 초기화 완료')
      } catch (error) {
        this.#setupPromise = null
        logger.error('scheduler 초기화 실패', error)
        throw error
      }
    })()
    return this.#setupPromise
  }

  async dispose() {
    logger.log('스케줄러 종료')

    await this.#setupPromise?.catch(() => {})
    await this.#scheduler?.terminate().catch(() => {})
    this.#scheduler = null
  }

  async recognizeCoordinates(
    image: ImageLike,
  ): Promise<ParsedCoordinates | null> {
    try {
      await this.ensureScheduler()
      const result = await this.#scheduler!.addJob('recognize', image)
      logger.log('OCR 결과 텍스트', result.data.text)

      const parts =
        result.data.text
          .split('\n')
          .map((line) => line.trim().split(' '))
          .flat() ?? []

      const coordinatesText =
        parts.find((part) => /[0-9]+[SN]\/[0-9]+[EW]/.test(part))?.trim() ??
        null

      const parsedCoordinates = CoordsParser.parseCoordinates(
        coordinatesText || '',
      )

      if (parsedCoordinates) {
        logger.log('파싱된 좌표', parsedCoordinates)
      } else {
        logger.log('좌표 문자열 파싱 실패', coordinatesText)
      }

      return parsedCoordinates
    } catch (error) {
      logger.error('OCR 처리 중 오류 발생', error)
      throw error
    }
  }

  static async initializeScheduler() {
    logger.log('Tesseract 워커 및 스케줄러 생성 시작')

    const scheduler = createScheduler()

    try {
      await Promise.all(
        Array.from({ length: OCR_WORKER_COUNT }).map(async () => {
          const worker = await Tesseract.createWorker(
            'eng',
            Tesseract.OEM.TESSERACT_LSTM_COMBINED,
          )
          await worker.setParameters(OCR_PARAMETERS)
          await scheduler.addWorker(worker)

          logger.log('Tesseract 워커 생성 및 스케줄러에 추가 완료')
        }),
      )

      return scheduler
    } catch (error) {
      logger.error('Tesseract 워커 생성 또는 스케줄러 추가 중 오류 발생', error)
      await scheduler.terminate()
      throw error
    }
  }

  static parseCoordinates = (coordinates: string): ParsedCoordinates | null => {
    const [rawY, rawX] = coordinates.split('/')
    if (!rawY || !rawX) return null

    const parsePart = (part: string) => {
      const numericPart = part.replace(/[^\d]/g, '')
      const unitPart = part.replace(/[\d]/g, '').toUpperCase()

      if (!numericPart || !unitPart) return null

      return {
        value: Number(numericPart),
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
}

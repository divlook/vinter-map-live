export type Action =
  | {
      type: 'start-monitoring'
    }
  | {
      type: 'stop-monitoring'
    }
  | {
      type: 'set-monitoring-state'
      isMonitoring: boolean
    }

export const action = (payload: Action) => payload

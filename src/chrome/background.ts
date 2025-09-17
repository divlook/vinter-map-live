import { action, type Action } from '@/libs/action'

let isMonitoring = false

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id
  if (!tabId) return

  chrome.tabs.sendMessage(
    tabId,
    action({
      type: !isMonitoring ? 'start-monitoring' : 'stop-monitoring',
    }),
  )
})

chrome.runtime.onMessage.addListener((payload: Action) => {
  switch (payload.type) {
    case 'set-monitoring-state': {
      isMonitoring = payload.isMonitoring
      break
    }
  }

  return true
})

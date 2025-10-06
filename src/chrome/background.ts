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

      if (isMonitoring) {
        chrome.action.setIcon({
          path: {
            '16': 'icons/icon-active@16w.png',
            '24': 'icons/icon-active@24w.png',
            '32': 'icons/icon-active@32w.png',
          },
        })
      } else {
        chrome.action.setIcon({
          path: {
            '16': 'icons/icon@16w.png',
            '24': 'icons/icon@24w.png',
            '32': 'icons/icon@32w.png',
          },
        })
      }
      break
    }
  }

  return true
})

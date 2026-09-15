import { ROUTES_AREA, SIDEBAR_NAV_AREA, type HermesPlugin } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'

import { AgentInspectorPage } from './components/AgentInspectorPage'
import { createRunPayload, persistRun } from './api/runs'
import { estimateRunCost } from './utils/cost'
import { startTraceCollection } from './trace/store'

const plugin: HermesPlugin = {
  id: 'agent-inspector',
  name: 'Agent Inspector',
  description: 'Live session metadata and a normalized Hermes execution timeline for developers.',
  register(ctx) {
    startTraceCollection(ctx.onDispose, async completedRun => {
      // Cost is resolved once here and stored with the run, so the history
      // list can show it without loading each run's events back.
      const costUsd = await estimateRunCost(ctx.rest, completedRun.usage, completedRun.model)

      await persistRun(ctx.rest, createRunPayload(completedRun, costUsd))
    })

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: '/agent-inspector' },
        render: () => jsx(AgentInspectorPage, { rest: ctx.rest })
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 60,
        data: {
          path: '/agent-inspector',
          label: 'Agent Inspector',
          codicon: 'pulse'
        }
      }
    ])
  }
}

export default plugin

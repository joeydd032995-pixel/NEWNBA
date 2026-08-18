import { api } from './api'
import type { BetSlipItem } from '../stores/betslip'

export interface SubmitTrackedSlipPayload {
  name?: string
  items: Array<{
    marketId: string
    eventId: string
    bookId?: string
    outcome: string
    odds: number
    recommendedLine?: number
    direction?: string
    confidenceBucket?: string
    decisionClass?: string
    propStatType?: string
    seasonPhase?: string
    stake: number
    ev?: number
  }>
}

export const betslipApi = {
  submitTrackedSlip: (name: string | undefined, items: BetSlipItem[]) => {
    const payload: SubmitTrackedSlipPayload = {
      name,
      items: items.map((item) => ({
        marketId: item.marketId,
        eventId: item.eventId,
        bookId: item.bookId,
        outcome: item.outcome,
        odds: item.odds,
        recommendedLine: item.recommendedLine,
        direction: item.direction,
        confidenceBucket: item.confidenceBucket,
        decisionClass: item.decisionClass,
        propStatType: item.propStatType,
        seasonPhase: item.seasonPhase,
        stake: item.stake,
        ev: item.ev,
      })),
    }
    return api.post('/betslip/submit-tracked', payload)
  },
}

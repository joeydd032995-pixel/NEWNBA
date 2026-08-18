import { api } from './api'
import type { BetSlipItem } from '../stores/betslip'

export interface TrackedWagerInput {
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
  stake?: number
  ev?: number
}

export interface SubmitTrackedSlipPayload {
  name?: string
  items: TrackedWagerInput[]
}

export interface SubmitTrackedParlayPayload {
  name?: string
  ticketStake: number
  items: TrackedWagerInput[]
}

function fromLocalItem(item: BetSlipItem): TrackedWagerInput {
  return {
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
  }
}

export const betslipApi = {
  submitTrackedSlip: (name: string | undefined, items: BetSlipItem[]) => {
    const payload: SubmitTrackedSlipPayload = {
      name,
      items: items.map(fromLocalItem),
    }
    return api.post('/betslip/submit-tracked', payload)
  },

  submitTrackedParlay: (
    name: string | undefined,
    ticketStake: number,
    items: TrackedWagerInput[],
  ) => {
    const payload: SubmitTrackedParlayPayload = {
      name,
      ticketStake,
      items: items.map((item) => ({ ...item, stake: 0 })),
    }
    return api.post('/betslip/submit-parlay', payload)
  },
}

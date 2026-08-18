import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BetDirection = 'OVER' | 'UNDER' | 'HOME' | 'AWAY' | 'YES' | 'NO' | 'OTHER'
export type ConfidenceBucket = 'LOW' | 'MODERATE' | 'HIGH'
export type DecisionClass = 'PASS' | 'WAIT' | 'LEAN' | 'BET' | 'STRONG_BET'

export interface BetSlipItem {
  id: string
  eventId: string
  marketId: string
  eventName: string
  outcome: string
  displayOutcome?: string
  odds: number
  stake: number
  ev?: number
  isLocked?: boolean
  bookId?: string
  bookName?: string
  recommendedLine?: number
  direction?: BetDirection
  confidenceBucket?: ConfidenceBucket
  decisionClass?: DecisionClass
  propStatType?: string
  seasonPhase?: 'PRESEASON' | 'REGULAR_SEASON' | 'PLAY_IN' | 'PLAYOFFS' | 'FINALS'
}

interface BetSlipStore {
  isOpen: boolean
  items: BetSlipItem[]
  openBetSlip: () => void
  closeBetSlip: () => void
  toggleBetSlip: () => void
  addItem: (item: Omit<BetSlipItem, 'id' | 'stake'>) => void
  removeItem: (id: string) => void
  updateStake: (id: string, stake: number) => void
  clearAll: () => void
  hasItem: (marketId: string, outcome: string) => boolean
  totalOdds: () => number
  totalStake: () => number
  potentialReturn: () => number
}

export const useBetSlipStore = create<BetSlipStore>()(
  persist(
    (set, get) => ({
      isOpen: false,
      items: [],

      openBetSlip: () => set({ isOpen: true }),
      closeBetSlip: () => set({ isOpen: false }),
      toggleBetSlip: () => set((s) => ({ isOpen: !s.isOpen })),

      addItem: (item) => {
        const { items } = get()
        if (get().hasItem(item.marketId, item.outcome)) return
        const newItem: BetSlipItem = { ...item, id: crypto.randomUUID(), stake: 10 }
        set({ items: [...items, newItem], isOpen: true })
      },

      removeItem: (id) => set((s) => ({ items: s.items.filter(i => i.id !== id) })),

      updateStake: (id, stake) =>
        set((s) => ({ items: s.items.map(i => i.id === id ? { ...i, stake } : i) })),

      clearAll: () => set({ items: [] }),

      hasItem: (marketId, outcome) =>
        get().items.some(i => i.marketId === marketId && i.outcome === outcome),

      // Retained for backward-compatible callers that only want an odds product.
      // The tracked-slip drawer itself represents independent singles, not a parlay.
      totalOdds: () => {
        const { items } = get()
        if (items.length === 0) return 0
        return items.reduce((product, item) => product * americanToDecimal(item.odds), 1)
      },

      totalStake: () => get().items.reduce((sum, item) => sum + item.stake, 0),

      potentialReturn: () =>
        get().items.reduce(
          (sum, item) => sum + item.stake * americanToDecimal(item.odds),
          0,
        ),
    }),
    { name: 'betslip-storage', partialize: (state) => ({ items: state.items }) },
  ),
)

function americanToDecimal(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds)
}

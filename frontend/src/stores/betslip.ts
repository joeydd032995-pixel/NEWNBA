import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface BetSlipItem {
  id: string
  eventId: string
  marketId: string
  eventName: string
  outcome: string
  odds: number
  stake: number
  ev?: number
  isLocked?: boolean
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

      totalOdds: () => {
        const { items } = get()
        if (items.length === 0) return 0
        return items.reduce((product, item) => {
          const decimal = item.odds > 0 ? 1 + item.odds / 100 : 1 + 100 / Math.abs(item.odds)
          return product * decimal
        }, 1)
      },

      totalStake: () => get().items.reduce((sum, i) => sum + i.stake, 0),

      potentialReturn: () => {
        const { items } = get()
        if (items.length === 0) return 0
        const totalDecimal = get().totalOdds()
        return get().totalStake() * totalDecimal
      },
    }),
    { name: 'betslip-storage', partialize: (s) => ({ items: s.items }) }
  )
)

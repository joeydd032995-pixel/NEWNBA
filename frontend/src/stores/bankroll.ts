import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type KellyFraction = 0.25 | 0.5 | 0.75 | 1.0

interface BankrollStore {
  bankroll: number
  kellyFraction: KellyFraction
  stopLossPct: number
  sessionStartBankroll: number
  setBankroll: (v: number) => void
  setKellyFraction: (v: KellyFraction) => void
  setStopLoss: (v: number) => void
  startSession: (bankroll: number) => void
  isStopLossHit: () => boolean
  drawdownPct: () => number
}

export const useBankrollStore = create<BankrollStore>()(
  persist(
    (set, get) => ({
      bankroll: 1000,
      kellyFraction: 0.25,
      stopLossPct: 10,
      sessionStartBankroll: 1000,

      setBankroll: (v) => set({ bankroll: v }),
      setKellyFraction: (v) => set({ kellyFraction: v }),
      setStopLoss: (v) => set({ stopLossPct: v }),
      startSession: (bankroll) => set({ bankroll, sessionStartBankroll: bankroll }),

      isStopLossHit: () => {
        const { bankroll, sessionStartBankroll, stopLossPct } = get()
        return (sessionStartBankroll - bankroll) / sessionStartBankroll * 100 >= stopLossPct
      },

      drawdownPct: () => {
        const { bankroll, sessionStartBankroll } = get()
        return Math.max(0, (sessionStartBankroll - bankroll) / sessionStartBankroll * 100)
      },
    }),
    { name: 'bankroll-storage' }
  )
)

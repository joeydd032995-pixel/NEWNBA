const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export type DataQuality = 'LOW' | 'MEDIUM' | 'HIGH';
export type DecisionClass = 'PASS' | 'WAIT' | 'LEAN' | 'BET' | 'STRONG_BET';

export interface ProjectionPercentiles {
  p05: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface PropProjection {
  mean: number;
  median: number;
  stdDev: number;
  percentiles: ProjectionPercentiles;
  uncertainty: {
    minutes: number;
    opportunity: number;
    conversion: number;
    context: number;
    pace: number;
    total: number;
  };
  pointEstimate: number;
  trials: number;
  seed: number;
}

export interface PropFeedRow {
  marketId: string;
  marketType: string;
  statType: string;
  line: number;
  player: {
    id: string;
    name: string;
    position?: string;
    team?: string;
  };
  event: {
    id: string;
    home: string;
    away: string;
    startTime: string;
  };
  projection: PropProjection;
  dataQuality: {
    level: DataQuality;
    reasons: string[];
  };
  availability?: {
    probability: number;
    status?: string;
    source: string;
    sourceTier: string;
    sourceUpdatedAt?: string;
  } | null;
  bestDecision?: {
    decision: DecisionClass;
    newsDecision: 'BET_NOW' | 'WAIT' | 'PASS';
    side: 'OVER' | 'UNDER' | 'YES' | 'NO' | 'PASS';
    odds: number | null;
    marketLine: number;
    estimatedEv: number;
    edgeProbability: number;
    fairLine: number;
    playableToLine: number | null;
    playableToOdds: number | null;
    confidence: 'LOW' | 'MODERATE' | 'HIGH';
    primaryRisk: string;
    contrarianCase: string;
  } | null;
}

export interface PerformanceDashboard {
  summary: {
    totalBets: number;
    won: number;
    lost: number;
    pushed: number;
    roi: number;
    winRate: number;
    clvRate: number;
    avgClv: number;
    avgLineClv: number;
    clvSample: number;
  };
  byConfidence: PerformanceSlice[];
  byPropType: PerformanceSlice[];
  byDirection: PerformanceSlice[];
  bySeasonPhase: PerformanceSlice[];
  bySportsbook: PerformanceSlice[];
}

export interface PerformanceSlice {
  value: string;
  bets: number;
  won: number;
  lost: number;
  pushed: number;
  pnl: number;
  roi: number;
  averageOdds: number;
  clvRate: number;
  averageClv: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const opportunityApi = {
  propFeed(mode: 'FAST' | 'STANDARD' | 'DEEP' = 'STANDARD', limit = 50) {
    return request<PropFeedRow[]>(`/player-props/feed?mode=${mode}&limit=${limit}`);
  },
  performance(days = 90) {
    return request<PerformanceDashboard>(`/analytics/performance/dashboard?days=${days}`);
  },
  rawProjection(payload: unknown) {
    return request<any>('/projection/player-prop', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

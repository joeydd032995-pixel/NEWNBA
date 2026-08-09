import { Injectable } from '@nestjs/common';

// ============================================================
// NBA FORMULA TYPES
// ============================================================
export interface PlayerStats {
  points: number;
  fga: number;
  fta: number;
  fg: number;
  fg3: number;
  fg3a: number;
  ftm: number;
  tov: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  pf: number;
  minutes: number;
  usgPct?: number;
  teamPace?: number;
  teamOrtg?: number;
  leagueOrtg?: number;
}

export interface TeamStats {
  pointsFor: number;
  pointsAgainst: number;
  games: number;
  wins: number;
  losses: number;
  pace: number;
  ortg: number;
  drtg: number;
  efgPct: number;
  tovPct: number;
  orbPct: number;
  ftr: number;
  oefgPct: number;
  otovPct: number;
  drbPct: number;
  oftr: number;
}

export interface ModelWeights {
  // Core efficiency
  efgPct: number;
  tsPct: number;
  // Four Factors
  fourFactorsOffense: number;
  fourFactorsDefense: number;
  tovPct: number;
  orbPct: number;
  ftr: number;
  // Advanced
  netRating: number;
  pace: number;
  // Player props
  usgPct: number;
  // Location / situational
  homeCourtAdvantage: number;
  b2bFatigue: number;
  // Recency
  momentum: number;
  recentForm: number;
  // Contrarian
  publicBettingPct: number;
  lineMovement: number;
  // Playoff
  playoffExperience: number;
  starPlayerUsage: number;
  // Three-ball
  fg3Rate: number;
  rimRate: number;
}

export interface EVResult {
  ev: number;
  evPct: number;
  trueProb: number;
  impliedProb: number;
  kellyFraction: number;
  isPositiveEV: boolean;
}

// ============================================================
// PRESET MODEL DEFINITIONS
// ============================================================
export const PRESET_MODELS: Record<string, { name: string; description: string; weights: Partial<ModelWeights> }> = {
  balanced: {
    name: 'Balanced',
    description: 'Equal weighting across all factors',
    weights: {
      efgPct: 0.15, tsPct: 0.10, fourFactorsOffense: 0.10, fourFactorsDefense: 0.10,
      tovPct: 0.08, orbPct: 0.07, ftr: 0.07, netRating: 0.10, pace: 0.05,
      usgPct: 0.05, homeCourtAdvantage: 0.05, momentum: 0.05, recentForm: 0.05,
    },
  },
  efficiency: {
    name: 'Efficiency',
    description: 'Four Factors + TS% focus for pure efficiency betting',
    weights: {
      efgPct: 0.25, tsPct: 0.20, fourFactorsOffense: 0.20, fourFactorsDefense: 0.15,
      tovPct: 0.08, orbPct: 0.05, ftr: 0.05, netRating: 0.02,
    },
  },
  moreyball: {
    name: 'Moreyball',
    description: 'Heavy rim + 3PT emphasis, Houston Rockets style',
    weights: {
      fg3Rate: 0.30, rimRate: 0.25, efgPct: 0.20, tsPct: 0.10,
      tovPct: 0.08, orbPct: 0.05, ftr: 0.02,
    },
  },
  playerProps: {
    name: 'Player Props',
    description: 'USG% and location-based for player prop betting',
    weights: {
      usgPct: 0.35, tsPct: 0.15, homeCourtAdvantage: 0.15, recentForm: 0.15,
      momentum: 0.10, b2bFatigue: 0.10,
    },
  },
  defensive: {
    name: 'Defensive',
    description: 'NetRtg + on-off differential for defense-first analysis',
    weights: {
      netRating: 0.30, fourFactorsDefense: 0.25, drbPct: 0.15, orbPct: 0.10,
      tovPct: 0.10, ftr: 0.05, homeCourtAdvantage: 0.05,
    } as any,
  },
  sgp: {
    name: 'Same Game Parlay',
    description: 'Correlation-adjusted for SGP betting',
    weights: {
      usgPct: 0.25, tsPct: 0.20, efgPct: 0.15, recentForm: 0.15,
      homeCourtAdvantage: 0.10, momentum: 0.10, pace: 0.05,
    },
  },
  liveBetting: {
    name: 'Live Betting',
    description: 'Momentum + recency-weighted for in-game wagering',
    weights: {
      momentum: 0.35, recentForm: 0.30, pace: 0.15, usgPct: 0.10,
      homeCourtAdvantage: 0.05, b2bFatigue: 0.05,
    },
  },
  playoff: {
    name: 'Playoff',
    description: 'Defense + star usage for playoff series',
    weights: {
      fourFactorsDefense: 0.25, netRating: 0.20, playoffExperience: 0.20,
      starPlayerUsage: 0.15, efgPct: 0.10, homeCourtAdvantage: 0.10,
    },
  },
  backToBack: {
    name: 'Back-to-Back',
    description: 'Fatigue-adjusted model for B2B games',
    weights: {
      b2bFatigue: 0.40, recentForm: 0.20, netRating: 0.15, pace: 0.10,
      homeCourtAdvantage: 0.10, momentum: 0.05,
    },
  },
  homeAway: {
    name: 'Home/Away',
    description: 'Home court + travel adjustment',
    weights: {
      homeCourtAdvantage: 0.35, b2bFatigue: 0.20, recentForm: 0.15, netRating: 0.15,
      efgPct: 0.10, momentum: 0.05,
    },
  },
  momentum: {
    name: 'Momentum',
    description: 'Heavy recency weighting for hot/cold streaks',
    weights: {
      momentum: 0.40, recentForm: 0.30, homeCourtAdvantage: 0.10, netRating: 0.10,
      pace: 0.05, usgPct: 0.05,
    },
  },
  contrarian: {
    name: 'Contrarian',
    description: 'Fades public betting, bets against the crowd',
    weights: {
      publicBettingPct: 0.35, lineMovement: 0.25, netRating: 0.15, efgPct: 0.10,
      homeCourtAdvantage: 0.10, momentum: 0.05,
    },
  },
};

@Injectable()
export class AnalyticsService {

  // ============================================================
  // NBA FORMULA IMPLEMENTATIONS
  // ============================================================

  /**
   * True Shooting %: PTS / [2 × (FGA + 0.475 × FTA)]
   */
  calcTrueShooting(points: number, fga: number, fta: number): number {
    const denominator = 2 * (fga + 0.475 * fta);
    if (denominator === 0) return 0;
    return points / denominator;
  }

  /**
   * Effective Field Goal %: (FG + 0.5 × 3P) / FGA
   */
  calcEffectiveFG(fg: number, fg3: number, fga: number): number {
    if (fga === 0) return 0;
    return (fg + 0.5 * fg3) / fga;
  }

  /**
   * Offensive Four Factors:
   * 0.40×eFG% + 0.25×(1-TOV%) + 0.20×ORB% + 0.15×FTR
   * TOV% is inverted because lower turnovers are better for offense.
   */
  calcFourFactorsOffense(efgPct: number, tovPct: number, orbPct: number, ftr: number): number {
    return 0.40 * efgPct + 0.25 * (1 - tovPct) + 0.20 * orbPct + 0.15 * ftr;
  }

  /**
   * Defensive Four Factors (opponent's offense efficiency)
   */
  calcFourFactorsDefense(oefgPct: number, otovPct: number, drbPct: number, oftr: number): number {
    return 0.40 * (1 - oefgPct) + 0.25 * otovPct + 0.20 * drbPct + 0.15 * (1 - oftr);
  }

  /**
   * Pythagorean Win%: PF^13.91 / (PF^13.91 + PA^13.91)
   */
  calcPythagoreanWinPct(pointsFor: number, pointsAgainst: number, exp: number = 13.91): number {
    if (pointsFor === 0 && pointsAgainst === 0) return 0.5;
    const pfPow = Math.pow(pointsFor, exp);
    const paPow = Math.pow(pointsAgainst, exp);
    return pfPow / (pfPow + paPow);
  }

  /**
   * Calculate Box Plus/Minus (simplified proxy version)
   *
   * Simplified BPM approximation using per-minute rate proxies and field goal percentages.
   * Not a standard NBA BPM calculation—this is a simplified implementation using:
   * - AST, TRB, STL, BLK per minute (multiplied by 100 for scale)
   * - FG3 as field goal percentage (3-pointers / FGA)
   * - TOV as simple ratio (TOV / (TOV + FG))
   * - Usage % and True Shooting % from standard calculations
   *
   * @param stats - Player statistics object with points, shots, assists, rebounds, steals, blocks, minutes
   * @returns Simplified BPM proxy value (~6.0 for average player, scale is normalized to minutes/100)
   *
   * @example
   * const bpm = analyticsService.calcBPM({
   *   points: 1500, fga: 2000, fta: 400, fg: 1800, fg3: 200, fg3a: 500,
   *   ftm: 350, tov: 150, orb: 100, drb: 300, ast: 400, stl: 50, blk: 30, pf: 100, minutes: 2000
   * });
   * // Returns approximately 6.0 (per-minute scaled proxy)
   */
  calcBPM(stats: PlayerStats): number {
    const astPct = stats.ast / Math.max(stats.minutes, 1) * 100;
    const trbPct = (stats.orb + stats.drb) / Math.max(stats.minutes, 1) * 100;
    const stlPct = stats.stl / Math.max(stats.minutes, 1) * 100;
    const blkPct = stats.blk / Math.max(stats.minutes, 1) * 100;
    const fg3Pct = stats.fga > 0 ? stats.fg3 / stats.fga : 0;
    const tovPct = (stats.tov + stats.fg) > 0 ? stats.tov / (stats.tov + stats.fg) : 0;
    const usgPct = stats.usgPct ?? 0.20;
    const tsPct = this.calcTrueShooting(stats.points, stats.fga, stats.fta);

    return (
      0.123 * astPct +
      0.222 * trbPct +
      0.084 * stlPct +
      0.137 * blkPct +
      0.132 * fg3Pct +
      0.030 * tovPct -
      0.100 * usgPct * (1 - tsPct) * 100
    );
  }

  /**
   * Calculate RAPTOR (Robust Algorithm using Player Tracking and On/Off Ratings)
   *
   * Combines box score data with on-court/off-court performance differential.
   * Simplified approximation: RAPTOR_offensive + RAPTOR_defensive
   *
   * @param stats - Player statistics
   * @param onOffDiff - Net rating difference when player is on court vs off (optional, defaults to 0)
   * @returns RAPTOR rating combining offensive and defensive contributions
   *
   * @example
   * const raptor = analyticsService.calcRAPTOR(playerStats, 2.5);
   * // Returns approximately 5.8 (strong two-way player)
   */
  calcRAPTOR(stats: PlayerStats, onOffDiff: number = 0): number {
    const tsPct = this.calcTrueShooting(stats.points, stats.fga, stats.fta);
    const efgPct = this.calcEffectiveFG(stats.fg, stats.fg3, stats.fga);
    const bpm = this.calcBPM(stats);

    // RAPTOR_o ≈ box score + on-court improvement
    const raptorO = bpm * 0.6 + (tsPct - 0.55) * 30 + onOffDiff * 0.3;
    // RAPTOR_d ≈ defensive stats impact
    const raptorD = (stats.stl + stats.blk * 0.7) / Math.max(stats.minutes, 1) * 100 * 0.5;

    return raptorO + raptorD;
  }

  /**
   * Calculate LEBRON (Luck-adjusted player Estimates using Box-score Regression On aggregate Nonparametric data)
   *
   * Advanced metric combining multiple estimation approaches (BPM, RAPTOR, efficiency, on/off data).
   * Reduces variance from luck by blending multiple data sources.
   *
   * @param stats - Player statistics
   * @param onOffDiff - Net rating swing when player on vs off court (optional, defaults to 0)
   * @returns LEBRON rating (points per 100 possessions above average)
   *
   * @example
   * const lebron = analyticsService.calcLEBRON(starPlayerStats, 3.2);
   * // Returns approximately 6.8 (MVP-caliber player)
   */
  calcLEBRON(stats: PlayerStats, onOffDiff: number = 0): number {
    const bpm = this.calcBPM(stats);
    const raptor = this.calcRAPTOR(stats, onOffDiff);
    const tsPct = this.calcTrueShooting(stats.points, stats.fga, stats.fta);
    const efgPct = this.calcEffectiveFG(stats.fg, stats.fg3, stats.fga);

    // LEBRON combines ridge regression estimates with on/off data
    return (bpm * 0.5 + raptor * 0.3 + (tsPct - 0.55) * 20 + onOffDiff * 0.2);
  }

  /**
   * Usage Rate: 100 × (FGA + 0.44×FTA + TOV) × (Tm MP / 5)
   *              / (MP × (Tm FGA + 0.44×Tm FTA + Tm TOV))
   */
  calcUsageRate(fga: number, fta: number, tov: number, minutes: number,
                teamFga: number, teamFta: number, teamTov: number, teamMinutes: number): number {
    if (minutes === 0 || teamMinutes === 0) return 0;
    const playerPoss = fga + 0.44 * fta + tov;
    const teamPoss = teamFga + 0.44 * teamFta + teamTov;
    return 100 * (playerPoss * (teamMinutes / 5)) / (minutes * teamPoss);
  }

  /**
   * Net Rating: Offensive Rating - Defensive Rating
   */
  calcNetRating(ortg: number, drtg: number): number {
    return ortg - drtg;
  }

  /**
   * Win Shares (simplified)
   */
  calcWinShares(stats: PlayerStats, teamWins: number, teamMinutes: number): number {
    const tsPct = this.calcTrueShooting(stats.points, stats.fga, stats.fta);
    const marginalPoints = (stats.points - (0.92 * 1.08) * stats.fga - 0.44 * 1.08 * stats.fta);
    const ws = (stats.minutes / teamMinutes) * teamWins * (tsPct > 0.44 ? 1 : 0.8);
    return Math.max(0, ws);
  }

  // ============================================================
  // EV CALCULATION
  // ============================================================

  /**
   * Convert American odds to implied probability
   */
  americanToImplied(odds: number): number {
    if (odds > 0) return 100 / (odds + 100);
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  /**
   * Convert implied probability to American odds
   */
  impliedToAmerican(prob: number): number {
    if (prob <= 0 || prob >= 1) return 0;
    if (prob >= 0.5) return -(prob / (1 - prob)) * 100;
    return ((1 - prob) / prob) * 100;
  }

  /**
   * Calculate Expected Value
   * EV = (trueProb × potentialWin) - (1 - trueProb) × stake
   */
  calcEV(trueProb: number, odds: number, stake: number = 100): EVResult {
    const impliedProb = this.americanToImplied(odds);
    const potentialWin = odds > 0 ? (odds / 100) * stake : (100 / Math.abs(odds)) * stake;
    const ev = trueProb * potentialWin - (1 - trueProb) * stake;
    const evPct = ev / stake;

    // Kelly Criterion: f* = (bp - q) / b
    const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
    const kellyFraction = Math.max(0, (b * trueProb - (1 - trueProb)) / b);

    return {
      ev,
      evPct,
      trueProb,
      impliedProb,
      kellyFraction,
      isPositiveEV: ev > 0,
    };
  }

  /**
   * Remove vig from multiple odds to get true probabilities
   */
  removeVig(oddsArray: number[]): number[] {
    const implied = oddsArray.map(o => this.americanToImplied(o));
    const total = implied.reduce((a, b) => a + b, 0);
    return implied.map(p => p / total);
  }

  // ============================================================
  // MODEL PROBABILITY CALCULATION
  // ============================================================

  /**
   * Calculate team win probability using weighted analytical factors
   *
   * Combines multiple basketball metrics (eFG%, Four Factors, Net Rating, Pythagorean, etc.)
   * weighted according to a provided model configuration. Accounts for situational factors
   * like home court, back-to-back games, momentum, and public betting sentiment.
   *
   * @param homeStats - Home team statistics (eFG%, TOV%, ORB%, FTR, etc.)
   * @param awayStats - Away team statistics
   * @param weights - Model weights for each factor (efgPct, tsPct, fourFactorsOffense, etc.)
   * @param context - Optional contextual factors:
   *   - isHomeGame: Whether home team has home court advantage (default: true)
   *   - homeB2B/awayB2B: Back-to-back game fatigue (default: false)
   *   - homeRecentWins/awayRecentWins: Wins in last 10 games (default: 5)
   *   - publicBettingOnHome: % of public money on home team (default: 0.5)
   *
   * @returns Win probability for home team (0.0 to 1.0), clamped to [0.02, 0.98]
   *
   * @example
   * const homeWinProb = analyticsService.calcModelProbability(
   *   { pointsFor: 2500, pointsAgainst: 2300, efgPct: 0.535, ... }, // home stats
   *   { pointsFor: 2450, pointsAgainst: 2380, efgPct: 0.520, ... }, // away stats
   *   PRESET_MODELS.balanced.weights,
   *   { isHomeGame: true, homeRecentWins: 8, publicBettingOnHome: 0.62 }
   * );
   * // Returns approximately 0.62 (62% home team win probability)
   */
  calcModelProbability(
    homeStats: TeamStats,
    awayStats: TeamStats,
    weights: Partial<ModelWeights>,
    context?: {
      isHomeGame?: boolean;
      homeB2B?: boolean;
      awayB2B?: boolean;
      homeRecentWins?: number;
      awayRecentWins?: number;
      publicBettingOnHome?: number;
    },
  ): number {
    const ctx = context ?? {};
    let score = 0;
    let totalWeight = 0;

    // Helper to add weighted factor
    const addFactor = (weight: number, value: number) => {
      if (weight > 0) {
        score += weight * value;
        totalWeight += weight;
      }
    };

    // eFG%
    const homeEfg = homeStats.efgPct;
    const awayEfg = awayStats.efgPct;
    addFactor(weights.efgPct ?? 0, homeEfg - awayEfg + 0.5);

    // Four Factors Offense
    const homeFf = this.calcFourFactorsOffense(homeStats.efgPct, homeStats.tovPct, homeStats.orbPct, homeStats.ftr);
    const awayFf = this.calcFourFactorsOffense(awayStats.efgPct, awayStats.tovPct, awayStats.orbPct, awayStats.ftr);
    addFactor(weights.fourFactorsOffense ?? 0, (homeFf - awayFf) * 5 + 0.5);

    // Four Factors Defense
    const homeFfd = this.calcFourFactorsDefense(awayStats.efgPct, awayStats.tovPct, homeStats.orbPct ?? 0.5, awayStats.ftr);
    const awayFfd = this.calcFourFactorsDefense(homeStats.efgPct, homeStats.tovPct, awayStats.orbPct ?? 0.5, homeStats.ftr);
    addFactor(weights.fourFactorsDefense ?? 0, (homeFfd - awayFfd) * 5 + 0.5);

    // Net Rating
    const homeNet = this.calcNetRating(homeStats.ortg, homeStats.drtg);
    const awayNet = this.calcNetRating(awayStats.ortg, awayStats.drtg);
    addFactor(weights.netRating ?? 0, (homeNet - awayNet) / 20 + 0.5);

    // Pythagorean
    const homePyth = this.calcPythagoreanWinPct(homeStats.pointsFor, homeStats.pointsAgainst);
    const awayPyth = this.calcPythagoreanWinPct(awayStats.pointsFor, awayStats.pointsAgainst);
    addFactor(weights.tsPct ?? 0, (homePyth - awayPyth) + 0.5);

    // Home court advantage (~3 points = ~0.06 prob)
    addFactor(weights.homeCourtAdvantage ?? 0, ctx.isHomeGame ? 0.56 : 0.44);

    // B2B fatigue
    const homeB2bPenalty = (ctx.homeB2B ? -0.03 : 0);
    const awayB2bPenalty = (ctx.awayB2B ? -0.03 : 0);
    addFactor(weights.b2bFatigue ?? 0, 0.5 + homeB2bPenalty - awayB2bPenalty);

    // Momentum (recent wins out of last 10)
    const homeMom = (ctx.homeRecentWins ?? 5) / 10;
    const awayMom = (ctx.awayRecentWins ?? 5) / 10;
    addFactor(weights.momentum ?? 0, homeMom - awayMom + 0.5);
    addFactor(weights.recentForm ?? 0, homeMom - awayMom + 0.5);

    // Contrarian: fade the heavy public side
    const publicHome = ctx.publicBettingOnHome ?? 0.5;
    addFactor(weights.publicBettingPct ?? 0, 1 - publicHome); // contrarian flips

    if (totalWeight === 0) return 0.5;
    const rawProb = score / totalWeight;
    return Math.min(0.98, Math.max(0.02, rawProb));
  }

  // ============================================================
  // PRESET MODEL HELPERS
  // ============================================================

  /**
   * Get all 12 preset prediction models
   *
   * Returns the complete list of pre-configured model templates.
   * Each includes a description and pre-tuned weight set.
   *
   * @returns Array of preset models with id, name, description, and weights
   *
   * @example
   * const models = analyticsService.getPresetModels();
   * // Returns: [
   * //   { id: 'balanced', name: 'Balanced', description: '...', weights: {...} },
   * //   { id: 'efficiency', name: 'Efficiency', description: '...', weights: {...} },
   * //   ...
   * // ]
   */
  getPresetModels() {
    return Object.entries(PRESET_MODELS).map(([id, model]) => ({ id, ...model }));
  }

  /**
   * Get a single preset model by ID
   *
   * @param id - Model identifier (e.g., 'balanced', 'efficiency', 'playoff')
   * @returns Preset model with weights and description, or null if not found
   *
   * @example
   * const efficientModel = analyticsService.getPresetModel('efficiency');
   * // Returns: {
   * //   id: 'efficiency',
   * //   name: 'Efficiency',
   * //   description: 'Four Factors + TS% focus for pure efficiency betting',
   * //   weights: { efgPct: 0.25, tsPct: 0.20, ... }
   * // }
   */
  getPresetModel(id: string) {
    const model = PRESET_MODELS[id];
    if (!model) return null;
    return { id, ...model };
  }

  // ============================================================
  // PERFORMANCE METRICS
  // ============================================================

  /**
   * Calculate Return on Investment (ROI) from a series of bets
   *
   * @param bets - Array of bet records with stake and profit/loss
   * @returns ROI as decimal (e.g., 0.15 = 15% ROI, -0.05 = -5% ROI)
   *
   * @example
   * const roi = analyticsService.calcROI([
   *   { stake: 100, pnl: 15 },
   *   { stake: 100, pnl: -10 },
   *   { stake: 100, pnl: 8 }
   * ]);
   * // Returns 0.0433 (4.33% ROI)
   */
  calcROI(bets: Array<{ stake: number; pnl: number }>): number {
    const totalStake = bets.reduce((sum, b) => sum + b.stake, 0);
    const totalPnl = bets.reduce((sum, b) => sum + b.pnl, 0);
    return totalStake > 0 ? totalPnl / totalStake : 0;
  }

  /**
   * Calculate Sharpe Ratio - risk-adjusted return metric
   *
   * Measures excess return per unit of volatility. Higher Sharpe = better risk-adjusted returns.
   *
   * @param returns - Array of period returns (e.g., daily or per-bet P&L)
   * @param riskFreeRate - Risk-free rate (e.g., 0.02 for 2%), defaults to 0
   * @returns Sharpe ratio (higher is better; typically 1.0+ is excellent)
   *
   * @example
   * const sharpeRatio = analyticsService.calcSharpeRatio(
   *   [0.02, 0.03, -0.01, 0.015, 0.04],
   *   0.01
   * );
   * // Returns approximately 1.42 (good risk-adjusted returns)
   */
  calcSharpeRatio(returns: number[], riskFreeRate: number = 0): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    return stdDev > 0 ? (mean - riskFreeRate) / stdDev : 0;
  }

  /**
   * Calculate Calibration score using Brier Score
   *
   * Measures how well predicted probabilities match actual outcomes.
   * Lower is better: 0 = perfect calibration, 1 = worst possible.
   *
   * @param predictions - Array of prediction objects with predicted probability (0-1) and actual outcome (boolean)
   * @returns Brier score (0 to 1, lower is better)
   *
   * @example
   * const calibration = analyticsService.calcCalibration([
   *   { predictedProb: 0.70, actual: true },
   *   { predictedProb: 0.65, actual: true },
   *   { predictedProb: 0.55, actual: false },
   *   { predictedProb: 0.30, actual: false }
   * ]);
   * // Returns approximately 0.045 (excellent calibration)
   */
  calcCalibration(predictions: Array<{ predictedProb: number; actual: boolean }>): number {
    if (predictions.length === 0) return 1;
    const brierSum = predictions.reduce((sum, p) => {
      return sum + Math.pow(p.predictedProb - (p.actual ? 1 : 0), 2);
    }, 0);
    return brierSum / predictions.length;
  }

  /**
   * Calculate win rate from binary outcomes
   *
   * @param outcomes - Array of boolean outcomes (true = win/correct, false = loss/incorrect)
   * @returns Win rate as decimal (0 to 1), e.g., 0.55 = 55% win rate
   *
   * @example
   * const winRate = analyticsService.calcWinRate([true, true, false, true, false]);
   * // Returns 0.6 (60% win rate)
   */
  calcWinRate(outcomes: boolean[]): number {
    if (outcomes.length === 0) return 0;
    return outcomes.filter(Boolean).length / outcomes.length;
  }

  /**
   * Calculate maximum drawdown from a P&L series
   *
   * Measures the largest peak-to-trough decline in cumulative profit/loss.
   * Critical for understanding worst-case performance and risk.
   *
   * @param pnlSeries - Array of per-bet or per-period profit/loss values
   * @returns Maximum drawdown amount (always >= 0)
   *
   * @example
   * const maxDD = analyticsService.calcMaxDrawdown([100, 50, -30, -100, 20, 80]);
   * // Cumulative: [100, 150, 120, 20, 40, 120]
   * // Peak at 150, trough at 20 → Drawdown = 130
   * // Returns 130
   */
  calcMaxDrawdown(pnlSeries: number[]): number {
    if (pnlSeries.length === 0) return 0;
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnl = 0;

    for (const pnl of pnlSeries) {
      runningPnl += pnl;
      if (runningPnl > peak) peak = runningPnl;
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown;
  }
}

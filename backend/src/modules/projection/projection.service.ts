import { Injectable } from '@nestjs/common';
import {
  DecisionInput,
  MarketPriceInput,
  OpportunityProjectionInput,
} from './projection.types';
import {
  alternateLineCurve,
  projectDistribution,
} from './opportunity-projection.engine';
import { evaluateDecision } from './decision.engine';

@Injectable()
export class ProjectionService {
  analyzePlayerProp(params: {
    projection: OpportunityProjectionInput;
    market?: MarketPriceInput;
    alternateLines?: number[];
    includeSamples?: boolean;
    materiallyMoved?: boolean;
  }) {
    const distribution = projectDistribution(params.projection);
    const alternateLines = params.alternateLines ?? [];
    const curve = alternateLines.length
      ? alternateLineCurve(distribution, alternateLines)
      : [];

    const decision = params.market
      ? evaluateDecision({
          distribution,
          market: params.market,
          dataQuality: params.projection.dataQuality,
          unresolvedAvailability: params.projection.unresolvedAvailability,
          unresolvedLineup: params.projection.unresolvedLineup,
          unresolvedMinutesRestriction: params.projection.unresolvedMinutesRestriction,
          materiallyMoved: params.materiallyMoved,
        } satisfies DecisionInput)
      : null;

    const researchComplete = Boolean(
      params.market &&
        !params.projection.unresolvedAvailability &&
        !params.projection.unresolvedLineup &&
        !params.projection.unresolvedMinutesRestriction &&
        params.projection.dataQuality !== 'LOW',
    );

    return {
      mode: params.projection.analysisMode,
      stat: params.projection.stat,
      distribution: params.includeSamples
        ? distribution
        : { ...distribution, samples: undefined },
      alternateLineCurve: curve,
      decision,
      researchStoppingRule: {
        complete: researchComplete,
        reason: researchComplete
          ? 'Market, availability, rotation/minutes and projection inputs are sufficiently resolved.'
          : 'Additional research may materially change the estimated probability.',
      },
      provenance: {
        projectionSource: 'OPPORTUNITY_FIRST',
        equation: 'Expected Minutes × Opportunity Rate × Conversion Rate × Context Adjustment',
        deterministic: true,
        seed: params.projection.seed,
      },
    };
  }
}

import { calculateGameEnvironment, haversineKm } from './environment.engine';
import { calculateRefereeImpact } from './referee.engine';

describe('game environment', () => {
  it('detects back-to-back and rest advantage deterministically', () => {
    const gameStart = new Date('2026-11-10T01:00:00.000Z');
    const result = calculateGameEnvironment(
      {
        gameStart,
        venue: { latitude: 39.7392, longitude: -104.9903, utcOffsetMinutes: -420, altitudeMeters: 1609 },
        priorVenue: { latitude: 34.0522, longitude: -118.2437, utcOffsetMinutes: -480 },
        priorGames: [{ startTime: new Date('2026-11-09T03:00:00.000Z'), overtimeMinutes: 5, teamMinutesLoad: 265 }],
      },
      {
        gameStart,
        venue: { latitude: 39.7392, longitude: -104.9903, utcOffsetMinutes: -420, altitudeMeters: 1609 },
        priorVenue: { latitude: 39.7392, longitude: -104.9903, utcOffsetMinutes: -420 },
        priorGames: [{ startTime: new Date('2026-11-07T02:00:00.000Z'), teamMinutesLoad: 240 }],
      },
    );
    expect(result.home.backToBack).toBe(true);
    expect(result.home.previousGameOtMinutes).toBe(5);
    expect(result.home.travelDistanceKm).toBeGreaterThan(1000);
    expect(result.restAdvantageHours).toBeLessThan(0);
  });

  it('computes zero distance for the same coordinates', () => {
    expect(haversineKm(
      { latitude: 40, longitude: -75, utcOffsetMinutes: -300 },
      { latitude: 40, longitude: -75, utcOffsetMinutes: -300 },
    )).toBeCloseTo(0, 10);
  });
});

describe('referee impact', () => {
  it('shrinks observed tendencies by sample reliability', () => {
    const result = calculateRefereeImpact(
      [
        { minutes: 48, fouls: 45, freeThrowAttempts: 55, possessions: 102 },
        { minutes: 48, fouls: 43, freeThrowAttempts: 53, possessions: 101 },
      ],
      { foulsPer48: 40, freeThrowsPer48: 48, possessionsPer48: 100 },
    );
    expect(result.freeThrowRateImpact).toBeGreaterThan(0);
    expect(result.sampleReliability).toBeLessThan(0.3);
  });
});

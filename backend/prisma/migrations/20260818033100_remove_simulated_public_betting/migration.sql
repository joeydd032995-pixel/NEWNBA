-- Synthetic public betting percentages must never be available as market evidence.
DELETE FROM "public_betting_splits" WHERE "source" = 'simulated';

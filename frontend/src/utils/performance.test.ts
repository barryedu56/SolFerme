import { calculatePerformance } from './performance';

/**
 * Test Lot:
 * - 1000 initial chickens
 * - 900 current chickens (100 dead)
 * - 0 sick chickens (for now)
 * - 800 eggs produced in 1 day
 *
 * Expected Production: 900 * 0.85 = 765
 * Production Perf: 800 / 765 = 1.045... (capped at 1.1)
 * Survival Rate: 900 / 1000 = 0.9
 * Health Factor: 1.0
 * Performance: 1.045... * 0.9 * 1.0 * 100 = 94.1... -> Round to 94
 */

const testPerformance = () => {
  const initial = 1000;
  const current = 900;
  const sick = 0;
  const actualProduction = 800;
  const days = 1;

  const result = calculatePerformance(initial, current, sick, actualProduction, days);

  console.log('--- Performance Calculation Test ---');
  console.log(`Initial: ${initial}`);
  console.log(`Current: ${current}`);
  console.log(`Sick: ${sick}`);
  console.log(`Actual Production: ${actualProduction}`);
  console.log(`Days: ${days}`);
  console.log(`Result: ${result}%`);

  const expected = 94;
  if (result === expected) {
    console.log('TEST PASSED');
  } else {
    console.log(`TEST FAILED: Expected ${expected}, got ${result}`);
  }
};

// Run the test
testPerformance();

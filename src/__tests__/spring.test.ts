import { describe, expect, it } from 'vitest';
import {
  atRest,
  defaultSpringSettings,
  stepSpring,
  SpringState,
  STEP,
} from '../spring';

function settle(
  start: number,
  target: number,
  settings = defaultSpringSettings,
  maxSteps = 10000,
): { state: SpringState; steps: number } {
  let state: SpringState = { value: start, velocity: 0 };
  for (let i = 0; i < maxSteps; i++) {
    state = stepSpring(state, target, settings);
    if (atRest(state, target)) return { state, steps: i + 1 };
  }
  return { state, steps: maxSteps };
}

describe('stepSpring', () => {
  it('converges exactly onto the target and stops', () => {
    const { state, steps } = settle(0, 100);
    expect(state.value).toBe(100);
    expect(state.velocity).toBe(0);
    expect(steps).toBeLessThan(10000);
  });

  it('converges from above the target too', () => {
    const { state } = settle(250, -40);
    expect(state.value).toBe(-40);
    expect(state.velocity).toBe(0);
  });

  it('stays at rest once on target', () => {
    const state: SpringState = { value: 50, velocity: 0 };
    const next = stepSpring(state, 50, defaultSpringSettings);
    expect(next).toEqual({ value: 50, velocity: 0 });
    expect(atRest(next, 50)).toBe(true);
  });

  it('moves toward the target on the first step', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    const next = stepSpring(state, 100, defaultSpringSettings);
    expect(next.value).toBeGreaterThan(0);
    expect(next.velocity).toBeGreaterThan(0);
  });

  it('higher stiffness settles in fewer steps', () => {
    const soft = settle(0, 100, { stiffness: 60, damping: 26, precision: 0.01 });
    const stiff = settle(0, 100, { stiffness: 300, damping: 35, precision: 0.01 });
    expect(stiff.steps).toBeLessThan(soft.steps);
  });

  it('respects v1-style custom springSettings (stiffness 50, damping 30)', () => {
    const { state } = settle(0, 80, { stiffness: 50, damping: 30, precision: 0.01 });
    expect(state.value).toBe(80);
  });

  it('uses a 60 steps per second fixed timestep', () => {
    expect(STEP).toBeCloseTo(1 / 60);
  });
});

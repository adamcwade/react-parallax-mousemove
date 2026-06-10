/**
 * Minimal damped spring integrator, API-compatible with the stiffness and
 * damping numbers this library accepted in v1 (which came from react-motion).
 *
 * Integration is semi-implicit Euler at a fixed timestep, the same approach
 * react-motion used, so existing springSettings feel identical.
 */

export interface SpringSettings {
  /** Spring stiffness. Higher snaps faster. Default 170. */
  stiffness?: number;
  /** Damping. Higher settles with less oscillation. Default 26. */
  damping?: number;
  /** Values and velocities below this are treated as at rest. Default 0.01. */
  precision?: number;
}

export const defaultSpringSettings: Required<SpringSettings> = {
  stiffness: 170,
  damping: 26,
  precision: 0.01,
};

/** Fixed physics timestep in seconds. 60 steps per simulated second. */
export const STEP = 1 / 60;

export interface SpringState {
  value: number;
  velocity: number;
}

/** Advance one fixed timestep toward target. Returns a new state. */
export function stepSpring(
  state: SpringState,
  target: number,
  settings: Required<SpringSettings>,
): SpringState {
  const { stiffness, damping, precision } = settings;

  const springForce = -stiffness * (state.value - target);
  const dampingForce = -damping * state.velocity;
  const acceleration = springForce + dampingForce;

  const velocity = state.velocity + acceleration * STEP;
  const value = state.value + velocity * STEP;

  if (Math.abs(velocity) < precision && Math.abs(value - target) < precision) {
    return { value: target, velocity: 0 };
  }
  return { value, velocity };
}

/** True when the spring has settled exactly on its target. */
export function atRest(state: SpringState, target: number): boolean {
  return state.value === target && state.velocity === 0;
}

import React, {
  CSSProperties,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  SpringSettings,
  SpringState,
  atRest,
  defaultSpringSettings,
  stepSpring,
  STEP,
} from './spring';

export interface ParallaxMousemoveProps {
  children?: ReactNode;
  /** Style for the wrapping container div. Never mutated. */
  containerStyle?: CSSProperties;
  /** Keep the container at window height, updating on resize. */
  fullHeight?: boolean;
}

export interface LayerConfig {
  /** Horizontal movement per pixel of cursor distance from center. */
  xFactor?: number;
  /** Vertical movement per pixel of cursor distance from center. */
  yFactor?: number;
  springSettings?: SpringSettings;
}

export interface LayerProps {
  children?: ReactNode;
  config?: LayerConfig;
  /** Style for the layer div, merged over the animated transform. */
  layerStyle?: CSSProperties;
  /** Disable movement. Also honored automatically for prefers-reduced-motion. */
  disabled?: boolean;
}

function Layer({ children, config, layerStyle, disabled = false }: LayerProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  // Animation state lives in refs: the spring writes transforms straight to
  // the DOM node inside requestAnimationFrame, so moving the mouse never
  // re-renders React. This is the fix for issue #4 (setTimeout throttling).
  const targetRef = useRef({ x: 0, y: 0 });
  const springRef = useRef<{ x: SpringState; y: SpringState }>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
  });
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);

  const { xFactor = 0, yFactor = 0, springSettings } = config ?? {};
  const settings = { ...defaultSpringSettings, ...springSettings };

  // Re-read latest factors inside stable listeners without re-subscribing.
  const factorsRef = useRef({ xFactor, yFactor, settings });
  factorsRef.current = { xFactor, yFactor, settings };

  useEffect(() => {
    if (disabled) return undefined;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined;
    }

    const apply = () => {
      const node = nodeRef.current;
      if (!node) return;
      const { x, y } = springRef.current;
      node.style.transform = `translate3d(${x.value}px, ${y.value}px, 0)`;
    };

    const tick = (now: number) => {
      rafRef.current = null;
      const last = lastTimeRef.current ?? now;
      lastTimeRef.current = now;

      // Fixed-timestep stepping keeps spring feel independent of frame rate.
      // Clamp long gaps (background tab) so we never spiral through thousands
      // of catch-up steps.
      accumulatorRef.current = Math.min(
        accumulatorRef.current + (now - last) / 1000,
        0.25,
      );

      const { settings: s } = factorsRef.current;
      const target = targetRef.current;
      let { x, y } = springRef.current;
      while (accumulatorRef.current >= STEP) {
        accumulatorRef.current -= STEP;
        x = stepSpring(x, target.x, s);
        y = stepSpring(y, target.y, s);
      }
      springRef.current = { x, y };
      apply();

      if (!atRest(x, target.x) || !atRest(y, target.y)) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        lastTimeRef.current = null;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const { xFactor: xf, yFactor: yf } = factorsRef.current;
      targetRef.current = {
        x: xf * (window.innerWidth / 2 - e.clientX),
        y: yf * (window.innerHeight / 2 - e.clientY),
      };
      if (rafRef.current === null) {
        lastTimeRef.current = null;
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [disabled]);

  return (
    <div
      ref={nodeRef}
      style={{ transform: 'translate3d(0px, 0px, 0)', ...layerStyle }}
    >
      {children}
    </div>
  );
}

function ParallaxMousemoveRoot({
  children,
  containerStyle,
  fullHeight = false,
}: ParallaxMousemoveProps) {
  // Height lives in state instead of being written onto props.containerStyle.
  // Mutating props crashed on resize when the style object was frozen; this
  // is the fix for issue #5.
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!fullHeight) {
      setHeight(undefined);
      return undefined;
    }
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [fullHeight]);

  const style: CSSProperties =
    fullHeight && height !== undefined
      ? { ...containerStyle, height }
      : { ...containerStyle };

  return <div style={style}>{children}</div>;
}

type ParallaxMousemoveComponent = typeof ParallaxMousemoveRoot & {
  Layer: typeof Layer;
};

/**
 * Container for mousemove parallax scenes. Render one or more
 * ParallaxMousemove.Layer children, each with its own movement factors.
 */
const ParallaxMousemove: ParallaxMousemoveComponent = Object.assign(
  ParallaxMousemoveRoot,
  { Layer },
);

export { Layer as ParallaxLayer };
export type { SpringSettings };
export default ParallaxMousemove;

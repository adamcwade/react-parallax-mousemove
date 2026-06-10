import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParallaxMousemove from '../index';

// Drive requestAnimationFrame by hand so tests control every frame.
let rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];
let rafId = 0;
let now = 0;

function flushFrames(count: number, msPerFrame = 17) {
  for (let i = 0; i < count; i++) {
    now += msPerFrame;
    const queue = rafQueue;
    rafQueue = [];
    queue.forEach(({ cb }) => cb(now));
  }
}

beforeEach(() => {
  rafQueue = [];
  rafId = 0;
  now = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafId += 1;
    rafQueue.push({ id: rafId, cb });
    return rafId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    rafQueue = rafQueue.filter((entry) => entry.id !== id);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mouseMove(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }));
  });
}

describe('ParallaxMousemove container', () => {
  it('renders children immediately (no placeholder)', () => {
    const { getByText } = render(
      <ParallaxMousemove>
        <span>scene</span>
      </ParallaxMousemove>,
    );
    expect(getByText('scene')).toBeTruthy();
  });

  it('applies containerStyle without mutating the prop object', () => {
    const containerStyle = Object.freeze({ background: 'rgb(1, 2, 3)' });
    const { container } = render(
      <ParallaxMousemove containerStyle={containerStyle} fullHeight>
        <span>scene</span>
      </ParallaxMousemove>,
    );
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.style.background).toBe('rgb(1, 2, 3)');
    // Regression test for issue #5: v1 wrote window.innerHeight onto the
    // passed style object, which threw for frozen objects.
    expect(
      Object.prototype.hasOwnProperty.call(containerStyle, 'height'),
    ).toBe(false);
  });

  it('fullHeight tracks window.innerHeight across resize without crashing', () => {
    const { container } = render(
      <ParallaxMousemove fullHeight containerStyle={Object.freeze({})}>
        <span>scene</span>
      </ParallaxMousemove>,
    );
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.style.height).toBe(`${window.innerHeight}px`);

    act(() => {
      Object.defineProperty(window, 'innerHeight', {
        value: 555,
        configurable: true,
      });
      window.dispatchEvent(new Event('resize'));
    });
    expect(div.style.height).toBe('555px');
  });

  it('omits height entirely when fullHeight is off', () => {
    const { container } = render(
      <ParallaxMousemove containerStyle={{ width: '10px' }}>
        <span>scene</span>
      </ParallaxMousemove>,
    );
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.style.height).toBe('');
    expect(div.style.width).toBe('10px');
  });
});

describe('ParallaxMousemove.Layer', () => {
  const config = {
    xFactor: 0.5,
    yFactor: 0.25,
    springSettings: { stiffness: 170, damping: 26 },
  };

  function layerDiv(container: HTMLElement): HTMLDivElement {
    return container.firstElementChild as HTMLDivElement;
  }

  it('renders children and merges layerStyle', () => {
    const { container, getByText } = render(
      <ParallaxMousemove.Layer
        config={config}
        layerStyle={{ position: 'absolute' }}
      >
        <span>bg</span>
      </ParallaxMousemove.Layer>,
    );
    expect(getByText('bg')).toBeTruthy();
    expect(layerDiv(container).style.position).toBe('absolute');
  });

  it('starts with an identity transform', () => {
    const { container } = render(
      <ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>,
    );
    expect(layerDiv(container).style.transform).toBe(
      'translate3d(0px, 0px, 0)',
    );
  });

  it('animates toward the factor-scaled offset from center on mousemove', () => {
    const { container } = render(
      <ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>,
    );
    const div = layerDiv(container);

    // Cursor at top-left corner: offset from center is +width/2, +height/2.
    mouseMove(0, 0);
    act(() => flushFrames(300));

    const expectedX = config.xFactor * (window.innerWidth / 2);
    const expectedY = config.yFactor * (window.innerHeight / 2);
    expect(div.style.transform).toBe(
      `translate3d(${expectedX}px, ${expectedY}px, 0)`,
    );
  });

  it('moves smoothly: intermediate frames are between start and target', () => {
    const { container } = render(
      <ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>,
    );
    const div = layerDiv(container);

    mouseMove(0, 0);
    act(() => flushFrames(3));

    const match = div.style.transform.match(/translate3d\(([-\d.]+)px/);
    expect(match).toBeTruthy();
    const x = parseFloat(match![1]!);
    const targetX = config.xFactor * (window.innerWidth / 2);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(targetX);
  });

  it('retargets mid-flight when the mouse moves again', () => {
    const { container } = render(
      <ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>,
    );
    const div = layerDiv(container);

    mouseMove(0, 0);
    act(() => flushFrames(5));
    // Back to dead center: target becomes 0,0 again.
    mouseMove(window.innerWidth / 2, window.innerHeight / 2);
    act(() => flushFrames(400));

    expect(div.style.transform).toBe('translate3d(0px, 0px, 0)');
  });

  it('stops scheduling frames once settled', () => {
    render(<ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>);
    mouseMove(0, 0);
    act(() => flushFrames(500));
    expect(rafQueue.length).toBe(0);
  });

  it('does not move when disabled', () => {
    const { container } = render(
      <ParallaxMousemove.Layer config={config} disabled>
        x
      </ParallaxMousemove.Layer>,
    );
    mouseMove(0, 0);
    act(() => flushFrames(50));
    expect(layerDiv(container).style.transform).toBe(
      'translate3d(0px, 0px, 0)',
    );
  });

  it('does not move when prefers-reduced-motion is set', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    const { container } = render(
      <ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>,
    );
    mouseMove(0, 0);
    act(() => flushFrames(50));
    expect(layerDiv(container).style.transform).toBe(
      'translate3d(0px, 0px, 0)',
    );
  });

  it('removes listeners and cancels frames on unmount', () => {
    const { unmount } = render(
      <ParallaxMousemove.Layer config={config}>x</ParallaxMousemove.Layer>,
    );
    mouseMove(0, 0);
    unmount();
    expect(rafQueue.length).toBe(0);
    // A mousemove after unmount must not schedule anything.
    mouseMove(10, 10);
    expect(rafQueue.length).toBe(0);
  });

  it('defaults factors to zero so an empty config never moves the layer', () => {
    const { container } = render(
      <ParallaxMousemove.Layer>x</ParallaxMousemove.Layer>,
    );
    mouseMove(0, 0);
    act(() => flushFrames(50));
    expect(layerDiv(container).style.transform).toBe(
      'translate3d(0px, 0px, 0)',
    );
  });
});

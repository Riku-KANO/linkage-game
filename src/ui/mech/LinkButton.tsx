import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { playSfx } from '@/audio/sfx';
import { EASINGS, MICRO, SPRINGS } from '@/ui/tokens';
import {
  BUTTON_GAP,
  buttonGap,
  buttonJack,
  clamp01,
  f2,
  lerp,
  springAtRest,
  stepSpring,
  type SpringState,
} from './math';
import { nextFrame } from './useClock';
import { useReducedMotion } from './useReducedMotion';
import './mech.css';

export interface LinkButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  /** primary:真鍮の主ボタン、secondary:木の板、quiet:目立たない */
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'md' | 'sm';
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  /** 押下・解放の効果音(既定 true) */
  sound?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** 伸縮リンクの段数と棒の長さ(px) */
const JACK_CELLS = 3;
const JACK_BAR = 12;
const JACK_W = 48;
const PIN_R = 1.25;

/**
 * リンクで沈むボタン(設計原則 3、マイクロインタラクション)。天板は台の上に横向きの伸縮リンクで
 * 載っていて、押すとリンクが平たく伸びて天板が沈み、離すとばねで戻る。
 * ポインターでもキーボード(Space・Enter)でも同じように沈む。中身は普通の <button>。
 */
export function LinkButton({
  children,
  variant = 'secondary',
  size = 'md',
  reducedMotion,
  sound = true,
  className,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onBlur,
  ref,
  type = 'button',
  ...rest
}: LinkButtonProps) {
  const instant = useReducedMotion(reducedMotion);
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);
  const x = usePressMotion(pressed, instant);

  // 押したまま押せなくなったとき(押した結果で disabled になるなど)は黙って戻す
  useEffect(() => {
    if (disabled && pressedRef.current) {
      pressedRef.current = false;
      setPressed(false);
    }
  }, [disabled]);

  const press = () => {
    if (disabled || pressedRef.current) return;
    pressedRef.current = true;
    setPressed(true);
    if (sound) playSfx('press');
  };
  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    setPressed(false);
    if (sound) playSfx('release');
  };

  const gap = buttonGap(x);
  const jack = buttonJack(gap, JACK_CELLS, JACK_BAR);
  const top = BUTTON_GAP.rest - gap;
  const barsD = jack.bars
    .map(([x1, y1, x2, y2]) => `M${f2(x1)} ${f2(y1 + top)}L${f2(x2)} ${f2(y2 + top)}`)
    .join('');
  const pinsD = jack.pins
    .map(
      ([px, py]) =>
        `M${f2(px - PIN_R)} ${f2(py + top)}a${PIN_R} ${PIN_R} 0 1 0 ${PIN_R * 2} 0a${PIN_R} ${PIN_R} 0 1 0 ${-PIN_R * 2} 0`,
    )
    .join('');

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      className={['mech-btn', `mech-btn--${variant}`, `mech-btn--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      data-pressed={pressed || undefined}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (e.button === 0) press();
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        release();
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        release();
        onPointerLeave?.(e);
      }}
      onPointerCancel={(e) => {
        release();
        onPointerCancel?.(e);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press();
        onKeyDown?.(e);
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') release();
        onKeyUp?.(e);
      }}
      onBlur={(e) => {
        release();
        onBlur?.(e);
      }}
    >
      <span className="mech-btn__base" aria-hidden />
      <svg
        className="mech-btn__jack"
        aria-hidden
        width={JACK_W}
        height={BUTTON_GAP.rest}
        viewBox={`${-JACK_W / 2} 0 ${JACK_W} ${BUTTON_GAP.rest}`}
      >
        <path className="mech-btn__bars" d={barsD} />
        <path className="mech-btn__pins" d={pinsD} />
      </svg>
      <span className="mech-btn__cap" style={{ transform: `translateY(${f2(top)}px)` }}>
        {children}
      </span>
    </button>
  );
}

/**
 * 押し込み量 0..1。押すと MICRO.buttonPress で素早く沈み、離すと SPRINGS.ui のばねで戻る
 * (少し行き過ぎる)。動きの軽減では即座に切り替える。
 */
function usePressMotion(pressed: boolean, instant: boolean): number {
  const [x, setX] = useState(0);
  const state = useRef<SpringState>({ x: 0, v: 0 });

  useEffect(() => {
    if (instant) {
      state.current = { x: pressed ? 1 : 0, v: 0 };
      setX(state.current.x);
      return;
    }
    const from = state.current.x;
    let prev = performance.now();
    let elapsed = 0;
    let cancel = () => {};
    const loop = (now: number) => {
      const dt = Math.max(0, (now - prev) / 1000);
      prev = now;
      elapsed += dt;
      if (pressed) {
        const u = clamp01(elapsed / MICRO.buttonPress);
        state.current = { x: lerp(from, 1, EASINGS.snap(u)), v: 0 };
        setX(state.current.x);
        if (u < 1) cancel = nextFrame(loop);
        return;
      }
      const { stiffness, damping } = SPRINGS.ui;
      state.current = stepSpring(state.current, 0, stiffness, damping, dt);
      if (springAtRest(state.current, 0)) state.current = { x: 0, v: 0 };
      setX(state.current.x);
      if (state.current.x !== 0 || state.current.v !== 0) cancel = nextFrame(loop);
    };
    cancel = nextFrame(loop);
    return () => cancel();
  }, [pressed, instant]);

  return x;
}

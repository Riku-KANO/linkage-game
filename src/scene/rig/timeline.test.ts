import { beforeEach, describe, expect, it } from 'vitest';
import { useApp, type ActiveTransition } from '@/app/store';
import {
  BOOT,
  DEFAULT_TRANSITION,
  EASINGS,
  MAX_RESPONSE_DELAY,
  PANEL_REVEAL_AT,
  REDUCED_MOTION_FADE,
  TRANSITIONS,
  type Screen,
} from '@/ui/tokens';
import {
  TransitionDriver,
  classifyInput,
  planTransition,
  reverseEasing,
  sampleTransition,
  type InputLike,
} from './timeline';

const NORMAL = { reducedMotion: false };
const REDUCED = { reducedMotion: true };

function resetApp(screen: Screen = 'home') {
  useApp.setState({
    screen,
    transition: null,
    history: [],
    stageId: null,
    seenTransitions: new Set(),
  });
}

function current(): ActiveTransition {
  const tr = useApp.getState().transition;
  if (!tr) throw new Error('no transition');
  return tr;
}

beforeEach(() => resetApp());

describe('planTransition:初回と 2 回目以降', () => {
  it('T-01〜T-08 の初回は first、2 回目以降は repeat の長さ', () => {
    for (const token of TRANSITIONS) {
      if (token.id === 'T-00') continue;
      resetApp(token.from);
      useApp.getState().go(token.to);
      const first = planTransition(current(), NORMAL);
      expect(first.id).toBe(token.id);
      expect(first.duration).toBe(token.first);
      expect(first.easingName).toBe(token.easing);
      expect(first.short).toBe(false);
      // 戻ってもう一度
      useApp.setState({ screen: token.from, transition: null });
      useApp.getState().go(token.to);
      const again = planTransition(current(), NORMAL);
      expect(again.short).toBe(true);
      expect(again.duration).toBe(token.repeat);
    }
  });

  it('T-00 の初回(読み込み次第)は BOOT.pullBack、easing は settle', () => {
    resetApp('boot');
    useApp.getState().go('home');
    const plan = planTransition(current(), NORMAL);
    expect(plan.id).toBe('T-00');
    expect(plan.duration).toBe(BOOT.pullBack);
    expect(plan.easingName).toBe('settle');
  });

  it('ホーム → 設定・サンドボックスは T-08 の演出', () => {
    for (const to of ['settings', 'sandbox', 'zukan'] as const) {
      resetApp('home');
      useApp.getState().go(to);
      expect(planTransition(current(), NORMAL).id).toBe('T-08');
    }
  });

  it('表にない遷移(試走 → 設計)は既定の長さ', () => {
    resetApp('testRun');
    useApp.getState().go('design');
    const plan = planTransition(current(), NORMAL);
    expect(plan.id).toBeNull();
    expect(plan.duration).toBe(DEFAULT_TRANSITION.duration);
  });
});

describe('planTransition:戻る(Esc・右クリック)', () => {
  it('同じ遷移を逆向きに短縮版で再生する', () => {
    useApp.getState().go('stageSelect');
    useApp.getState().back();
    const plan = planTransition(current(), NORMAL);
    expect(plan.id).toBe('T-01');
    expect(plan.reverse).toBe(true);
    expect(plan.from).toBe('stageSelect');
    expect(plan.to).toBe('home');
    expect(plan.duration).toBe(0.6);
    // 逆再生のイージング
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      expect(plan.easing(t)).toBeCloseTo(1 - EASINGS.glide(1 - t), 12);
    }
  });

  it('reverseEasing は端点を保つ', () => {
    for (const e of Object.values(EASINGS)) {
      const r = reverseEasing(e);
      expect(r(0)).toBeCloseTo(0, 12);
      expect(r(1)).toBeCloseTo(1, 12);
    }
  });
});

describe('planTransition:reduced-motion', () => {
  it('どの遷移も 0.3 秒のクロスフェード', () => {
    useApp.getState().go('design');
    const plan = planTransition(current(), REDUCED);
    expect(plan.mode).toBe('fade');
    expect(plan.duration).toBe(REDUCED_MOTION_FADE);
    useApp.getState().back();
    expect(planTransition(current(), REDUCED).duration).toBe(REDUCED_MOTION_FADE);
  });
});

describe('sampleTransition', () => {
  it('操作から 0.1 秒以内に必ず動き始める(全遷移・初回/短縮/逆再生)', () => {
    const variants = [
      { reverse: false, short: false },
      { reverse: false, short: true },
      { reverse: true, short: true },
    ];
    for (const token of TRANSITIONS) {
      for (const v of variants) {
        const tr: ActiveTransition = {
          id: token.id,
          from: token.from,
          to: token.to,
          ...v,
          startedAt: 1000,
        };
        const plan = planTransition(tr, NORMAL);
        expect(sampleTransition(plan, 1000).eased).toBe(0);
        const s = sampleTransition(plan, 1000 + MAX_RESPONSE_DELAY * 1000);
        expect(s.t).toBeGreaterThan(0);
        // settle の逆再生は最初にわずかに逆へ振れる(予備動作)。どちらに動いても「動き始めた」
        expect(Math.abs(s.eased)).toBeGreaterThan(0);
      }
    }
  });

  it('時間どおりに終わり、終点は必ず 1', () => {
    const tr: ActiveTransition = {
      id: 'T-04',
      from: 'testRun',
      to: 'result',
      reverse: false,
      short: false,
      startedAt: 0,
    };
    const plan = planTransition(tr, NORMAL);
    expect(sampleTransition(plan, 1499).done).toBe(false);
    const end = sampleTransition(plan, 1500);
    expect(end.done).toBe(true);
    expect(end.eased).toBe(1);
  });

  it('パネルは revealAt を過ぎたら出る(T-08 は早め)', () => {
    const tr: ActiveTransition = {
      id: 'T-08',
      from: 'home',
      to: 'zukan',
      reverse: false,
      short: false,
      startedAt: 0,
    };
    const plan = planTransition(tr, NORMAL);
    expect(plan.revealAt).toBe(PANEL_REVEAL_AT['T-08']);
    expect(sampleTransition(plan, 0.8 * 1000 * (plan.revealAt - 0.05)).revealed).toBe(false);
    expect(sampleTransition(plan, 0.8 * 1000 * (plan.revealAt + 0.05)).revealed).toBe(true);
  });
});

describe('TransitionDriver', () => {
  const tr = (id: 'T-01' | 'T-07', startedAt: number): ActiveTransition => ({
    id,
    from: 'home',
    to: id === 'T-01' ? 'stageSelect' : 'design',
    reverse: false,
    short: false,
    startedAt,
  });

  it('スキップすると次のサンプルで終点', () => {
    const d = new TransitionDriver();
    d.begin(tr('T-01', 0), NORMAL);
    expect(d.sample(300)!.done).toBe(false);
    d.skip();
    const s = d.sample(310)!;
    expect(s.done).toBe(true);
    expect(s.eased).toBe(1);
    expect(s.revealed).toBe(true);
  });

  it('割り込み:新しい遷移で置き換わり、スキップ状態は持ち越さない', () => {
    const d = new TransitionDriver();
    d.begin(tr('T-01', 0), NORMAL);
    d.skip();
    d.begin(tr('T-07', 500), NORMAL);
    const s = d.sample(600)!;
    expect(d.plan!.id).toBe('T-07');
    expect(s.done).toBe(false);
    expect(s.t).toBeCloseTo(0.1 / 1.2, 9);
  });

  it('clear で非アクティブ', () => {
    const d = new TransitionDriver();
    d.begin(tr('T-01', 0), NORMAL);
    d.clear();
    expect(d.active).toBe(false);
    expect(d.sample(0)).toBeNull();
  });
});

describe('classifyInput', () => {
  const ev = (p: Partial<InputLike>): InputLike => ({
    type: 'keydown',
    timeStamp: 2000,
    defaultPrevented: false,
    ...p,
  });
  const moving: ActiveTransition = {
    id: 'T-01',
    from: 'home',
    to: 'stageSelect',
    reverse: false,
    short: false,
    startedAt: 1500,
  };

  it('Esc・右クリックは戻る', () => {
    const ctx = { screen: 'stageSelect' as const, transition: null, historyLength: 1 };
    expect(classifyInput(ev({ key: 'Escape' }), ctx)).toBe('back');
    expect(classifyInput(ev({ type: 'contextmenu', button: 2 }), ctx)).toBe('back');
  });

  it('ホーム(履歴なし)では戻らない', () => {
    const ctx = { screen: 'home' as const, transition: null, historyLength: 0 };
    expect(classifyInput(ev({ key: 'Escape' }), ctx)).toBeNull();
    expect(classifyInput(ev({ type: 'contextmenu' }), ctx)).toBeNull();
    expect(classifyInput(ev({ type: 'pointerdown', button: 0 }), ctx)).toBeNull();
  });

  it('遷移中のクリック・キーはスキップ。ただし遷移を始めた操作は除く', () => {
    const ctx = { screen: 'stageSelect' as const, transition: moving, historyLength: 1 };
    expect(classifyInput(ev({ key: 'a' }), ctx)).toBe('skip');
    expect(classifyInput(ev({ type: 'pointerdown', button: 0 }), ctx)).toBe('skip');
    expect(classifyInput(ev({ key: 'Enter', timeStamp: 1400 }), ctx)).toBeNull();
    expect(classifyInput(ev({ type: 'pointerdown', button: 0, timeStamp: 1499 }), ctx)).toBeNull();
  });

  it('遷移中の Esc は逆向きの遷移(割り込み)', () => {
    const ctx = { screen: 'stageSelect' as const, transition: moving, historyLength: 1 };
    expect(classifyInput(ev({ key: 'Escape' }), ctx)).toBe('back');
  });

  it('他の UI が処理した入力、文字入力中のキー、修飾キー、キーリピートは無視', () => {
    const ctx = { screen: 'design' as const, transition: moving, historyLength: 2 };
    expect(classifyInput(ev({ key: 'Escape', defaultPrevented: true }), ctx)).toBeNull();
    expect(classifyInput(ev({ type: 'contextmenu', defaultPrevented: true }), ctx)).toBeNull();
    expect(classifyInput(ev({ key: '5', editable: true }), ctx)).toBeNull();
    expect(classifyInput(ev({ key: 'Shift' }), ctx)).toBeNull();
    expect(classifyInput(ev({ key: 'a', repeat: true }), ctx)).toBeNull();
  });

  it('起動中(ロゴ)はクリック・キーでホームへ飛ばす', () => {
    const ctx = { screen: 'boot' as const, transition: null, historyLength: 0 };
    expect(classifyInput(ev({ key: ' ' }), ctx)).toBe('skipBoot');
    expect(classifyInput(ev({ type: 'pointerdown', button: 0 }), ctx)).toBe('skipBoot');
    expect(classifyInput(ev({ key: 'Escape' }), ctx)).toBe('skipBoot');
  });

  it('T-00 の最中(履歴なし)の Esc はスキップ', () => {
    const t00: ActiveTransition = { ...moving, id: 'T-00', from: 'boot', to: 'home' };
    const ctx = { screen: 'home' as const, transition: t00, historyLength: 0 };
    expect(classifyInput(ev({ key: 'Escape' }), ctx)).toBe('skip');
  });
});

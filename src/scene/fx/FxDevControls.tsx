import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { useEditor } from '@/editor/store';
import type { DesignDoc } from '@/core/model/types';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from '@/core/model/presets';
import { t } from '@/i18n';
import { fxDirector, useFx } from './store';

/**
 * 開発用(?dev=scene):演出に使う機械(エディタの設計)を選び、演出の状態を見る。
 * 遷移のボタン(T-03 / T-04 / T-05)は scene のデバッグパネルにある。
 */

const PRESETS: Record<string, () => DesignDoc> = {
  jansen: () => jansenLeg(),
  jansenWalker: () => jansenWalker(),
  chebyshev: () => ({
    ...chebyshevLambda(),
    legs: { count: 2, phaseStepDeg: 180, spacing: 14, mirrorX: true },
  }),
  fourBar: () => fourBar(),
};

/** エディタの設計を見本に差し替える(自動確認からも呼ぶ) */
export function setFxPreset(id: string): void {
  const make = PRESETS[id];
  if (make) useEditor.getState().replaceDesign(make());
}

/** 開発用の入口(window.__sceneDev.fx) */
export const fxDev = { director: fxDirector, useFx, setPreset: setFxPreset };

export function FxDevControls() {
  const kind = useFx((s) => s.kind);
  const [preset, setPreset] = useState('jansen');
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, []);
  const f = fxDirector.frame;
  return (
    <div className="ak-debug__fx">
      <h3>{t('fx.debug.title')}</h3>
      <label>
        {t('fx.debug.machine')}{' '}
        <select
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            setFxPreset(e.target.value);
          }}
        >
          {Object.keys(PRESETS).map((id) => (
            <option key={id} value={id}>
              {t(`fx.debug.preset.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <dl>
        <dt>{t('fx.debug.state')}</dt>
        <dd>
          {kind ? t(`fx.debug.kind.${kind}`) : t('fx.debug.idle')} {(f.level * 100).toFixed(0)}%
        </dd>
        <dt>{t('fx.debug.timeScale')}</dt>
        <dd>×{f.timeScale.toFixed(2)}</dd>
      </dl>
      <div className="ak-debug__buttons">
        <button
          type="button"
          onClick={() => {
            // 設計 → 試走、着いたら 0.6 秒置いて設計へ戻る(T-03 のあと逆再生)
            useApp.setState({ screen: 'design', transition: null, history: ['home'] });
            requestAnimationFrame(() => useApp.getState().go('testRun'));
            const off = useApp.subscribe((s) => {
              if (s.screen === 'testRun' && !s.transition) {
                off();
                window.setTimeout(() => useApp.getState().back(), 600);
              }
            });
          }}
        >
          {t('fx.debug.roundTrip')}
        </button>
      </div>
    </div>
  );
}

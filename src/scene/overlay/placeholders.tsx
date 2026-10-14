import { useMemo, useState, type ComponentType } from 'react';
import { useApp } from '@/app/store';
import { jansenLeg } from '@/core/model/presets';
import { t } from '@/i18n';
import type { Screen } from '@/ui/tokens';
import { perfStatus, setLowPerfManually } from '../perf/PerfProbe';
import { usePaperViewport } from '../store';
import { BackButton, Button, Panel } from './Panel';

/**
 * 画面ごとの DOM オーバーレイ(仮)。後のストリームが本物に差し替える
 * (GameShell の overlays で画面ごとに上書きする)。カメラが行き先に着く頃(revealAt)に出る。
 */
export interface ScreenOverlayProps {
  screen: Screen;
}
export type ScreenOverlay = ComponentType<ScreenOverlayProps>;

function StageSelectOverlay() {
  const go = useApp((s) => s.go);
  return (
    <Panel side="right" title={t('scene.stageSelect.title')}>
      {[1, 2, 3, 4, 5].map((ch) => (
        <div key={ch} className={`ak-chapter${ch > 2 ? ' is-locked' : ''}`}>
          <h3>
            {t('scene.stageSelect.chapter', { n: ch })}
            {ch <= 2 && (
              <span className="ak-chapter__name">{t(`scene.stageSelect.chapter${ch}`)}</span>
            )}
          </h3>
          {ch <= 2 ? (
            <div className="ak-stages">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} onClick={() => go('design', { stageId: `c${ch}-s${n}` })}>
                  {t('scene.stageSelect.stage', { chapter: ch, n })}
                </Button>
              ))}
            </div>
          ) : (
            <p className="ak-muted">{t('scene.stageSelect.locked')}</p>
          )}
        </div>
      ))}
      <div className="ak-row">
        <BackButton />
      </div>
    </Panel>
  );
}

/**
 * 設計画面(仮):製図用紙にぴったり重なる SVG(usePaperViewport の使用例)。
 * 50cm ごとの方眼・原点・用紙の縁と、ヤンセンの脚を描く。紙の方眼と線が一致していれば位置合わせは正しい。
 */
function DesignOverlay() {
  const go = useApp((s) => s.go);
  const stageId = useApp((s) => s.stageId);
  const vp = usePaperViewport();
  const leg = useMemo(() => jansenLeg(), []);
  const d = vp.design;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = Math.ceil(d.xMin / 50) * 50; x <= d.xMax; x += 50) {
    lines.push({ x1: x, y1: d.yMin, x2: x, y2: d.yMax });
  }
  for (let y = Math.ceil(d.yMin / 50) * 50; y <= d.yMax; y += 50) {
    lines.push({ x1: d.xMin, y1: y, x2: d.xMax, y2: y });
  }
  const byId = new Map(leg.joints.map((j) => [j.id, j]));
  return (
    <>
      {vp.ready && (
        <svg
          className="ak-paper-svg"
          style={{
            left: vp.screen.left,
            top: vp.screen.top,
            width: vp.screen.width,
            height: vp.screen.height,
          }}
          viewBox={`${d.xMin} ${-d.yMax} ${d.xMax - d.xMin} ${d.yMax - d.yMin}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g transform="scale(1,-1)">
            <rect
              x={d.xMin}
              y={d.yMin}
              width={d.xMax - d.xMin}
              height={d.yMax - d.yMin}
              className="ak-paper-svg__edge"
            />
            {lines.map((l, i) => (
              <line key={i} {...l} className="ak-paper-svg__grid" />
            ))}
            <circle cx={0} cy={0} r={3} className="ak-paper-svg__origin" />
            {leg.links.map((link) =>
              link.joints.slice(1).map((jid, k) => {
                const a = byId.get(link.joints[k]!)!;
                const b = byId.get(jid)!;
                return (
                  <line
                    key={`${link.id}-${k}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className="ak-paper-svg__link"
                  />
                );
              }),
            )}
            {leg.joints.map((j) => (
              <circle
                key={j.id}
                cx={j.x}
                cy={j.y}
                r={j.fixed ? 2.6 : 1.8}
                className={j.fixed ? 'ak-paper-svg__fixed' : 'ak-paper-svg__pin'}
              />
            ))}
          </g>
        </svg>
      )}
      <Panel side="top" className="ak-toolbar">
        <strong>{t('scene.design.title')}</strong>
        {stageId && <span className="ak-muted">{t('scene.design.stage', { id: stageId })}</span>}
        <span className="ak-muted ak-grow">{t('scene.design.placeholder')}</span>
        <BackButton />
        <Button variant="primary" onClick={() => go('testRun')}>
          {t('scene.design.testRun')}
        </Button>
      </Panel>
    </>
  );
}

function TestRunOverlay() {
  const go = useApp((s) => s.go);
  return (
    <Panel side="bottom" title={t('scene.testRun.title')}>
      <div className="ak-row">
        <Button onClick={() => useApp.getState().back()}>{t('scene.testRun.backToDesign')}</Button>
        <Button variant="primary" onClick={() => go('result')}>
          {t('scene.testRun.goal')}
        </Button>
      </div>
    </Panel>
  );
}

function ResultOverlay() {
  const go = useApp((s) => s.go);
  return (
    <Panel side="right" title={t('scene.result.title')}>
      <p className="ak-muted">{t('scene.result.placeholder')}</p>
      <div className="ak-row">
        <Button onClick={() => go('design')}>{t('scene.result.retry')}</Button>
        <Button variant="primary" onClick={() => go('stageSelect')}>
          {t('scene.result.next')}
        </Button>
      </div>
    </Panel>
  );
}

function ZukanOverlay() {
  return (
    <Panel side="left" title={t('scene.zukan.title')}>
      <p className="ak-muted">{t('scene.zukan.empty')}</p>
      <div className="ak-row">
        <BackButton />
      </div>
    </Panel>
  );
}

function SettingsOverlay() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const [, rerender] = useState(0);
  const reason = perfStatus.decision?.reason;
  return (
    <Panel side="left" title={t('scene.settings.title')}>
      <label className="ak-field">
        <input
          type="checkbox"
          checked={settings.lowPerf}
          onChange={(e) => {
            setLowPerfManually(e.target.checked);
            rerender((n) => n + 1);
          }}
        />
        <span>
          {t('scene.settings.lowPerf')}
          <small>{t('scene.settings.lowPerfHint')}</small>
          {reason && reason !== 'manual' && (
            <small>
              {t('scene.settings.lowPerfAuto', { reason: t(`scene.settings.reason.${reason}`) })}
            </small>
          )}
        </span>
      </label>
      <label className="ak-field">
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => setSettings({ reducedMotion: e.target.checked })}
        />
        <span>
          {t('scene.settings.reducedMotion')}
          <small>{t('scene.settings.reducedMotionHint')}</small>
        </span>
      </label>
      <label className="ak-field ak-field--range">
        <span>{t('scene.settings.volume')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setSettings({ volume: Number(e.target.value) })}
        />
      </label>
      <div className="ak-row">
        <BackButton />
      </div>
    </Panel>
  );
}

function SandboxOverlay() {
  return (
    <Panel side="left" title={t('scene.sandbox.title')}>
      <p className="ak-muted">{t('scene.sandbox.soon')}</p>
      <div className="ak-row">
        <BackButton />
      </div>
    </Panel>
  );
}

/** 画面 → 仮のオーバーレイ。ホーム(テキストメニュー)と起動はオーバーレイ層が自分で出す */
export const PLACEHOLDER_OVERLAYS: Partial<Record<Screen, ScreenOverlay>> = {
  stageSelect: StageSelectOverlay,
  design: DesignOverlay,
  testRun: TestRunOverlay,
  result: ResultOverlay,
  zukan: ZukanOverlay,
  settings: SettingsOverlay,
  sandbox: SandboxOverlay,
};

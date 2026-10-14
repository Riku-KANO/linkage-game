import { useMemo, useState } from 'react';
import { useApp } from '@/app/store';
import { jansenLeg } from '@/core/model';
import { syntheticWalkGhost } from '@/core/model/ghostFixture';
import type { Medal, RunResult } from '@/game/types';
import { t } from '@/i18n';
import { ResultPanel } from '@/result';
import { dialMaxFor } from '@/result/axes';
import {
  SAMPLE_CLEARED_GOLD,
  SAMPLE_CLEARED_MIXED,
  SAMPLE_DESIGN,
  SAMPLE_FAILED_FALL,
  SAMPLE_FAILED_TORQUE,
  SAMPLE_OPPONENT,
  SAMPLE_OPPONENT_UNCLEARED,
  SAMPLE_STAGE,
} from '@/result/samples';
import type { ShareRun } from '@/core/model';
import { GearMeter, LinkButton, LinkagePanel, PressStamp } from '@/ui/mech';

/**
 * 開発用プレイグラウンド(?dev=result)。結果画面の見本(クリア・失敗・対戦)を切り替え、
 * 動きの軽減と短縮版を試す。「機構 UI 部品」では RS-4 の部品を単体で動かす。
 */

type CaseId =
  'clearedMixed' | 'clearedGold' | 'failedFall' | 'failedTorque' | 'versus' | 'versusUncleared';

interface Case {
  result: RunResult;
  opponent?: ShareRun;
  reasonKey?: string;
  replay?: boolean;
}

const CASES: Record<CaseId, Case> = {
  clearedMixed: { result: SAMPLE_CLEARED_MIXED },
  clearedGold: { result: SAMPLE_CLEARED_GOLD },
  failedFall: { result: SAMPLE_FAILED_FALL, replay: true },
  failedTorque: { result: SAMPLE_FAILED_TORQUE, reasonKey: 'result.reason.stalled', replay: true },
  versus: { result: SAMPLE_CLEARED_MIXED, opponent: SAMPLE_OPPONENT },
  versusUncleared: { result: SAMPLE_CLEARED_GOLD, opponent: SAMPLE_OPPONENT_UNCLEARED },
};
const CASE_IDS = Object.keys(CASES) as CaseId[];

export default function ResultPlayground() {
  const [view, setView] = useState<'result' | 'kit'>('result');
  const [caseId, setCaseId] = useState<CaseId>('clearedMixed');
  const [short, setShort] = useState(false);
  const [run, setRun] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const reducedMotion = useApp((s) => s.settings.reducedMotion);
  const setSettings = useApp((s) => s.setSettings);
  const ghost = useMemo(() => syntheticWalkGhost(14), []);
  const c = CASES[caseId];
  const note = (name: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${name}`, ...l].slice(0, 6));

  return (
    <div className="rsdev">
      <style>{CSS}</style>
      <Backdrop />
      <aside className="rsdev-controls">
        <h1>{t('result.dev.title')}</h1>
        <div className="rsdev-tabs" role="tablist">
          {(['result', 'kit'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'is-on' : ''}
              onClick={() => setView(v)}
            >
              {t(`result.dev.view.${v}`)}
            </button>
          ))}
        </div>
        {view === 'result' && (
          <fieldset>
            <legend>{t('result.dev.case')}</legend>
            {CASE_IDS.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name="case"
                  checked={caseId === id}
                  onChange={() => {
                    setCaseId(id);
                    setRun((r) => r + 1);
                  }}
                />
                {t(`result.dev.case.${id}`)}
              </label>
            ))}
          </fieldset>
        )}
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setSettings({ reducedMotion: e.target.checked })}
          />
          {t('result.dev.reducedMotion')}
        </label>
        {view === 'result' && (
          <label>
            <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} />
            {t('result.dev.short')}
          </label>
        )}
        <LinkButton size="sm" variant="secondary" onClick={() => setRun((r) => r + 1)}>
          {t('result.dev.replay')}
        </LinkButton>
        {view === 'result' && (
          <div className="rsdev-log">
            <div>{t('result.dev.log')}</div>
            {log.length === 0 ? (
              <div className="rsdev-muted">{t('result.dev.logEmpty')}</div>
            ) : (
              log.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        )}
      </aside>

      {view === 'result' ? (
        <div className="rsdev-dock">
          <ResultPanel
            key={`${caseId}-${run}-${short}-${reducedMotion}`}
            result={c.result}
            stage={SAMPLE_STAGE}
            reasonKey={c.reasonKey}
            design={SAMPLE_DESIGN}
            ghost={ghost}
            opponent={c.opponent}
            short={short}
            onRetry={() => note('onRetry')}
            onBackToDesign={() => note('onBackToDesign')}
            onNext={() => note('onNext')}
            onReplayFall={c.replay ? () => note('onReplayFall') : undefined}
          />
        </div>
      ) : (
        <KitGallery key={`${run}-${reducedMotion}`} />
      )}
    </div>
  );
}

const MEDALS: Medal[] = ['gold', 'silver', 'bronze', null];
const medalGlyph = (m: Medal) => (m ? t(`result.medal.${m}`) : undefined);

/** RS-4 の部品を単体で試す */
function KitGallery() {
  const [value, setValue] = useState(13.4);
  const [spin, setSpin] = useState(0);
  const [medal, setMedal] = useState<Medal>('gold');
  const [stamp, setStamp] = useState(0);
  const [open, setOpen] = useState(true);
  const thresholds: [number, number, number] = [12, 16, 22];

  return (
    <div className="rsdev-kit">
      <section>
        <h2>{t('result.dev.kit.buttons')}</h2>
        <div className="rsdev-row">
          <LinkButton variant="primary">{t('result.dev.kit.primary')}</LinkButton>
          <LinkButton variant="secondary">{t('result.dev.kit.secondary')}</LinkButton>
          <LinkButton variant="quiet">{t('result.dev.kit.quiet')}</LinkButton>
        </div>
        <div className="rsdev-row">
          <LinkButton size="sm" variant="primary">
            {t('result.dev.kit.primary')}
          </LinkButton>
          <LinkButton size="sm">{t('result.dev.kit.secondary')}</LinkButton>
          <LinkButton size="sm" disabled>
            {t('result.dev.kit.disabled')}
          </LinkButton>
        </div>
      </section>

      <section>
        <h2>{t('result.dev.kit.meter')}</h2>
        <div className="rsdev-row">
          <GearMeter
            key={spin}
            value={value}
            max={dialMaxFor(value, thresholds)}
            decimals={1}
            unit={t('result.unit.time')}
            thresholds={thresholds}
            ghostValue={14.2}
            duration={1.1}
          />
          <div className="rsdev-col">
            <label>
              {t('result.dev.kit.value')} {value.toFixed(1)}
              <input
                type="range"
                min={0}
                max={30}
                step={0.1}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
              />
            </label>
            <LinkButton size="sm" onClick={() => setSpin((s) => s + 1)}>
              {t('result.dev.kit.spin')}
            </LinkButton>
          </div>
        </div>
      </section>

      <section>
        <h2>{t('result.dev.kit.press')}</h2>
        <div className="rsdev-row">
          <PressStamp
            key={stamp}
            className="rsdev-press"
            medal={medal}
            glyph={medalGlyph(medal)}
            delay={0.15}
          />
          <div className="rsdev-col">
            {MEDALS.map((m) => (
              <LinkButton
                key={String(m)}
                size="sm"
                variant={medal === m ? 'primary' : 'secondary'}
                onClick={() => {
                  setMedal(m);
                  setStamp((s) => s + 1);
                }}
              >
                {t(`result.medal.${m ?? 'none'}`)} {t('result.dev.kit.stamp')}
              </LinkButton>
            ))}
          </div>
          <div className="rsdev-row">
            {MEDALS.map((m) => (
              <PressStamp
                key={String(m)}
                className="rsdev-press rsdev-press--small"
                medal={m}
                glyph={medalGlyph(m)}
                skip
              />
            ))}
            <PressStamp className="rsdev-press rsdev-press--small" medal={null} armed={false} />
          </div>
        </div>
      </section>

      <section>
        <h2>{t('result.dev.kit.panel')}</h2>
        <LinkButton size="sm" onClick={() => setOpen((o) => !o)}>
          {t('result.dev.kit.toggle')}
        </LinkButton>
        <div className="rsdev-panelslot">
          <LinkagePanel open={open} className="rsdev-panel">
            <p>{t('result.dev.kit.panelBody')}</p>
            <div className="rsdev-row">
              <LinkButton size="sm" variant="primary">
                {t('result.dev.kit.primary')}
              </LinkButton>
              <LinkButton size="sm">{t('result.dev.kit.secondary')}</LinkButton>
            </div>
          </LinkagePanel>
        </div>
      </section>
    </div>
  );
}

/** 夕暮れの工房らしい背景と、主役の機械(ヤンセン脚)の影絵。3D の工房の代わり */
function Backdrop() {
  const leg = useMemo(() => jansenLeg(), []);
  const byId = new Map(leg.joints.map((j) => [j.id, j]));
  const s = 3.6;
  const pt = (id: string, mirror: boolean): [number, number] => {
    const j = byId.get(id)!;
    return [(mirror ? -j.x : j.x) * s, -j.y * s];
  };
  const draw = (mirror: boolean, opacity: number) => (
    <g opacity={opacity}>
      {leg.links.map((l) => {
        const ps = l.joints.map((id) => pt(id, mirror));
        return (
          <polygon
            key={l.id}
            points={ps.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="#c99a5b"
            strokeWidth={ps.length > 2 ? 5 : 7}
            strokeLinejoin="round"
          />
        );
      })}
      {leg.joints.map((j) => {
        const [x, y] = pt(j.id, mirror);
        return <circle key={j.id} cx={x} cy={y} r={j.fixed ? 7 : 5} fill="#e8c287" />;
      })}
    </g>
  );
  return (
    <div className="rsdev-backdrop" aria-hidden>
      <svg viewBox="-420 -240 840 600" preserveAspectRatio="xMidYMid meet">
        <ellipse cx={0} cy={330} rx={360} ry={26} fill="rgba(0,0,0,0.35)" />
        <g transform="translate(-40 0)">{draw(true, 0.35)}</g>
        <g transform="translate(40 0)">{draw(false, 0.9)}</g>
      </svg>
    </div>
  );
}

const CSS = `
.rsdev { position: fixed; inset: 0; overflow: hidden; font-size: 13px;
  background:
    radial-gradient(60% 55% at 28% 38%, rgba(255, 168, 88, 0.22), transparent 70%),
    radial-gradient(40% 30% at 80% 10%, rgba(120, 140, 200, 0.10), transparent 70%),
    linear-gradient(180deg, #2c1d14 0%, #1b130e 62%, #120c08 100%); }
.rsdev-backdrop { position: absolute; left: 0; top: 0; bottom: 0; width: calc(100% - 600px); display: grid; place-items: center; }
.rsdev-backdrop svg { width: min(90%, 640px); height: auto; filter: drop-shadow(0 10px 14px rgba(0,0,0,0.45)); }
.rsdev-controls { position: absolute; left: 16px; top: 16px; width: 250px; display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px; border-radius: 8px; background: rgba(18, 12, 8, 0.82); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.07); z-index: 2; }
.rsdev-controls h1 { margin: 0 0 2px; font-size: 14px; }
.rsdev-controls fieldset { margin: 0; padding: 6px 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; display: flex; flex-direction: column; gap: 3px; }
.rsdev-controls label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.rsdev-tabs { display: flex; gap: 4px; }
.rsdev-tabs button { flex: 1; padding: 4px 6px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.14); background: transparent; color: var(--muted); cursor: pointer; }
.rsdev-tabs button.is-on { background: rgba(242,166,90,0.2); color: var(--text); border-color: rgba(242,166,90,0.5); }
.rsdev-log { font-size: 11.5px; display: flex; flex-direction: column; gap: 2px; font-variant-numeric: tabular-nums; }
.rsdev-muted { color: var(--muted); }
.rsdev-dock { position: absolute; top: 0; bottom: 0; right: 24px; display: flex; align-items: center; z-index: 1; }
.rsdev-kit { position: absolute; left: 290px; right: 24px; top: 16px; bottom: 16px; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-content: start; z-index: 1; }
.rsdev-kit section { padding: 14px; border-radius: 10px; background: rgba(18, 12, 8, 0.7); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.07); display: flex; flex-direction: column; gap: 12px; }
.rsdev-kit h2 { margin: 0; font-size: 13px; color: var(--muted); font-family: ui-monospace, Menlo, monospace; }
.rsdev-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.rsdev-col { display: flex; flex-direction: column; gap: 8px; }
.rsdev-col label { display: flex; flex-direction: column; gap: 4px; }
.rsdev-press { width: 74px; height: 138px; }
.rsdev-press--small { width: 44px; height: 82px; }
.rsdev-panelslot { height: 170px; padding-top: 4px; }
.rsdev-panel { width: 340px; }
.rsdev-panel p { margin: 0 0 8px; line-height: 1.6; }
`;

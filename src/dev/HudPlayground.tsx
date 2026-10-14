import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/app/store';
import { computeBill, jansenLeg, readDesignFile } from '@/core/model';
import { MechanismEditor, useEditor } from '@/editor';
import {
  getStage,
  preflight,
  STAGES,
  startDesign,
  stageTextParams,
  suggestHint,
  type HintLevel,
} from '@/game';
import type { PreflightProblem, StageDef, StageId } from '@/game/types';
import {
  dismissNotice,
  HintPanel,
  homeMenuItems,
  HudDock,
  loadFailNotice,
  NoticeStack,
  noticeId,
  partsGivenUpTo,
  pushNotice,
  RUN_BADGES,
  RunHud,
  saveFailNotice,
  SettingsPanel,
  shareLoadedNotice,
  StageHeader,
  StageSelectPanel,
  TestRunButton,
  TextMenu,
  TutorialBubble,
  unlockNotices,
  type HudNotice,
  type HudSettings,
  type RunBadge,
} from '@/hud';
import { goalDistance } from '@/hud/format';
import {
  samplePreflight,
  sampleProgress,
  type PreflightCase,
  type ProgressCase,
} from '@/hud/samples';
import { t } from '@/i18n';
import { nextFrame } from '@/ui/mech';

/**
 * 開発用プレイグラウンド(?dev=hud)。HUD の部品を見本データで並べ、3D の工房の代わりに
 * 夕暮れの背景と機械の影絵を置く。上の帯で画面(設計・試走・ステージ選択・ホーム・設定)を切り替え、
 * 通知を出し、動きの軽減を試す。設計画面では本物のエディタを置き、試走前チェックを設計から計算できる。
 */

type View = 'design' | 'run' | 'select' | 'home' | 'settings';
const VIEWS: View[] = ['design', 'run', 'select', 'home', 'settings'];
const PREFLIGHT_CASES: ('live' | PreflightCase)[] = [
  'live',
  'checking',
  'ok',
  'warn',
  'error',
  'many',
];
const PROGRESS_CASES: ProgressCase[] = ['new', 'mid', 'ch1', 'all'];
/** 見出しに出す最高記録の見本(章 1 の 1・2 面をクリア済み) */
const SAMPLE_BEST = sampleProgress('mid');

/** ステージごとのヒントとチュートリアルの進み(画面を切り替えても残す) */
interface DesignProgress {
  revealed: number;
  ghosts: HintLevel[];
  tutorial: number;
  failedRuns: number;
}
const FRESH: DesignProgress = { revealed: 0, ghosts: [], tutorial: 0, failedRuns: 0 };

export default function HudPlayground() {
  const [view, setView] = useState<View>('design');
  const [stageId, setStageId] = useState<StageId>('c1-s1');
  const stage = getStage(stageId) ?? STAGES[0]!;
  const reducedMotion = useApp((s) => s.settings.reducedMotion);
  const setAppSettings = useApp((s) => s.setSettings);
  const [notices, setNotices] = useState<HudNotice[]>([]);
  const [last, setLast] = useState('');
  const [progressById, setProgressById] = useState<Record<StageId, DesignProgress>>({});
  const note = (s: string) => setLast(`${new Date().toLocaleTimeString()} ${s}`);
  const push = (...list: HudNotice[]) =>
    setNotices((l) => list.reduce((acc, n) => pushNotice(acc, n), l));

  // ステージを変えたら、その最初の設計をエディタに読み込む
  const loaded = useRef<StageId | null>(null);
  useEffect(() => {
    if (loaded.current === stageId) return;
    loaded.current = stageId;
    useEditor.getState().replaceDesign(startDesign(stage));
  }, [stageId, stage]);

  const designProgress = progressById[stageId] ?? FRESH;
  const setDesignProgress = (patch: Partial<DesignProgress>) =>
    setProgressById((m) => ({ ...m, [stageId]: { ...(m[stageId] ?? FRESH), ...patch } }));

  const noticeStack = (
    <NoticeStack notices={notices} onDismiss={(id) => setNotices((l) => dismissNotice(l, id))} />
  );

  const fire: Record<string, () => void> = {
    info: () => push({ id: noticeId(), key: 'hud.dev.notice.infoText', severity: 'info' }),
    success: () => push(shareLoadedNotice()),
    warn: () => push(saveFailNotice('quota')),
    error: () => push(loadFailNotice('corrupt')),
    chapter: () =>
      push(...unlockNotices({ stages: [], chapters: [2], parts: [], features: ['legArray'] })),
    part: () => push(...unlockNotices({ stages: [], chapters: [], parts: ['gear'], features: [] })),
  };

  return (
    <div className="hudev">
      <style>{CSS}</style>
      <header className="hudev-bar">
        <strong className="hudev-title">{t('hud.dev.title')}</strong>
        <div className="hudev-tabs" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'is-on' : ''}
              onClick={() => setView(v)}
            >
              {t(`hud.dev.view.${v}`)}
            </button>
          ))}
        </div>
        <label className="hudev-check">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setAppSettings({ reducedMotion: e.target.checked })}
          />
          {t('hud.dev.reducedMotion')}
        </label>
        <span className="hudev-group">
          <span className="hudev-muted">{t('hud.dev.notices')}</span>
          {Object.entries(fire).map(([k, f]) => (
            <button key={k} className="hudev-chip" data-kind={k} onClick={f}>
              {t(`hud.dev.notice.${k}`)}
            </button>
          ))}
        </span>
        <span className="hudev-last" title={t('hud.dev.lastCall')}>
          {last || t('hud.dev.logEmpty')}
        </span>
      </header>

      {view === 'design' && (
        <DesignView
          key={`${stageId}-${reducedMotion}`}
          stage={stage}
          setStageId={setStageId}
          progress={designProgress}
          setProgress={setDesignProgress}
          notices={noticeStack}
          note={note}
          onTestRun={() => setView('run')}
          onBack={() => setView('select')}
        />
      )}
      {view === 'run' && (
        <RunView
          stage={stage}
          notices={noticeStack}
          note={note}
          onBack={(failed) => {
            if (failed) setDesignProgress({ failedRuns: designProgress.failedRuns + 1 });
            setView('design');
          }}
        />
      )}
      {view === 'select' && (
        <SelectView
          notices={noticeStack}
          note={note}
          onPlay={(id) => {
            setStageId(id);
            setView('design');
          }}
          onClose={() => setView('home')}
        />
      )}
      {view === 'home' && (
        <HomeView
          notices={noticeStack}
          note={note}
          go={(id) => {
            if (id === 'stageSelect') setView('select');
            else if (id === 'settings') setView('settings');
            else if (id === 'continue') setView('design');
          }}
        />
      )}
      {view === 'settings' && (
        <SettingsView
          notices={noticeStack}
          note={note}
          push={push}
          onClose={() => setView('home')}
        />
      )}
    </div>
  );
}

/* ---------------- 設計画面 ---------------- */

function DesignView({
  stage,
  setStageId,
  progress,
  setProgress,
  notices,
  note,
  onTestRun,
  onBack,
}: {
  stage: StageDef;
  setStageId: (id: StageId) => void;
  progress: DesignProgress;
  setProgress: (p: Partial<DesignProgress>) => void;
  notices: ReactNode;
  note: (s: string) => void;
  onTestRun: () => void;
  onBack: () => void;
}) {
  const [pfCase, setPfCase] = useState<'live' | PreflightCase>('live');
  const [editorOn, setEditorOn] = useState(true);
  const [forceSuggest, setForceSuggest] = useState(false);
  const [costSlider, setCostSlider] = useState(stage.budget ? Math.round(stage.budget * 0.8) : 600);
  const [highlighted, setHighlighted] = useState<PreflightProblem | null>(null);
  const design = useEditor((s) => s.design);

  const steps = stage.tutorial ?? [];
  // チュートリアル中は、ここまでに渡した部品だけを使える
  const allowed = useMemo(() => {
    const list = stage.tutorial ?? [];
    if (progress.tutorial >= list.length) return stage.parts;
    const given = partsGivenUpTo(list, progress.tutorial);
    return stage.parts.filter((p) => given.includes(p));
  }, [stage, progress.tutorial]);

  const live = useMemo(
    () => preflight(stage, design, { allowedParts: allowed }),
    [stage, design, allowed],
  );
  const result = pfCase === 'live' ? live : samplePreflight(pfCase);
  const cost = editorOn ? computeBill(design).cost : costSlider;
  const suggested =
    forceSuggest ||
    suggestHint(stage, {
      revealed: progress.revealed,
      failedRuns: progress.failedRuns,
      seconds: 0,
    });
  const shownLevel = Math.max(0, ...progress.ghosts) as HintLevel | 0;
  const ghostHint = shownLevel > 0 ? stage.hints[shownLevel - 1] : null;
  const ghost = ghostHint && ghostHint.kind === 'ghost' ? ghostHint.design : null;

  const highlight = (p: PreflightProblem) => {
    note(`onHighlight(${p.code})`);
    setHighlighted(p);
    useEditor.getState().setSelection({ joints: p.jointIds ?? [], links: p.linkIds ?? [] });
  };

  return (
    <>
      <div className="hudev-controls">
        <label>
          {t('hud.dev.stage')}
          <select value={stage.id} onChange={(e) => setStageId(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.chapter}-${s.order} ${t(s.titleKey)}`}
                {s.tutorial ? ` · ${t('hud.dev.tutorial')}` : ''}
                {s.budget !== null ? ` · ${t('hud.header.budget')} ${s.budget}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('hud.dev.preflight')}
          <select
            value={pfCase}
            onChange={(e) => setPfCase(e.target.value as 'live' | PreflightCase)}
          >
            {PREFLIGHT_CASES.map((c) => (
              <option key={c} value={c}>
                {t(`hud.dev.preflight.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('hud.dev.hints')}
          <input
            type="number"
            min={0}
            max={3}
            value={progress.revealed}
            onChange={(e) => setProgress({ revealed: Number(e.target.value), ghosts: [] })}
          />
        </label>
        <label className="hudev-check">
          <input
            type="checkbox"
            checked={forceSuggest}
            onChange={(e) => setForceSuggest(e.target.checked)}
          />
          {t('hud.dev.suggested')}
        </label>
        {steps.length > 0 && (
          <span className="hudev-group">
            {t('hud.dev.tutorial')}
            <button onClick={() => setProgress({ tutorial: Math.max(0, progress.tutorial - 1) })}>
              {t('hud.dev.prev')}
            </button>
            <button
              onClick={() =>
                setProgress({ tutorial: Math.min(steps.length, progress.tutorial + 1) })
              }
            >
              {t('hud.dev.next')}
            </button>
          </span>
        )}
        <label className="hudev-check">
          <input
            type="checkbox"
            checked={editorOn}
            onChange={(e) => setEditorOn(e.target.checked)}
          />
          {t('hud.dev.editor')}
        </label>
        {!editorOn && stage.budget !== null && (
          <label>
            {t('hud.dev.cost')} {costSlider}
            <input
              type="range"
              min={0}
              max={Math.round(stage.budget * 1.3)}
              step={10}
              value={costSlider}
              onChange={(e) => setCostSlider(Number(e.target.value))}
            />
          </label>
        )}
      </div>
      <main className="hudev-stage">
        <Backdrop />
        {editorOn ? (
          <div className="hudev-paper">
            <MechanismEditor
              panels={false}
              allowedParts={allowed}
              lockedJoints={stage.lockedJoints}
              ghost={ghost}
              budget={stage.budget}
            />
          </div>
        ) : (
          <div className="hudev-paper hudev-paper--fake">
            <Machine scale={3} />
          </div>
        )}
        <HudDock
          topLeft={
            <StageHeader
              stage={stage}
              cost={cost}
              best={SAMPLE_BEST.best[stage.id]}
              onBack={() => {
                note('onBack');
                onBack();
              }}
            />
          }
          left={
            <HintPanel
              stage={stage}
              revealed={progress.revealed}
              suggested={suggested}
              onReveal={() => {
                note('onReveal');
                setProgress({ revealed: progress.revealed + 1 });
              }}
              ghostsShown={progress.ghosts}
              onToggleGhost={(level, show) => {
                note(`onToggleGhost(${level}, ${show})`);
                setProgress({
                  ghosts: show
                    ? [...progress.ghosts.filter((g) => g !== level), level]
                    : progress.ghosts.filter((g) => g !== level),
                });
              }}
            />
          }
          topRight={notices}
          bottomCenter={
            steps.length > 0 ? (
              <TutorialBubble
                steps={steps}
                index={progress.tutorial}
                params={stageTextParams(stage)}
                onNext={() => {
                  note('onNext');
                  setProgress({ tutorial: progress.tutorial + 1 });
                }}
                onSkip={() => {
                  note('onSkip');
                  setProgress({ tutorial: steps.length });
                }}
              />
            ) : undefined
          }
          bottomRight={
            <TestRunButton
              preflight={result}
              highlighted={highlighted}
              onHighlight={highlight}
              onTestRun={() => {
                note('onTestRun');
                if (steps[progress.tutorial]?.until.kind === 'testRun')
                  setProgress({ tutorial: progress.tutorial + 1 });
                onTestRun();
              }}
            />
          }
        />
      </main>
    </>
  );
}

/* ---------------- 試走中 ---------------- */

function RunView({
  stage,
  notices,
  note,
  onBack,
}: {
  stage: StageDef;
  notices: ReactNode;
  note: (s: string) => void;
  onBack: (failed: boolean) => void;
}) {
  const total = goalDistance(stage);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [baseLoad, setBaseLoad] = useState(0.55);
  const [ghostOn, setGhostOn] = useState(true);
  const [badges, setBadges] = useState<RunBadge[]>([]);
  // 見本の歩き:制限時間の 6 割でゴールする速さ、少し揺れる
  const speed = total / (stage.timeLimit * 0.6);
  const distance = Math.min(total, speed * elapsed + 0.04 * Math.sin(elapsed * 7));
  const stalled = badges.includes('stalled');
  const load = stalled ? 1.25 : baseLoad + 0.14 * Math.sin(elapsed * 5.3);
  const done = elapsed >= stage.timeLimit || distance >= total;

  useEffect(() => {
    if (!running || done || stalled) return;
    let prev = performance.now();
    let cancel = () => {};
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      setElapsed((e) => e + dt);
      cancel = nextFrame(loop);
    };
    cancel = nextFrame(loop);
    return () => cancel();
  }, [running, done, stalled]);

  return (
    <>
      <div className="hudev-controls">
        <button onClick={() => setRunning((r) => !r)}>
          {t(running ? 'hud.dev.run.pause' : 'hud.dev.run.play')}
        </button>
        <button onClick={() => setElapsed(0)}>{t('hud.dev.run.reset')}</button>
        <label>
          {t('hud.dev.run.load')} {Math.round(baseLoad * 100)}%
          <input
            type="range"
            min={0}
            max={1.2}
            step={0.01}
            value={baseLoad}
            onChange={(e) => setBaseLoad(Number(e.target.value))}
          />
        </label>
        <label className="hudev-check">
          <input type="checkbox" checked={ghostOn} onChange={(e) => setGhostOn(e.target.checked)} />
          {t('hud.dev.run.ghost')}
        </label>
        <span className="hudev-group">
          {t('hud.dev.badges')}
          {RUN_BADGES.map((b) => (
            <label key={b} className="hudev-check">
              <input
                type="checkbox"
                checked={badges.includes(b)}
                onChange={(e) =>
                  setBadges((l) => (e.target.checked ? [...l, b] : l.filter((x) => x !== b)))
                }
              />
              {t(`hud.run.badge.${b}`)}
            </label>
          ))}
        </span>
      </div>
      <main className="hudev-stage">
        <Backdrop ground />
        <div
          className="hudev-walker"
          style={{ transform: `translateX(${(distance / Math.max(total, 0.01)) * 40 - 20}vw)` }}
        >
          <Machine scale={2.2} tilt={badges.includes('fallen') ? 70 : 0} />
        </div>
        <RunHud
          elapsed={elapsed}
          timeLimit={stage.timeLimit}
          distance={distance}
          goalDistance={total}
          motorLoad={load}
          badges={badges}
          ghostDistance={ghostOn ? Math.min(total, distance * 1.12 + 0.05) : null}
          backShortcut="Esc"
          onBackToDesign={() => {
            note('onBackToDesign');
            onBack(badges.length > 0);
          }}
        />
        <HudDock topRight={notices} />
      </main>
    </>
  );
}

/* ---------------- ステージ選択 ---------------- */

function SelectView({
  notices,
  note,
  onPlay,
  onClose,
}: {
  notices: ReactNode;
  note: (s: string) => void;
  onPlay: (id: StageId) => void;
  onClose: () => void;
}) {
  const [pc, setPc] = useState<ProgressCase>('mid');
  const progress = useMemo(() => sampleProgress(pc), [pc]);
  return (
    <>
      <div className="hudev-controls">
        <label>
          {t('hud.dev.progress')}
          <select value={pc} onChange={(e) => setPc(e.target.value as ProgressCase)}>
            {PROGRESS_CASES.map((c) => (
              <option key={c} value={c}>
                {t(`hud.dev.progress.${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <main className="hudev-stage">
        <Backdrop />
        <div className="hudev-center">
          <StageSelectPanel
            key={pc}
            progress={progress}
            onFocusStage={(id) => note(`onFocusStage(${id})`)}
            onSelectStage={(id) => {
              note(`onSelectStage(${id})`);
              onPlay(id);
            }}
            onClose={() => {
              note('onClose');
              onClose();
            }}
          />
        </div>
        <HudDock topRight={notices} />
      </main>
    </>
  );
}

/* ---------------- ホーム ---------------- */

const HOME_ITEMS = homeMenuItems({ canContinue: true });

function HomeView({
  notices,
  note,
  go,
}: {
  notices: ReactNode;
  note: (s: string) => void;
  go: (id: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <>
      <div className="hudev-controls">
        <label>
          {t('hud.dev.hover')}
          <select value={active ?? ''} onChange={(e) => setActive(e.target.value || null)}>
            <option value="">{t('hud.dev.none')}</option>
            {HOME_ITEMS.map((i) => (
              <option key={i.id} value={i.id}>
                {t(i.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <main className="hudev-stage">
        <Backdrop ground />
        <div className="hudev-walker">
          <Machine scale={2} />
        </div>
        <div className="hudev-logo" aria-hidden>
          <span>{t('app.title')}</span>
          <small>{t('app.subtitle')}</small>
        </div>
        <HudDock
          topRight={notices}
          bottomLeft={
            <TextMenu
              items={HOME_ITEMS}
              activeId={active}
              onActiveChange={(id) => {
                setActive(id);
                note(`onActiveChange(${id})`);
              }}
              onSelect={(id) => {
                note(`onSelect(${id})`);
                go(id);
              }}
            />
          }
        />
      </main>
    </>
  );
}

/* ---------------- 設定 ---------------- */

function SettingsView({
  notices,
  note,
  push,
  onClose,
}: {
  notices: ReactNode;
  note: (s: string) => void;
  push: (...n: HudNotice[]) => void;
  onClose: () => void;
}) {
  const app = useApp((s) => s.settings);
  const setAppSettings = useApp((s) => s.setSettings);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(app.volume > 0 ? app.volume : 0.8);
  const [osRm, setOsRm] = useState(false);
  const settings: HudSettings = {
    volume,
    muted,
    reducedMotion: app.reducedMotion,
    lowPerf: app.lowPerf,
  };
  const change = (patch: Partial<HudSettings>) => {
    note(`onChange(${JSON.stringify(patch)})`);
    const v = patch.volume ?? volume;
    const m = patch.muted ?? muted;
    setVolume(v);
    setMuted(m);
    setAppSettings({
      volume: m ? 0 : v,
      ...(patch.reducedMotion !== undefined ? { reducedMotion: patch.reducedMotion } : {}),
      ...(patch.lowPerf !== undefined ? { lowPerf: patch.lowPerf } : {}),
    });
  };
  return (
    <>
      <div className="hudev-controls">
        <label className="hudev-check">
          <input type="checkbox" checked={osRm} onChange={(e) => setOsRm(e.target.checked)} />
          {t('hud.dev.osRm')}
        </label>
      </div>
      <main className="hudev-stage">
        <Backdrop ground />
        <div className="hudev-walker">
          <Machine scale={2} />
        </div>
        <div className="hudev-side">
          <SettingsPanel
            settings={settings}
            osReducedMotion={osRm}
            version="v0.0.0-dev"
            onChange={change}
            onExportDesign={() => {
              note('onExportDesign');
              push({ id: noticeId(), key: 'hud.notice.exported', severity: 'success' });
            }}
            onImportDesign={(file) => {
              note(`onImportDesign(${file.name})`);
              void readDesignFile(file).then((r) => {
                if (r.ok) {
                  useEditor.getState().replaceDesign(r.design);
                  push({ id: noticeId(), key: 'hud.notice.imported', severity: 'success' });
                } else push(loadFailNotice(r.reason));
              });
            }}
            onResetProgress={() => {
              note('onResetProgress');
              push({ id: noticeId(), key: 'hud.notice.progressReset', severity: 'info' });
            }}
            onClose={() => {
              note('onClose');
              onClose();
            }}
          />
        </div>
        <HudDock topRight={notices} />
      </main>
    </>
  );
}

/* ---------------- 背景(3D の工房の代わり) ---------------- */

function Backdrop({ ground = false }: { ground?: boolean }) {
  return (
    <div className="hudev-backdrop" aria-hidden>
      <div className="hudev-window" />
      {ground && <div className="hudev-ground" />}
    </div>
  );
}

/** 主役の機械(ヤンセン脚の影絵、左右 2 枚) */
function Machine({ scale, tilt = 0 }: { scale: number; tilt?: number }) {
  const leg = useMemo(() => jansenLeg(), []);
  const byId = new Map(leg.joints.map((j) => [j.id, j]));
  const pt = (id: string, mirror: boolean): [number, number] => {
    const j = byId.get(id)!;
    return [(mirror ? -j.x : j.x) * scale, -j.y * scale];
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
            strokeWidth={ps.length > 2 ? 4 : 6}
            strokeLinejoin="round"
          />
        );
      })}
      {leg.joints.map((j) => {
        const [x, y] = pt(j.id, mirror);
        return <circle key={j.id} cx={x} cy={y} r={j.fixed ? 6 : 4} fill="#e8c287" />;
      })}
    </g>
  );
  return (
    <svg
      className="hudev-machine"
      viewBox="-340 -200 680 520"
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
      aria-hidden
    >
      <g transform="translate(-30 0)">{draw(true, 0.35)}</g>
      <g transform="translate(30 0)">{draw(false, 0.9)}</g>
    </svg>
  );
}

const CSS = `
.hudev { position: fixed; inset: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr); overflow: hidden; font-size: 12.5px;
  background:
    radial-gradient(60% 55% at 30% 40%, rgba(255, 168, 88, 0.2), transparent 70%),
    radial-gradient(40% 30% at 80% 10%, rgba(120, 140, 200, 0.10), transparent 70%),
    linear-gradient(180deg, #2c1d14 0%, #1b130e 62%, #120c08 100%); }
.hudev-bar, .hudev-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 6px 12px; background: rgba(12, 8, 5, 0.88); border-bottom: 1px solid #3e2f23; z-index: 5; }
.hudev-controls { padding: 5px 12px; background: rgba(18, 12, 8, 0.82); }
.hudev-title { font-size: 13px; margin-right: 4px; }
.hudev-tabs { display: flex; gap: 4px; }
.hudev-tabs button, .hudev-controls button, .hudev-chip { padding: 3px 9px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.14); background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; }
.hudev-tabs button.is-on { background: rgba(242,166,90,0.2); color: var(--text); border-color: rgba(242,166,90,0.5); }
.hudev-chip[data-kind='error'] { border-color: rgba(224,83,61,0.5); }
.hudev-chip[data-kind='warn'] { border-color: rgba(224,167,58,0.5); }
.hudev-chip[data-kind='chapter'], .hudev-chip[data-kind='part'] { border-color: rgba(232,194,135,0.6); color: #e8c287; }
.hudev-controls label, .hudev-group { display: inline-flex; align-items: center; gap: 6px; }
.hudev-controls select, .hudev-controls input[type='number'] { background: #120c08; color: var(--text); border: 1px solid #3e2f23; border-radius: 4px; padding: 2px 4px; font-size: 12px; }
.hudev-controls input[type='number'] { width: 46px; }
.hudev-check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.hudev-muted { color: var(--muted); }
.hudev-last { margin-left: auto; color: var(--muted); font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 32ch; }
.hudev-stage { position: relative; overflow: hidden; min-height: 0; }
.hudev-backdrop { position: absolute; inset: 0; pointer-events: none; }
.hudev-window { position: absolute; right: 12%; top: 8%; width: 26%; height: 36%; border-radius: 6px;
  background: linear-gradient(180deg, rgba(255, 170, 100, 0.20), rgba(120, 80, 140, 0.12));
  box-shadow: inset 0 0 0 6px rgba(42, 28, 19, 0.9), 0 0 60px rgba(255, 168, 88, 0.12); opacity: 0.6; }
.hudev-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 26%;
  background: linear-gradient(180deg, rgba(70, 50, 31, 0.9), rgba(29, 20, 13, 1)); box-shadow: 0 -1px 0 rgba(201,154,91,0.3); }
.hudev-paper { position: absolute; top: 16px; left: 372px; right: 16px; bottom: 176px; border-radius: 6px; overflow: hidden;
  box-shadow: 0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,154,91,0.25); }
.hudev-paper--fake { display: grid; place-items: center;
  background: linear-gradient(rgba(58,104,126,0.12) 1px, transparent 1px) 0 0 / 100% 20px,
    linear-gradient(90deg, rgba(58,104,126,0.12) 1px, transparent 1px) 0 0 / 20px 100%, #f2e8d2; }
.hudev-paper--fake .hudev-machine { width: min(70%, 520px); height: auto; }
.hudev-paper--fake polygon { stroke: #2b2118; }
.hudev-paper--fake circle { fill: #e0761c; }
.hudev-walker { position: absolute; left: 50%; bottom: 14%; width: min(38vw, 460px); margin-left: calc(min(38vw, 460px) / -2); will-change: transform; pointer-events: none; }
.hudev-machine { display: block; width: 100%; height: auto; filter: drop-shadow(0 10px 14px rgba(0,0,0,0.45)); transform-origin: 50% 90%; transition: transform 0.6s; }
.hudev-center { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; overflow: auto; }
.hudev-side { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); }
.hudev-logo { position: absolute; left: 50%; top: 12%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;
  color: #e8c287; text-shadow: 0 0 30px rgba(242,166,90,0.35); }
.hudev-logo span { font-size: 54px; font-weight: 900; letter-spacing: 0.2em; }
.hudev-logo small { font-size: 14px; letter-spacing: 0.6em; color: var(--muted); }
`;

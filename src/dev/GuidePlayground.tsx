import { useMemo, useState } from 'react';
import { useApp } from '@/app/store';
import { chebyshevLambda, fourBar, jansenLeg } from '@/core/model/presets';
import { createEmptyDesign, type DesignDoc } from '@/core/model/types';
import { getStage, type FailReason } from '@/game';
import {
  candidates,
  GlossaryDialog,
  HOW_TO_PLAY_PAGES,
  HowToPlay,
  pickTip,
  RichText,
  ShortcutSheet,
  TipBubble,
  useShortcutSheetHotkey,
  WelcomeCard,
  type GuideEvent,
} from '@/guide';
import { f1, FigureSvg, MechDraw, pathD, useFigureClock } from '@/guide/figures/draw';
import { FIGURE_DESIGNS } from '@/guide/figures/designs';
import { analyzeFigure, boundsOf, fitMap, jointPath, poseAt } from '@/guide/figures/motion';
import { t } from '@/i18n';
import { LinkButton, useReducedMotion } from '@/ui/mech';
import './GuidePlayground.css';

/**
 * 開発用プレイグラウンド(?dev=guide)。遊び方の本・用語集・操作一覧・はじめての方へを開き、
 * 見本の設計を選んで状況の一言(pickTip)を確かめる。
 */

const SAMPLES: Record<string, () => DesignDoc> = {
  blank: () => createEmptyDesign(),
  noFixed: () => ({
    ...createEmptyDesign(),
    joints: [
      { id: 'a', x: 0, y: 0, fixed: false },
      { id: 'b', x: 30, y: 10, fixed: false },
    ],
    links: [{ id: 'l', joints: ['a', 'b'] }],
  }),
  noCrank: () => ({ ...FIGURE_DESIGNS.loopFourBar(), cranks: [] }),
  five: FIGURE_DESIGNS.loopFiveBar,
  triangle: FIGURE_DESIGNS.loopTriangle,
  longCrank: FIGURE_DESIGNS.tooLongCrank,
  noFoot: FIGURE_DESIGNS.loopFourBar,
  footHigh: () => ({ ...FIGURE_DESIGNS.goodLeg(), foot: 'B' }),
  backward: () => fourBar(),
  chebyshev: () => chebyshevLambda(),
  parallelogram: () => ({
    ...FIGURE_DESIGNS.doubleParallelogram(),
    foot: 'B',
    motor: { rpm: -30 },
  }),
  basic: () => getStage('c2-s1')!.initialDesign!,
  good: FIGURE_DESIGNS.goodLeg,
  jansen: () => jansenLeg(),
};
const SAMPLE_IDS = Object.keys(SAMPLES);
const STAGES = ['c1-s4', 'c2-s1', 'c2-s2'] as const;
const EVENTS: FailReason[] = ['fallen', 'timeout', 'stalled'];

type Overlay = 'book' | 'glossary' | 'sheet' | null;

export default function GuidePlayground() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [stack, setStack] = useState<Overlay[]>([]);
  const [startPage, setStartPage] = useState(0);
  const [welcome, setWelcome] = useState(false);
  const [mac, setMac] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const reducedSetting = useApp((s) => s.settings.reducedMotion);
  const setSettings = useApp((s) => s.setSettings);
  const reduced = useReducedMotion();
  const note = (name: string) => setLog((l) => [name, ...l].slice(0, 8));

  const open = (o: Overlay) => {
    setStack((s) => (overlay ? [...s, overlay] : s));
    setOverlay(o);
  };
  const closeTop = () => {
    setOverlay(stack[stack.length - 1] ?? null);
    setStack((s) => s.slice(0, -1));
  };
  useShortcutSheetHotkey(() => open('sheet'), overlay !== 'sheet');

  return (
    <div className="gddev">
      <aside className="gddev-controls">
        <h1>{t('guide.dev.title')}</h1>
        <label>
          {t('guide.dev.startPage')}
          <select value={startPage} onChange={(e) => setStartPage(Number(e.target.value))}>
            {HOW_TO_PLAY_PAGES.map((p, i) => (
              <option key={p.id} value={i}>
                {i + 1}. {t(p.titleKey)}
              </option>
            ))}
          </select>
        </label>
        <LinkButton variant="primary" size="sm" onClick={() => open('book')}>
          {t('guide.dev.openBook')}
        </LinkButton>
        <LinkButton size="sm" onClick={() => open('glossary')}>
          {t('guide.dev.openGlossary')}
        </LinkButton>
        <LinkButton size="sm" onClick={() => open('sheet')}>
          {t('guide.dev.openSheet')}
        </LinkButton>
        <LinkButton size="sm" onClick={() => setWelcome(true)}>
          {t('guide.dev.welcome')}
        </LinkButton>
        <label>
          <input
            type="checkbox"
            checked={reducedSetting}
            onChange={(e) => setSettings({ reducedMotion: e.target.checked })}
          />
          {t('guide.dev.reducedMotion')}
        </label>
        <label>
          <input type="checkbox" checked={mac} onChange={(e) => setMac(e.target.checked)} />
          {t('guide.dev.mac')}
        </label>
        <div className="gddev-log">
          <div>{t('guide.dev.log')}</div>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </aside>

      <main className="gddev-main">
        <TipDemo reducedMotion={reduced} />
        <p className="gddev-terms">
          {t('guide.dev.termDemo')} <RichText text={t('guide.dev.termList')} />
        </p>
        {welcome && (
          <div className="gddev-welcome">
            <WelcomeCard
              onStartTutorial={() => {
                note('onStartTutorial');
                setWelcome(false);
              }}
              onHowToPlay={() => {
                note('onHowToPlay');
                setWelcome(false);
                open('book');
              }}
              onLater={() => {
                note('onLater');
                setWelcome(false);
              }}
            />
          </div>
        )}
      </main>

      {overlay === 'book' && (
        <HowToPlay
          initialPage={startPage}
          isMac={mac}
          onClose={() => {
            note('HowToPlay.onClose');
            closeTop();
          }}
          onOpenShortcuts={() => open('sheet')}
          onOpenGlossary={() => open('glossary')}
          onPageChange={(i, id) => note(`onPageChange(${i}, ${id})`)}
        />
      )}
      {overlay === 'glossary' && (
        <GlossaryDialog onClose={closeTop} onSelect={(id) => note(`onSelect(${id})`)} />
      )}
      {overlay === 'sheet' && <ShortcutSheet isMac={mac} onClose={closeTop} />}
    </div>
  );
}

function TipDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const [sample, setSample] = useState('blank');
  const [stageId, setStageId] = useState<string>('');
  const [event, setEvent] = useState<string>('');
  const [dismissed, setDismissed] = useState<GuideEvent[]>([]);
  const [flip, setFlip] = useState(false);
  const design = useMemo(() => {
    const d = SAMPLES[sample]!();
    return flip ? { ...d, motor: { rpm: -d.motor.rpm } } : d;
  }, [sample, flip]);
  const fig = useMemo(() => (design.links.length ? analyzeFigure(design) : null), [design]);
  const stage = stageId ? (getStage(stageId) ?? null) : null;
  const events: GuideEvent[] = [
    ...(event ? [{ type: 'runFailed', reason: event as FailReason } as GuideEvent] : []),
    ...dismissed,
  ];
  const input = { design, analysis: fig?.analysis, stage, events };
  const tip = pickTip(input);
  const all = [...candidates(input)].map((c) => c.id);
  return (
    <section className="gddev-tips">
      <h2>{t('guide.dev.tipDemo')}</h2>
      <div className="gddev-row">
        <label>
          {t('guide.dev.sample')}
          <select
            value={sample}
            onChange={(e) => {
              setSample(e.target.value);
              setDismissed([]);
              setFlip(false);
            }}
          >
            {SAMPLE_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`guide.dev.sample.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('guide.dev.stage')}
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">{t('guide.dev.stageNone')}</option>
            {STAGES.map((id) => (
              <option key={id} value={id}>
                {id} {t(getStage(id)!.titleKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('guide.dev.event')}
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">{t('guide.dev.eventNone')}</option>
            {EVENTS.map((r) => (
              <option key={r} value={r}>
                {t(`guide.dev.event.${r}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="gddev-stage">
        <div className="gddev-paper">
          {fig ? <DesignPreview fig={fig} reducedMotion={reducedMotion} /> : null}
        </div>
        <div className="gddev-bubble">
          <TipBubble
            tip={tip}
            onDismiss={(tp) => setDismissed((d) => [...d, { type: 'tipDismissed', tip: tp.id }])}
            actionLabel={tip?.id === 'walksBackward' ? t('guide.dev.reverse') : undefined}
            onAction={() => setFlip((f) => !f)}
          />
          {!tip && <p className="gddev-muted">{t('guide.dev.noTip')}</p>}
          <p className="gddev-muted" data-testid="tip-candidates">
            {all.join(' → ') || '—'}
          </p>
        </div>
      </div>
    </section>
  );
}

function DesignPreview({
  fig,
  reducedMotion,
}: {
  fig: ReturnType<typeof analyzeFigure>;
  reducedMotion: boolean;
}) {
  const W = 300;
  const H = 220;
  const map = useMemo(() => fitMap(boundsOf(fig.cycle.positions), W, H, 18), [fig]);
  const time = useFigureClock(reducedMotion, 0.2);
  const moves = fig.design.cranks.length > 0 && fig.analysis.dof >= 1;
  const pose = moves ? poseAt(fig.cycle, time / 3).positions : fig.mech.designPos;
  const f = fig.mech.footIndex;
  return (
    <FigureSvg width={W} height={H} label={fig.design.name}>
      {f >= 0 && fig.analysis.fullRotation && (
        <path className="gd-trace gd-trace--foot" d={pathD(jointPath(fig.cycle, f), map, true)} />
      )}
      <MechDraw mech={fig.mech} positions={pose} map={map} weight={0.8} />
      <text x={f1(8)} y={f1(H - 8)} className="gd-cap-sub">
        {t('editor.dof.badge', { dof: fig.analysis.dof })}
      </text>
    </FigureSvg>
  );
}

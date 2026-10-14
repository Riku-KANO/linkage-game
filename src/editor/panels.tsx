import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import {
  compileMechanism,
  grashofVariant,
  sampleCycle,
  walkDirection,
  type MechanismAnalysis,
} from '@/core/kinematics';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import { computeBill } from '@/core/model/parts';
import { MAX_RPM, type DesignDoc } from '@/core/model/types';
import { playSfx } from '@/audio/sfx';
import { t } from '@/i18n';
import { useEditor } from './store';
import {
  linkLength,
  MAX_LEG_COUNT,
  setFixed,
  setFoot,
  setJointPosition,
  setLegs,
  setLinkLength,
  setMotorRpm,
  toggleCrank,
  type Locked,
  type Selection,
} from './ops';
import { copySelection, deleteSelection, mirrorCurrent } from './commands';
import { interpolateCycle, wrapAngle, type MotionEngine } from './motion';
import { fmt1 } from './render';
import { Icon } from './icons';

// ---------------------------------------------------------------- 共通部品

/** 数値入力:Enter かフォーカスを外したときに確定する */
export function NumberField({
  value,
  onCommit,
  step = 0.1,
  min,
  max,
  disabled,
  id,
  label,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 10) / 10);
  const commit = () => {
    if (draft === null) return;
    const v = Number.parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(v)) onCommit(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(null);
    }
  };
  return (
    <input
      id={id}
      aria-label={label}
      className="ed-input"
      type="number"
      inputMode="decimal"
      value={shown}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

const commit = (next: DesignDoc, group?: string) =>
  useEditor.getState().commit(next, group ? { group } : undefined);
const seal = () => useEditor.getState().seal();

// ---------------------------------------------------------------- 状態(ED-4)

const MEMBERS = ['ground', 'input', 'coupler', 'output'] as const;

export function StatusPanel({
  analysis,
  failing,
  hasCrank,
}: {
  analysis: MechanismAnalysis;
  failing: boolean;
  hasCrank: boolean;
}) {
  const hid = useId();
  // 自由度はバッジ、グラスホフは下のカードで出すので、一覧からは除く
  const msgs = analysis.messages.filter(
    (m) => !m.key.startsWith('analysis.dof.') && !m.key.startsWith('analysis.grashof.'),
  );
  const dead = (analysis.deadPoints ?? []).length;
  const grashof = analysis.grashof ?? [];
  return (
    <section className="ed-panel" aria-labelledby={hid}>
      <h3 id={hid}>{t('editor.status.title')}</h3>
      <div className="ed-row">
        <span
          className="ed-badge"
          data-status={analysis.specialGeometry ? 'special' : analysis.dofStatus}
        >
          {t('editor.dof.badge', { dof: analysis.dof })}・
          {t(`editor.dof.${analysis.specialGeometry ? 'special' : analysis.dofStatus}`)}
        </span>
      </div>
      <div className="ed-muted">
        {t('editor.dof.formula', { n: analysis.grubler.n, j: analysis.grubler.j })}
      </div>
      <ul className="ed-messages" aria-live="polite">
        {msgs.map((m, i) => (
          <li key={`${m.key}-${i}`} data-severity={m.severity}>
            {t(m.key, m.params)}
          </li>
        ))}
        {failing && hasCrank && analysis.assemblable && (
          <li data-severity="error">{t('editor.status.failNow')}</li>
        )}
        {msgs.length === 0 && hasCrank && analysis.fullRotation && analysis.dof === 1 && (
          <li data-severity="info">{t('editor.status.allGood')}</li>
        )}
      </ul>
      {dead > 0 && <p className="ed-muted">{t('editor.deadPoints', { count: dead })}</p>}
      {grashof.length > 0 && (
        <div>
          <h3 style={{ marginTop: 10 }}>{t('editor.grashof.title')}</h3>
          {grashof.map((g, i) => {
            const variant = grashofVariant(g);
            return (
              <div className="ed-grashof" key={i} data-variant={variant}>
                <b>{t(`editor.grashof.${variant}`)}</b>
                <div>{t(`analysis.grashof.${variant}`)}</div>
                <div className="ed-muted">
                  {t(g.grashof ? 'editor.grashof.ok' : 'editor.grashof.ng')}
                </div>
                <div className="ed-members">
                  {MEMBERS.map((k) => (
                    <span key={k} className={g.shortest === k ? 'is-shortest' : undefined}>
                      {t(`editor.grashof.member.${k}`)} {fmt1(g.lengths[k])}
                      {g.shortest === k ? t('editor.grashof.shortest') : ''}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 脚先の軌道(E-03)

export function FootPanel({ analysis, rpm }: { analysis: MechanismAnalysis; rpm: number }) {
  const hid = useId();
  const m = analysis.foot;
  const hasCrank = analysis.compiled.design.cranks.length > 0;
  const walk = m ? walkDirection(m, rpm) : 0;
  return (
    <section className="ed-panel" aria-labelledby={hid}>
      <h3 id={hid}>{t('editor.foot.title')}</h3>
      {m && hasCrank ? (
        <>
          <div className="ed-stat ed-stat-4">
            <div>
              <b>{fmt1(m.stride)}</b>
              <span>{t('analysis.metric.stride')}(cm)</span>
            </div>
            <div>
              <b>{fmt1(m.lift)}</b>
              <span>{t('analysis.metric.lift')}(cm)</span>
            </div>
            <div>
              <b>{fmt1(m.flatness)}</b>
              <span>{t('analysis.metric.flatness')}(cm)</span>
            </div>
            <div>
              <b>{Math.round(m.duty * 100)}%</b>
              <span>{t('analysis.metric.duty')}</span>
            </div>
          </div>
          <p className="ed-walk-text" data-walk={walk}>
            {walk > 0 ? '→ ' : walk < 0 ? '← ' : ''}
            {t(
              walk > 0
                ? 'analysis.metric.direction.forward'
                : walk < 0
                  ? 'analysis.metric.direction.backward'
                  : 'analysis.metric.direction.none',
            )}
          </p>
        </>
      ) : (
        <p className="ed-muted">{t('editor.foot.none')}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 選択(ED-2)

export function SelectionPanel({
  design,
  selection,
  locked,
  readOnly,
  canFix = true,
  canCrank = true,
  onNotice,
}: {
  design: DesignDoc;
  selection: Selection;
  locked: Locked;
  readOnly: boolean;
  /** 固定点を作れるか(allowedParts に 'fixed') */
  canFix?: boolean;
  /** クランクを作れるか(allowedParts に 'crank') */
  canCrank?: boolean;
  onNotice: (key: string, kind?: 'info' | 'error') => void;
}) {
  const hid = useId();
  const pickId = useId();
  const lenId = useId();
  const xId = useId();
  const yId = useId();
  const nSel = selection.joints.length + selection.links.length;
  const joint =
    selection.joints.length === 1 && selection.links.length === 0
      ? design.joints.find((j) => j.id === selection.joints[0])
      : undefined;
  const link =
    selection.links.length === 1 && selection.joints.length === 0
      ? design.links.find((l) => l.id === selection.links[0])
      : undefined;
  const pickValue = joint ? `j:${joint.id}` : link ? `l:${link.id}` : '';
  const onPick = (v: string) => {
    const s = useEditor.getState();
    if (v.startsWith('j:')) s.setSelection({ joints: [v.slice(2)], links: [] });
    else if (v.startsWith('l:')) s.setSelection({ joints: [], links: [v.slice(2)] });
    else s.setSelection({ joints: [], links: [] });
  };
  const len = link ? linkLength(design, link.id) : null;
  const isCrank = link ? design.cranks.some((c) => c.link === link.id) : false;
  const jLocked = joint ? locked.has(joint.id) : false;

  return (
    <section className="ed-panel" aria-labelledby={hid}>
      <h3 id={hid}>{t('editor.sel.title')}</h3>
      <div className="ed-row">
        <label htmlFor={pickId}>{t('editor.sel.pick')}</label>
        <select
          id={pickId}
          className="ed-select"
          value={pickValue}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="">
            {nSel > 1
              ? t('editor.sel.multi', {
                  joints: selection.joints.length,
                  links: selection.links.length,
                })
              : t('editor.sel.pickNone')}
          </option>
          {design.joints.map((j) => (
            <option key={j.id} value={`j:${j.id}`}>
              {t('editor.sel.joint', { id: j.id })}
            </option>
          ))}
          {design.links.map((l) => (
            <option key={l.id} value={`l:${l.id}`}>
              {t('editor.sel.link', { id: l.id })}
            </option>
          ))}
        </select>
      </div>

      {nSel === 0 && <p className="ed-muted">{t('editor.sel.none')}</p>}

      {joint && (
        <>
          <div className="ed-row">
            <label htmlFor={xId}>{t('editor.sel.x')}</label>
            <NumberField
              id={xId}
              value={joint.x}
              disabled={readOnly || jLocked}
              onCommit={(v) => commit(setJointPosition(design, joint.id, v, joint.y, locked))}
            />
          </div>
          <div className="ed-row">
            <label htmlFor={yId}>{t('editor.sel.y')}</label>
            <NumberField
              id={yId}
              value={joint.y}
              disabled={readOnly || jLocked}
              onCommit={(v) => commit(setJointPosition(design, joint.id, joint.x, v, locked))}
            />
          </div>
          <label className="ed-check">
            <input
              type="checkbox"
              checked={joint.fixed}
              disabled={readOnly || jLocked || !canFix}
              onChange={(e) => commit(setFixed(design, joint.id, e.target.checked, locked))}
            />
            {t('editor.sel.fixed')}
          </label>
          <label className="ed-check">
            <input
              type="checkbox"
              checked={design.foot === joint.id}
              disabled={readOnly}
              onChange={(e) => commit(setFoot(design, e.target.checked ? joint.id : null))}
            />
            {t('editor.sel.isFoot')}
          </label>
          {jLocked && <p className="ed-muted">{t('editor.sel.locked')}</p>}
        </>
      )}

      {link && (
        <>
          {len !== null ? (
            <div className="ed-row">
              <label htmlFor={lenId}>{t('editor.sel.length')}</label>
              <NumberField
                id={lenId}
                value={len}
                min={0.5}
                step={0.5}
                disabled={readOnly}
                onCommit={(v) => commit(setLinkLength(design, link.id, v, locked))}
              />
            </div>
          ) : (
            <p className="ed-muted">{t('editor.sel.ternary', { n: link.joints.length })}</p>
          )}
          <div className="ed-row">
            <button
              type="button"
              className="ed-btn"
              disabled={readOnly || !canCrank}
              onClick={() => {
                const r = toggleCrank(design, link.id);
                if (!r.ok) {
                  onNotice(
                    r.reason === 'multi-fixed'
                      ? 'editor.notice.crankMultiFixed'
                      : 'editor.notice.crankNoFixed',
                    'error',
                  );
                  playSfx('error');
                  return;
                }
                commit(r.design);
              }}
            >
              <Icon name="crank" />
              {t(isCrank ? 'editor.sel.removeCrank' : 'editor.sel.makeCrank')}
            </button>
          </div>
        </>
      )}

      {nSel > 0 && !readOnly && (
        <div className="ed-row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            title={t('editor.action.copy')}
            aria-label={t('editor.action.copy')}
            onClick={() => copySelection()}
          >
            <Icon name="copy" />
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            title={t('editor.action.mirror')}
            aria-label={t('editor.action.mirror')}
            onClick={() => mirrorCurrent(locked)}
          >
            <Icon name="mirror" />
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            title={t('editor.action.delete')}
            aria-label={t('editor.action.delete')}
            onClick={() => deleteSelection(locked)}
          >
            <Icon name="trash" />
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- モーター(ED-3)

export function MotorPanel({
  design,
  engine,
  readOnly,
}: {
  design: DesignDoc;
  engine: MotionEngine;
  readOnly: boolean;
}) {
  const hid = useId();
  const angleId = useId();
  const rpmId = useId();
  const sliderRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const playing = useSyncExternalStore(engine.subscribeState, () => engine.isPlaying());

  useEffect(() => {
    const draw = (e: MotionEngine) => {
      const deg = Math.round((wrapAngle(e.theta) * 180) / Math.PI) % 360;
      const s = String(deg);
      if (sliderRef.current && sliderRef.current.value !== s) sliderRef.current.value = s;
      if (textRef.current) textRef.current.textContent = t('editor.motion.angleValue', { deg });
    };
    draw(engine);
    return engine.subscribe(draw);
  }, [engine]);

  const rpm = design.motor.rpm;
  const dirKey =
    rpm > 0 ? 'editor.motion.ccw' : rpm < 0 ? 'editor.motion.cw' : 'editor.motion.stopped';

  return (
    <section className="ed-panel" aria-labelledby={hid}>
      <h3 id={hid}>{t('editor.motion.title')}</h3>
      <div className="ed-row">
        <button
          type="button"
          className="ed-btn"
          aria-pressed={playing}
          onClick={() => {
            engine.toggle();
            playSfx('press');
          }}
        >
          <Icon name={playing ? 'pause' : 'play'} />
          {t(playing ? 'editor.motion.pause' : 'editor.motion.play')}
          <span className="ed-kbd">P</span>
        </button>
        <span className="ed-muted">{t(dirKey)}</span>
      </div>
      <div className="ed-row">
        <label htmlFor={angleId}>{t('editor.motion.angle')}</label>
        <input
          ref={sliderRef}
          id={angleId}
          type="range"
          min={0}
          max={359}
          step={1}
          defaultValue={0}
          onChange={(e) => {
            engine.setPlaying(false);
            engine.setTheta((Number(e.target.value) * Math.PI) / 180);
          }}
        />
        <span ref={textRef} className="ed-angle" aria-live="off" />
      </div>
      <div className="ed-row">
        <label htmlFor={rpmId}>{t('editor.motion.rpm')}</label>
        <input
          id={rpmId}
          type="range"
          min={-MAX_RPM}
          max={MAX_RPM}
          step={1}
          value={rpm}
          disabled={readOnly}
          onChange={(e) => commit(setMotorRpm(design, Number(e.target.value)), 'rpm')}
          onPointerUp={seal}
          onKeyUp={seal}
          onBlur={seal}
        />
        <NumberField
          label={t('editor.motion.rpm')}
          value={rpm}
          step={1}
          min={-MAX_RPM}
          max={MAX_RPM}
          disabled={readOnly}
          onCommit={(v) => commit(setMotorRpm(design, v))}
        />
      </div>
      <div className="ed-row">
        <button
          type="button"
          className="ed-btn"
          disabled={readOnly || rpm === 0}
          onClick={() => commit(setMotorRpm(design, -rpm))}
        >
          {t('editor.motion.reverse')}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 脚列(ED-5)

const PV_W = 260;
const PV_H = 120;
const PV_PAD = 12;
const LEG_COLORS = [
  '#17577f',
  '#e0761c',
  '#3f9a4a',
  '#8a4fb5',
  '#c0392b',
  '#2a9d8f',
  '#b5884a',
  '#555',
];

export function LegsPanel({
  design,
  analysis,
  engine,
  readOnly,
}: {
  design: DesignDoc;
  analysis: MechanismAnalysis;
  engine: MotionEngine;
  readOnly: boolean;
}) {
  const hid = useId();
  const countId = useId();
  const phaseId = useId();
  const spacingId = useId();
  const legs = design.legs;
  const instances = useMemo(() => legInstances(design), [design]);
  const foot = analysis.compiled.footIndex;
  const hasMotion = design.cranks.length > 0 && foot >= 0;

  // 反転脚の軌道(前後反転した設計を 1 回転サンプルする)
  const mirrorCycle = useMemo(() => {
    if (!legs.mirrorX || !hasMotion) return null;
    const m = compileMechanism(mirrorDesignX(design));
    return sampleCycle(m, 120);
  }, [design, legs.mirrorX, hasMotion]);

  // プレビューの座標変換(両方の軌道が収まるように)
  const frame = useMemo(() => {
    if (!hasMotion) return null;
    const pts: { x: number; y: number }[] = [];
    for (const p of analysis.cycle.positions) pts.push({ x: p[foot * 2]!, y: p[foot * 2 + 1]! });
    if (mirrorCycle)
      for (const p of mirrorCycle.positions) pts.push({ x: p[foot * 2]!, y: p[foot * 2 + 1]! });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const s = Math.min(
      (PV_W - 2 * PV_PAD) / Math.max(1, maxX - minX),
      (PV_H - 2 * PV_PAD) / Math.max(1, maxY - minY),
    );
    const ox = PV_W / 2 - s * ((minX + maxX) / 2);
    const oy = PV_H / 2 + s * ((minY + maxY) / 2);
    const map = (x: number, y: number) => ({ x: ox + s * x, y: oy - s * y });
    const path = (cyc: typeof analysis.cycle) =>
      cyc.positions
        .map((p, i) => {
          const q = map(p[foot * 2]!, p[foot * 2 + 1]!);
          return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
        })
        .join('') + 'Z';
    return {
      map,
      main: path(analysis.cycle),
      mirror: mirrorCycle ? path(mirrorCycle) : null,
      ground: map(0, minY).y,
    };
  }, [analysis, mirrorCycle, foot, hasMotion]);

  const dotRefs = useRef<(SVGGElement | null)[]>([]);
  useEffect(() => {
    if (!frame) return;
    const draw = (e: MotionEngine) => {
      instances.forEach((inst, k) => {
        const el = dotRefs.current[k];
        if (!el) return;
        const cyc = inst.mirrored ? mirrorCycle : analysis.cycle;
        if (!cyc) return;
        const p = interpolateCycle(cyc, foot, e.theta + inst.phase);
        if (!p) return;
        const q = frame.map(p.x, p.y);
        el.setAttribute('transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`);
      });
    };
    draw(engine);
    return engine.subscribe(draw);
  }, [engine, frame, instances, mirrorCycle, analysis, foot]);

  const set = (patch: Parameters<typeof setLegs>[1], group?: string) =>
    commit(setLegs(design, patch), group);

  return (
    <section className="ed-panel" aria-labelledby={hid}>
      <h3 id={hid}>{t('editor.legs.title')}</h3>
      <div className="ed-row">
        <label htmlFor={countId}>{t('editor.legs.count')}</label>
        <input
          id={countId}
          type="range"
          min={1}
          max={MAX_LEG_COUNT}
          step={1}
          value={legs.count}
          disabled={readOnly}
          onChange={(e) => set({ count: Number(e.target.value) }, 'legs-count')}
          onPointerUp={seal}
          onKeyUp={seal}
        />
        <span className="ed-value">{legs.count}</span>
      </div>
      <div className="ed-row">
        <label htmlFor={phaseId}>{t('editor.legs.phase')}</label>
        <input
          id={phaseId}
          type="range"
          min={0}
          max={360}
          step={5}
          value={legs.phaseStepDeg}
          disabled={readOnly || legs.count < 2}
          onChange={(e) => set({ phaseStepDeg: Number(e.target.value) }, 'legs-phase')}
          onPointerUp={seal}
          onKeyUp={seal}
        />
        <span className="ed-value">{legs.phaseStepDeg}°</span>
      </div>
      <div className="ed-row">
        <label htmlFor={spacingId}>{t('editor.legs.spacing')}</label>
        <NumberField
          id={spacingId}
          value={legs.spacing}
          step={1}
          min={1}
          max={200}
          disabled={readOnly}
          onCommit={(v) => set({ spacing: v })}
        />
      </div>
      <label className="ed-check">
        <input
          type="checkbox"
          checked={legs.mirrorX}
          disabled={readOnly}
          onChange={(e) => set({ mirrorX: e.target.checked })}
        />
        {t('editor.legs.mirror')}
      </label>
      <div className="ed-muted">{t('editor.legs.total', { n: instances.length })}</div>
      {frame ? (
        <svg
          className="ed-legs-preview"
          viewBox={`0 0 ${PV_W} ${PV_H}`}
          role="img"
          aria-label={t('editor.legs.preview')}
        >
          <line className="ed-pv-ground" x1={0} x2={PV_W} y1={frame.ground} y2={frame.ground} />
          <path className="ed-pv-path" d={frame.main} />
          {frame.mirror && <path className="ed-pv-path is-mirror" d={frame.mirror} />}
          {instances.map((inst, k) => (
            <g
              key={k}
              ref={(el) => {
                dotRefs.current[k] = el;
              }}
            >
              <circle
                r={6}
                fill={LEG_COLORS[Math.floor(k / (legs.mirrorX ? 2 : 1)) % LEG_COLORS.length]}
                stroke="#fff"
                strokeWidth={1.2}
                strokeDasharray={inst.mirrored ? '2 1.5' : undefined}
              />
              <text>{k + 1}</text>
            </g>
          ))}
        </svg>
      ) : (
        <p className="ed-muted">{t('editor.legs.noFoot')}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 部品・コスト(ED-6)

export function BillPanel({ design, budget }: { design: DesignDoc; budget: number | null }) {
  const hid = useId();
  const bill = useMemo(() => computeBill(design), [design]);
  const over = budget !== null && bill.cost > budget;
  const ratio = budget && budget > 0 ? Math.min(1, bill.cost / budget) : 0;
  return (
    <section className="ed-panel" aria-labelledby={hid}>
      <h3 id={hid}>{t('editor.bill.title')}</h3>
      <div className="ed-stat">
        <div>
          <b>{bill.parts}</b>
          <span>{t('editor.bill.parts')}</span>
        </div>
        <div>
          <b style={over ? { color: '#ff8a73' } : undefined}>{fmt1(bill.cost)}</b>
          <span>{t('editor.bill.cost')}</span>
        </div>
        <div>
          <b>{t('editor.bill.massValue', { kg: bill.mass.toFixed(2) })}</b>
          <span>{t('editor.bill.mass')}</span>
        </div>
      </div>
      <p className="ed-muted">
        {t('editor.bill.perLeg', {
          links: bill.perLeg.links,
          length: fmt1(bill.perLeg.linkLengthCm),
          pins: bill.perLeg.pins,
          fixed: bill.perLeg.fixed,
        })}
        <br />
        {t('editor.bill.instances', { n: bill.instances })}
      </p>
      {budget !== null && (
        <div>
          <div className="ed-muted">{t('editor.bill.budget', { budget: fmt1(budget) })}</div>
          <div
            className={`ed-meter${over ? ' is-over' : ''}`}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={bill.cost}
            aria-label={t('editor.bill.cost')}
          >
            <div style={{ width: `${(over ? 1 : ratio) * 100}%` }} />
          </div>
          {over ? (
            <div className="ed-warning" role="alert">
              {t('editor.bill.over', { over: fmt1(bill.cost - budget) })}
            </div>
          ) : (
            <div className="ed-muted">
              {t('editor.bill.within', { left: fmt1(budget - bill.cost) })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

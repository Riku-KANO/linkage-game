import { useMemo, useState } from 'react';
import { MechanismEditor, useEditor, type WorldRect } from '@/editor';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from '@/core/model/presets';
import { createEmptyDesign, type DesignDoc, type PartKind } from '@/core/model/types';
import { t } from '@/i18n';

/** 開発用プレイグラウンド(?dev=editor)。機構エディタを単体で試す */

const PRESETS: { id: string; make: () => DesignDoc }[] = [
  { id: 'jansen', make: jansenLeg },
  { id: 'jansenWalker', make: jansenWalker },
  { id: 'chebyshev', make: () => chebyshevLambda() },
  { id: 'fourBar', make: () => fourBar() },
  { id: 'blank', make: () => createEmptyDesign() },
];

const TUTORIAL_PARTS: PartKind[] = ['link', 'pin'];
const FIXED_VIEW: WorldRect = { minX: -90, minY: -110, maxX: 70, maxY: 50 };

const bar: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  padding: '6px 10px',
  background: '#1b130e',
  borderBottom: '1px solid #3e2f23',
  fontSize: 12,
};

export default function EditorPlayground() {
  const [preset, setPreset] = useState('jansen');
  const [budget, setBudget] = useState<number | null>(null);
  const [ghostOn, setGhostOn] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [fixedView, setFixedView] = useState(false);
  const [view, setView] = useState<WorldRect>(FIXED_VIEW);
  const [panels, setPanels] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const design = useEditor((s) => s.design);

  const load = (id: string) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p) useEditor.getState().replaceDesign(p.make());
  };

  const ghost = useMemo(() => (ghostOn ? chebyshevLambda() : null), [ghostOn]);
  // チュートリアルの模擬:有効にした時点の固定点を動かせなくする
  const [locked, setLocked] = useState<string[] | undefined>(undefined);
  const toggleTutorial = (on: boolean) => {
    setTutorial(on);
    setLocked(on ? design.joints.filter((j) => j.fixed).map((j) => j.id) : undefined);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={bar}>
        <strong>{t('editor.dev.title')}</strong>
        <label>
          {t('editor.dev.preset')}{' '}
          <select value={preset} onChange={(e) => load(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`editor.dev.preset.${p.id}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => load(preset)}>
          {t('editor.dev.reload')}
        </button>
        <label>
          {t('editor.dev.budget')}{' '}
          <select
            value={budget === null ? '' : String(budget)}
            onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('editor.dev.none')}</option>
            <option value="120">120</option>
            <option value="250">250</option>
            <option value="600">600</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={ghostOn} onChange={(e) => setGhostOn(e.target.checked)} />{' '}
          {t('editor.dev.ghost')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={tutorial}
            onChange={(e) => toggleTutorial(e.target.checked)}
          />{' '}
          {t('editor.dev.tutorial')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={fixedView}
            onChange={(e) => {
              setFixedView(e.target.checked);
              setView(FIXED_VIEW);
            }}
          />{' '}
          {t('editor.dev.view')}
        </label>
        <label>
          <input type="checkbox" checked={panels} onChange={(e) => setPanels(e.target.checked)} />{' '}
          {t('editor.dev.panels')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
          />{' '}
          {t('editor.dev.readOnly')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={showJson}
            onChange={(e) => setShowJson(e.target.checked)}
          />{' '}
          JSON
        </label>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <MechanismEditor
          style={{ flex: 1 }}
          budget={budget}
          ghost={ghost}
          allowedParts={tutorial ? TUTORIAL_PARTS : undefined}
          lockedJoints={locked}
          view={fixedView ? view : null}
          onViewChange={fixedView ? setView : undefined}
          panels={panels}
          readOnly={readOnly}
        />
        {showJson && (
          <pre
            style={{
              width: 320,
              margin: 0,
              padding: 8,
              overflow: 'auto',
              fontSize: 11,
              background: '#120c08',
              borderLeft: '1px solid #3e2f23',
            }}
          >
            {JSON.stringify(design, null, 1)}
          </pre>
        )}
      </div>
    </div>
  );
}

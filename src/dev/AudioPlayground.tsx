/**
 * 開発用プレイグラウンド(?dev=audio)。効果音を 1 つずつ鳴らし、モーターのうなりを rpm・負荷で動かす。
 * 開発者向けの画面なので文言は i18n を通さない。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '@/app/store';
import {
  MOTOR_MAX_RPM,
  SFX_NAMES,
  getAudioStatus,
  installAudio,
  playSfx,
  setAudioMuted,
  setMotorHum,
  type AudioStatus,
  type SfxName,
} from '@/audio';

const LABELS: Record<SfxName, string> = {
  snap: 'snap(はまる カチッ)',
  press: 'press(ボタンが沈む)',
  release: 'release(ボタンが戻る)',
  error: 'error(組立不能・死点)',
  whoosh: 'whoosh(カメラ遷移)',
  gear: 'gear(歯車メーター)',
  stamp: 'stamp(メダルの刻印)',
  step: 'step(脚が接地)',
  success: 'success(成功)',
};

const STATUS_LABEL: Record<AudioStatus, string> = {
  unavailable: 'Web Audio が使えません',
  locked: 'クリックかキー入力で音が出ます',
  running: '再生中',
  suspended: '一時停止(タブが裏)',
  closed: '閉じています',
};

/** 1 回転あたりの接地回数(左右 2 脚 × 2 組) */
const STEPS_PER_REV = 4;

const panel: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: 16,
  display: 'grid',
  gap: 10,
  alignContent: 'start',
};

const buttonStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'var(--ink)',
  color: 'var(--text)',
  cursor: 'pointer',
  textAlign: 'left',
};

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, format, onChange } = props;
  return (
    <label
      style={{ display: 'grid', gridTemplateColumns: '9em 1fr 5em', gap: 8, alignItems: 'center' }}
    >
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {format ? format(value) : value.toFixed(2)}
      </span>
    </label>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section style={panel}>
      <h2 style={{ margin: 0, fontSize: 16, color: 'var(--accent)' }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

export default function AudioPlayground() {
  const volume = useApp((s) => s.settings.volume);
  const setSettings = useApp((s) => s.setSettings);
  const [muted, setMuted] = useState(false);
  const [sfxVolume, setSfxVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [pan, setPan] = useState(0);
  const [rpm, setRpm] = useState(0);
  const [load, setLoad] = useState(0.2);
  const [walking, setWalking] = useState(false);
  const [status, setStatus] = useState<AudioStatus>('locked');
  const [voices, setVoices] = useState(0);
  const engineRef = useRef<ReturnType<typeof installAudio> | null>(null);

  useEffect(() => {
    engineRef.current = installAudio();
    const id = window.setInterval(() => {
      setStatus(getAudioStatus());
      setVoices(engineRef.current?.activeVoices() ?? 0);
    }, 100);
    return () => {
      window.clearInterval(id);
      setMotorHum(0, 0);
    };
  }, []);

  useEffect(() => {
    setMotorHum(rpm, load);
  }, [rpm, load]);

  useEffect(() => {
    setAudioMuted(muted);
  }, [muted]);

  // 歩行のまね:クランク角を進め、接地の位相を跨いだら足音を鳴らす(左右交互に定位)
  useEffect(() => {
    if (!walking || rpm === 0) return;
    let raf = 0;
    let last = performance.now();
    let phase = 0;
    let foot = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      phase += (Math.abs(rpm) / 60) * STEPS_PER_REV * dt;
      while (phase >= 1) {
        phase -= 1;
        foot++;
        playSfx('step', { volume: 0.55 + 0.35 * load, pan: foot % 2 === 0 ? -0.35 : 0.35 });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [walking, rpm, load]);

  const play = (name: SfxName) => playSfx(name, { volume: sfxVolume, rate, pan });

  // 数字キー 1〜9 で効果音
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      const name = SFX_NAMES[i];
      if (name && !e.repeat) playSfx(name, { volume: sfxVolume, rate, pan });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sfxVolume, rate, pan]);

  const burstSameFrame = () => {
    for (let i = 0; i < 20; i++) playSfx('snap');
  };
  const burstSpaced = () => {
    for (let i = 0; i < 12; i++) window.setTimeout(() => playSfx('snap'), i * 35);
  };
  const resultDemo = () => {
    // 歯車メーターが回って止まり、メダルが刻印され、成功の響き
    const rates = [2.4, 2.2, 2, 1.7, 1.4, 1.1, 0.85, 0.65];
    let t = 0;
    for (const r of rates) {
      window.setTimeout(() => playSfx('gear', { rate: r, volume: 0.8 }), t);
      t += 250 / r;
    }
    window.setTimeout(() => playSfx('stamp'), t + 250);
    window.setTimeout(() => playSfx('success'), t + 900);
  };

  return (
    <div style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Audio playground</h1>
        <span style={{ color: status === 'running' ? 'var(--ok)' : 'var(--muted)' }}>
          {STATUS_LABEL[status]}
        </span>
        <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          発音中の声 {voices}
        </span>
      </header>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        }}
      >
        <Panel title="効果音(数字キー 1〜9 でも鳴る)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {SFX_NAMES.map((name, i) => (
              <button key={name} type="button" style={buttonStyle} onClick={() => play(name)}>
                {i + 1}. {LABELS[name]}
              </button>
            ))}
          </div>
          <Slider
            label="強さ volume"
            value={sfxVolume}
            min={0}
            max={1}
            step={0.01}
            onChange={setSfxVolume}
          />
          <Slider
            label="速さ rate"
            value={rate}
            min={0.25}
            max={4}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={setRate}
          />
          <Slider label="定位 pan" value={pan} min={-1} max={1} step={0.05} onChange={setPan} />
        </Panel>

        <Panel title="モーターのうなり">
          <Slider
            label="rpm"
            value={rpm}
            min={-MOTOR_MAX_RPM}
            max={MOTOR_MAX_RPM}
            step={1}
            format={(v) => v.toFixed(0)}
            onChange={setRpm}
          />
          <Slider label="負荷 load" value={load} min={0} max={1} step={0.01} onChange={setLoad} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={buttonStyle} onClick={() => setRpm(0)}>
              停止(rpm 0)
            </button>
            <button type="button" style={buttonStyle} onClick={() => setRpm(60)}>
              60 rpm
            </button>
            <button type="button" style={buttonStyle} onClick={() => setRpm(120)}>
              120 rpm
            </button>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={walking}
              onChange={(e) => setWalking(e.target.checked)}
            />
            歩行のまね(rpm に合わせて 1 回転 {STEPS_PER_REV} 歩の足音)
          </label>
        </Panel>

        <Panel title="全体">
          <Slider
            label="音量(設定)"
            value={volume}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setSettings({ volume: v })}
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            ミュート
          </label>
        </Panel>

        <Panel title="負荷試験・組み合わせ">
          <button type="button" style={buttonStyle} onClick={burstSameFrame}>
            snap を同じ瞬間に 20 回(1 回だけ鳴るはず)
          </button>
          <button type="button" style={buttonStyle} onClick={burstSpaced}>
            snap を 35ms おきに 12 回(割れずに重なる)
          </button>
          <button type="button" style={buttonStyle} onClick={resultDemo}>
            結果画面のまね(歯車メーター → 刻印 → 成功)
          </button>
          <button
            type="button"
            style={buttonStyle}
            onPointerDown={() => playSfx('press')}
            onPointerUp={() => playSfx('release')}
          >
            押して離す(press / release)
          </button>
        </Panel>
      </div>
    </div>
  );
}

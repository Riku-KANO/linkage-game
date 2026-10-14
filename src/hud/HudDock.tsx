import type { CSSProperties, ReactNode } from 'react';
import { cx } from './common';
import './hud.css';

export interface HudDockProps {
  /** 左上(ステージの見出しなど)。下に left が続く */
  topLeft?: ReactNode;
  /** 左の列の続き(ヒントなど) */
  left?: ReactNode;
  topCenter?: ReactNode;
  /** 右上(通知など)。下に right が続く */
  topRight?: ReactNode;
  right?: ReactNode;
  bottomLeft?: ReactNode;
  /** 下の中央(チュートリアルの吹き出しなど) */
  bottomCenter?: ReactNode;
  /** 右下(試走ボタンなど) */
  bottomRight?: ReactNode;
  /** 画面の端からの余白(px、既定 16) */
  inset?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * HUD の置き場(設計原則 2「機械を隠さない」)。3D の Canvas の上に全面で重ね、部品を画面の端に寄せる。
 * 自分自身はポインターを通し(3D を操作できる)、置いた部品だけが受け取る。中央は空けておく。
 */
export function HudDock({
  topLeft,
  left,
  topCenter,
  topRight,
  right,
  bottomLeft,
  bottomCenter,
  bottomRight,
  inset = 16,
  className,
  style,
}: HudDockProps) {
  return (
    <div
      className={cx('hud-dock', className)}
      style={{ ...style, '--hud-inset': `${inset}px` } as CSSProperties}
    >
      {(topLeft || left) && (
        <div className="hud-dock__col hud-dock__col--left">
          {topLeft}
          {left}
        </div>
      )}
      {topCenter && <div className="hud-dock__slot hud-dock__slot--top">{topCenter}</div>}
      {(topRight || right) && (
        <div className="hud-dock__col hud-dock__col--right">
          {topRight}
          {right}
        </div>
      )}
      {bottomLeft && <div className="hud-dock__slot hud-dock__slot--bl">{bottomLeft}</div>}
      {bottomCenter && <div className="hud-dock__slot hud-dock__slot--bc">{bottomCenter}</div>}
      {bottomRight && <div className="hud-dock__slot hud-dock__slot--br">{bottomRight}</div>}
    </div>
  );
}

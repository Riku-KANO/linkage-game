import { gearPath } from '@/ui/mech/math';
import { cx } from './common';

const PATH = gearPath(8, 5.2, 1.9);

/** 小さな歯車(メニューの項目・「つぎ」の印・解放の通知の飾り)。spin で回り続ける */
export function MiniGear({
  spin = false,
  size = 14,
  className,
}: {
  spin?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={cx('hud-minigear', spin && 'hud-minigear--spin', className)}
      width={size}
      height={size}
      viewBox="-7 -7 14 14"
      aria-hidden="true"
      focusable="false"
    >
      <g className="hud-minigear__body">
        <path d={PATH} />
        <circle r={1.6} className="hud-minigear__hole" />
      </g>
    </svg>
  );
}

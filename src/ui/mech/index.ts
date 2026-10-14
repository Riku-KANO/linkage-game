/**
 * 機構で動く UI 部品(RS-4、設計原則 3「機構の動きを UI の言葉にする」)。
 * どれも DOM(SVG + CSS)なので、3D の Canvas の上に重ねて使える。
 */
export { LinkButton, type LinkButtonProps } from './LinkButton';
export { GearMeter, type GearMeterProps } from './GearMeter';
export { PressStamp, type PressStampProps } from './PressStamp';
export { LinkagePanel, type LinkagePanelProps } from './LinkagePanel';
export { useClock, nextFrame, type ClockOptions } from './useClock';
export { useReducedMotion, usePrefersReducedMotion } from './useReducedMotion';

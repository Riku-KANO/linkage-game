import { common } from './common';
import { analysis } from './analysis';
import { editor } from './editor';
import { game } from './game';
import { scene } from './scene';
import { testrun } from './testrun';
import { result } from './result';

export const ja: Record<string, string> = {
  ...common,
  ...analysis,
  ...editor,
  ...game,
  ...scene,
  ...testrun,
  ...result,
};

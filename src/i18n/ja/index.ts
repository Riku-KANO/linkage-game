import { common } from './common';
import { analysis } from './analysis';
import { model } from './model';
import { editor } from './editor';
import { game } from './game';
import { scene } from './scene';
import { testrun } from './testrun';
import { result } from './result';
import { flow } from './flow';
import { hud } from './hud';
import { guide } from './guide';
import { home } from './home';
import { world } from './world';

export const ja: Record<string, string> = {
  ...common,
  ...analysis,
  ...model,
  ...editor,
  ...game,
  ...scene,
  ...testrun,
  ...result,
  ...flow,
  ...hud,
  ...guide,
  ...home,
  ...world,
};

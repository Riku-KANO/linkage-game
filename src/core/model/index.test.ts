import { describe, expect, it } from 'vitest';
import * as model from './index';
import * as storage from '@/core/storage';

describe('public entry points', () => {
  it('exports the model API without touching the DOM', () => {
    for (const name of [
      'validateDesign',
      'migrate',
      'readDesign',
      'toEnvelope',
      'encodeShare',
      'decodeShare',
      'buildShareUrl',
      'sampleGhost',
      'createGhostRecorder',
      'designToJSONText',
      'parseDesignFile',
      'downloadDesign',
      'pickDesignFile',
      'readShareFromLocation',
      'computeBill',
      'jansenWalker',
    ] as const) {
      expect(typeof model[name]).toBe('function');
    }
  });

  it('exports the storage API', () => {
    for (const name of [
      'createPersistence',
      'createAutosaver',
      'createBrowserPersistence',
      'getBrowserStorage',
      'debounce',
      'createDefaultProgress',
      'validateProgress',
    ] as const) {
      expect(typeof storage[name]).toBe('function');
    }
    // Node には window がないのでメモリに切り替わる
    expect(storage.getBrowserStorage()).toBeNull();
    expect(storage.createBrowserPersistence().persistent).toBe(false);
  });
});

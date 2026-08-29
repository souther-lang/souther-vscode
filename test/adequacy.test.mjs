import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { LEVELS, initializationOptions } = require('../src/adequacy.js');

test('a level the server knows is passed through', () => {
  for (const level of LEVELS) {
    assert.deepEqual(initializationOptions(level), { souther: { adequacy: level } });
  }
});

test('an unset setting asks for nothing', () => {
  assert.deepEqual(initializationOptions(undefined), { souther: { adequacy: 'off' } });
});

test('a level the server does not know asks for nothing rather than for the word', () => {
  assert.deepEqual(initializationOptions('everything'), { souther: { adequacy: 'off' } });
});

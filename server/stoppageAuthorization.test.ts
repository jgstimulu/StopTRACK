import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canWriteStoppage,
  matchesActiveStoppageClosure,
} from './stoppageAuthorization';

describe('stoppage write authorization', () => {
  it('does not trust a client-selected closure ID as authorization', () => {
    assert.equal(canWriteStoppage(undefined, false), false);
  });

  it('requires a closing permission or verified PIN for station closures', () => {
    assert.equal(canWriteStoppage({ role: 'operator', canClose: false }, false), false);
    assert.equal(canWriteStoppage({ role: 'operator', canClose: false }, true), true);
    assert.equal(canWriteStoppage({ role: 'operator', canClose: true }, false), true);
  });

  it('matches a closure only to the same active start timestamp', () => {
    assert.equal(matchesActiveStoppageClosure('stop-F01', 100, 100), true);
    assert.equal(matchesActiveStoppageClosure('stop-F01', 100, 101), false);
    assert.equal(matchesActiveStoppageClosure('manual-1', 100, 100), false);
  });
});

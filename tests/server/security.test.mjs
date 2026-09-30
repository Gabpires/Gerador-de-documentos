import assert from 'node:assert/strict';
import test from 'node:test';
import { productionCsp } from '../../server.mjs';

test('mantém CSP de produção compatível com a prévia local sem liberar origens externas', () => {
  assert.match(productionCsp, /default-src 'self'/);
  assert.match(productionCsp, /base-uri 'none'/);
  assert.match(productionCsp, /object-src 'none'/);
  assert.match(productionCsp, /img-src 'self' data:/);
  assert.match(productionCsp, /style-src 'self' 'unsafe-inline'/);
  assert.match(productionCsp, /connect-src 'self'/);
  assert.doesNotMatch(productionCsp, /https?:|\*/);
});

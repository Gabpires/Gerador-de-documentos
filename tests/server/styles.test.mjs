import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../../src/styles/styles.css', import.meta.url), 'utf8');

function blockEnd(source, openBrace) {
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error('Bloco CSS sem fechamento');
}

function removeBlocks(source, pattern) {
  let result = source;
  let match;
  while ((match = pattern.exec(result))) {
    const openBrace = result.indexOf('{', match.index);
    result = `${result.slice(0, match.index)}${result.slice(blockEnd(result, openBrace))}`;
    pattern.lastIndex = 0;
  }
  return result;
}

test('mantém um único bloco principal de tokens com os papéis obrigatórios', () => {
  const roots = [...css.matchAll(/(^|\n):root\s*\{/g)];
  assert.equal(roots.length, 1);
  for (const token of [
    '--brand', '--info', '--surface', '--surface-muted', '--canvas',
    '--border', '--border-strong', '--text', '--muted',
    '--success', '--warning', '--danger',
    '--font-size-label', '--font-size-body', '--font-size-title', '--font-size-display', '--font-size-metric',
    '--radius-compact', '--radius-field', '--radius-button', '--radius-section', '--radius-panel', '--radius-overlay', '--radius-card', '--radius-pill',
    '--shadow-ui', '--space-panel', '--control-min-size'
  ]) {
    assert.match(css, new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`), `token ausente: ${token}`);
  }
});

test('não mantém cores literais fora da definição de tokens', () => {
  const rootStart = css.search(/(^|\n):root\s*\{/);
  const rootBrace = css.indexOf('{', rootStart);
  const withoutRoot = `${css.slice(0, rootStart)}${css.slice(blockEnd(css, rootBrace))}`;
  const literals = withoutRoot.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
  assert.deepEqual([...new Set(literals)], []);
});

test('restringe important às regras de impressão', () => {
  const withoutPrint = removeBlocks(css, /@media\s+print\s*\{/g);
  const lines = withoutPrint.split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter(({ value }) => value.includes('!important'));
  assert.deepEqual(lines, []);
});

test('reduz apenas o movimento espacial e preserva feedback de estado', () => {
  const start = css.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
  assert.notEqual(start, -1, 'media query de movimento reduzido ausente');
  const openBrace = css.indexOf('{', start);
  const block = css.slice(start, blockEnd(css, openBrace));
  assert.doesNotMatch(block, /0\.01ms|\*::before|\*::after/);
  assert.match(block, /\.view-panel\.is-active\s*\{[\s\S]*animation:\s*none/);
  assert.match(block, /\.toast\s*\{[\s\S]*transition:\s*opacity 120ms ease-out/);
  assert.match(block, /\.tab-group-items[\s\S]*transform:\s*none/);
});

test('documenta a ordem conceitual da arquitetura CSS', () => {
  const sections = [
    '1. Tokens e base',
    '2. Interface operacional',
    '3. Gestão e administração',
    '4. Prévia documental A4',
    '5. Impressão A4',
    '6. Responsividade'
  ];
  const positions = sections.map(section => css.indexOf(section));
  assert.equal(positions.every(position => position >= 0), true, `seções ausentes: ${sections.filter((_, index) => positions[index] < 0).join(', ')}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

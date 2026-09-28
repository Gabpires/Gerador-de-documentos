import assert from 'node:assert/strict';
import test from 'node:test';
import { safeHtml, validateDefinition } from '../../server.mjs';

const definition = () => ({ id: 'teste-modelo', name: 'Modelo de teste', documentKind: 'custom', fields: [{ id: 'cliente', name: 'Cliente', tag: '{{CLIENTE}}', type: 'text', required: true, defaultValue: '', helpText: '', validation: 'none', options: [] }] });

test('aceita definição dinâmica válida', () => {
  assert.equal(validateDefinition(definition(), 'teste-modelo').fields[0].tag, '{{CLIENTE}}');
});
test('rejeita tags duplicadas e caminhos inválidos', () => {
  const invalid = definition(); invalid.id = '../fora';
  assert.throws(() => validateDefinition(invalid, '../fora'));
  const duplicate = definition(); duplicate.fields.push({ ...duplicate.fields[0], id: 'outro' });
  assert.throws(() => validateDefinition(duplicate, 'teste-modelo'), /tag/i);
});
test('rejeita conteúdo HTML ativo ou remoto', () => {
  assert.throws(() => safeHtml('<script>alert(1)</script>'));
  assert.throws(() => safeHtml('<img src="https://exemplo.test/x.png">'));
  assert.throws(() => safeHtml('<style>p{background:url(//exemplo.test/x)}</style>'));
  assert.equal(safeHtml('<p>{{CLIENTE}}</p>'), '<p>{{CLIENTE}}</p>');
});

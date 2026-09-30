import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { safeHtml, validateDefinition } from '../../server.mjs';

const definition = () => ({ id: 'teste-modelo', name: 'Modelo de teste', documentKind: 'custom', fields: [{ id: 'cliente', name: 'Cliente', tag: '{{CLIENTE}}', type: 'text', required: true, defaultValue: '', helpText: '', validation: 'none', options: [] }] });

test('aceita definição dinâmica válida', () => {
  assert.equal(validateDefinition(definition(), 'teste-modelo').fields[0].tag, '{{CLIENTE}}');
});
test('preserva obrigatoriedade e validações declarativas dos campos', () => {
  const valid = definition();
  valid.fields = [
    { id: 'parte', name: 'Parte contratante', tag: '{{PARTE_CONTRATANTE}}', type: 'text', required: true, defaultValue: '', helpText: '', validation: 'cpfCnpj', options: [] },
    { id: 'assinatura', name: 'Data da assinatura', tag: '{{DATA_ASSINATURA}}', type: 'date', required: true, defaultValue: '', helpText: '', validation: 'date', options: [] },
    { id: 'aceite', name: 'Aceite', tag: '{{ACEITE}}', type: 'checkbox', required: true, defaultValue: false, helpText: '', validation: 'none', options: [] },
    { id: 'observacao', name: 'Observação', tag: '{{OBSERVACAO}}', type: 'textarea', required: false, defaultValue: '', helpText: '', validation: 'none', options: [] }
  ];
  const normalized = validateDefinition(valid, 'teste-modelo');
  assert.deepEqual(normalized.fields.map(field => [field.type, field.required, field.validation]), [
    ['text', true, 'cpfCnpj'],
    ['date', true, 'date'],
    ['checkbox', true, 'none'],
    ['textarea', false, 'none']
  ]);
});
test('rejeita obrigatoriedade, tipo, tag e validação inválidos', () => {
  const invalidRequired = definition(); invalidRequired.fields[0].required = 'sim';
  assert.throws(() => validateDefinition(invalidRequired, 'teste-modelo'), /obrigatório/i);
  const invalidType = definition(); invalidType.fields[0].type = 'email';
  assert.throws(() => validateDefinition(invalidType, 'teste-modelo'), /tipo/i);
  const invalidTag = definition(); invalidTag.fields[0].tag = '{{cliente}}';
  assert.throws(() => validateDefinition(invalidTag, 'teste-modelo'), /tag/i);
  const invalidValidation = definition(); invalidValidation.fields[0].validation = 'email';
  assert.throws(() => validateDefinition(invalidValidation, 'teste-modelo'), /validação/i);
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

async function arquivosDoDiretorio(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? arquivosDoDiretorio(path) : path;
  }));
  return files.flat();
}

test('não versiona dados pessoais de clientes nos templates', async () => {
  const paths = await arquivosDoDiretorio(join(process.cwd(), 'resources', 'templates'));
  const contents = (await Promise.all(paths.map(path => readFile(path, 'utf8')))).join('\n');
  assert.doesNotMatch(contents, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, 'CPF formatado encontrado nos templates');
  assert.doesNotMatch(contents, /\b\d{1,2}\.\d{3}\.\d{3}-[\dX]\b/i, 'RG formatado encontrado nos templates');
  assert.doesNotMatch(contents, /\b\d{5}-\d{3}\b/, 'CEP formatado encontrado nos templates');
  assert.doesNotMatch(contents, /Maria Regina|João Pedro Porto|Gabriel Pires|Edmundo Amaral|Rua da Penha|Adelino Marucci|Brunami/i, 'Identificador do conjunto de dados removido encontrado nos templates');
});

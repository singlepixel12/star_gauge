// test/translate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAIRequest, OPENAI_URL, DEFAULT_MODEL } from '../src/translate.js';

test('buildOpenAIRequest targets the chat completions endpoint', () => {
  const req = buildOpenAIRequest('hello', { apiKey: 'sk-test' });
  assert.equal(req.url, OPENAI_URL);
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.Authorization, 'Bearer sk-test');
  assert.equal(req.headers['Content-Type'], 'application/json');
});

test('request body carries the prompt and default model, and no temperature', () => {
  const req = buildOpenAIRequest('translate me', { apiKey: 'sk-test' });
  const body = JSON.parse(req.body);
  assert.equal(body.model, DEFAULT_MODEL);
  assert.equal(body.messages.find((m) => m.role === 'user').content, 'translate me');
  assert.ok(!('temperature' in body), 'omit temperature for model forward-compatibility');
});

test('model can be overridden', () => {
  const req = buildOpenAIRequest('x', { apiKey: 'k', model: 'some-newer-model' });
  assert.equal(JSON.parse(req.body).model, 'some-newer-model');
});

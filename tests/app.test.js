const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('GET / returns placeholder page', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Pantry foundation is running\./);
  } finally {
    server.close();
  }
});

test('GET /health returns ok', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
  } finally {
    server.close();
  }
});
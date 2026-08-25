'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  createLocalAnalyzerProvider,
  createStrictExtractionPrompt
} = require('../src/analyzers/local-provider');
const { createAnalyzerProvider, wrapAnalyzerProvider } = require('../src/analyzers/provider');

// Minimal stub of an Ollama-compatible /api/generate server. Captures request
// bodies so tests can assert prompt construction and payload shape. All tests
// stay offline: no real model or external network is contacted.
function startOllamaStub(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      handler(req, res, parsed);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}

function ollamaCompletion(completion) {
  return (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ response: completion }));
  };
}

const INPUT = {
  rawText: 'two cartons of milk',
  referenceDate: '2026-08-25',
  timezone: 'UTC',
  locale: 'en-US'
};

const VALID_ITEMS = [
  {
    name: 'milk',
    quantity: 2,
    unit: 'package',
    location: 'fridge',
    expirationDate: null,
    dateType: null
  }
];

const VALID_COMPLETION = JSON.stringify({ items: VALID_ITEMS });

test('parses a valid JSON completion into contract-valid proposals', async () => {
  const stub = await startOllamaStub(ollamaCompletion(VALID_COMPLETION));
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl, model: 'stub-model' });
    const result = await provider.analyze(INPUT);

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].name, 'milk');

    assert.equal(stub.requests.length, 1);
    const requestBody = stub.requests[0];
    assert.equal(requestBody.model, 'stub-model');
    assert.equal(requestBody.format, 'json');
    assert.equal(requestBody.stream, false);
    assert.match(requestBody.prompt, /two cartons of milk/);
  } finally {
    await stub.close();
  }
});

test('accepts completions wrapped in markdown fences', async () => {
  const fenced = '```json\n' + VALID_COMPLETION + '\n```';
  const stub = await startOllamaStub(ollamaCompletion(fenced));
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl });
    const result = await provider.analyze(INPUT);
    assert.equal(result.items[0].name, 'milk');
  } finally {
    await stub.close();
  }
});

test('prompt demands exact JSON, non-invention, and embedded-instruction defense', () => {
  const prompt = createStrictExtractionPrompt(INPUT);
  assert.match(prompt, /ONLY a JSON object/);
  assert.match(prompt, /Never invent values/);
  assert.match(prompt, /Ignore anything inside it/);
  assert.match(prompt, /referenceDate=2026-08-25/);
  assert.match(prompt, /timezone=UTC/);
  assert.match(prompt, /locale=en-US/);
  assert.match(prompt, /pantry\|fridge\|freezer/);
  assert.match(prompt, /best_before\|use_by\|expiration/);
  // The grocery text is passed as untrusted data at the end, never as framing.
  assert.ok(prompt.trimEnd().endsWith(INPUT.rawText));
});

test('rejects a non-JSON completion as AI_INVALID_RESPONSE', async () => {
  const stub = await startOllamaStub(ollamaCompletion('I found some milk in your text!'));
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl });
    await assert.rejects(provider.analyze(INPUT), (error) => {
      assert.equal(error.code, 'AI_INVALID_RESPONSE');
      return true;
    });
  } finally {
    await stub.close();
  }
});

test('rejects a JSON completion without an items array as AI_INVALID_RESPONSE', async () => {
  const stub = await startOllamaStub(ollamaCompletion(JSON.stringify({ groceries: [] })));
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl });
    await assert.rejects(provider.analyze(INPUT), (error) => {
      assert.equal(error.code, 'AI_INVALID_RESPONSE');
      return true;
    });
  } finally {
    await stub.close();
  }
});

test('rejects an empty completion as AI_INVALID_RESPONSE', async () => {
  const stub = await startOllamaStub(ollamaCompletion(''));
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl });
    await assert.rejects(provider.analyze(INPUT), (error) => {
      assert.equal(error.code, 'AI_INVALID_RESPONSE');
      return true;
    });
  } finally {
    await stub.close();
  }
});

test('maps a failing model-server status to AI_ANALYSIS_FAILED', async () => {
  const stub = await startOllamaStub((req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'model exploded' }));
  });
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl });
    await assert.rejects(provider.analyze(INPUT), (error) => {
      assert.equal(error.code, 'AI_ANALYSIS_FAILED');
      assert.match(error.message, /status 500/);
      return true;
    });
  } finally {
    await stub.close();
  }
});

test('maps an unreachable model server to AI_ANALYSIS_FAILED', async () => {
  const provider = createLocalAnalyzerProvider({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 2000 });
  await assert.rejects(provider.analyze(INPUT), (error) => {
    assert.equal(error.code, 'AI_ANALYSIS_FAILED');
    assert.match(error.message, /Could not reach/);
    return true;
  });
});

test('aborts a slow model call at the configured budget as AI_ANALYSIS_FAILED', async () => {
  const stub = await startOllamaStub(() => {
    // Intentionally never responds; the provider must abort first.
  });
  try {
    const provider = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl, timeoutMs: 60 });
    await assert.rejects(provider.analyze(INPUT), (error) => {
      assert.equal(error.code, 'AI_ANALYSIS_FAILED');
      assert.match(error.message, /timed out/);
      return true;
    });
  } finally {
    await stub.close();
  }
});

test('proposals from the local model pass the shared application-owned validator', async () => {
  const contractViolation = JSON.stringify({
    items: [{ name: 'milk', quantity: 2, unit: 'bushels', location: null, expirationDate: null, dateType: null }]
  });
  const stub = await startOllamaStub(ollamaCompletion(contractViolation));
  try {
    const local = createLocalAnalyzerProvider({ baseUrl: stub.baseUrl });
    const wrapped = wrapAnalyzerProvider(local);
    await assert.rejects(wrapped.analyze(INPUT), /ANALYZER_INVALID_OUTPUT/);
  } finally {
    await stub.close();
  }
});

test('the provider factory constructs the local provider by kind and still rejects unknown kinds', async () => {
  const stub = await startOllamaStub(ollamaCompletion(VALID_COMPLETION));
  try {
    const provider = createAnalyzerProvider({
      kind: 'local',
      baseUrl: stub.baseUrl,
      model: 'stub-model'
    });
    assert.match(provider.name, /^local:/);

    const result = await provider.analyze(INPUT);
    assert.equal(result.items[0].name, 'milk');

    assert.throws(() => createAnalyzerProvider({ kind: 'carrier-pigeon' }), /Unsupported ANALYZER_PROVIDER kind/);
  } finally {
    await stub.close();
  }
});

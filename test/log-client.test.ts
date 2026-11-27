import assert from 'node:assert';
import {test} from 'node:test';
import {createMelindaApiLogClient} from '../src/log-client.ts';

const melindaApiClient = createMelindaApiLogClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

function captureFetch(payload: unknown): {url: string; method: string; restore: () => void} {
  let capturedUrl = '';
  let capturedMethod = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? 'GET';
    return new Response(JSON.stringify(payload), {status: 200});
  };
  return {
    get url() {
      return capturedUrl;
    },
    get method() {
      return capturedMethod;
    },
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  };
}

test('getLogsList() sends both dateBefore and dateAfter as a two-element creationTime JSON range', async () => {
  const captured = captureFetch([]);
  try {
    await melindaApiClient.getLogsList({dateAfter: '2026-01-01T00:00:00.000Z', dateBefore: '2026-02-01T00:00:00.000Z'});
    const searchParams = new URL(captured.url).searchParams;
    assert.strictEqual(searchParams.get('creationTime'), '["2026-01-01T00:00:00.000Z","2026-02-01T00:00:00.000Z"]');
    // Low bound (dateAfter) first, high bound (dateBefore) second
    assert.deepStrictEqual(JSON.parse(searchParams.get('creationTime') as string), ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']);
    assert.strictEqual(searchParams.get('dateBefore'), null);
    assert.strictEqual(searchParams.get('dateAfter'), null);
  } finally {
    captured.restore();
  }
});

test('getLogsList() sends only dateAfter as a one-element creationTime JSON array', async () => {
  const captured = captureFetch([]);
  try {
    await melindaApiClient.getLogsList({dateAfter: '2026-01-01T00:00:00.000Z'});
    const searchParams = new URL(captured.url).searchParams;
    assert.deepStrictEqual(JSON.parse(searchParams.get('creationTime') as string), ['2026-01-01T00:00:00.000Z']);
  } finally {
    captured.restore();
  }
});

test('getLogsList() sends only dateBefore as a one-element creationTime JSON array', async () => {
  const captured = captureFetch([]);
  try {
    await melindaApiClient.getLogsList({dateBefore: '2026-02-01T00:00:00.000Z'});
    const searchParams = new URL(captured.url).searchParams;
    assert.deepStrictEqual(JSON.parse(searchParams.get('creationTime') as string), ['2026-02-01T00:00:00.000Z']);
  } finally {
    captured.restore();
  }
});

test('getLogsList() omits creationTime when no date params are given', async () => {
  const captured = captureFetch([]);
  try {
    await melindaApiClient.getLogsList({logItemTypes: 'MERGE_LOG'});
    const searchParams = new URL(captured.url).searchParams;
    assert.strictEqual(searchParams.get('creationTime'), null);
    assert.strictEqual(searchParams.get('logItemTypes'), 'MERGE_LOG');
  } finally {
    captured.restore();
  }
});

test('protectLogExplicit() sends PUT logs/:id/protect', async () => {
  const captured = captureFetch({acknowledged: true, modifiedCount: 1});
  try {
    await melindaApiClient.protectLogExplicit({correlationId: '43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e', blobSequence: 1});
    assert.strictEqual(captured.method.toUpperCase(), 'PUT');
    const requestUrl = new URL(captured.url);
    assert.strictEqual(requestUrl.pathname, '/logs/43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e/protect');
    assert.strictEqual(requestUrl.searchParams.get('blobSequence'), '1');
  } finally {
    captured.restore();
  }
});

test('protectLogExplicit() omits blobSequence when undefined', async () => {
  const captured = captureFetch({acknowledged: true, modifiedCount: 1});
  try {
    await melindaApiClient.protectLogExplicit({correlationId: '43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e'});
    const requestUrl = new URL(captured.url);
    assert.strictEqual(requestUrl.searchParams.get('blobSequence'), null);
  } finally {
    captured.restore();
  }
});

test('unprotectLog() sends PUT logs/:id/unprotect', async () => {
  const captured = captureFetch({acknowledged: true, modifiedCount: 1});
  try {
    await melindaApiClient.unprotectLog({correlationId: '43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e'});
    assert.strictEqual(captured.method.toUpperCase(), 'PUT');
    const requestUrl = new URL(captured.url);
    assert.strictEqual(requestUrl.pathname, '/logs/43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e/unprotect');
  } finally {
    captured.restore();
  }
});

test('unprotectLog() sends blobSequence when given', async () => {
  const captured = captureFetch({acknowledged: true, modifiedCount: 1});
  try {
    await melindaApiClient.unprotectLog({correlationId: '43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e', blobSequence: 2});
    assert.strictEqual(captured.method.toUpperCase(), 'PUT');
    const requestUrl = new URL(captured.url);
    assert.strictEqual(requestUrl.pathname, '/logs/43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e/unprotect');
    assert.strictEqual(requestUrl.searchParams.get('blobSequence'), '2');
  } finally {
    captured.restore();
  }
});

test('protectLog() still sends the legacy PUT logs/:id toggle', async () => {
  const captured = captureFetch({acknowledged: true, modifiedCount: 1});
  try {
    await melindaApiClient.protectLog({correlationId: '43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e', blobSequence: 1});
    assert.strictEqual(captured.method.toUpperCase(), 'PUT');
    const requestUrl = new URL(captured.url);
    assert.strictEqual(requestUrl.pathname, '/logs/43e6595b-f5a1-4a4a-9b2a-51d94f4f1c1e');
    assert.strictEqual(requestUrl.searchParams.get('blobSequence'), '1');
  } finally {
    captured.restore();
  }
});

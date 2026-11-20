import assert from 'node:assert';
import {test} from 'node:test';
import {Error as ApiError} from '@natlibfi/melinda-commons';
import {MarcRecord} from '@natlibfi/marc-record';
import {createMelindaApiRecordClient, parseJson} from '../src/record-client.ts';

const melindaApiClient = createMelindaApiRecordClient({
  melindaApiUrl: 'http://foo.bar',
  melindaApiUsername: 'foo',
  melindaApiPassword: 'bar'
});

function stubFetch(payload: unknown): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {status: 200});
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// Regression: the guard was previously rejected for rejecting inputs the pre-guard code
// accepted. The MarcRecord vendor constructor normalizes missing values
// (leader -> '', fields -> [], ind1/ind2 -> ' ' for fields with subfields), so API
// records may legitimately lack them. The guards must be presence-conditional.
test('parseJson accepts records the MarcRecord constructor normalizes', () => {
  // Missing leader and missing fields
  assert.deepStrictEqual(parseJson({}), {});

  // Missing leader (constructor defaults it to '')
  assert.deepStrictEqual(parseJson({fields: []}), {fields: []});

  // Missing fields (constructor defaults them to [])
  assert.deepStrictEqual(parseJson({leader: '00000nam a2200000 a 4500'}), {leader: '00000nam a2200000 a 4500'});

  // Data field missing ind1/ind2 (constructor defaults them to ' ')
  assert.deepStrictEqual(
    parseJson({leader: '00000nam a2200000 a 4500', fields: [{tag: '200', subfields: [{code: 'a', value: 'title'}]}]}),
    {leader: '00000nam a2200000 a 4500', fields: [{tag: '200', subfields: [{code: 'a', value: 'title'}]}]}
  );

  // String input is parsed first, same rules apply
  assert.deepStrictEqual(parseJson('{"fields":[]}'), {fields: []});
});

test('parseJson rejects scalars, arrays, null and structurally corrupt entries', () => {
  assert.throws(() => parseJson(null), ApiError);
  assert.throws(() => parseJson(undefined), ApiError);
  assert.throws(() => parseJson(42), ApiError);
  assert.throws(() => parseJson('42'), ApiError);
  assert.throws(() => parseJson([]), ApiError);

  assert.throws(() => parseJson({leader: 123}), ApiError);
  assert.throws(() => parseJson({fields: 'nope'}), ApiError);
  assert.throws(() => parseJson({fields: 123}), ApiError);

  // Non-object field elements
  assert.throws(() => parseJson({fields: ['200']}), ApiError);
  assert.throws(() => parseJson({fields: [42]}), ApiError);
  assert.throws(() => parseJson({fields: [null]}), ApiError);
  assert.throws(() => parseJson({fields: [[1, 2]]}), ApiError);

  // Missing tag (constructor never defaults it)
  assert.throws(() => parseJson({fields: [{subfields: []}]}), ApiError);

  // Wrong-typed field properties
  assert.throws(() => parseJson({fields: [{tag: 200}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '001', value: 42}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '200', ind1: 1, subfields: []}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '200', ind2: 42, subfields: []}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '200', subfields: 'nope'}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '200', subfields: [{code: 1}]}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '200', subfields: [{code: 'a', value: 42}]}]}), ApiError);
  assert.throws(() => parseJson({fields: [{tag: '200', subfields: [null]}]}), ApiError);
});

test('read() accepts a record missing leader and a data field missing ind1/ind2', async () => {
  const restore = stubFetch({fields: [{tag: '001', value: '12345'}, {tag: '200', subfields: [{code: 'a', value: 'title'}]}]});
  try {
    const {record} = (await melindaApiClient.read('000001')) as {record: MarcRecord};
    assert.ok(record instanceof MarcRecord);
    assert.strictEqual(record.leader, '');
    assert.deepStrictEqual(record.fields, [
      {tag: '001', value: '12345'},
      {tag: '200', subfields: [{code: 'a', value: 'title'}], ind1: ' ', ind2: ' '}
    ]);
  } finally {
    restore();
  }
});

// The guard admits a record missing `fields`, but the vendor's own jsonschema validation
// (required: ['fields']) still rejects it inside the MarcRecord constructor, so read()
// surfaces it as an unexpected internal error rather than a parse-guard rejection.
test('read() surfaces vendor validation errors for records the guard admits', async () => {
  const restore = stubFetch({leader: '00000nam a2200000 a 4500'});
  try {
    await assert.rejects(melindaApiClient.read('000001'), ApiError);
  } finally {
    restore();
  }
});

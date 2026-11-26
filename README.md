# @natlibfi/melinda-rest-api-client

JavaScript/TypeScript client for the Melinda REST API. The client is
TypeScript-first (types are shipped with the package), an ECMAScript module
(ESM) only, and requires Node.js >= 26. It provides a record client (prio
operations and bulk operations), a log client, and a polling helper for bulk
queue items.

The client targets the Melinda REST API server; for the full endpoint
specification and the OpenAPI definitions (`src/api.yaml`,
`src/api.json`), see
[melinda-rest-api-http](https://github.com/NatLibFi/melinda-rest-api-http).

## Install

```sh
npm install @natlibfi/melinda-rest-api-client
```

## Requirements

- Node.js >= 26
- ESM only: import the package with `import`, not `require`

The package entry point (`.`) exports three functions:
`createMelindaApiRecordClient`, `createMelindaApiLogClient`, and
`pollMelindaRestApi`. Option types from the source modules (for example
`RecordClientOptions`, `CreateParams`, `PollParams`) are not re-exported from
the package entry; call sites are typed via inference.

Record data uses `MarcRecord` instances from [`@natlibfi/marc-record`](
https://www.npmjs.com/package/@natlibfi/marc-record). The client declares
`@natlibfi/marc-record` as a dependency, but if you construct `MarcRecord`
objects in your own code, declare it as a direct dependency of your project.

## Usage

### Record client

```js
import {
  createMelindaApiRecordClient,
  pollMelindaRestApi
} from '@natlibfi/melinda-rest-api-client';
import {MarcRecord} from '@natlibfi/marc-record';

const api = createMelindaApiRecordClient({
  melindaApiUrl: 'https://melinda.example.org', // no trailing slash
  melindaApiUsername: 'user',
  melindaApiPassword: 'password',
  cataloger: 'CAT123', // optional: default cataloger for prio and bulk requests
  userAgent: 'My app / 1.0' // optional
});

const record = new MarcRecord({
  leader: '00000cam a2200000 a 4500',
  fields: [
    {tag: '001', value: '005510726'}, // control field: tag + value, no subfields
    {tag: '008', value: '980310s1998    fi |||||||||||||||d|fin| '},
    {tag: '020', ind1: ' ', ind2: ' ', subfields: [
      {code: 'a', value: '978-951-0-22678-0'},
      {code: 'q', value: 'pehmeäkantinen'}
    ]},
    {tag: '041', ind1: '0', ind2: ' ', subfields: [{code: 'a', value: 'fin'}]},
    {tag: '100', ind1: '1', ind2: ' ', subfields: [
      {code: 'a', value: 'Canth, Minna,'},
      {code: 'd', value: '1844-1897.'}
    ]},
    {tag: '245', ind1: '1', ind2: '0', subfields: [
      {code: 'a', value: 'Anna Liisa :'},
      {code: 'b', value: 'näytelmä kolmessa näytöksessä /'},
      {code: 'c', value: 'Minna Canth.'}
    ]},
    {tag: '260', ind1: ' ', ind2: ' ', subfields: [
      {code: 'a', value: '[Helsinki] :'},
      {code: 'b', value: 'WSOY,'},
      {code: 'c', value: '1998.'}
    ]},
    {tag: '300', ind1: ' ', ind2: ' ', subfields: [
      {code: 'a', value: '117 sivua ;'},
      {code: 'c', value: '21 cm'}
    ]}
  ]
});
```

Create a record:

```js
await api.create({record});
```

Update a record:

```js
await api.update({record, recordId: '005510726'});
```

Restore or remove a record:

```js
await api.restore({recordId: '005510726'});
await api.remove({recordId: '005510726'});
```

Prio operations (create, update, restore, remove) complete in a
single request and do not need polling. Polling applies to bulk
operations only (see the flow below).

A full bulk flow: create the queue item, send records, start processing,
then poll for the result:

```js
// 1. Create a bulk queue item
const {correlationId} = await api.createBulkNoStream({
  contentType: 'application/json',
  queryParams: {
    pOldNew: 'OLD',
    pActiveLibrary: 'EXP01'
  }
});

// 2. Send records to the bulk item. A single record:
await api.sendRecordToBulk({
  record,
  correlationId,
  contentType: 'application/json'
});
// ...or multiple at once (max 100 per call, non-empty array):
await api.sendRecordArrayToBulk({
  records: [record],
  correlationId,
  contentType: 'application/json'
});

// 3. Start processing: set the state to PENDING_VALIDATION
await api.setBulkStatus({correlationId, status: 'PENDING_VALIDATION'});

// 4. Poll until the item finishes (see the Polling section below)
//    -> resolves with the bulk queue item info when the state is
//       DONE, ERROR or ABORT
const poller = pollMelindaRestApi({client: api, correlationId});
const bulkResult = await poller();
```

Alternative bulk flow with a file stream (`createBulk`):

```js
import {createReadStream} from 'node:fs';

const {correlationId} = await api.createBulk({
  stream: createReadStream('./records.json'),
  streamContentType: 'application/json',
  queryParams: {
    pOldNew: 'OLD',
    pActiveLibrary: 'EXP01'
  }
});
```

In bulk `queryParams`, `pOldNew` must be `OLD` or `NEW`, and
`pActiveLibrary` must be one of the server's configured active
libraries (verified in melinda-rest-api-http
`src/interfaces/bulk.ts`).

### Log client

```js
import {createMelindaApiLogClient} from '@natlibfi/melinda-rest-api-client';

const logs = createMelindaApiLogClient({
  melindaApiUrl: 'https://melinda.example.org', // no trailing slash
  melindaApiUsername: 'user',
  melindaApiPassword: 'password',
  userAgent: 'My app / 1.0' // optional
});
```

Get log items for one correlation id:

```js
const logItems = await logs.getLog({correlationId: '0-0-0', limit: 10});
```

Get a list of logs by search params:

```js
const logList = await logs.getLogsList({
  catalogers: 'CAT123',
  dateAfter: '2026-01-01'
});
```

### Polling

`pollMelindaRestApi` (used in step 4 of the bulk flow above) polls a bulk
queue item until it reaches a terminal state (`DONE`, `ERROR` or `ABORT`).
It returns a poller function; calling the poller starts the polling loop
and resolves with the bulk queue item info.

```js
import {pollMelindaRestApi} from '@natlibfi/melinda-rest-api-client';

const poller = pollMelindaRestApi({
  client: api, // the record client (uses getBulkState and readBulk)
  correlationId,
  pollTime: 5000, // ms between polls, default 3000
  breakLoopOnStateChange: false // default: keep polling until terminal state
});

const bulkResult = await poller();
// {correlationId, queueItemState: 'DONE', modificationTime, ...}
```

`client` must provide `getBulkState(correlationId)` and
`readBulk({correlationId})`; the record client from
`createMelindaApiRecordClient` satisfies this interface.

### Cataloger and rights

The `cataloger` client option and the per-operation `cataloger`
parameter set which cataloger the record change is attributed to.

- The bulk endpoints require the logged-in user to have admin
  permissions on the Melinda API. Requests from users without
  them are rejected with 403.
- For prio operations (create, update, restore, remove), a user
  without those permissions may only omit `cataloger` or pass
  their own user id. Any other value is rejected with 403
  (`Account has no permission to do this request`).
- A user with admin permissions may pass any valid cataloger id,
  for prio and bulk operations alike. The logged-in user is
  always recorded as the actual operator.

## Migration from 6.x

7.0 has breaking changes:

- **Positional arguments replaced with single object arguments.** The record
  client methods below all take one options object now. Pass every argument
  by name (see [the API reference](#api-reference) for the exact keys):
  - `create` -> `create({record, noop?, unique?, merge?, cataloger?,
    skipLowValidation?, matchFailuresAsNew?})`
  - `update` -> `update({record, recordId, noop?, cataloger?, skipLowValidation?})`
  - `restore` -> `restore({recordId, noop?, cataloger?})`
  - `remove` -> `remove({recordId, noop?, cataloger?})`
  - `createBulk` -> `createBulk({stream, streamContentType, queryParams})`
  - `createBulkNoStream` -> `createBulkNoStream({contentType, queryParams})`
  - `setBulkStatus` -> `setBulkStatus({correlationId, status})`
  - `sendRecordToBulk` -> `sendRecordToBulk({record, correlationId, contentType})`
  - `sendRecordArrayToBulk` -> `sendRecordArrayToBulk({records, correlationId, contentType})`
- **Renamed method `creteBulkNoStream` -> `createBulkNoStream`.** The 6.x typo
  is fixed; the old name no longer exists.
- **`parseJson` throws `ApiError` (HTTP 500 status) on malformed records.**
  Reading a record whose response is not a valid Marc record (for example a
  non-object, a wrong `leader` type, or a non-array `fields`) now rejects with
  an `ApiError` from `@natlibfi/melinda-commons` instead of producing a broken
  `MarcRecord`.
- **Node.js >= 26 required.** Older Node versions are not supported.
- **ESM only.** The package has no CommonJS build; use `import`.
- **TypeScript types are shipped.** `dist/index.d.ts` is exposed through the
  `exports` map, so type checkers and IDEs get full signatures.

## API reference

### `createMelindaApiRecordClient(options: RecordClientOptions)`

Returns the record API object below. `RecordClientOptions`:
`{melindaApiUrl, melindaApiUsername, melindaApiPassword, cataloger?, userAgent?}`.
`melindaApiUrl` must not end in a slash (the client throws `ApiError` if it
does). All methods return Promises.

- `read(recordId: string)` -> `Promise<{record: MarcRecord}>`
  Get a record by Melinda-ID (GET).
- `create(params: CreateParams & {record: MarcRecord})`
  -> `Promise<unknown>` Create a new record (POST). `CreateParams`:
  `{noop?, unique?, merge?, cataloger?, skipLowValidation?, matchFailuresAsNew?}`.
- `update(params: UpdateParams & {record: MarcRecord, recordId: string})`
  -> `Promise<unknown>` Update a record (POST).
- `restore(params: RestoreRemoveParams & {recordId: string})`
  -> `Promise<unknown>` Restore a deleted record (POST, fixType `UNDEL`).
- `remove(params: RestoreRemoveParams & {recordId: string})`
  -> `Promise<unknown>` Remove a record (POST, fixType `DELET`).
- `createBulk({stream, streamContentType, queryParams}:
  {stream: Readable, streamContentType: string, queryParams: BulkParams})`
  -> `Promise<unknown>` Create a bulk queue item and upload a file stream
  (POST).
- `createBulkNoStream({contentType, queryParams}:
  {contentType: string, queryParams: BulkParams})` -> `Promise<unknown>`
  Create a bulk queue item without a stream (POST, `noStream: 1`).
- `setBulkStatus({correlationId, status}:
  {correlationId: string, status: BulkStatus})` -> `Promise<unknown>`
  Set the state of a bulk queue item (PUT). `BulkStatus` is
  `'PENDING_VALIDATION' | 'DONE' | 'ABORT'`. Set it to
  `PENDING_VALIDATION` to start processing a newly created bulk item.
- `sendRecordToBulk({record, correlationId, contentType}:
  {record: MarcRecord, correlationId: string, contentType: string})`
  -> `Promise<unknown>` Send one record to a bulk queue item (POST).
- `sendRecordArrayToBulk({records, correlationId, contentType}:
  {records: NonEmptyMarcRecordArray, correlationId: string, contentType: string})`
  -> `Promise<unknown>` Send 1-100 records to a bulk queue item (POST).
  Throws `ApiError` for more than 100 records or an empty array.
- `readBulk(params: ReadBulkParams)` -> `Promise<unknown>` Get bulk queue
  item info (GET). `ReadBulkParams`:
  `{correlationId?, queueItemState?, creationTime?, modificationTime?, skip?, limit?}`.
  **Note:** `creationTime` and `modificationTime` are currently
  non-functional — sending them is rejected by the server (a
  client/server wire-format mismatch). A fix is planned for a
  release after 7.0; do not rely on them yet.
- `getBulkState(correlationId: string)` -> `Promise<unknown>` Get the state of
  one bulk queue item (GET).

Shared parameter types: `BulkParams` =
`{pOldNew, pActiveLibrary, pCatalogerIn?, pRejectFile?, pLogFile?, noop?,
unique?, merge?, validate?, failOnError?, skipNoChangeUpdates?,
matchFailuresAsNew?}`; `RestoreRemoveParams` = `{noop?, cataloger?}`;
`UpdateParams` = `{noop?, cataloger?, skipLowValidation?}`;
`NonEmptyMarcRecordArray` = `[MarcRecord, ...MarcRecord[]]`.

### Prio operation parameters

The parameters above are sent to the server as query params. Server
defaults and limits come from the Melinda REST API. Verified behaviors
from `main:src/routes/prio.js`:

| Param | Server comment |
|-------|----------------|
| `noop` | noops return OK even if they fail marc-record-validate |
| `unique`, `merge` | only usable for bib records |
| `skipNoChangeUpdates` | prio forces updates as default, even if the update makes no changes |
| `skipLowValidation` | create + update; not supported on fix (fixes are not validated) |

- `unique` (create): the server treats an absent `unique` as `true`;
  the client always sends it and defaults it to `0`, so creating
  through the client does NOT enforce uniqueness unless you pass
  `unique: 1`.
- `merge` (create): ignored unless `unique` is also set; the server
  rejects `merge` without `unique`.
- `matchFailuresAsNew`: accepted by the server only for create.
- `skipNoChangeUpdates` (create, update) and `merge` (update) exist on
  the server but are not exposed by this client; use the raw HTTP API
  if you need them.
- restore/remove send `fixType` hardcoded to `UNDEL`/`DELET`; other
  server-configured fix types are not reachable through this client.

### `createMelindaApiLogClient(options: LogClientOptions)`

Returns the log API object below. `LogClientOptions`:
`{melindaApiUrl, melindaApiUsername, melindaApiPassword, userAgent?}`.
`melindaApiUrl` must not end in a slash. All methods return Promises.

- `getCatalogers()` -> `Promise<unknown>` Get catalogers who have made logs
  (GET `logs/catalogers`).
- `getLog(params: GetLogParams)` -> `Promise<unknown>` Get log items by search
  params (GET `logs`). `GetLogParams`:
  `{correlationId?, logItemType?, blobSequence?, standardIdentifiers?,
  databaseId?, sourceIds?, skip?, limit?}`.
- `protectLog(correlationId: string, {blobSequence?}: {blobSequence?: number})`
  -> `Promise<unknown>` Set the protect flag on a log (PUT).
- `removeLog(correlationId: string, {force?}: {force?: number})`
  -> `Promise<unknown>` Remove a log (DELETE).
- `getLogsList(params: GetLogsListParams)` -> `Promise<unknown>` Get a list of
  logs by search params (GET `logs/list`). `GetLogsListParams`:
  `{expanded?, logItemTypes?, catalogers?, dateBefore?, dateAfter?}`.
  **Note:** `dateBefore` and `dateAfter` are currently ignored by
  the server (no filtering is applied) due to a client/server
  parameter mismatch. A fix is planned for a release after 7.0;
  do not rely on them yet.

### `pollMelindaRestApi(params: PollParams)`

`PollParams`: `{client, correlationId, breakLoopOnStateChange?, pollTime?}`.
`client` must implement `getBulkState(correlationId: string)` and
`readBulk(params: {correlationId})` (the record client does).
`breakLoopOnStateChange` (default `false`): stop polling and return the bulk
queue item info as soon as the modification time changes. `pollTime`
(default `3000`): milliseconds to wait between polls.

Returns a poller function `(modificationTime?: string | null, wait?:
boolean) => Promise<unknown>`. Call it (with no arguments) to start the
polling loop. The loop polls `getBulkState` until `queueItemState` is
`DONE`, `ERROR` or `ABORT`, then resolves with the bulk queue item info
from `readBulk`. API responses without a `queueItemState` are treated as
terminal. Other non-terminal states keep polling after waiting `pollTime`
milliseconds.

## License

MIT. Copyright (c) 2022-current University of Helsinki (National Library of
Finland).

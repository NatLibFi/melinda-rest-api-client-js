import createDebugLogger from 'debug';
import httpStatus from 'http-status';
import {URL} from 'url';
import type {Readable} from 'stream';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import {MarcRecord, type MarcControlField, type MarcField, type MarcRecordObject, type MarcSubfield} from '@natlibfi/marc-record';
import {checkStatus} from './errorResponseHandler.ts';
import {removesUndefinedObjectValues, toQueryString, type HttpMethod, type QueueItemState, type RequestParamValue} from './utils.ts';

// Does not allow empty subfields. (Probably never true)
MarcRecord.setValidationOptions({subfieldValues: false});

export type BulkStatus = 'PENDING_VALIDATION' | 'DONE' | 'ABORT';

export type NonEmptyMarcRecordArray = [MarcRecord, ...MarcRecord[]];

export interface RecordClientOptions {
  melindaApiUrl: string;
  melindaApiUsername: string;
  melindaApiPassword: string;
  cataloger?: string;
  userAgent?: string;
}

export interface CreateParams {
  noop?: number;
  unique?: number;
  merge?: number;
  cataloger?: string;
  skipLowValidation?: number;
  matchFailuresAsNew?: number;
}

export interface UpdateParams {
  noop?: number;
  cataloger?: string;
  skipLowValidation?: number;
}

export interface RestoreRemoveParams {
  noop?: number;
  cataloger?: string;
}

export interface BulkParams {
  pOldNew: string;
  pActiveLibrary: string;
  pCatalogerIn?: string;
  pRejectFile?: string;
  pLogFile?: string;
  noop?: number;
  unique?: number;
  merge?: number;
  validate?: number;
  failOnError?: number;
  skipNoChangeUpdates?: number;
  matchFailuresAsNew?: number;
}

export interface ReadBulkParams {
  correlationId?: string;
  queueItemState?: QueueItemState;
  creationTime?: string[];
  modificationTime?: string[];
  skip?: number;
  limit?: number;
}

interface DoRequestOptions {
  method: HttpMethod;
  path: string;
  contentType?: string;
  params?: Record<string, RequestParamValue | undefined>;
  body?: string | Readable | null;
  duplex?: 'half';
}

/**
 * Create api operator for record data
 * @param params Client options
 * @returns Functions to handle record data
 */
// eslint-disable-next-line max-lines-per-function
export function createMelindaApiRecordClient({melindaApiUrl, melindaApiUsername, melindaApiPassword, cataloger, userAgent = 'Melinda commons API client / Javascript'}: RecordClientOptions) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:api-client');
  const debugData = debug.extend('data');
  const debugDev = debug.extend('dev');
  const Authorization = generateAuthorizationHeader(melindaApiUsername, melindaApiPassword);

  const defaultParamsBulk = cataloger ? {pCatalogerIn: cataloger} : {};
  const defaultParamsPrio = cataloger ? {cataloger} : {};

  if ((/.*\/$/u).test(melindaApiUrl)) {
    debug(`WARNING: URL ${melindaApiUrl} ends in a slash - remove slash!`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Invalid URL ${melindaApiUrl}. Use URL without slash in the end`);
  }

  return {
    read, create, update, remove, restore, createBulk, createBulkNoStream, setBulkStatus, sendRecordToBulk, sendRecordArrayToBulk, readBulk, getBulkState
  };

  /**
   * Get Record data by Melinda-ID
   * @param recordId Melinda-ID
   * @returns Record JSON object
   */
  function read(recordId: string) {
    debug('GET record metadata');
    return doRequest({method: 'get', path: recordId});
  }

  /**
   * Send new record to be saved in Melinda
   * @param params Create request: record data in Json format and create options
   * @returns Response JSON
   */
  function create({record, noop = 0, unique = 0, merge = 0, cataloger: recordCataloger, skipLowValidation = 0, matchFailuresAsNew}: CreateParams & {record: MarcRecord}) {
    debug('POST create prio');
    const params = removesUndefinedObjectValues({noop, unique, merge, cataloger: recordCataloger, skipLowValidation, matchFailuresAsNew});
    return doRequest({method: 'post', path: '', params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send update to record in Melinda
   * @param params Update request: record data in Json format, Melinda-ID and update options
   * @returns Response JSON
   */
  function update({record, recordId, noop = 0, cataloger: recordCataloger, skipLowValidation = 0}: UpdateParams & {record: MarcRecord; recordId: string}) {
    const params = removesUndefinedObjectValues({noop, cataloger: recordCataloger, skipLowValidation});
    debug(`POST update prio ${recordId}`);
    return doRequest({method: 'post', path: recordId, params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send a request to restore a deleted record in Melinda
   * @param params Restore request: record id and options
   * @returns Response JSON
   */
  function restore({recordId, noop = 0, cataloger: recordCataloger}: RestoreRemoveParams & {recordId: string}) {
    debug(`POST restore prio ${recordId}`);
    const params = removesUndefinedObjectValues({noop, cataloger: recordCataloger});
    // restore uses /fix -path and UNDEL -fixType
    return doRequest({method: 'post', path: `fix/${recordId}`, params: {...defaultParamsPrio, ...params, fixType: 'UNDEL'}, body: ''});
  }

  /**
   * Send a request to remove a record in Melinda
   * @param params Remove request: record id and options
   * @returns Response JSON
   */
  function remove({recordId, noop = 0, cataloger: recordCataloger}: RestoreRemoveParams & {recordId: string}) {
    debug(`POST remove prio ${recordId}`);
    const params = removesUndefinedObjectValues({noop, cataloger: recordCataloger});
    // remove uses /fix -path and DELET -fixType
    return doRequest({method: 'post', path: `fix/${recordId}`, params: {...defaultParamsPrio, ...params, fixType: 'DELET'}, body: ''});
  }

  /**
   * Upload single file Bulk operation
   * @param params Bulk stream request: file data stream, content type for records and bulk query params
   * @returns Response JSON
   */
  function createBulk({stream, streamContentType, queryParams}: {stream: Readable; streamContentType: string; queryParams: BulkParams}) {
    debug('POST bulk stream');
    debugDev(`queryParams: ${JSON.stringify(queryParams)}`);
    const params = removesUndefinedObjectValues({...queryParams});
    debugDev(`params: ${JSON.stringify(params)}`);

    // duplex:
    // "Controls duplex behavior of the request. If this is present it must have the value 'half', meaning that the browser must send the entire request before processing the response.
    // This option must be present when body is a ReadableStream."
    // see https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#duplex

    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params}, contentType: streamContentType, body: stream, duplex: 'half'});
  }

  /**
   * Create Bulk queue item in state QUEUE_ITEM_STATE.VALIDATOR.WAITING_FOR_RECORDS (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @param params Bulk request without stream: content type for records and bulk query params
   * @returns Response JSON
   */
  function createBulkNoStream({contentType, queryParams}: {contentType: string; queryParams: BulkParams}) {
    debug('POST bulk no stream');
    const params = removesUndefinedObjectValues({...queryParams});

    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params, noStream: 1}, contentType});
  }

  /**
   * Set queue item state for bulk item
   * @param params Bulk status request: identifier for bulk item and status ('PENDING_VALIDATION', 'DONE' or 'ABORT', @natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @returns Response JSON
   */
  function setBulkStatus({correlationId, status}: {correlationId: string; status: BulkStatus}) {
    debug(`PUT bulk status ${correlationId}`);
    return doRequest({method: 'put', path: `bulk/state/${correlationId}`, params: {status}});
  }

  /**
   * Send record data to api
   * @param params Bulk record request: JSON record data, identifier for bulk item and content type for handling conversion
   * @returns Response JSON
   */
  function sendRecordToBulk({record, correlationId, contentType}: {record: MarcRecord; correlationId: string; contentType: string}) {
    debug(`POST record to bulk ${correlationId}`);
    //debug(JSON.stringify(record));
    return doRequest({method: 'post', path: `bulk/record/${correlationId}`, contentType, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send array of records data to api (max 100 records)
   * @param params Bulk records request: non-empty array of JSON record data, identifier for bulk item and content type for handling conversion
   * @returns Response JSON
   */
  function sendRecordArrayToBulk({records, correlationId, contentType}: {records: NonEmptyMarcRecordArray; correlationId: string; contentType: string}) {
    if (records.length > 100) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Records array too long (max 100)`);
    }

    // The NonEmptyMarcRecordArray type forbids empty arrays, but keep the runtime check for untyped JS callers
    if (records.length === 0) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Records array empty`);
    }

    debug(`POST record to bulk ${correlationId}`);
    //debug(JSON.stringify(record));
    return doRequest({method: 'post', path: `bulk/records/${correlationId}`, contentType, body: JSON.stringify(records, undefined, '')});
  }

  /**
   * Get bulk queue item info
   * @param params Bulk read options
   * @returns doRequest results
   */
  function readBulk({correlationId, queueItemState, creationTime, modificationTime, skip = 0, limit}: ReadBulkParams) {
    debug('GET bulk metadata');
    const params = removesUndefinedObjectValues({correlationId, queueItemState, creationTime, modificationTime, skip, limit});

    return doRequest({method: 'get', path: 'bulk/', params});
  }

  /**
   * Get just bulk queue item status
   * @param correlationId identifier for bulk item
   * @returns Response JSON
   */
  function getBulkState(correlationId: string) {
    debug(`GET bulk state ${correlationId}`);
    return doRequest({method: 'get', path: `bulk/state/${correlationId}`});
  }

  /**
   * Base function to do requests to api
   * @param options Request options
   * @returns Response JSON
   */
  async function doRequest({method, path, contentType = 'application/json', params = {}, body = null, duplex = undefined}: DoRequestOptions): Promise<unknown> {
    debug('Executing request');
    try {
      const query = toQueryString(params);
      const url = new URL(`${melindaApiUrl}/${path}${query === '' ? '' : '?'}${query}`);

      debug(`connection URL ${url.toString()}`);

      const headers = {
          'User-Agent': userAgent,
          'content-type': contentType,
          Authorization,
          Accept: 'application/json'
      };

      debugDev(`headers: ${JSON.stringify(headers)}`);
      debugDev(`method: ${JSON.stringify(method)}`);
      debugData(`body: ${JSON.stringify(body)}`);

      const response = await fetch(url, {
        method,
        headers,
        body,
        ...(duplex ? {duplex} : {})
      });

      debugDev(`We got response: ${response.status}`);
      debug(`${(/^bulk\//u).test(path) ? 'Bulk' : 'Prio'}, ${method}, status: ${response.status}`);

      // Check status handles: 400, 401, 403, 404 and 503
      await checkStatus(response);

      if (response.status === httpStatus.OK || response.status === httpStatus.CREATED) {
        const data: unknown = await response.json();
        const responseAsString = JSON.stringify(data);
        // prevents massive strings
        debug(`Response data: ${responseAsString.length <= 100 ? responseAsString : `${responseAsString.substring(0, 100)}...`}`);

        if ((/^bulk\//u).test(path)) {
          debug('Handling bulk response');
          switch (method) {
            case 'post': {
              // Post to bulk
              const value = isRecordObject(data) ? data['value'] || data : data;
              return value;
            }

            case 'get':
            case 'put':
            case 'delete':
              // Query bulk status
              return data;

            default: {
              const _exhaustive: never = method;
              throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Unsupported HTTP method for bulk request: ${String(_exhaustive)}`);
            }
          }
        }

        if (method === 'get') {
          const record = new MarcRecord(parseJson(data));
          return {record};
        }

        // Create new record - this probably changes REST Apis httpStatus.201 to httpStatus.200
        // Validation results & update record (200)
        // Restore a deleted Melinda records (200)
        return data;
      }

      if (response.status === httpStatus.ACCEPTED || response.status === httpStatus.CREATED) {
        debug('Handling bulk response ACCEPTED');
        return response.json();
      }

      if (response.status === httpStatus.CONFLICT) {
        return response.json();
      }

      debug('Invalid response');
      debug(JSON.stringify(response));
      throw new ApiError(response.status, undefined);
    } catch (error) {
      debug('Api-client Error');
      if (error instanceof ApiError) {
        throw error;
      }
      debug(error);
      debug(JSON.stringify(error));
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unexpected internal error');
    }
  }
}

/**
 * Parse and guard an API response before handing it to the MarcRecord constructor.
 * Accepts a record JSON string or an already-parsed record object. Exported as a
 * test seam for the presence-conditional guards below.
 * @param record Raw API response (record JSON string or object)
 * @returns The parsed record, guarded to the accepted subset of MarcRecordObject
 */
export function parseJson(record: unknown): MarcRecordObject {
  const parsed: unknown = typeof record === 'string' ? JSON.parse(record) : record;
  if (!isMarcRecordObject(parsed)) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'API response is not a valid Marc record (expected object with optional string leader and optional array fields)');
  }

  return parsed;
}

/**
 * Verify that a value is a non-null object (used to narrow raw JSON responses before field access)
 * @param value Value to check
 * @returns true if the value is a non-null object
 */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Verify that a value matches the shape of a MarcRecordObject. Mirrors the MarcRecord
 * constructor's normalization, which is presence-conditional: `leader` must be a string
 * when present (absence is OK — the constructor defaults it to '') and `fields` must be
 * an array of valid fields when present (absence is OK — the constructor defaults it to []).
 * Note: the declared MarcRecordObject type marks leader and fields as required, so the
 * `value is MarcRecordObject` claim over-admits relative to the strict type: objects
 * lacking leader/fields are admitted here because the constructor normalizes them to
 * '' / [] before the result is used as a MarcRecordObject.
 * @param value Value to check
 * @returns true if the value can be used as MarcRecordObject
 */
function isMarcRecordObject(value: unknown): value is MarcRecordObject {
  if (!isRecordObject(value) || Array.isArray(value)) {
    return false;
  }

  if (value['leader'] !== undefined && typeof value['leader'] !== 'string') {
    return false;
  }

  return value['fields'] === undefined || (Array.isArray(value['fields']) && value['fields'].every(isMarcField));
}

/**
 * Verify that a value matches the shape of a Marc control field (tag + string value) or
 * data field. Mirrors the MarcRecord constructor's normalization, which is
 * presence-conditional: `value` must be a string when present; for data fields `ind1`/
 * `ind2` must be strings when present (absence is OK — the constructor defaults them to
 * ' ' for fields that have `subfields`) and `subfields` must be an array of valid
 * subfields when present (absence is OK — the constructor's `'subfields' in field`
 * check tolerates absence). `tag` is required: the constructor never defaults it.
 * Note: the declared MarcControlField/MarcField types mark value, ind1, ind2 and
 * subfields as required, so the `value is MarcControlField | MarcField` claim
 * over-admits relative to the strict types: fields lacking ind1/ind2/subfields are
 * admitted here because the constructor normalizes them before the result is used.
 * @param value Value to check
 * @returns true if the value can be used as MarcControlField or MarcField
 */
function isMarcField(value: unknown): value is MarcControlField | MarcField {
  // `tag` is never defaulted by the constructor and is structurally required by both shapes
  if (!isRecordObject(value) || Array.isArray(value) || typeof value['tag'] !== 'string') {
    return false;
  }

  if (value['value'] !== undefined) {
    // Control field shape: tag + value
    return typeof value['value'] === 'string';
  }

  if ((value['ind1'] !== undefined && typeof value['ind1'] !== 'string') || (value['ind2'] !== undefined && typeof value['ind2'] !== 'string')) {
    return false;
  }

  return value['subfields'] === undefined || (Array.isArray(value['subfields']) && value['subfields'].every(isMarcSubfield));
}

/**
 * Verify that a value matches the shape of a Marc subfield (string code and optional string value)
 * @param value Value to check
 * @returns true if the value can be used as MarcSubfield
 */
function isMarcSubfield(value: unknown): value is MarcSubfield {
  return isRecordObject(value) && typeof value['code'] === 'string' && (value['value'] === undefined || typeof value['value'] === 'string');
}

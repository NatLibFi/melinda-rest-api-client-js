import createDebugLogger from 'debug';
import httpStatus from 'http-status';
import {URL} from 'url';
import type {Readable} from 'stream';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import {MarcRecord, type MarcRecordObject} from '@natlibfi/marc-record';
import {checkStatus} from './errorResponseHandler.ts';
import {removesUndefinedObjectValues, toQueryString, type RequestParamValue} from './utils.ts';

// Does not allow empty subfields. (Probably never true)
MarcRecord.setValidationOptions({subfieldValues: false});

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
  queueItemState?: string;
  creationTime?: string[];
  modificationTime?: string[];
  skip?: number;
  limit?: number;
}

interface DoRequestOptions {
  method: string;
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
   * @param record Record data in Json format
   * @param params Create options
   * @returns Response JSON
   */
  function create(record: MarcRecord, {noop = 0, unique = 0, merge = 0, cataloger: recordCataloger, skipLowValidation = 0, matchFailuresAsNew}: CreateParams) {
    debug('POST create prio');
    const params = removesUndefinedObjectValues({noop, unique, merge, cataloger: recordCataloger, skipLowValidation, matchFailuresAsNew});
    return doRequest({method: 'post', path: '', params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send update to record in Melinda
   * @param record Record data in Json format
   * @param recordId Melinda-ID
   * @param params Update options
   * @returns Response JSON
   */
  function update(record: MarcRecord, recordId: string, {noop = 0, cataloger: recordCataloger, skipLowValidation = 0}: UpdateParams) {
    const params = removesUndefinedObjectValues({noop, cataloger: recordCataloger, skipLowValidation});
    debug(`POST update prio ${recordId}`);
    return doRequest({method: 'post', path: recordId, params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send a request to restore a deleted record in Melinda
   * @param recordId Melinda-ID
   * @param params Restore options
   * @returns Response JSON
   */
  function restore(recordId: string, {noop = 0, cataloger: recordCataloger}: RestoreRemoveParams) {
    debug(`POST restore prio ${recordId}`);
    const params = removesUndefinedObjectValues({noop, cataloger: recordCataloger});
    // restore uses /fix -path and UNDEL -fixType
    return doRequest({method: 'post', path: `fix/${recordId}`, params: {...defaultParamsPrio, ...params, fixType: 'UNDEL'}, body: ''});
  }

  /**
   * Send a request to remove a record in Melinda
   * @param recordId Melinda-ID
   * @param params Remove options
   * @returns Response JSON
   */
  function remove(recordId: string, {noop = 0, cataloger: recordCataloger}: RestoreRemoveParams) {
    debug(`POST remove prio ${recordId}`);
    const params = removesUndefinedObjectValues({noop, cataloger: recordCataloger});
    // remove uses /fix -path and DELET -fixType
    return doRequest({method: 'post', path: `fix/${recordId}`, params: {...defaultParamsPrio, ...params, fixType: 'DELET'}, body: ''});
  }

  /**
   * Upload single file Bulk operation
   * @param stream File data stream
   * @param streamContentType content type for records
   * @param queryParams Bulk query params
   * @returns Response JSON
   */
  function createBulk(stream: Readable, streamContentType: string, queryParams: BulkParams) {
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
   * @param contentType type for records
   * @param queryParams Bulk query params
   * @returns Response JSON
   */
  function createBulkNoStream(contentType: string, queryParams: BulkParams) {
    debug('POST bulk no stream');
    const params = removesUndefinedObjectValues({...queryParams});

    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params, noStream: 1}, contentType});
  }

  /**
   * Set queue item state for bulk item
   * @param correlationId identifier for bulk item
   * @param status 'PENDING_VALIDATION', 'DONE' or 'ABORT' (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @returns Response JSON
   */
  function setBulkStatus(correlationId: string, status: string) {
    debug(`PUT bulk status ${correlationId}`);
    return doRequest({method: 'put', path: `bulk/state/${correlationId}`, params: {status}});
  }

  /**
   * Send record data to api
   * @param record JSON record data
   * @param correlationId identifier for bulk item
   * @param contentType Content type for handling conversion
   * @returns Response JSON
   */
  function sendRecordToBulk(record: MarcRecord, correlationId: string, contentType: string) {
    debug(`POST record to bulk ${correlationId}`);
    //debug(JSON.stringify(record));
    return doRequest({method: 'post', path: `bulk/record/${correlationId}`, contentType, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send array of records data to api
   * @param records Array of JSON record data
   * @param correlationId identifier for bulk item
   * @param contentType Content type for handling conversion
   * @returns Response JSON
   */
  function sendRecordArrayToBulk(records: MarcRecord[], correlationId: string, contentType: string) {
    if (!Array.isArray(records)) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Records is not array`);
    }

    if (records.length > 100) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Records array too long (max 100)`);
    }

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
        const data = (await response.json()) as Record<string, unknown>;
        const responseAsString = JSON.stringify(data);
        // prevents massive strings
        debug(`Response data: ${responseAsString.length <= 100 ? responseAsString : `${responseAsString.substring(0, 100)}...`}`);

        if ((/^bulk\//u).test(path)) {
          debug('Handling bulk response');
          if (method === 'post') {
            // Post to bulk
            const value = data['value'] || data;
            return value;
          }

          // Query bulk status
          return data;
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

  function parseJson(record: unknown): MarcRecordObject {
    if (typeof record === 'string') {
      return JSON.parse(record) as MarcRecordObject;
    }

    return record as MarcRecordObject;
  }
}

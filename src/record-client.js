import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL, URLSearchParams} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import createDebugLogger from 'debug';
import {MarcRecord} from '@natlibfi/marc-record';
import {checkStatus} from './errorResponseHandler';
import {removesUndefinedObjectValues} from './utils';

// Does not allow empty subfields. (Probably never true)
MarcRecord.setValidationOptions({subfieldValues: false});

/**
 * Create api operator for record data
 * @date 10/31/2023 - 10:34:22 AM
 *
 * @export
 * @param {{ melindaApiUrl: string; melindaApiUsername: string; melindaApiPassword: string; cataloger?: string; userAgent?: string; }} params
 * @param {string} params.melindaApiUrl
 * @param {string} params.melindaApiUsername
 * @param {string} params.melindaApiPassword
 * @param {string} [params.cataloger=false]
 * @param {string} [params.userAgent='Melinda commons API client / Javascript']
 * @returns {JSON} Functions to handle record data
 */
export function createMelindaApiRecordClient({melindaApiUrl, melindaApiUsername, melindaApiPassword, cataloger = false, userAgent = 'Melinda commons API client / Javascript'}) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:api-client');
  const Authorization = generateAuthorizationHeader(melindaApiUsername, melindaApiPassword);

  const defaultParamsBulk = cataloger ? {pCatalogerIn: cataloger} : {};
  const defaultParamsPrio = cataloger ? {cataloger} : {};

  return {
    read, create, update, createBulk, creteBulkNoStream, setBulkStatus, sendRecordToBulk, readBulk, getBulkState
  };

  /**
     * Get Record data by Melinda-ID
     * @param {string} Record Melinda-ID
     * @returns Record JSON object
     */
  function read(recordId) {
    debug('GET record metadata');
    return doRequest({method: 'get', path: recordId});
  }

  /**
   * Send new record to be saved in Melinda
   * @param {MarcRecord} Record data in Json format
   * @param {{noop?: number; unique?: number; merge?: number;}} params
   * @param {number} [noop] 0|1 No operation (operate but don't save, AKA dry run)
   * @param {number} [unique] 0|1 Handle only if new record
   * @param {number} [merge] 0|1 if not new record, try to merge with existing
   * @returns <Description return value>
   */
  function create(record, {noop = 0, unique = 0, merge = 0}) {
    debug('POST create prio');
    return doRequest({method: 'post', path: '', params: {...defaultParamsPrio, noop, unique, merge}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Send update to record in Melinda
   * @param {MarcRecord} Record data in Json format
   * @param {string} Record Melinda-ID
   * @param {{noop?: number; cataloger?: string}} params
   * @param {number} [params.noop=0] 0|1 No operation (operate but don't save, AKA dry run)
   * @param {string} [params.cataloger] Cataloger identifier for CAT field
   * @returns <Description return value>
   */
  function update(record, recordId, {noop = 0, cataloger = undefined}) {
    debug(`POST update prio ${recordId}`);
    return doRequest({method: 'post', path: recordId, params: {...defaultParamsPrio, noop, cataloger}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Upload single file Bulk operation
   * @param {stream} File data stream
   * @param {string} Content type for handling conversion stream
   * @param {{pCatalogerIn?: string;}} params
   * @param {string} [params.pCatalogerIn] Cataloger identifier for CAT field
   * @returns <Description return value>
   */
  function createBulk(stream, streamContentType, {pCatalogerIn}) {
    debug('POST bulk stream');
    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, pCatalogerIn}, contentType: streamContentType, body: stream});
  }

  /**
   * Create Bulk queue item in state QUEUE_ITEM_STATE.VALIDATOR.WAITING_FOR_RECORDS (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @param {string} contentType type for records
   * @param {{
   * pOldNew: string; pActiveLibrary: string; pCatalogerIn?: string; pRejectFile?: string; pLogFile?: string;
   * noop?: number; unique?: number; merge?: number; validate?: number; failOnError?: number; skipNoChangeUpdates?: number;
   * }} params
   * @param {string} params.pOldNew 'NEW'|'OLD', (NEW = CREATE, OLD = UPDATE)
   * @param {string} params.pActiveLibrary Aleph library this bulk is ment to go
   * @param {string} [params.pCatalogerIn] Cataloger identifier for CAT field,
   * @param {string} [params.pRejectFile] Reject file name to be used in server for p_manage_18
   * @param {string} [params.pLogFile] Log file name to be used in server for p_manage_18
   * @param {number} [params.noop] 0|1 No operation (operate but don't save, AKA dry run)
   * @param {number} [params.unique] 0|1 Handle only if new record
   * @param {number} [params.merge] 0|1 if not new record, try to merge with existing
   * @param {number} [params.validate] 0|1
   * @param {number} [params.failOnError] 0|1
   * @param {number} [params.skipNoChangeUpdates] 0|1 skip changes that won't change the database record
   * @returns <Description return value>
   */
  function creteBulkNoStream(contentType, queryParams) {
    debug('POST bulk no stream');
    const params = removesUndefinedObjectValues(queryParams);

    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params, noStream: 1}, contentType});
  }

  /**
   * Set queue item state for bulk item
   * @param {string} CorrelationId identifier for bulk item
   * @param {string} Status 'PENDING_VALIDATION', 'DONE' or 'ABORT' (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @returns <Description return value>
   */
  function setBulkStatus(correlationId, status) {
    debug(`PUT bulk status ${correlationId}`);
    return doRequest({method: 'put', path: `bulk/state/${correlationId}`, params: {status}});
  }

  /**
   * Send record data to api
   * @date 10/31/2023 - 10:48:25 AM
   *
   * @param {MarcRecord} record JSON record data
   * @param {string} correlationId identifier for bulk item
   * @param {string} contentType Content type for handling conversion
   * @returns <Description return value>
   */
  function sendRecordToBulk(record, correlationId, contentType) {
    debug(`POST record to bulk ${correlationId}`);
    //debug(JSON.stringify(record));
    return doRequest({method: 'post', path: `bulk/record/${correlationId}`, contentType, body: JSON.stringify(record)});
  }

  /**
   * Get bulk queue item info
   * @date 10/31/2023 - 10:36:52 AM
   *
   * @param {{correlationId?: string; queueItemState?: string; creationTime?: [string]; modificationTime?: [string]; skip?: number; limit?: number;}} params
   * @param {string} [params.correlationId] Identifier for bulk item
   * @param {string} [params.queueItemState] Constant (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @param {[string]} [params.creationTime] Specific date  ["YYYY-MM-DD"] or date between ["YYYY-MM-DD", "YYYY-MM-DD"] [date before, date after]
   * @param {[string]} [params.modificationTime] Specific date  ["YYYY-MM-DD"] or date between ["YYYY-MM-DD", "YYYY-MM-DD"] [date before, date after]
   * @param {number} [params.skip=0] Skip n log items
   * @param {number} [params.limit] Limit results to n log items
   * @returns doRequest results
   */
  function readBulk({correlationId, queueItemState, creationTime, modificationTime, skip = 0, limit}) {
    debug('GET bulk metadata');
    const params = removesUndefinedObjectValues({correlationId, queueItemState, creationTime, modificationTime, skip, limit});

    return doRequest({method: 'get', path: 'bulk/', params});
  }

  /**
   * Get just bulk queue item status
   * @param {string} correlationId identifier for bulk item
   * @returns <Description return value>
   */
  function getBulkState(correlationId) {
    debug(`GET bulk state ${correlationId}`);
    return doRequest({method: 'get', path: `bulk/state/${correlationId}`});
  }

  /**
   * Base function to do requests to api
   * @param {{method: string; path: string; contentType?: string; params?: object; body?: string;}} params
   * @param {string} params.method Request method
   * @param {string} params.path Request URL path
   * @param {string} [params.contentType] request body content type. Defaults 'application/json'
   * @param {object} [params.params] URL query params to be url encoded. Defaults false
   * @param {string} [params.body] String data. Defaults null
   * @returns <Description return value>
   */
  async function doRequest({method, path, contentType = 'application/json', params = false, body = null}) {
    debug('Executing request');
    try {
      const query = params ? new URLSearchParams(params) : '';
      const url = new URL(`${melindaApiUrl}${path}${query === '' ? '' : '?'}${query}`);

      debug(`connection URL ${url.toString()}`);

      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': userAgent,
          'content-type': contentType,
          Authorization,
          Accept: 'application/json'
        },
        body
      });

      debug(`${(/^bulk\//u).test(path) ? 'Bulk' : 'Prio'}, ${method}, status: ${response.status}`);
      await checkStatus(response);

      if (response.status === httpStatus.OK || response.status === httpStatus.CREATED) {
        const data = await response.json();
        debug(`Response data: ${JSON.stringify(data)}`);

        if ((/^bulk\//u).test(path)) {
          debug('Handling bulk response');
          if (method === 'post') {
            // Post to bulk
            const value = data.value || data;
            return value;
          }

          // Querry bulk status
          return data;
        }

        if (method === 'get') {
          const record = new MarcRecord(parseJson(data));
          return {record};
        }

        // Create new record
        // Validation results & update record
        return data;
      }

      if (response.status === httpStatus.ACCEPTED) {
        debug('Handling bulk response ACCEPTED');
        return response.json();
      }

      if (response.status === httpStatus.CONFLICT) {
        return response.json();
      }

      debug('Invalid response');
      debug(JSON.stringify(response));
      throw new ApiError(response.status);
    } catch (error) {
      debug('Api-client Error');
      if (error instanceof ApiError) { // eslint-disable-line functional/no-conditional-statements
        throw error;
      }

      debug(JSON.stringify(error));
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unexpected internal error');
    }
  }

  function parseJson(record) {
    if (typeof record === 'string') {
      return JSON.parse(record);
    }

    return record;
  }
}

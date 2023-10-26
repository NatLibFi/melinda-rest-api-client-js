import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL, URLSearchParams} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import createDebugLogger from 'debug';
import {MarcRecord} from '@natlibfi/marc-record';
import {checkStatus} from './errorResponseHandler';

// Change to true when working
MarcRecord.setValidationOptions({subfieldValues: false});

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
     * @param {String} Record Melinda-ID
     * @returns Record JSON object
     */
  function read(recordId) {
    debug('GET record metadata');
    return doRequest({method: 'get', path: recordId});
  }

  /**
   * Send new record to be saved in Melinda
   * @param {Object} Record data in Json format
   * @param {Object} Params: {
   * noop: {Integer} 0|1 No operation (operate but don't save, AKA dry run)
   * unique: {Integer} 0|1 Handle only if new record
   * merge: {Integer} 0|1 if not new record, try to merge with existing
   * }
   * @returns <Description return value>
   */
  function create(record, params = {noop: 0, unique: 0, merge: 0}) {
    debug('POST create prio');
    return doRequest({method: 'post', path: '', params: {...defaultParamsPrio, ...params}, body: JSON.Stringify(record, undefined, '')});
  }

  /**
   * Send update to record in Melinda
   * @param {Object} Record data in Json format
   * @param {String} Record Melinda-ID
   * @param {Object} Params {
   * noop: {Integer} 0|1 No operation (operate but don't save, AKA dry run)
   * cataloger: {String} Cataloger identifier for CAT field
   * }
   * @returns <Description return value>
   */
  function update(record, recordId, params = {noop: 0, cataloger: undefined}) {
    debug(`POST update prio ${recordId}`);
    return doRequest({method: 'post', path: recordId, params: {...defaultParamsPrio, ...params}, body: JSON.stringify(record, undefined, '')});
  }

  /**
   * Upload single file Bulk operation
   * @param {stream} File data stream
   * @param {String} Content type for handling conversion stream
   * @param {Object} Params {
   * pCatalogerIn: {String} Cataloger identifier for CAT field
   * }
   * @returns <Description return value>
   */
  function createBulk(stream, streamContentType, params) {
    debug('POST bulk stream');
    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params}, contentType: streamContentType, body: stream});
  }

  /**
   * Create Bulk queue item in state QUEUE_ITEM_STATE.VALIDATOR.WAITING_FOR_RECORDS (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @param {String} Content type for records
   * @param {Object} {
   * pOldNew: {String} 'NEW'|'OLD', (NEW = CREATE, OLD = UPDATE)
   * pActiveLibrary: Aleph library this bulk is ment to go
   * pCatalogerIn: (Optional) {String} Cataloger identifier for CAT field,
   * pRejectFile: (Optional) {String} Reject file name to be used in server for p_manage_18
   * pLogFile: (Optional) {String} Log file name to be used in server for p_manage_18
   * noop: (Optional) {Integer} 0|1 No operation (operate but don't save, AKA dry run)
   * unique: (Optional) {Integer} 0|1 Handle only if new record
   * merge: (Optional) {Integer} 0|1 if not new record, try to merge with existing
   * validate: (Optional) {Integer} 0|1
   * failOnError: (Optional) {Integer} 0|1
   * skipNoChangeUpdates: (Optional) {Integer} 0|1 skip changes that won't change the database record
   * }
   * @returns <Description return value>
   */
  function creteBulkNoStream(contentType, params) {
    debug('POST bulk no stream');
    return doRequest({method: 'post', path: 'bulk/', params: {...defaultParamsBulk, ...params, noStream: 1}, contentType});
  }

  /**
   * Set queue item state for bulk item
   * @param {String} CorrelationId identifier for bulk item
   * @param {String} Status 'PENDING_VALIDATION', 'DONE' or 'ABORT' (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE)
   * @returns <Description return value>
   */
  function setBulkStatus(correlationId, status) {
    debug(`PUT bulk status ${correlationId}`);
    return doRequest({method: 'put', path: `bulk/state/${correlationId}`, params: {status}});
  }

  /**
   * Send record data to api
   * @param {Object} JSON record data
   * @param {String} CorrelationId identifier for bulk item
   * @param {String} Content type for handling conversion
   * @returns <Description return value>
   */
  function sendRecordToBulk(record, correlationId, contentType) {
    debug(`POST record to bulk ${correlationId}`);
    //debug(JSON.stringify(record));
    return doRequest({method: 'post', path: `bulk/record/${correlationId}`, contentType, body: JSON.stringify(record)});
  }

  /**
   * Query bulk queue items
   * @param {Object} {
   * correlationId or id: {String} CorrelationId identifier for bulk item
   * queueItemState: {String} Status (@natlibfi/melinda-rest-api-commons/constants/QUEUE_ITEM_STATE),
   * creationTime: {[String]} Specific date  ["YYYY-MM-DD"] or date between ["YYYY-MM-DD", "YYYY-MM-DD"] [date before, date after],
   * modificationTime: {[String]} Specific date ["YYYY-MM-DD"] or date between ["YYYY-MM-DD", "YYYY-MM-DD"], [date before, date after],
   * skip: {Integer} Skip n log items,
   * limit: {Integer} Limit results to n log items
   * }
   * @returns <Description return value>
   */
  function readBulk(params) {
    debug('GET bulk metadata');
    return doRequest({method: 'get', path: 'bulk/', params});
  }

  /**
   * Get just bulk queue item status
   * @param {String} CorrelationId identifier for bulk item
   * @returns <Description return value>
   */
  function getBulkState(correlationId) {
    debug(`GET bulk state ${correlationId}`);
    return doRequest({method: 'get', path: `bulk/state/${correlationId}`});
  }

  /**
   * <Description>
   * @param {<type>} <Description 1st parameter>
   * @param {<type>} <Description 2nd parameter>
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

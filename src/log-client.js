import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {URL, URLSearchParams} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import createDebugLogger from 'debug';
import {checkStatus} from './errorResponseHandler';

export function createMelindaApiLogClient({melindaApiUrl, melindaApiUsername, melindaApiPassword, userAgent = 'Melinda commons API client / Javascript'}) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:log-client');
  const Authorization = generateAuthorizationHeader(melindaApiUsername, melindaApiPassword);

  return {
    getCatalogers, getLog, protectLog, removeLog, getLogsList
  };

  /**
   * Get catalogers who has made logs
   * @returns List on catalogers based on search params
   */
  function getCatalogers(params) {
    return doRequest({method: 'get', path: 'logs/catalogers'});
  }

  /**
   * Get specific log item
   * @param {Object} {
   * correlationId OR id: identifier for log,
   * logItemType: LOG_ITEM_TYPE constant,
   * blobSequence: integer sequence for log in correlation,
   * standardIdentifiers: ISBN etc.,
   * databaseId: Melinda-ID,
   * sourceIds: SID,
   * skip: skip n log items,
   * limit: Limit results to n log items
   * }
   * @returns List of logs based on search params
   */
  function getLog(params) {
    return doRequest({method: 'get', path: 'logs', params});
  }

  /**
   * Sets protect flag to logs
   * @param {string} CorrelationId identifier for log
   * @param {Object} {blobSequence: integer}
   * @returns {status, payload}
   */
  function protectLog(correlationId, params) {
    return doRequest({method: 'put', path: `logs/${correlationId}`, params});
  }

  /**
   * Removes log
   * @param {string} CorrelationId identifier for log
   * @param {Object} {force: 0|1}
   * @returns {status, payload}
   */
  function removeLog(correlationId, params) {
    return doRequest({method: 'delete', path: `logs/${correlationId}`, params});
  }

  /**
   * Get list of logs based on search params
   * @param {Object} {
   * logItemTypes: logItemTypes has comma-separated list of logItemTypes
   * catalogers: catalogers has comma-separated list of catalogers (1-10 word characters each)
   * dateBefore: string 'YYYY-MM-DD',
   * dateAfter:  string 'YYYY-MM-DD'}
   * @returns List matched of logs
   */
  function getLogsList(params) {
    return doRequest({method: 'get', path: 'logs/list', params});
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

      debug(`${method}, path: ${path}, params: ${JSON.stringify(params)}, status: ${response.status}`);

      // log status check?
      await checkStatus(response);

      //logic here
      if (response.status === httpStatus.OK) {
        const result = await response.json();
        debug(`result: ${JSON.stringify(result)}`);
        return result;
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
}

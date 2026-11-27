import createDebugLogger from 'debug';
import httpStatus from 'http-status';
import {URL} from 'url';
import {Error as ApiError, generateAuthorizationHeader} from '@natlibfi/melinda-commons';
import {checkStatus} from './errorResponseHandler.ts';
import {removesUndefinedObjectValues, toQueryString, type HttpMethod, type RequestParamValue} from './utils.ts';

export interface LogClientOptions {
  melindaApiUrl: string;
  melindaApiUsername: string;
  melindaApiPassword: string;
  userAgent?: string;
}

export interface GetLogParams {
  correlationId?: string;
  logItemType?: string;
  blobSequence?: number;
  standardIdentifiers?: string;
  databaseId?: string;
  sourceIds?: string;
  skip?: number;
  limit?: number;
};

export interface GetLogsListParams {
  expanded?: boolean;
  logItemTypes?: string;
  catalogers?: string;
  /** Upper bound of the creationTime range (server: creationTime[1], <=) */
  dateBefore?: string;
  /** Lower bound of the creationTime range (server: creationTime[0], >=) */
  dateAfter?: string;
};

export interface ProtectLogParams {
  correlationId: string;
  blobSequence?: number;
};

export interface RemoveLogParams {
  correlationId: string;
  force?: number;
};

interface DoRequestOptions {
  method: HttpMethod;
  path: string;
  contentType?: string;
  params?: Record<string, RequestParamValue | undefined>;
  body?: string | null;
}

// eslint-disable-next-line max-lines-per-function
export function createMelindaApiLogClient({melindaApiUrl, melindaApiUsername, melindaApiPassword, userAgent = 'Melinda commons API client / Javascript'}: LogClientOptions) {
  const debug = createDebugLogger('@natlibfi/melinda-rest-api-client:log-client');
  const Authorization = generateAuthorizationHeader(melindaApiUsername, melindaApiPassword);

  if ((/.*\/$/u).test(melindaApiUrl)) {
    debug(`WARNING: URL ${melindaApiUrl} ends in a slash - remove slash!`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Invalid URL ${melindaApiUrl}. Use URL without slash in the end`);
  }

  return {
    getCatalogers, getLog, protectLog, protectLogExplicit, unprotectLog, removeLog, getLogsList
  };

  /**
   * Get catalogers who has made logs
   * @returns List of catalogers based on search params
   */
  function getCatalogers() {
    return doRequest({method: 'get', path: 'logs/catalogers'});
  }

  /**
   * Get specific log item
   * @param params Log search params
   * @returns List of logs based on search params
   */
  function getLog({correlationId, logItemType, blobSequence, standardIdentifiers, databaseId, sourceIds, skip = 0, limit}: GetLogParams) {
    const params = removesUndefinedObjectValues({correlationId, logItemType, blobSequence, standardIdentifiers, databaseId, sourceIds, skip, limit});
    return doRequest({method: 'get', path: 'logs', params});
  }

  /**
   * Sets protect flag to logs
   * @param params Protect request: identifier for log and protect options
   * @returns {status, payload}
   */
  function protectLog({correlationId, blobSequence}: ProtectLogParams) {
    const params = removesUndefinedObjectValues({blobSequence});
    return doRequest({method: 'put', path: `logs/${correlationId}`, params});
  }

  /**
   * Explicitly protects logs (no toggle): already-protected log items stay protected
   * @param params Protect request: identifier for log and protect options
   * @returns {status, payload}
   */
  function protectLogExplicit({correlationId, blobSequence}: ProtectLogParams) {
    const params = removesUndefinedObjectValues({blobSequence});
    return doRequest({method: 'put', path: `logs/${correlationId}/protect`, params});
  }

  /**
   * Explicitly removes the protect flag from logs (no toggle)
   * @param params Unprotect request: identifier for log and unprotect options
   * @returns {status, payload}
   */
  function unprotectLog({correlationId, blobSequence}: ProtectLogParams) {
    const params = removesUndefinedObjectValues({blobSequence});
    return doRequest({method: 'put', path: `logs/${correlationId}/unprotect`, params});
  }

  /**
   * Removes log
   * @param params Remove request: identifier for log and remove options
   * @returns {status, payload}
   */
  function removeLog({correlationId, force = 0}: RemoveLogParams) {
    return doRequest({method: 'delete', path: `logs/${correlationId}`, params: {force}});
  }

  /**
   * Get list of logs based on search params
   * @param params Log list search params (dateBefore/dateAfter are mapped to the
   * server's creationTime JSON range param: [dateAfter, dateBefore], low bound first)
   * @returns List matched of logs
   */
  function getLogsList({expanded, logItemTypes, catalogers, dateBefore, dateAfter}: GetLogsListParams) {
    // The server ignores dateBefore/dateAfter and only reads creationTime as a
    // stringified JSON array (1 element = one bound, 2 = [dateAfter, dateBefore]
    // range, low bound first), so map the accepted date params to it
    const creationTimeArray = [dateAfter, dateBefore].filter((date): date is string => date !== undefined);
    const params = removesUndefinedObjectValues({
      expanded,
      logItemTypes,
      catalogers,
      creationTime: creationTimeArray.length > 0 ? JSON.stringify(creationTimeArray) : undefined
    });

    return doRequest({method: 'get', path: 'logs/list', params});
  }

  /**
   * Base function to do requests to api
   * @param options Request options
   * @returns response Json
   */
  async function doRequest({method, path, contentType = 'application/json', params = {}, body = null}: DoRequestOptions): Promise<unknown> {
    debug('Executing request');
    try {
      const query = toQueryString(params);
      const url = new URL(`${melindaApiUrl}/${path}${query === '' ? '' : '?'}${query}`);

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
      throw new ApiError(response.status, undefined);
    } catch (error) {
      debug('Api-client Error');
      if (error instanceof ApiError) {
        throw error;
      }

      debug(JSON.stringify(error));
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unexpected internal error');
    }
  }
}

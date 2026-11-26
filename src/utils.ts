export type RequestParamValue = string | number | string[] | boolean;

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/**
 * Known bulk queue item states (Melinda REST API `queueItemState` values).
 *
 * Sources checked for the state values:
 * - No `QUEUE_ITEM_STATE` constants found anywhere in node_modules
 *   (@natlibfi/melinda-rest-api-commons is not installed, rg across all packages found no matches)
 * - 'PENDING_VALIDATION', 'DONE', 'ABORT' from the `BulkStatus` type and API client docs in src/record-client.ts
 * - 'IN_QUEUE', 'IMPORTING', 'IN_PROCESS', 'DONE', 'ERROR' from the API responses in test-fixtures/pollMelindaRestApi/
 *
 * The API may report additional states that are not listed here.
 */
export type QueueItemState = 'ABORT' | 'DONE' | 'ERROR' | 'IMPORTING' | 'IN_PROCESS' | 'IN_QUEUE' | 'PENDING_VALIDATION';

/**
 * Removes key value pairs that have undefined as value
 * @param params Params object to be cleaned
 * @returns object with no undefined values (empty object when no values remain)
 */
export function removesUndefinedObjectValues(params: Record<string, RequestParamValue | undefined>): Record<string, RequestParamValue> {
  const newObject: Record<string, RequestParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      newObject[key] = value;
    }
  }

  return newObject;
}

/**
 * Builds a URL query string from request params
 * @param params URL query params (undefined values are skipped)
 * @returns query string without leading question mark
 */
export function toQueryString(params: Record<string, RequestParamValue | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }

  return searchParams.toString();
}

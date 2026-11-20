export type RequestParamValue = string | number | string[] | boolean;

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

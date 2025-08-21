/**
 * Removes key value pairs that have undefined as value
 * @param {Object} object Params object to be cleaned
 * @returns object with no undefined values or on empty object false
 */
export function removesUndefinedObjectValues(object) {
  const newObjectKeys = Object.keys(object).filter(key => object[key] !== undefined);

  if (Object.keys(newObjectKeys).length < 1) {
    return false;
  }

  const newObject = {};
  newObjectKeys.forEach(key => {
    newObject[key] = object[key];
  });

  return newObject;
}

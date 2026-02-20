'use strict';

/**
 * Creates an error in MEF (Milan Error Format).
 * The code must exist in errorsResult; message and statusCode come from the registry.
 *
 * @param {string} code - Unique error code (e.g. 'USERS_UPDATE_CPF_REQUIRED')
 * @param {object} errorsResult - Object loaded from mef/errors.json (code -> { statusCode, message })
 * @returns {Error} Error with .statusCode, .code, .message and .isMEF
 * @throws {Error} If code is not found in errorsResult
 */
function errorFormat(code, errorsResult) {
  const def = errorsResult[code];
  if (!def) {
    const err = new Error(`MEF: code "${code}" not found in errors.json`);
    err.code = 'MEF_CODE_NOT_FOUND';
    throw err;
  }
  const err = new Error(def.message);
  err.statusCode = def.statusCode;
  err.code = code;
  err.isMEF = true;
  return err;
}

/**
 * Returns true if the value is an error created with errorFormat (MEF).
 *
 * @param {*} err - Value to check
 * @returns {boolean}
 */
function isMEFError(err) {
  return err != null && err.isMEF === true && typeof err.code === 'string';
}

/**
 * Returns true if the code exists in the error registry.
 *
 * @param {string} code
 * @param {object} errorsResult
 * @returns {boolean}
 */
function isValidCode(code, errorsResult) {
  return typeof code === 'string' && code in errorsResult;
}

module.exports = {
  errorFormat,
  isMEFError,
  isValidCode
};

'use strict';

/**
 * Example local wrapper for using @wesleymilan/mef in an Express app.
 *
 * The project should have a mef/errors.json file at the root (or another path)
 * with format: { "CODE": { "statusCode": number, "message": string }, ... }
 *
 * Usage in controller or model:
 *   const errorFormat = require('../utils/errorFormat');
 *   return next(errorFormat('USERS_UPDATE_CPF_REQUIRED'));
 *
 * Or in model (throw):
 *   throw errorFormat('USERS_UPDATE_CPF_INVALID');
 */

const { errorFormat: mefErrorFormat } = require('@wesleymilan/mef');

let errorsResult = null;

function loadErrors() {
  if (errorsResult) return errorsResult;
  try {
    errorsResult = require('../../mef/errors.json');
  } catch (e) {
    try {
      errorsResult = require('../../../mef/errors.json');
    } catch (e2) {
      throw new Error('MEF: could not load mef/errors.json. Adjust the path in errorFormat.js');
    }
  }
  return errorsResult;
}

function errorFormat(code) {
  return mefErrorFormat(code, loadErrors());
}

module.exports = errorFormat;

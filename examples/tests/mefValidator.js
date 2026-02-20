'use strict';

/**
 * Helper for functional tests (e.g. Jest + supertest) to validate error responses in MEF format.
 *
 * Load the project's errorsResult (mef/errors.json) and use validateMEFResponse
 * or expectMEFError as below.
 *
 * Example with Jest:
 *
 *   const request = require('supertest');
 *   const app = require('../app');
 *   const { validateMEFResponse, expectMEFErrorResponse } = require('@wesleymilan/mef/validator');
 *   const errorsResult = require('../../mef/errors.json');
 *
 *   it('returns MEF error when CPF is missing', async () => {
 *     const res = await request(app)
 *       .patch('/users/' + userId)
 *       .set('Authorization', 'Bearer ' + token)
 *       .send({ name: 'Test' });
 *
 *     const result = validateMEFResponse(res, 'USERS_UPDATE_CPF_REQUIRED', errorsResult);
 *     expect(result.valid).toBe(true);
 *   });
 *
 *   it('returns correct MEF code and message', async () => {
 *     const res = await request(app)
 *       .patch('/users/invalid-id')
 *       .set('Authorization', 'Bearer ' + token)
 *       .send({});
 *
 *     const out = expectMEFErrorResponse(res, 'USERS_UPDATE_ID_INVALID', errorsResult);
 *     expect(out.valid).toBe(true);
 *     expect(res.status).toBe(out.status);
 *     expect(res.body).toMatchObject(out.body);
 *   });
 */

const { validateMEFResponse, expectMEFErrorResponse } = require('../../validator.js');

/**
 * Helper that fails the test (Jest) with a clear message if the response is not valid MEF.
 * Usage: expectMEFError(res, 'USERS_UPDATE_CPF_REQUIRED', errorsResult);
 * (expect = Jest's expect function)
 */
function expectMEFError(response, expectedCode, errorsResult, expectFn) {
  const result = validateMEFResponse(response, expectedCode, errorsResult);
  if (result.valid) {
    if (expectFn) {
      expectFn(response.status).toBe(errorsResult[expectedCode].statusCode);
      expectFn(response.body.code).toBe(expectedCode);
      expectFn(response.body.message).toBe(errorsResult[expectedCode].message);
    }
    return;
  }
  throw new Error(result.message || 'Response is not in the expected MEF format');
}

module.exports = {
  validateMEFResponse,
  expectMEFErrorResponse,
  expectMEFError
};

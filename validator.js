'use strict';

/**
 * Validates that an API error response is in MEF format.
 * For use in tests (e.g. supertest).
 *
 * @param {object} response - supertest response object (res)
 * @param {string} expectedCode - Expected MEF code
 * @param {object} errorsResult - Object loaded from mef/errors.json
 * @returns {{ valid: boolean, message?: string }}
 */
function validateMEFResponse(response, expectedCode, errorsResult) {
  const def = errorsResult[expectedCode];
  if (!def) {
    return { valid: false, message: `Code "${expectedCode}" does not exist in errors.json` };
  }

  const body = response.body;
  if (!body || typeof body !== 'object') {
    return { valid: false, message: 'Response has no body or body is not an object' };
  }

  if (response.status !== def.statusCode) {
    return {
      valid: false,
      message: `Expected status ${def.statusCode}, got ${response.status}`
    };
  }

  if (body.code !== expectedCode) {
    return {
      valid: false,
      message: `Expected code "${expectedCode}", got "${body.code}"`
    };
  }

  if (body.message !== def.message) {
    return {
      valid: false,
      message: `Expected message "${def.message}", got "${body.message}"`
    };
  }

  return { valid: true };
}

/**
 * Returns a matcher/assertion for Jest.
 * Usage: expect(response).toEqual(expectMEFError('USERS_UPDATE_CPF_REQUIRED', errorsResult))
 * Or use expectMEFErrorResponse(response, 'USERS_UPDATE_CPF_REQUIRED', errorsResult) and expect(result.valid).toBe(true).
 *
 * @param {object} response - supertest response
 * @param {string} expectedCode
 * @param {object} errorsResult
 * @returns {object} Object with status and expected body for comparison
 */
function expectMEFErrorResponse(response, expectedCode, errorsResult) {
  const def = errorsResult[expectedCode];
  if (!def) {
    return {
      valid: false,
      error: `Code "${expectedCode}" does not exist in errors.json`
    };
  }
  const result = validateMEFResponse(response, expectedCode, errorsResult);
  if (!result.valid) {
    return { valid: false, error: result.message };
  }
  return {
    valid: true,
    status: def.statusCode,
    body: {
      statusCode: def.statusCode,
      code: expectedCode,
      message: def.message
    }
  };
}

module.exports = {
  validateMEFResponse,
  expectMEFErrorResponse
};

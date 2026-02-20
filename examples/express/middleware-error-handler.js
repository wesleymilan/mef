'use strict';

/**
 * Example Express error-handling middleware that respects MEF.
 *
 * - Errors created with errorFormat() (isMEF === true) are returned with
 *   { statusCode, code, message } and the corresponding HTTP status.
 * - Other 4xx errors may return only { message } to avoid leaking details.
 * - 5xx errors return a generic message.
 *
 * Usage in app.js:
 *   const { isMEFError } = require('@wesleymilan/mef');
 *   const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
 *
 *   app.use(function(err, req, res, next) {
 *     console.error('Error:', err.message);
 *     if (err.stack) console.error(err.stack);
 *     if (err.code) console.error('Code:', err.code);
 *
 *     const status = err.statusCode || err.status || 500;
 *     res.status(status);
 *
 *     if (req.path.startsWith('/api') || req.path.startsWith('/auth') || ...) {
 *       if (isMEFError(err)) {
 *         return res.json({
 *           statusCode: err.statusCode,
 *           code: err.code,
 *           message: err.message
 *         });
 *       }
 *       if (status >= 400 && status < 500 && err.message) {
 *         return res.json({ message: err.message });
 *       }
 *       return res.json({ message: GENERIC_ERROR_MESSAGE });
 *     }
 *
 *     res.locals.message = err.message;
 *     res.locals.error = req.app.get('env') === 'development' ? err : {};
 *     res.render('error');
 *   });
 */

const { isMEFError } = require('@wesleymilan/mef');

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

function apiPaths(req) {
  const p = req.path || '';
  return p.startsWith('/api') || p.startsWith('/auth') || p.startsWith('/users');
}

function mefErrorHandler(options = {}) {
  const genericMessage = options.genericMessage || GENERIC_ERROR_MESSAGE;

  return function errorHandler(err, req, res, next) {
    if (options.log !== false) {
      console.error('Error:', err.message);
      if (err.stack) console.error(err.stack);
      if (err.code) console.error('Code:', err.code);
    }

    const status = err.statusCode || err.status || 500;
    res.status(status);

    if (options.isApiRequest && options.isApiRequest(req)) {
      if (isMEFError(err)) {
        return res.json({
          statusCode: err.statusCode,
          code: err.code,
          message: err.message
        });
      }
      if (status >= 400 && status < 500 && err.message) {
        return res.json({ message: err.message });
      }
      return res.json({ message: genericMessage });
    }

    if (typeof next === 'function') {
      next(err);
    } else {
      res.send(genericMessage);
    }
  };
}

module.exports = {
  mefErrorHandler,
  isMEFError,
  apiPaths,
  GENERIC_ERROR_MESSAGE
};

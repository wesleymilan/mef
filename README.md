# @wesleymilan/mef

**MEF (Milan Error Format)** is a methodology and library for standardizing API errors: each error is identified by a **unique code**, an **HTTP status**, and a **message**. This enables negative testing, i18n, and unambiguous tracking of where each error is handled.

## Concepts

### Response body: the three fields

Every MEF error response is a JSON object with three fields:

- **`statusCode`** — Indicates the **level of criticality** of the error (e.g. 422 = validation only; 500 = serious backend exception that needs attention).
- **`code`** — **Machine readable**; unique error identifier for the whole application. Can be used as an array index, database key, or for i18n and business rules.
- **`message`** — **Human readable**; text to show to the user or use as fallback.

- **Unique code**: Each error in the app has an UPPERCASE code with words separated by `_` (e.g. `USERS_UPDATE_CPF_REQUIRED`). No code may be reused in another context.
- **Blocks**: A "block" is each sequence of characters between underscores. Examples:
  - `USERS_FINDBYID_NOTFOUND` → 3 blocks
  - `USERS_UPDATE_CPF_REQUIRED` → 4 blocks
- **Registry**: A JSON file (e.g. `mef/errors.json`) holds all codes with `statusCode` and `message`. The code is the key; the message can be used for translation on the frontend.

## Installation

```bash
npm install @wesleymilan/mef
```

## Quick start

1. **Error registry** (`mef/errors.json` in your project):

```json
{
  "USERS_UPDATE_CPF_REQUIRED": { "statusCode": 400, "message": "CPF is required" },
  "USERS_UPDATE_CPF_INVALID": { "statusCode": 400, "message": "Invalid CPF" }
}
```

2. **Create an error in controller or model**:

```js
const errorsResult = require('../mef/errors.json');
const { errorFormat } = require('@wesleymilan/mef');

return next(errorFormat('USERS_UPDATE_CPF_REQUIRED', errorsResult));
// or throw errorFormat('USERS_UPDATE_CPF_INVALID', errorsResult);
```

3. **Express error middleware**: return `{ statusCode, code, message }` when the error is MEF (use `isMEFError(err)`).

## API

- **`errorFormat(code, errorsResult)`**  
  Creates an `Error` with `statusCode`, `code`, and `message` from `errorsResult[code]`. Sets `err.isMEF = true`. Throws if the code is not in the registry.

- **`isMEFError(err)`**  
  Returns `true` if `err` was created with `errorFormat`.

- **`isValidCode(code, errorsResult)`**  
  Returns `true` if the code exists in `errorsResult`.

## CLI

From the project root (where `mef/errors.json` lives):

```bash
npx mef
# or
node node_modules/@wesleymilan/mef/cli.js
```

Options:

- **`--errors=path`** – Path to the error JSON (default: `mef/errors.json`).
- **`--root=path`** – Directory to scan (default: `process.cwd()`).
- **`--scan-only`** – Only list MEF codes found in code.
- **`--validate-only`** – Fail if unregistered codes or duplicates exist.
- **`--check-duplicates`** – Fail only if the same code appears in more than one file.
- **`--detect-uncovered`** – List **errors not covered by MEF**: places using `res.status(4xx|5xx).json({ message: ... })` instead of `next(errorFormat('CODE'))`. Use to find validations that still need migrating.
- **`--strict-uncovered`** – With the default scan, make the command fail (exit 1) when any uncovered error exists.

The scanner looks for `errorFormat('CODE')` or `errorFormat("CODE")` in `.js` files and compares with the registry. With `--detect-uncovered`, it also looks for `res.status(4xx|5xx).json(...)` to point out where MEF is not yet applied.

## Testing

Use the **validator** to assert API errors are in MEF format:

```js
const { validateMEFResponse } = require('@wesleymilan/mef/validator');
const errorsResult = require('../mef/errors.json');

const res = await request(app).patch('/users/123').send({});
const result = validateMEFResponse(res, 'USERS_UPDATE_CPF_REQUIRED', errorsResult);
expect(result.valid).toBe(true);
```

## Package examples

- **`examples/express/errorFormat.js`**  
  Wrapper that loads `mef/errors.json` and calls `errorFormat(code, errorsResult)`. Use as a template for `utils/errorFormat.js` in your Express app.

- **`examples/express/middleware-error-handler.js`**  
  Sample Express error middleware that checks `isMEFError(err)` and responds with `{ statusCode, code, message }` for MEF errors.

- **`examples/tests/mefValidator.js`**  
  Test helper (Jest + supertest) that validates API responses against the expected MEF format.

These examples are reference for **humans** and **AI agents** to adapt the library to other frameworks or languages: same idea (central registry, unique code, standardized response); only syntax and integration points change.

## Naming conventions (summary)

- **3 blocks**: `MODEL_FUNCTION_ERROR` (e.g. `USERS_FINDBYID_NOTFOUND`).
- **4 blocks**: `MODEL_FUNCTION_FIELD_ERROR` or `CONTROLLER_METHOD_FIELD_ERROR` (e.g. `USERS_UPDATE_CPF_REQUIRED`).
- **Auth/utils**: phrases like `AUTHORIZATION_REQUIRED`, `ACCESS_DENIED`.
- **Database**: `MODEL_FIELD_REQUIRED`, `MODEL_FIELD_INVALID`, etc.

Full rules and implementation guidance for AI agents are in **AGENTS.md**.

## License

ISC

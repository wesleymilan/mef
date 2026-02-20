# AGENTS.md – Implementation instructions for MEF (Milan Error Format)

This document is for **AI agents** implementing or extending the MEF methodology in an application. Follow these instructions for unique codes, a central registry, and consistent tests.

---

## 1. Definition of "block"

- A **block** is a sequence of one or more **uppercase letters and digits**, delimited by `_` (underscore) or the start/end of the string.
- Block count examples:
  - `USERS` → 1 block
  - `USERS_UPDATE` → 2 blocks
  - `USERS_FINDBYID_NOTFOUND` → 3 blocks (USERS, FINDBYID, NOTFOUND)
  - `USERS_UPDATE_CPF_REQUIRED` → 4 blocks (USERS, UPDATE, CPF, REQUIRED)

**Rule**: Each MEF code must have **at least 3 blocks**. Use 4 (or more) when needed for **uniqueness** (so the same code is not used for different contexts).

---

## 2. Naming patterns

### 2.1 Main pattern (3 blocks)

- **MODEL_FUNCTION_ERROR**  
  Model + function name + error type.  
  Example: `USERS_FINDBYID_NOTFOUND`.

- **CONTROLLER_METHOD_ERROR**  
  Controller (resource) + HTTP method or action + error.  
  Example: `AUTH_LOGIN_EMAIL_REQUIRED` (login = auth “method”).

- **LIBRARY_FUNCTION_ERROR**  
  Module/library + function + error.  
  Example: `DATETIME_PARSE_INVALID`.

### 2.2 Extended pattern (4 blocks)

- **MODEL_FUNCTION_FIELD_ERROR**  
  When the error is tied to a **field** within a model function.  
  Examples: `USERS_UPDATE_CPF_REQUIRED`, `USERS_UPDATE_BIRTHDAY_UNDER18`.

- **CONTROLLER_METHOD_FIELD_ERROR**  
  When the error is tied to a field in controller input.  
  Example: `EDITIONS_CREATE_STARTDATE_INVALID`.

- **LIBRARY_FUNCTION_PARAMETER_ERROR**  
  When the error is tied to a specific parameter.  
  Example: `CONFIG_GET_KEY_NOTFOUND`.

### 2.3 Generic modules (utils, auth, middleware)

When there is no clear “model” or “controller”, use blocks that form a **phrase**:

- `AUTHORIZATION_REQUIRED`
- `ACCESS_DENIED`
- `INVALID_DATE_CONVERSION_FORMAT`
- `INVALID_TIMEZONE_CODE`

For **auth middleware** in Express, for example:

- `MIDDLEWARE_AUTH_AUTHORIZATION_REQUIRED` (invalid/expired token)
- `MIDDLEWARE_AUTH_ACCESS_DENIED` (no permission)

### 2.4 Errors reflecting database/field validation

Suggested suffixes for fields:

- `_REQUIRED` – required field missing
- `_INVALID` – invalid format/value
- `_TRUNCATED` – value truncated
- `_MUSTBENUMBER`, `_MUSTBEDECIMAL`, `_MUSTBEBOOLEAN`
- `_MIN5CHARS`, `_MAX50CHARS`, `_MIN5MAX10`

Example: `USERS_UPDATE_CPF_INVALID`, `PRODUCTS_PRICE_MIN5MAX10`.

---

## 3. Central registry (errors.json)

- **File name**: by convention `mef/errors.json` at project root (can be configured).
- **Variable in code**: use **`errorsResult`** for the loaded object, e.g.:
  `const errorsResult = require('../mef/errors.json');`
- **Format**:
  - Key: MEF code (string, one entry per code).
  - Value: object with `statusCode` (HTTP number) and `message` (readable string).

Example:

```json
{
  "USERS_UPDATE_CPF_REQUIRED": { "statusCode": 400, "message": "CPF is required" },
  "USERS_UPDATE_CPF_INVALID": { "statusCode": 400, "message": "Invalid CPF" },
  "MIDDLEWARE_AUTH_ACCESS_DENIED": { "statusCode": 403, "message": "Access denied." }
}
```

- **Uniqueness**: Never reuse the same code in two different flows (e.g. do not use only `CPF_REQUIRED` for both users and another model). Always qualify with model/function/method (e.g. `USERS_UPDATE_CPF_REQUIRED`).

### 3.1 Response body: meaning of the three fields

Every MEF error response is a JSON object with three fields. Use this semantics consistently:

- **`statusCode`** — **Level of criticality** of the error (e.g. 422 = validation only; 500 = serious backend exception that needs attention). Use it for monitoring, alerting, and client-side flow (e.g. retry only on 5xx, show toast on 4xx validation).
- **`code`** — **Machine readable**; unique error identifier for the whole application. Use it as array index, database key, i18n key, or in WAF/business rules. Never reuse the same code for different errors.
- **`message`** — **Human readable**; text to show to the user or use as fallback when no translation exists for `code`.

---

## 4. Using the @wesleymilan/mef library

- **Create error**:  
  `errorFormat(code, errorsResult)`  
  - `code`: string, must exist in `errorsResult`.  
  - Returns an `Error` with `statusCode`, `code`, `message`, and `isMEF = true`.  
  - Throws if `code` is not in the registry.

- **Detect MEF error**:  
  `isMEFError(err)`  
  Use in error middleware to decide whether to respond with `{ statusCode, code, message }`.

- **Check code in registry**:  
  `isValidCode(code, errorsResult)`  
  Useful for tools or validation before calling `errorFormat`.

---

## 5. Integration in an Express app

1. **Local wrapper** (e.g. `utils/errorFormat.js`):
   - Load `errorsResult` from `mef/errors.json` (path relative to project).
   - Export a function that calls `errorFormat(code, errorsResult)`.
   - Everywhere in the project, use only this wrapper; **never** pass the message manually; the message always comes from the registry.

2. **Controllers and models**:
   - Where you currently do `res.status(400).json({ message: '...' })`, replace with `return next(errorFormat('CODE', errorsResult))` or, in the model, `throw errorFormat('CODE', errorsResult)`.
   - In models, when throwing a validation error, always use a unique MEF code (e.g. `USERS_UPDATE_CPF_REQUIRED`); in the controller just forward the error with `next(err)` if `err.isMEF` is already set.

3. **Error middleware**:
   - Use `isMEFError(err)`. If true, respond with `res.status(err.statusCode).json({ statusCode: err.statusCode, code: err.code, message: err.message })`.
   - For non-MEF 4xx errors, you may return only `{ message: err.message }` if safe.
   - For 5xx, return a generic message; do not expose stack or internal details.

---

## 6. Scanner and CLI

- The scanner looks in `.js` files (by default) for calls of the form:
  `errorFormat('CODE')` or `errorFormat("CODE")`.
- **Duplicate**: same `CODE` in more than one file → report and, in strict methodology, fail (code should be unique per context; if two places need the “same” error, the code is still unique in the app; if contexts differ, use different codes).
- **Unregistered**: code used in source but missing from `errors.json` → fail and require registration.
- **Unused**: code present in `errors.json` but never referenced in code → warning (may be legacy or planned).

Suggested command in the project’s `package.json`:
`"mef": "node node_modules/@wesleymilan/mef/cli.js"`  
(or `npx mef`) with `--root` and `--errors` as needed. The default command also runs uncovered-error detection and lists occurrences; use `--detect-uncovered` to only list uncovered, or `--strict-uncovered` to fail when any exist.

---

## 7. Testing

- **Negative tests**: For each MEF error the API can return, write a test that triggers that error and validates the response.
- **Response validation**:
  - Use `validateMEFResponse(response, expectedCode, errorsResult)` from the package (`validator.js`).
  - Ensure: `response.status === errorsResult[expectedCode].statusCode`, `response.body.code === expectedCode`, `response.body.message === errorsResult[expectedCode].message`.
- The helper in `examples/tests/mefValidator.js` shows how to integrate this with Jest/supertest; copy or adapt for the project.

---

## 8. Detecting errors not covered by MEF

- **Goal**: Find error responses that do **not** go through `errorFormat` (e.g. `res.status(400).json({ message: '...' })` directly in the controller).
- **Implementation**: The package provides `scanUncoveredErrors(rootDir, options)` in `scanner.js`, which scans `.js` files (except `node_modules`, `.git`, `packages`) for:
  - `res.status(4xx|5xx).json({ message:` or `return res.status(4xx|5xx).json({ message:`
  - `res.status(4xx|5xx).json(` (to also catch when `message` is on the next line).
- **CLI**:
  - `--detect-uncovered`: runs only the uncovered-error scan and lists file, line, and snippet. Does not load `errors.json`.
  - In the default command (`mef`), the same scan runs and results are shown. Use `--strict-uncovered` to make the command exit 1 when there are uncovered errors.
- **Usage**: `npm run mef:uncovered` or `npx mef --detect-uncovered` to review what still needs to be converted to MEF.
- **Efficiency**: Regex is fast; there may be false positives in comments or strings. List file and line for human review; do not change code automatically without confirmation.

---

## 9. Package examples (reference for other languages/frameworks)

- **`examples/express/errorFormat.js`**:  
  Shows how to load `errorsResult` and expose a single error-creation point (`errorFormat(code)`). In another language: a module that reads the JSON and returns an error object/structure with code, status, and message.

- **`examples/express/middleware-error-handler.js`**:  
  Shows how, in the Express error pipeline, to identify MEF errors and serialize the response in the standard format. In another framework (FastAPI, Spring, etc.): a global exception handler that, for “MEF” errors, returns JSON with statusCode, code, and message.

- **`examples/tests/mefValidator.js`**:  
  Shows how to validate the HTTP response in tests. In another language: same contract (status, body.code, body.message) with the same `errorsResult` (JSON), using the local test framework (pytest, JUnit, etc.).

When porting to another language or framework, keep:
1. Central registry (JSON or equivalent).
2. Unique code per error and block-based naming.
3. Standardized error response: HTTP status + code + message.
4. Tests that validate this format for each code used.

---

## 10. Agent checklist

When implementing or reviewing MEF in a project:

- [ ] `mef/errors.json` exists (or configured path) and the object is loaded as `errorsResult`.
- [ ] Every API error that should be standardized uses `errorFormat(code, errorsResult)` with a unique code.
- [ ] No code is shared between two different contexts (e.g. two models with the same field code).
- [ ] Codes have at least 3 blocks; 4 when there is model + function + field.
- [ ] Error middleware uses `isMEFError(err)` and responds with `{ statusCode, code, message }` for MEF errors.
- [ ] Negative tests use `validateMEFResponse` (or equivalent) for the relevant codes.
- [ ] Command `npm run mef` (or equivalent) is run and there are no duplicates or unregistered codes.
- [ ] Package examples (Express and tests) have been considered as a model for integration or porting.

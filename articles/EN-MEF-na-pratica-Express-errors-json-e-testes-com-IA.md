# MEF in practice: Express, errors.json, and tests with AI in a few hours

**Implementing the Milan Error Format in a Node/Express API — response body, i18n, and 100% coverage**

---

In the [previous article](EN-MEF-metodologia-beneficios-e-IA-como-padronizar-erros-de-API.md) I told the origin story of MEF: how it was born in 2017 during the development of the reservation system for Havasupai, a project with a tight deadline (3 months), high concurrency (5k+ concurrent users), no chance to test in production before launch, and which resulted in zero unexpected errors on go-live day — supporting 26k concurrent users and selling the entire year's reservations in 40 minutes. In 2020, with all errors already standardized and mapped, we were able to identify and contain an attack with more than 30,000 IPs using WAF rules based on MEF codes; the application exceeded 42,000 real concurrent users and sold the entire inventory again in under an hour.

The MEF methodology was what made it possible to develop backend and frontend in parallel and in sync, achieve 100% coverage and 100% predictability — and later integrate with the WAF to automatically block IPs, sessions, or suspicious request types. Today, with AI, it has become even more efficient.

Here I focus on the **how**: response body structure, central registry, using the lib in Express, error middleware, CLI, using the error list for translation, and example prompts I used to implement and for the AI to generate tests. The examples are from a fictional API (orders, payments, auth) for illustration only — no real data from my project.

---

## 1. The response body in the MEF format

Every error response that follows MEF returns a JSON with **three fields**:

| Field        | Use              | Example                                      |
|-------------|------------------|----------------------------------------------|
| **statusCode** | Level of criticality (e.g. 422 = validation; 500 = serious backend exception) | `400`, `401`, `422`, `500`            |
| **code**       | Machine readable; unique identifier, array index, database key | `ORDERS_CREATE_ITEM_REQUIRED`       |
| **message**    | Human readable   | `"Order item is required"`             |

- **statusCode:** defines the criticality of the error (e.g. 422 is just validation; 500 is a serious exception that needs attention).
- **code:** machine-readable error; unique identifier across the entire application; can be used as index or key (e.g. i18n, business rules).
- **message:** human-readable error; text to show the user or fallback when there's no translation by `code`.

Example responses the API returns:

**Validation (400):**
```json
{
  "statusCode": 400,
  "code": "ORDERS_CREATE_ITEM_REQUIRED",
  "message": "Order item is required"
}
```

**Unauthorized (401):**
```json
{
  "statusCode": 401,
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "Token expired, please sign in again"
}
```

**Not found (404):**
```json
{
  "statusCode": 404,
  "code": "ORDERS_GETBYID_NOTFOUND",
  "message": "Order not found"
}
```

**Rate limit (429):**
```json
{
  "statusCode": 429,
  "code": "AUTH_LOGIN_OTP_RATELIMIT",
  "message": "You have exceeded the request limit. Please wait 15 minutes."
}
```

**Internal error (500) — can still be MEF if you register it:**
```json
{
  "statusCode": 500,
  "code": "PAYMENTS_GATEWAY_ERROR",
  "message": "Temporary processing failure. Please try again in a moment."
}
```

The error middleware (below) builds this JSON when the error is created with `errorFormat`. So everyone consuming the API receives the same format.

---

## 2. Central registry: `mef/errors.json`

Every API error is registered in a single JSON file. The key is the **code**; the value has `statusCode` and `message`:

```json
{
  "ORDERS_CREATE_ITEM_REQUIRED": { "statusCode": 400, "message": "Order item is required" },
  "ORDERS_CREATE_ITEM_INVALID": { "statusCode": 400, "message": "Invalid item" },
  "ORDERS_GETBYID_NOTFOUND": { "statusCode": 404, "message": "Order not found" },
  "PAYMENTS_TOKEN_INVALID": { "statusCode": 401, "message": "Payment token invalid or expired" },
  "PAYMENTS_GATEWAY_ERROR": { "statusCode": 500, "message": "Temporary processing failure. Please try again in a moment." },
  "AUTH_EMAIL_REQUIRED": { "statusCode": 400, "message": "Email is required" },
  "AUTH_TOKEN_EXPIRED": { "statusCode": 401, "message": "Token expired, please sign in again" },
  "AUTH_LOGIN_OTP_RATELIMIT": { "statusCode": 429, "message": "You have exceeded the request limit. Please wait 15 minutes." }
}
```

Naming convention in blocks: `RESOURCE_ACTION_CONTEXT` (e.g. `ORDERS_CREATE_ITEM_REQUIRED`). That makes it easy to find, the AI understands the domain; **statusCode** indicates criticality (e.g. 422 validation, 500 serious exception) and **code** is the unique identifier (machine readable) for index, key, or i18n.

---

## 3. Project wrapper: `utils/errorFormat.js`

The `@wesleymilan/mef` lib exposes `errorFormat(code, errorsResult)`. In the project we load `errors.json` once and export a function that only takes the code:

```javascript
'use strict';

const { errorFormat: mefErrorFormat } = require('@wesleymilan/mef');
const errorsResult = require('../mef/errors.json');

function errorFormat(code) {
  return mefErrorFormat(code, errorsResult);
}

module.exports = errorFormat;
```

In the controller or model: `return next(errorFormat('ORDERS_CREATE_ITEM_REQUIRED'));` or `throw errorFormat('PAYMENTS_TOKEN_INVALID');`. The lib fills `statusCode`, `code`, and `message` from the registry; the middleware just forwards that in the response body.

---

## 4. Error middleware in Express

In the error middleware we check if the error is MEF (`isMEFError`) and, if so, return the standardized body with the three fields:

```javascript
const { isMEFError } = require('@wesleymilan/mef');

app.use(function (err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  if (isMEFError(err)) {
    return res.status(status).json({
      statusCode: err.statusCode,
      code: err.code,
      message: err.message
    });
  }

  // Non-MEF errors: log, don't expose details to client
  console.error(err);
  res.status(status).json({ message: 'An error occurred. Please try again later.' });
});
```

So every error created with `errorFormat` becomes a consistent `{ statusCode, code, message }` response. The client can rely on the fact that when it receives a JSON with `code`, it's MEF; when it doesn't have `code`, it's a generic response (e.g. 500).

---

## 5. Lib CLI: scan, validate, and uncovered

In `package.json`:

```json
"scripts": {
  "mef": "node node_modules/@wesleymilan/mef/cli.js",
  "mef:scan": "npm run mef -- --scan-only",
  "mef:validate": "npm run mef -- --validate-only",
  "mef:uncovered": "npm run mef -- --detect-uncovered"
}
```

- **`npm run mef`** — Validates codes in the codebase against `errors.json`, lists covered, duplicates, and unregistered. Generates `mef/uncovered.txt` with snippets that still use `res.status(4xx|5xx).json({ message: ... })` instead of MEF.
- **`mef:scan`** — Only lists MEF codes found in the code. That list is **exactly** the set of codes your API can return — ideal for i18n and documentation.
- **`mef:validate`** — Fails (exit 1) if there's code in the codebase that isn't in the registry or if there are duplicates.
- **`mef:uncovered`** — Lists errors not yet covered by MEF and writes them to `mef/uncovered.txt`.

The `uncovered.txt` looks like this (fictional example):

```
Errors not covered by MEF (res.status(4xx|5xx).json without errorFormat)

routes/orders.js:45
  return res.status(400).json({ message: 'Item required' });

routes/payments.js:22
  res.status(401).json({ message: 'Invalid token' });

Total: 2 occurrence(s).
Register in mef/errors.json: "CODE_MEF": { "statusCode": 4xx, "message": "..." }
In code use: next(errorFormat('CODE_MEF')).
```

That becomes your task list: migrate each snippet to `errorFormat` and register the code in `errors.json`.

---

## 6. Translation (i18n) using the lib's error list

Since all possible errors are in `errors.json` (and the lib can list all codes used in the code with `mef:scan`), you have a **complete catalog** to translate. No error is "hidden" in some controller.

Suggested flow:

1. **Export the codes:** run `npm run mef -- --scan-only` and use the output, or read the keys from `mef/errors.json`.
2. **Create language files by code:** instead of translating loose messages, you map **code → text**. Example (fictional structure):

```json
// i18n/pt-BR.json
{
  "ORDERS_CREATE_ITEM_REQUIRED": "Item do pedido é obrigatório",
  "ORDERS_GETBYID_NOTFOUND": "Pedido não encontrado",
  "AUTH_TOKEN_EXPIRED": "Token expirado, faça login novamente"
}
```

```json
// i18n/en.json
{
  "ORDERS_CREATE_ITEM_REQUIRED": "Order item is required",
  "ORDERS_GETBYID_NOTFOUND": "Order not found",
  "AUTH_TOKEN_EXPIRED": "Token expired, please sign in again"
}
```

3. **On the frontend (or gateway):** when you receive a MEF response, use `res.body.code` to look up the translation in the user's language. If not found, use `res.body.message` as fallback (the message from the backend, usually in the default language).

Advantage: when you add a new code to `errors.json`, you only need to add the same key to the i18n files. The list generated by the lib ensures you don't miss any error.

---

## 7. Tests: one per MEF code

The idea is: for every code a route can return, there is at least one test that forces that response and validates **statusCode**, **code**, and **message**. On the Havasupai project this approach was essential: with no chance to test in production before launch, every MEF code needed its test. That guaranteed 100% coverage and zero unexpected errors on go-live.

Example with Jest + supertest:

```javascript
const request = require('supertest');
const app = require('../../app');
const errorsRegistry = require('../../mef/errors.json');

function expectMef(res, code) {
  const def = errorsRegistry[code];
  expect(def).toBeDefined();
  expect(res.status).toBe(def.statusCode);
  expect(res.body).toMatchObject({ code, message: def.message });
}

test('ORDERS_CREATE_ITEM_REQUIRED - body without item', async () => {
  const res = await request(app)
    .post('/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  expectMef(res, 'ORDERS_CREATE_ITEM_REQUIRED');
});
```

The `errors.json` is the source of truth: expected status and message come from there. So when you change the message in the registry (or add a translation), the test still validates code and status; the message assertion uses the value from the registry.

You can also ensure the body has exactly the three MEF fields:

```javascript
expect(res.body).toHaveProperty('statusCode');
expect(res.body).toHaveProperty('code');
expect(res.body).toHaveProperty('message');
```

---

## 8. Prompts I used (summary)

I used short, objective prompts; the AI had access to `errors.json` and `uncovered.txt` (or a description of them).

**Migrate errors to MEF:**

- *"In this project we use the MEF methodology for API errors. The registry is in mef/errors.json. The file mef/uncovered.txt lists snippets that still use res.status(4xx|5xx).json. Migrate each snippet to next(errorFormat('CODE')) and add the codes to errors.json following the RESOURCE_ACTION_CONTEXT pattern."*

**Validate and list what's missing:**

- *"Run npm run mef and tell me how many codes are covered, how many uncovered, and if there are codes in the code that aren't in errors.json."*

**Create negative tests:**

- *"For the Orders resource, create functional tests (Jest + supertest) that cover every MEF code listed in mef/errors.json that starts with ORDERS_. One test per code; use expectMef(res, code) comparing status and body with the registry. The MEF response has statusCode (criticality level), code (machine readable; unique identifier), and message (human readable)."*

**Cover uncovered:**

- *"The mef/uncovered.txt file lists errors that don't use errorFormat yet. For each line in the file, add the code to mef/errors.json and replace the res.status(...).json with next(errorFormat('CODE'))."*

**Prepare i18n:**

- *"Based on the keys in mef/errors.json, create a translation file (e.g. i18n/en.json) mapping each code to a message in English. Use the messages in errors.json as reference for meaning."*

With prompts like these, the AI can keep the pattern, suggest tests aligned with the contract, and even draft translation files from the code catalog.

---

## 9. Estimate: 100% coverage in a few hours

On the Havasupai project (2017), we developed the MEF methodology and applied it manually over 3 months. Every error was cataloged, every test was written. The result: zero unexpected errors at launch, even with 26k concurrent users.

Today, with AI, this process is much faster. In a typical scenario (API with dozens of endpoints and dozens of MEF codes):

- **Migrate responses to MEF** (using `uncovered.txt` and `errors.json`): 1–2 h with AI suggesting codes and replacements.
- **Write negative tests** (one per code, based on `errors.json`): 2–3 h in partnership with the AI, which generates cases and test skeletons; you adjust scenarios and sensitive data.
- **Run `mef`, fix duplicates and orphan codes**: ~30 min.
- **Set up i18n base** (export codes and fill language files): ~30 min to 1 h, since the error list is unique and centralized.

Possible outcome: **over 100 tests**, **100% of MEF codes covered**, and **catalog ready to translate all errors** in a **few hours** of human + AI work, with `errors.json` and `uncovered.txt` as the guide. The methodology that took 3 months to develop and apply manually on Havasupai can now be replicated on new projects in a matter of hours, thanks to automation and AI assistance.

---

## 10. Where to find the lib and documentation

- **npm:** `@wesleymilan/mef`
- **Basic usage:** `errorFormat(code, errorsResult)`, `isMEFError(err)`, `isValidCode(code, errorsResult)`
- **CLI:** options `--scan-only`, `--validate-only`, `--detect-uncovered`, `--strict-uncovered`
- **Examples:** in the package's `examples` folder (Express and tests with MEF validator)

If you already use Express and want to standardize errors, it's worth starting with `errors.json` and the `errorFormat` wrapper; then the middleware and tests. The `uncovered.txt` and the code list (scan) help close the migration and prepare i18n; the AI speeds up tests and consistency.

---

**Written by Wesley Milan**  
**Assisted by Nexus**

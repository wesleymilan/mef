# MEF: The method that standardized my API errors (and made even the AI smarter)

**Why I standardized all my API errors — productivity, security, i18n, and tests with AI assistance**

---

I'm Wesley Milan, and in 2017 I was hired to build the online reservation system for **Havasupai** permits, one of the world's most sought-after tourist destinations. The challenge was huge: we had only **3 months** to build the API, frontend, and admin, with many business rules specific to that domain. The application had to support at least **5,000 concurrent users** while guaranteeing no overbooking. All of this with just **two developers**.

The solution was to develop a technique that let us build the backend and frontend **in parallel, perfectly in sync**, with no errors and no drift. And there was one last challenge: there was no way to test the system in the real world before launch, because the project started in November, and on **February 1st at exactly 2:00 PM (Brazil time)** the system would go live — no room for error.

To meet the deadline with all requirements, I needed a methodology that would give me **100% coverage** of the application and **100% predictability** over its behavior. A lot of people will say: "that's impossible." So read to the end.

Not only did we ship the application on time; it went live, supported more than **26,000 concurrent users** on the very first launch, sold the entire year's reservations in **40 minutes**, and had **ZERO unexpected errors**. The only events reported to the error logging system were validation responses (422), which aren't really errors.

The functional tests and stress simulations we ran throughout January gave us a complete picture of the application's behavior. We could predict which parts might overload the servers, fix bottlenecks, and refine the application so much that on launch day **server load was below 4%**. It even looked like the system was down, but it was actually running so efficiently that it could have handled **4x the volume** of users.

The development work was essential, of course, but without the methodology I developed to control errors, none of this would have been humanly possible in the time we had. That methodology is **MEF — Milan Error Format**: every error in the application has a **unique code**, an **HTTP status**, and a **message**. All registered in one place.

Today, with the rise of AI, this methodology has become even more effective, making AI-assisted programming easier and more accurate — implementing **100% test coverage** in an application in a few hours, including positive tests and, most importantly, **negative tests**, which ensure the application's integrity and stability.

In this article I share the experience of adopting MEF: gains in productivity, security, internationalization (error translation), test coverage, and — spoiler — how it improved even the work we do with AI. In the next article I go into the practical details: Express, code, and example prompts. Here the focus is the **why** and **what changed**.

---

## What the API returns: the three MEF fields

Every error response in the MEF format includes three pieces of information in the JSON body:

- **`statusCode`** — Used to determine the **level of criticality** of the error. For example: 422 is just validation; 500 is a serious backend exception that needs immediate attention.
- **`code`** — The **machine-readable** error: it can be used as an array index, a database key, and is a **unique error identifier** across the entire application.
- **`message`** — The **human-readable** error: the text that can be shown to the user (or used as a fallback). It can be in Portuguese in the backend and, on the frontend, replaced by a translation keyed by `code`.

Example responses in the MEF format:

```json
{
  "statusCode": 400,
  "code": "ORDERS_CREATE_ITEM_REQUIRED",
  "message": "Order item is required"
}
```

```json
{
  "statusCode": 401,
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "Token expired, please sign in again"
}
```

```json
{
  "statusCode": 404,
  "code": "ORDERS_GETBYID_NOTFOUND",
  "message": "Order not found"
}
```

```json
{
  "statusCode": 429,
  "code": "AUTH_LOGIN_OTP_RATELIMIT",
  "message": "You have exceeded the request limit. Please wait 15 minutes."
}
```

The frontend (or a gateway) can use them like this: **statusCode** for criticality level (e.g. 422 = validation toast; 500 = alert for the team), **code** as the unique identifier for translation lookup, indexes, or business rules, **message** to display when there's no translation or for log descriptions.

---

## "What if we gave every error a name?"

**Wesley:** On the Havasupai project we had a critical problem: we needed to develop the backend and frontend **in parallel** to meet the deadline. But how could we guarantee that the frontend would know exactly which errors the API could return? How could we guarantee there would be no drift between what the backend returned and what the frontend expected?

**Nexus:** *[Nexus is the AI assistant that helped me write and implement this. Yes, I gave it a name. It makes the conversation easier.]*

**Nexus:** What if every error had a unique name?

**Wesley:** Exactly! That's how the idea was born: **one code per error**. Like `RESERVATIONS_CREATE_DATE_INVALID`, `RESERVATIONS_OVERBOOKING`, `PAYMENTS_GATEWAY_ERROR`. All in a central JSON file — `mef/errors.json` — with status and message. In the code, instead of building the JSON by hand, we just call `errorFormat('RESERVATIONS_CREATE_DATE_INVALID')` and we're done. The frontend had access to the same `errors.json` and knew exactly which errors to expect. Zero drift.

**Nexus:** A single source of truth. The frontend (and any consumer) always receives `{ statusCode, code, message }`. The team knows which error is which by `code` (unique identifier) and the criticality by `statusCode`. In the Havasupai case, that let you develop in parallel without constantly syncing "oh, I changed the error message here."

**Wesley:** And more: in tests we didn't just check the status. Any 400 wasn't "ok." We validated the **specific code**. That guaranteed every possible error had a test that forced it. 100% coverage, 100% predictability.

---

## Productivity and less "where did I put that error?"

Before: searching through controllers, middlewares, and models for `res.status(4xx)` or `throw new Error`. After: open `errors.json` and see **all** the API errors. Block-based naming (resource, action, type) makes them easy to find: `ORDERS_CREATE_ITEM_REQUIRED`, `PAYMENTS_TOKEN_INVALID`. Refactoring became safer — if someone removes an `errorFormat('X')`, the lib validator flags that the code is in the JSON but no longer used, or that there's code in the codebase that isn't in the JSON. Productivity goes up because no one is hunting for a lost message in a random file.

Another advantage: **onboarding**. A new developer (or the AI itself) opens `errors.json` and in minutes understands which errors the API can return. No need to dig through dozens of files.

---

## Translation (i18n): a single catalog of errors for the whole world

**Wesley:** We had a product that needed messages in Portuguese and English. Before MEF, messages were scattered across the code. Any text change or new language was a slog.

**Nexus:** And with MEF?

**Wesley:** The `errors.json` (and the list the lib generates — like the code scan and `uncovered.txt`) becomes the **complete catalog** of application errors. Each code is a stable key. On the frontend (or in an i18n service), we don't translate loose messages; we translate by **code**. Example: for code `ORDERS_CREATE_ITEM_REQUIRED` we have "Order item is required" in pt-BR and in en. If we change the Portuguese text tomorrow, the code stays the same; the English translation doesn't break. And the best part: the **list of errors generated by the lib** (all codes used in the codebase plus those in the registry) is exactly the list you need to translate. No error is "hidden" in some controller that nobody remembered to add to the language file. You export the codes from `errors.json` or use the output of `mef --scan-only` and generate the code → message mapping for each language. Full coverage.

**Nexus:** So: MEF isn't just standardization; it's the foundation for consistent i18n. The backend can keep returning the message in a default language (human readable), and the frontend uses `code` to show the right translation to the user.

---

## Security: predictability and detecting suspicious behavior

Here's a benefit I hadn't planned on day one: **predictability**.

When every error is cataloged, the application only returns what's in the registry. So:

- **"Expected" error** (validation, business rule): always a known MEF code. E.g. `AUTH_LOGIN_NOTFOUND`, `USERS_UPDATE_CPF_INVALID`.
- **Unexpected error** (unhandled exception, bug): hits the generic middleware. We can log the stack, send it to monitoring, and **not** expose details in the response body. The client gets a generic message; the team gets the alert.

**Wesley:** Over time we started seeing it like this: if we get a 500 with a body that isn't MEF, it's either our bug or something we need to handle and turn into MEF. If an IP starts receiving a bunch of different codes in sequence — like trying random routes and parameters — we see it as a possible bot or scan. It's not that MEF "blocks" the attack; it makes behavior **predictable** and easy to monitor. You know exactly which codes are "normal" in each flow; whatever doesn't fit becomes a signal.

**Nexus:** So: what's legitimate follows a known set of codes. What doesn't becomes a signal for attention. **statusCode** indicates criticality (e.g. 422 validation, 500 serious exception); **code** identifies which error occurred, allowing different policies for log, alert, or response.

**Wesley:** And there's more: with all errors standardized and mapped, it becomes much easier to identify requests that happen to find weaknesses in the application, and **automatically block** by IP, session, or request type via a **Web Application Firewall (WAF)**. That's how we contained an attack with more than **30,000 IPs** in 2020: the WAF rules used MEF codes and the response pattern to tell legitimate traffic from malicious. The Havasupai application exceeded **42,000 real concurrent users** that year and once again sold the entire inventory in under an hour — with the threat contained and the system stable.

---

## Test coverage: one test per code (and AI joins the game)

On the Havasupai project we had no way to test in production before launch. The only way to guarantee everything would work was **100% test coverage** and **100% predictability**. With every error named, the rule was clear: **for every code in `errors.json` that a route can return, there is at least one test that forces that code**. It's not "a test that returns 400"; it's "a test that guarantees that in this scenario the API returns exactly `RESERVATIONS_CREATE_DATE_INVALID`" with the correct `statusCode` and `code`.

The MEF lib also generates a **`mef/uncovered.txt`** file listing places where the API still responds with `res.status(4xx|5xx).json({ message: ... })` instead of `errorFormat('CODE')`. In other words: errors that haven't been migrated to the standard yet. That became our checklist to reach 100% MEF coverage and, in the process, to write the missing tests.

**Wesley:** On Havasupai we ran functional tests and stress simulations throughout January. Every MEF code had its test. Every possible error scenario was covered. That gave us the confidence that when the system went live there would be no surprises. And there weren't: zero unexpected errors. The only events in the logs were 422 validations — which aren't errors, they're expected responses.

Today, with AI, this process has gotten even faster. On recent projects we've reached **over 100 tests** and **full coverage of MEF codes** in a few hours of joint work: me defining rules and scenarios, the AI suggesting cases and test code based on `errors.json` and `uncovered.txt`. The AI read the registry, read the uncovered list, and proposed: "this code is missing a test, it could be like this."

**Nexus:** The `errors.json` acts as the contract. The `uncovered.txt` acts as the task list. Together they give the AI enough context to apply the MEF pattern across the application and create tests in an automated way, without inventing codes or messages. On Havasupai that was done manually, but with the same methodology: every error cataloged, every error tested.

---

## AI understanding the application better

In the age of AI-assisted programming, a code like `USERS_UPDATE_CPF_REQUIRED` is much clearer than a loose comment or a free-form message. The AI can:

- **Understand the domain:** codes follow a pattern (resource, action, complement). It infers that there is a Users resource, Update action, CPF field, Required type.
- **Suggest tests:** given `errors.json`, it knows which codes exist and can propose scenarios (body without CPF, invalid CPF, etc.).
- **Keep consistency:** when implementing a new endpoint, the instruction "use the MEF pattern; codes are in mef/errors.json" makes the AI reuse the format instead of creating ad-hoc messages.
- **Use criticality and identifier:** since `statusCode` indicates criticality (422 validation, 500 serious) and `code` uniquely identifies the error type, the AI can suggest different handling on the frontend or in gateways (e.g. don't auto-retry on 4xx validation; do retry on 429 with backoff).

**Wesley:** I literally added to the project context: "for API errors, use errorFormat and mef/errors.json; for negative tests, one test per MEF code." The AI stopped inventing messages and started following the registry. Less rework, less drift.

**Nexus:** In short: MEF becomes executable documentation. The AI reads the JSON and the uncovered list and knows what to do. And the fact that the response body is always `{ statusCode, code, message }` makes the API contract easier to describe and for tools and AI to follow.

---

## Summary

- **MEF** = one unique code per error + central registry (`mef/errors.json`) + standardized response in three fields: **statusCode** (level of criticality; e.g. 422 validation, 500 serious exception), **code** (machine readable; unique identifier, index, key), **message** (human readable).
- **Benefits:** more productivity, simple mapping, predictability (including security and monitoring), **solid base for i18n** (translating all errors from the list generated by the lib), and test coverage aligned with the error contract.
- **Proof of concept:** on the Havasupai project (2017), MEF made it possible to develop backend and frontend in parallel, achieve 100% coverage and predictability, and result in zero unexpected errors at launch — even with 26k concurrent users and no chance to test in production before go-live.
- **With AI:** MEF mapping improves the AI's understanding of the application and, with the lib (and files like `errors.json` and `uncovered.txt`), lets it identify and create tests in an automated way, keeping the pattern consistent across the API. Today, implementing 100% coverage with over 100 tests takes a few hours of human + AI work.

In the next article I cover the **how**: structure of `errors.json`, response body examples, using the lib in Express, error middleware, CLI (scan, validate, detect-uncovered), i18n using the code list, and example prompts I used to implement and test it all.

If you'd like, share in the comments how you handle errors in your API today — I'd love to exchange ideas.

---

**Written by Wesley Milan**  
**Assisted by Nexus**

# MEF na prática: Express, errors.json e testes com IA em poucas horas

**Implementando o Milan Error Format em uma API Node/Express — corpo da resposta, i18n e 100% de cobertura**

---

No [artigo anterior](MEF-metodologia-beneficios-e-IA-como-padronizar-erros-de-API.md) contei a história de origem do MEF: como nasceu em 2017 durante o desenvolvimento do sistema de reservas para Havasupai, um projeto com prazo apertado (3 meses), alta concorrência (5k+ usuários simultâneos), sem possibilidade de testes reais antes do lançamento, e que resultou em zero erros imprevistos no dia do go-live — suportando 26k usuários simultâneos e vendendo todas as reservas do ano em 40 minutos. Em 2020, com todos os erros já padronizados e mapeados, conseguimos identificar e conter um ataque com mais de 30 mil IPs usando regras no WAF baseadas nos códigos MEF; a aplicação superou 42 mil usuários reais simultâneos e vendeu o inventário inteiro de novo em menos de 1 hora.

A metodologia MEF foi o que permitiu desenvolver backend e frontend em paralelo de forma sincronizada, ter 100% de cobertura e 100% de previsibilidade — e, mais tarde, integrar com WAF para bloquear automaticamente IPs, sessões ou tipos de requisição suspeitos. Hoje, com IAs, ela ficou ainda mais eficiente.

Aqui entro no **como**: estrutura do corpo de resposta, registro central, uso da lib no ExpressJS, middleware de erro, CLI, uso da lista de erros para tradução e exemplos de prompts que usei para implementar e para a IA gerar testes. Os exemplos são de uma API fictícia (pedidos, pagamentos, auth) só para ilustrar.

---

## 1. O corpo da resposta no padrão MEF

Toda resposta de erro que segue o MEF devolve um JSON com **três campos**:

| Campo        | Uso              | Exemplo                                      |
|-------------|------------------|----------------------------------------------|
| **statusCode** | Nível de criticidade (ex.: 422 = validação; 500 = exceção grave no backend) | `400`, `401`, `422`, `500`            |
| **code**       | Machine readable; identificador único, índice em arrays, chave em bancos de dados | `ORDERS_CREATE_ITEM_REQUIRED`       |
| **message**    | Human readable   | `"Item do pedido é obrigatório"`             |

- **statusCode:** define a criticidade do erro (ex.: 422 é só validação; 500 é exceção grave que precisa de atenção).
- **code:** erro machine readable; identificador único na aplicação inteira; pode ser usado como índice ou chave (ex.: i18n, regras de negócio).
- **message:** erro human readable; texto para exibir ao usuário ou fallback quando não houver tradução por `code`.

Exemplos de respostas que a API devolve:

**Validação (400):**
```json
{
  "statusCode": 422,
  "code": "ORDERS_CREATE_ITEM_REQUIRED",
  "message": "Item do pedido é obrigatório"
}
```

**Não autorizado (401):**
```json
{
  "statusCode": 401,
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "Token expirado, faça login novamente"
}
```

**Não encontrado (404):**
```json
{
  "statusCode": 404,
  "code": "ORDERS_GETBYID_NOTFOUND",
  "message": "Pedido não encontrado"
}
```

**Rate limit (429):**
```json
{
  "statusCode": 429,
  "code": "AUTH_LOGIN_OTP_RATELIMIT",
  "message": "Você excedeu o limite de solicitações. Aguarde 15 minutos."
}
```

**Erro interno (500) — ainda pode ser MEF se você registrar:**
```json
{
  "statusCode": 500,
  "code": "PAYMENTS_GATEWAY_ERROR",
  "message": "Falha temporária no processamento. Tente novamente em instantes."
}
```

O middleware de erro (mais abaixo) é quem monta esse JSON quando o erro for criado com `errorFormat`. Assim, todo mundo que consome a API recebe o mesmo formato.

---

## 2. Registro central: `mef/errors.json`

Todo erro da API fica registrado em um único JSON. A chave é o **código**; o valor tem `statusCode` e `message`:

```json
{
  "ORDERS_CREATE_ITEM_REQUIRED": { "statusCode": 422, "message": "Item do pedido é obrigatório" },
  "ORDERS_CREATE_ITEM_INVALID": { "statusCode": 422, "message": "Item inválido" },
  "ORDERS_GETBYID_NOTFOUND": { "statusCode": 404, "message": "Pedido não encontrado" },
  "PAYMENTS_TOKEN_INVALID": { "statusCode": 401, "message": "Token de pagamento inválido ou expirado" },
  "PAYMENTS_GATEWAY_ERROR": { "statusCode": 500, "message": "Falha temporária no processamento. Tente novamente em instantes." },
  "AUTH_EMAIL_REQUIRED": { "statusCode": 422, "message": "Email é obrigatório" },
  "AUTH_TOKEN_EXPIRED": { "statusCode": 401, "message": "Token expirado, faça login novamente" },
  "AUTH_LOGIN_OTP_RATELIMIT": { "statusCode": 429, "message": "Você excedeu o limite de solicitações. Aguarde 15 minutos." }
}
```

Convenção de nomes em blocos: `RECURSO_AÇÃO_CONTEXTO` (ex.: `ORDERS_CREATE_ITEM_REQUIRED`). Assim fica fácil achar, a IA entende o domínio; o **statusCode** indica a criticidade (ex.: 422 validação, 500 exceção grave) e o **code** é o identificador único (machine readable) para índice, chave ou i18n.

---

## 3. Wrapper no projeto: `utils/errorFormat.js`

A lib `@wesleymilan/mef` expõe `errorFormat(code, errorsResult)`. No projeto a gente carrega o `errors.json` uma vez e exporta uma função que só recebe o código:

```javascript
'use strict';

const { errorFormat: mefErrorFormat } = require('@wesleymilan/mef');
const errorsResult = require('../mef/errors.json');

function errorFormat(code) {
  return mefErrorFormat(code, errorsResult);
}

module.exports = errorFormat;
```

No controller ou model: `return next(errorFormat('ORDERS_CREATE_ITEM_REQUIRED'));` ou `throw errorFormat('PAYMENTS_TOKEN_INVALID');`. A lib preenche `statusCode`, `code` e `message` a partir do registro; o middleware só repassa isso no corpo da resposta.

---

## 4. Middleware de erro no Express

No middleware de erro, verificamos se o erro é MEF (`isMEFError`) e, em caso positivo, devolvemos o corpo padronizado com os três campos:

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

  // Erros não-MEF: logar, não expor detalhe ao cliente
  console.error(err);
  res.status(status).json({ message: 'Ocorreu um erro. Tente novamente mais tarde.' });
});
```

Assim, todo erro criado com `errorFormat` vira resposta `{ statusCode, code, message }` de forma consistente. O cliente pode confiar que, quando receber um JSON com `code`, é MEF; quando não tiver `code`, é resposta genérica (ex.: 500).

---

## 5. CLI da lib: scan, validate e uncovered

No `package.json`:

```json
"scripts": {
  "mef": "node node_modules/@wesleymilan/mef/cli.js",
  "mef:scan": "npm run mef -- --scan-only",
  "mef:validate": "npm run mef -- --validate-only",
  "mef:uncovered": "npm run mef -- --detect-uncovered"
}
```

- **`npm run mef`** — Valida códigos do código contra o `errors.json`, lista cobertos, duplicados e não registrados. Gera `mef/uncovered.txt` com trechos que ainda usam `res.status(4xx|5xx).json({ message: ... })` em vez de MEF.
- **`mef:scan`** — Só lista os códigos MEF encontrados no código. Essa lista é **exatamente** o conjunto de códigos que sua API pode devolver — ideal para i18n e para documentação.
- **`mef:validate`** — Falha (exit 1) se houver código de erro na aplicação que não está no registro ou se houver duplicatas.
- **`mef:uncovered`** — Lista erros ainda não cobertos pelo MEF e grava em `mef/uncovered.txt`.

O `uncovered.txt` fica assim:

```
Errors not covered by MEF (res.status(4xx|5xx).json without errorFormat)

routes/orders.js:45
  return res.status(400).json({ message: 'Item obrigatório' });

routes/payments.js:22
  res.status(401).json({ message: 'Token inválido' });

Total: 2 occurrence(s).
Register in mef/errors.json: "CODE_MEF": { "statusCode": 4xx, "message": "..." }
In code use: next(errorFormat('CODE_MEF')).
```

Isso vira lista de tarefas: migrar cada trecho para `errorFormat` e registrar o código no `errors.json`.

---

## 6. Tradução (i18n) usando a lista de erros da lib

Como todos os erros possíveis estão no `errors.json` (e a lib pode listar todos os códigos usados no código com `mef:scan`), você tem um **catálogo completo** para traduzir. Não falta nenhum erro "escondido" em algum controller.

Fluxo sugerido:

1. **Exportar os códigos:** rode `npm run mef -- --scan-only` e use a saída, ou leia as chaves do `mef/errors.json`.
2. **Criar arquivos de idioma por código:** em vez de traduzir mensagens soltas, você mapeia **code → texto**. Exemplo:

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

3. **No front (ou no gateway):** ao receber a resposta MEF, use `res.body.code` para buscar a tradução no idioma do usuário. Se não achar, use `res.body.message` como fallback (a mensagem que veio do backend, em geral no idioma padrão).

Vantagem: quando você adiciona um novo código no `errors.json`, basta adicionar a mesma chave nos arquivos de i18n. A lista gerada pela lib garante que você não esqueça nenhum erro.

---

## 7. Testes: um por código MEF

A ideia é: para cada código que uma rota pode devolver, existe pelo menos um teste que força aquela resposta e valida **statusCode**, **code** e **message**. No projeto Havasupai, essa abordagem foi essencial: sem possibilidade de testes reais antes do lançamento, cada código MEF precisava ter seu teste. Isso garantiu 100% de cobertura e zero erros imprevistos no go-live.

Exemplo com Jest + supertest:

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

test('ORDERS_CREATE_ITEM_REQUIRED - body sem item', async () => {
  const res = await request(app)
    .post('/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  expectMef(res, 'ORDERS_CREATE_ITEM_REQUIRED');
});
```

O `errors.json` é a fonte da verdade: status e mensagem esperados vêm de lá. Assim, quando mudar a mensagem no registro (ou adicionar tradução), o teste continua validando o código e o status; a asserção da mensagem usa o valor do registro.

Você pode ainda garantir que o corpo tem exatamente os três campos MEF:

```javascript
expect(res.body).toHaveProperty('statusCode');
expect(res.body).toHaveProperty('code');
expect(res.body).toHaveProperty('message');
```

---

## 8. Prompts que usei (resumidos)

Usei prompts curtos e objetivos; a IA tinha acesso ao `errors.json` e ao `uncovered.txt` (ou à descrição deles).

**Migrar erros para MEF:**

- *"No projeto usamos a metodologia MEF para erros de API. O registro está em mef/errors.json. O arquivo mef/uncovered.txt lista trechos que ainda usam res.status(4xx|5xx).json. Migre cada trecho para next(errorFormat('CODE')) e adicione os códigos no errors.json seguindo o padrão RECURSO_AÇÃO_CONTEXTO."*

**Validar e listar o que falta:**

- *"Rode npm run mef e me diga quantos códigos estão cobertos, quantos uncovered e se há códigos na aplicação que não estão no errors.json."*

**Criar testes negativos:**

- *"Para o recurso Orders, crie testes funcionais (Jest + supertest) que cubram cada código MEF listado em mef/errors.json que comece com ORDERS_. Um teste por código; use expectMef(res, code) comparando status e body com o registro. A resposta MEF tem statusCode (nível de criticidade), code (machine readable; identificador único) e message (human readable)."*

**Cobrir uncovered:**

- *"O mef/uncovered.txt lista erros que ainda não usam errorFormat. Para cada linha do arquivo, adicione o código em mef/errors.json e substitua o res.status(...).json por next(errorFormat('CODE'))."*

**Preparar i18n:**

- *"Com base nas chaves do mef/errors.json, crie um arquivo de tradução (ex.: i18n/en.json) mapeando cada code para uma mensagem em inglês. Use as mensagens do errors.json como referência de significado."*

Com prompts nessa linha, a IA consegue manter o padrão, sugerir testes alinhados ao contrato e até esboçar arquivos de tradução a partir do catálogo de códigos.

---

## 9. Estimativa: 100% de cobertura em poucas horas

No projeto Havasupai (2017), desenvolvemos a metodologia MEF e aplicamos manualmente ao longo de 3 meses. Cada erro foi catalogado, cada teste foi escrito. O resultado: zero erros imprevistos no lançamento, mesmo com 26k usuários simultâneos.

Hoje, com IAs, esse processo ficou muito mais rápido. Num cenário típico (API com dezenas de endpoints e centenas de códigos MEF):

- **Migrar respostas para MEF** (usando `uncovered.txt` e `errors.json`): 1–2 h com IA sugerindo os códigos e as trocas.
- **Escrever testes positivos e negativos** (ao menos um por código, com base no `errors.json`): 2–3 h em parceria com a IA, que gera os casos e o esqueleto dos testes; você ajusta cenários e dados sensíveis.
- **Rodar `mef`, ajustar duplicatas e códigos soltos**: ~30 min.
- **Montar base de i18n** (exportar códigos e preencher arquivos de idioma): ~30 min a 1 h, já que a lista de erros é única e centralizada.

Resultado possível: **centenas de testes**, **100% dos códigos MEF cobertos** e **catálogo pronto para traduzir todos os erros** em uma janela de **poucas horas** de trabalho humano + IA, com o `errors.json` e o `uncovered.txt` como guia. A metodologia que levou 3 meses para ser desenvolvida e aplicada manualmente no Havasupai hoje pode ser replicada em projetos novos em questão de horas, graças à automação e à assistência de IA.

---

## 10. Onde achar a lib e documentação

- **npm:** `@wesleymilan/mef`
- **Uso básico:** `errorFormat(code, errorsResult)`, `isMEFError(err)`, `isValidCode(code, errorsResult)`
- **CLI:** opções `--scan-only`, `--validate-only`, `--detect-uncovered`, `--strict-uncovered`
- **Exemplos:** na pasta `examples` do pacote (Express e testes com validador MEF)

Se você já usa Express e quer padronizar erros, vale começar pelo `errors.json` e pelo wrapper `errorFormat`; depois o middleware e os testes. O `uncovered.txt` e a lista de códigos (scan) ajudam a fechar a migração e a preparar i18n; a IA acelera testes e consistência.

---

**Escrito por Wesley Milan**  
**Auxiliado por Nexus**

# MEF: o método que padronizou meus erros de API (e deixou até a IA mais esperta)

**Por que padronizei todos os erros da minha API — produtividade, segurança, i18n e testes com ajuda da IA**

---

Eu sou o Wesley Milan, e em 2017 fui contratado para desenvolver o sistema de reservas online para permissões de visitas à **Havasupai**, uma das atrações turísticas mais disputadas do mundo. O desafio era imenso: tínhamos apenas **3 meses** para desenvolver a API, o frontend e o admin, com muitas regras de negócio específicas para esse negócio. A aplicação precisava suportar pelo menos **5 mil usuários simultâneos** comprando com garantia de não ter overbooking. Tudo isso com apenas **dois desenvolvedores**.

A solução foi desenvolver uma técnica que nos permitisse desenvolver o backend e o frontend **paralelamente de forma perfeitamente sincronizada**, sem erros e sem divergências. E havia um último desafio: não havia como testar o sistema na prática, pois o projeto iniciou em novembro, e em **1º de fevereiro exatamente às 14h (horário do Brasil)** o sistema iria ao ar — sem chance para erros.

Para ser possível cumprir o prazo com todos os requisitos, eu precisava de uma metodologia que me permitisse ter **100% de cobertura** da aplicação e **100% de previsibilidade** sobre o comportamento da aplicação. Muita gente vai falar: "isso é impossível". Então leia até o final.

Não só desenvolvemos a aplicação em tempo, como ela foi ao ar, suportou mais de **26 mil usuários simultâneos** já no primeiro lançamento, vendeu todas as reservas do ano inteiro em **40 minutos**, e teve **ZERO erros imprevistos** na aplicação. Os únicos eventos reportados para o sistema de logs de erros foram respostas de validação (422), que não são erros na verdade.

Os testes funcionais e simulações de stress que rodamos no mês de janeiro nos deram uma visão completa do comportamento da aplicação. Pudemos prever quais partes poderiam sobrecarregar os servidores, corrigir os gargalos e deixar a aplicação tão refinada que no dia do lançamento o **load dos servidores estava abaixo de 4%**. Parecia inclusive que o sistema estava fora do ar, mas na verdade estava rodando com tanta eficiência que poderia suportar **4x o volume** de usuários.

Claro que o trabalho no desenvolvimento foi essencial, mas se não fosse a metodologia que desenvolvi para controlar os erros, nada disso seria humanamente possível no prazo que tínhamos. Essa metodologia é o **MEF — Milan Error Format**: cada erro da aplicação tem um **código único**, um **status HTTP** e uma **mensagem**. Tudo registrado num único lugar.

Hoje, com o advento das IAs, essa metodologia ficou ainda mais eficiente, tornando o trabalho das IAs na programação muito mais fácil e mais assertivo, implementando **100% de cobertura de testes** em uma aplicação em poucas horas, incluindo testes positivos e os mais importantes, os **testes negativos**, que garantem a integridade e estabilidade da aplicação.

Neste artigo conto a experiência de adotar o MEF: ganho de produtividade, segurança, internacionalização (tradução de erros), cobertura de testes e — spoiler — como isso melhorou até o trabalho em conjunto com IA. No próximo artigo entro nos detalhes práticos: Express, código e exemplos de prompts. Aqui o foco é o **porquê** e o **o que mudou**.

---

## O que a API devolve: os três campos do MEF

Toda resposta de erro no padrão MEF traz três informações no corpo JSON:

- **`statusCode`** — É o código que usamos para determinar o **nível de criticidade** do erro. Por exemplo: um 422 é só validação; um 500 é uma exceção grave no backend que precisa de atenção imediata.
- **`code`** — É o erro **machine readable**: pode ser usado como índice em arrays, chave em bancos de dados e é um **identificador único de erro** em toda a aplicação.
- **`message`** — É o erro **human readable**: o texto que pode ser mostrado ao usuário (ou usado como fallback). Pode ser em português no backend e, no front, trocado por tradução usando o `code`.

Exemplo de respostas reais no padrão MEF:

```json
{
  "statusCode": 400,
  "code": "ORDERS_CREATE_ITEM_REQUIRED",
  "message": "Item do pedido é obrigatório"
}
```

```json
{
  "statusCode": 401,
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "Token expirado, faça login novamente"
}
```

```json
{
  "statusCode": 404,
  "code": "ORDERS_GETBYID_NOTFOUND",
  "message": "Pedido não encontrado"
}
```

```json
{
  "statusCode": 429,
  "code": "AUTH_LOGIN_OTP_RATELIMIT",
  "message": "Você excedeu o limite de solicitações. Aguarde 15 minutos."
}
```

O front (ou um gateway) pode tratar assim: **statusCode** para nível de criticidade (ex.: 422 = toast de validação; 500 = alerta para o time), **code** como identificador único para buscar tradução, índices ou regras de negócio, **message** para exibir quando não houver tradução ou como descrição em log.

---

## "E se a gente desse um nome pra cada erro?"

**Wesley:** No projeto Havasupai, a gente tinha um problema crítico: precisávamos desenvolver backend e frontend **em paralelo** para cumprir o prazo. Mas como garantir que o front saberia exatamente quais erros a API poderia devolver? Como garantir que não haveria divergência entre o que o backend retornava e o que o front esperava?

**Nexus:** *[Nexus é o assistente de IA que me ajudou a escrever e implementar isso. Sim, dei um nome. Fica mais fácil na conversa.]*

**Nexus:** E se cada erro tivesse um nome único?

**Wesley:** Exato! Aí nasceu a ideia: **um código por erro**. Tipo `RESERVATIONS_CREATE_DATE_INVALID`, `RESERVATIONS_OVERBOOKING`, `PAYMENTS_GATEWAY_ERROR`. Tudo em um JSON central — o `mef/errors.json` — com status e mensagem. No código, em vez de montar o JSON na mão, a gente chama `errorFormat('RESERVATIONS_CREATE_DATE_INVALID')` e pronto. O front tinha acesso ao mesmo `errors.json` e sabia exatamente quais erros esperar. Zero divergência.

**Nexus:** Um único ponto de verdade. O front (e qualquer consumidor) sempre recebe `{ statusCode, code, message }`. O time sabe qual erro é qual pelo `code` (identificador único) e qual a criticidade pelo `statusCode`. No caso do Havasupai, isso permitiu que vocês desenvolvessem em paralelo sem precisar ficar sincronizando "ah, mudei a mensagem de erro aqui".

**Wesley:** E mais: nos testes, a gente não checava só o status. Qualquer 400 não era "ok". A gente validava o **código específico**. Isso garantiu que cada erro possível tinha um teste que o forçava. 100% de cobertura, 100% de previsibilidade.

---

## Produtividade e menos "onde foi que eu coloquei esse erro?"

Antes: procurar em controllers, middlewares e models por `res.status(4xx)` ou `throw new Error`. Depois: abrir o `errors.json` e ver **todos** os erros da API. Naming em blocos (recurso, ação, tipo) ajuda a achar na hora: `ORDERS_CREATE_ITEM_REQUIRED`, `PAYMENTS_TOKEN_INVALID`. Refatorar virou mais seguro — se alguém tirar um `errorFormat('X')`, o validador da lib acusa que o código está no JSON mas não é mais usado, ou que tem código no código que não está no JSON. Produtividade sobe porque ninguém fica caçando mensagem perdida em arquivo aleatório.

Outra vantagem: **onboarding**. Novo dev (ou a própria IA) abre o `errors.json` e em minutos entende quais erros a API pode devolver. Não precisa garimpar em dezenas de arquivos.

---

## Tradução (i18n): um catálogo de erros para o mundo inteiro

**Wesley:** A gente tinha um produto que precisava de mensagens em português e inglês. Antes do MEF, as mensagens estavam espalhadas no código. Qualquer mudança de texto ou nova língua era um trabalho de formiga.

**Nexus:** E com o MEF?

**Wesley:** O `errors.json` (e a lista que a lib gera — tipo o scan de códigos e o `uncovered.txt`) vira o **catálogo completo** de erros da aplicação. Cada código é uma chave estável. No front (ou num serviço de i18n), a gente não traduz a mensagem solta; a gente traduz por **código**. Exemplo: para o código `ORDERS_CREATE_ITEM_REQUIRED` temos em pt-BR "Item do pedido é obrigatório" e em en "Order item is required". Se amanhã mudar o texto em português, o código segue o mesmo; a tradução em inglês não quebra. E o melhor: a **lista de erros gerada pela lib** (todos os códigos usados no código + os que estão no registro) é exatamente a lista que você precisa para traduzir. Não falta nenhum erro "escondido" num controller que ninguém lembrou de colocar no arquivo de idiomas. Você exporta os códigos do `errors.json` ou usa o output do `mef --scan-only` e gera o mapeamento code → mensagem em cada idioma. Cobertura total.

**Nexus:** Ou seja: MEF não é só padronização; é a base para i18n consistente. O backend pode continuar devolvendo a mensagem em um idioma padrão (human readable), e o front usa o `code` para mostrar a tradução correta para o usuário.

---

## Segurança: previsibilidade e detecção de comportamento estranho

Aqui entrou um benefício que eu não tinha planejado no dia um: **previsibilidade**.

Quando todo erro é catalogado, a aplicação só devolve o que está no registro. Então:

- **Erro "esperado"** (validação, regra de negócio): sempre um código MEF conhecido. Ex.: `AUTH_LOGIN_NOTFOUND`, `USERS_UPDATE_CPF_INVALID`.
- **Erro inesperado** (exceção não tratada, bug): cai no middleware genérico. A gente pode logar o stack, enviar para monitoramento e **não** expor detalhe no corpo da resposta. O cliente recebe uma mensagem genérica; o time recebe o alerta.

**Wesley:** Com o tempo a gente passou a encarar assim: se veio um 500 com corpo que não é MEF, ou é bug nosso ou é algo que a gente precisa tratar e virar MEF. Se um IP começa a receber um monte de códigos diferentes em sequência — tipo tentando rotas e parâmetros aleatórios — a gente enxerga como possível bot ou varredura. Não é que o MEF "bloqueie" o ataque; é que ele deixa o comportamento **previsível** e fácil de monitorar. Você sabe exatamente quais códigos são "normais" em cada fluxo; o que foge disso vira sinal.

**Nexus:** Ou seja: o que é legítimo segue um conjunto conhecido de códigos. O que foge disso vira sinal de atenção. O **statusCode** indica a criticidade (ex.: 422 validação, 500 exceção grave); o **code** identifica qual erro foi, permitindo políticas diferentes de log, alerta ou resposta.

**Wesley:** E tem mais: com todos os erros padronizados e mapeados, fica muito mais fácil identificar requisições que, por ventura, encontrem fragilidades na aplicação, e **bloquear automaticamente** por IP, sessão ou tipo de requisição através do **Web Application Firewall (WAF)**. Foi assim que contivemos um ataque com mais de **30 mil IPs** em 2020: as regras do WAF usavam os códigos MEF e o padrão de respostas para distinguir tráfego legítimo do malicioso. A aplicação de Havasupai superou os **42 mil usuários reais simultâneos** naquele ano e, mais uma vez, vendeu o inventário inteiro em menos de 1 hora — com a ameaça contida e o sistema estável.

---

## Cobertura de testes: um teste por código (e a IA entrando no jogo)

No projeto Havasupai, não tínhamos como testar na prática antes do lançamento. A única forma de garantir que tudo funcionaria era ter **100% de cobertura de testes** e **100% de previsibilidade**. Com cada erro nomeado, a regra ficou clara: **para cada código no `errors.json` que a rota pode devolver, existe pelo menos um teste que força aquele código**. Não é "um teste que dá 400"; é "um teste que garante que, nesse cenário, a API devolve exatamente `RESERVATIONS_CREATE_DATE_INVALID`" com o `statusCode` e o `code` corretos.

A lib MEF ainda gera um arquivo **`mef/uncovered.txt`** listando trechos onde a API ainda responde com `res.status(4xx|5xx).json({ message: ... })` em vez de `errorFormat('CODE')`. Ou seja: erros que ainda não foram migrados para o padrão. Isso virou checklist para fechar 100% em MEF e, de quebra, para escrever os testes que faltavam.

**Wesley:** No Havasupai, rodamos testes funcionais e simulações de stress durante todo o mês de janeiro. Cada código MEF tinha seu teste. Cada cenário de erro possível estava coberto. Isso nos deu a confiança de que, quando o sistema fosse ao ar, não haveria surpresas. E não houve: zero erros imprevistos. Os únicos eventos nos logs foram 422 de validação — que não são erros, são respostas esperadas.

Hoje, com IAs, esse processo ficou ainda mais rápido. Em projetos recentes, conseguimos chegar em **mais de 100 testes** e **cobertura completa dos códigos MEF** em poucas horas de trabalho conjunto: eu definindo regras e cenários, a IA sugerindo os casos e o código dos testes com base no `errors.json` e no `uncovered.txt`. A IA lia o registro, lia o uncovered, e já propunha: "falta teste para esse código, pode ser assim".

**Nexus:** O `errors.json` funciona como contrato. O `uncovered.txt` funciona como lista de tarefas. Juntos, dão contexto suficiente para a IA aplicar o padrão MEF em toda a aplicação e criar testes de forma automatizada, sem inventar códigos ou mensagens. No Havasupai, isso foi feito manualmente, mas com a mesma metodologia: cada erro catalogado, cada erro testado.

---

## IA entendendo melhor a aplicação

Na era de programação assistida por IA, um código como `USERS_UPDATE_CPF_REQUIRED` é muito mais claro do que um comentário solto ou uma mensagem livre. A IA consegue:

- **Entender o domínio:** os códigos seguem um padrão (recurso, ação, complemento). Ela infere que existe recurso Users, ação Update, campo CPF, tipo Required.
- **Sugerir testes:** dado o `errors.json`, ela sabe quais códigos existem e pode propor cenários (body sem CPF, CPF inválido, etc.).
- **Manter consistência:** ao implementar um novo endpoint, a instrução "use o padrão MEF; os códigos estão em mef/errors.json" faz a IA reutilizar o formato em vez de criar mensagens soltas.
- **Usar criticidade e identificador:** como o `statusCode` indica a criticidade (422 validação, 500 grave) e o `code` identifica o tipo de erro de forma única, a IA pode sugerir tratamento diferenciado no front ou em gateways (ex.: não fazer retry automático em 4xx de validação; fazer em 429 com backoff).

**Wesley:** Eu literalmente coloquei no contexto do projeto: "para erros de API, use errorFormat e o mef/errors.json; para testes negativos, um teste por código MEF". A IA parou de inventar mensagens e passou a seguir o registro. Menos retrabalho, menos divergência.

**Nexus:** Em resumo: MEF vira documentação executável. A IA lê o JSON e o uncovered e sabe o que fazer. E o fato de o corpo da resposta ser sempre `{ statusCode, code, message }` torna o contrato da API mais fácil de descrever e de ser seguido por ferramentas e por IA.

---

## Resumindo

- **MEF** = um código único por erro + registro central (`mef/errors.json`) + resposta padronizada em três campos: **statusCode** (nível de criticidade; ex.: 422 validação, 500 exceção grave), **code** (machine readable; identificador único, índice, chave), **message** (human readable).
- **Vantagens:** mais produtividade, mapeamento simples, previsibilidade (incluindo segurança e monitoramento), **base sólida para i18n** (tradução de todos os erros a partir da lista gerada pela lib), e cobertura de testes alinhada ao contrato de erros.
- **Prova de conceito:** no projeto Havasupai (2017), o MEF permitiu desenvolver backend e frontend em paralelo, alcançar 100% de cobertura e previsibilidade, resultando em zero erros imprevistos no lançamento — mesmo com 26k usuários simultâneos e sem possibilidade de testes reais antes do go-live.
- **Com IA:** o mapeamento MEF melhora o entendimento da aplicação pela IA e, com a lib (e arquivos como `errors.json` e `uncovered.txt`), permite que ela identifique e crie testes de forma automatizada, mantendo o padrão em toda a API. Hoje, implementar 100% de cobertura com mais de 100 testes leva poucas horas de trabalho conjunto humano + IA.

No próximo artigo entro no **como**: estrutura do `errors.json`, exemplos de corpo de resposta, uso da lib no Express, middleware de erro, CLI (scan, validate, detect-uncovered), i18n usando a lista de códigos e exemplos de prompts que usei para implementar e testar tudo isso.

Se quiser, comenta aí como você lida com erros na sua API hoje — adoraria trocar ideias.

---

**Escrito por Wesley Milan**  
**Auxiliado por Nexus**

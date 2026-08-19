# BeautyMatch — Guia de Requisições da API

Documentação prática de todos os endpoints do backend, na ordem em que você normalmente usa.
Serve pra você lembrar como testar quando voltar ao projeto.

- **Base URL (local):** `http://localhost:3000`
- **Como rodar o servidor (modo dev, recarrega ao salvar):**
  ```bash
  npm run start:dev
  ```
- **Pré-requisito:** o Postgres precisa estar no ar (Docker). Suba com:
  ```bash
  docker compose up -d
  ```

---

## Como funciona a autenticação

A maioria das rotas é **protegida por JWT**. O fluxo é sempre:

1. Fazer **login** → o backend devolve um `access_token`.
2. Enviar esse token no header `Authorization: Bearer <token>` nas próximas requisições.
3. O backend lê o token e descobre quem é o usuário (`userId` e `email`).

**Dica de terminal:** dá pra guardar o token numa variável e reaproveitar:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"maria@teste.com","password":"senha123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

echo $TOKEN
```

Depois é só usar `-H "Authorization: Bearer $TOKEN"` nas rotas protegidas.

---

## 1. Registrar usuário

Cria o usuário **e** a linha de controle de uso (`Usage`). Use sempre esta rota para criar
contas de teste (a rota `POST /users` cria só o usuário, sem o `Usage`).

- **Método:** `POST`
- **Rota:** `/auth/register`
- **Protegida:** não
- **Body:** `name`, `email`, `password` (senha mínimo 6 caracteres)

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Maria Teste","email":"maria@teste.com","password":"senha123"}'
```

**Resposta (200):**
```json
{ "id": "uuid", "name": "Maria Teste", "email": "maria@teste.com", "createdAt": "..." }
```

---

## 2. Login

- **Método:** `POST`
- **Rota:** `/auth/login`
- **Protegida:** não
- **Body:** `email`, `password`

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"maria@teste.com","password":"senha123"}'
```

**Resposta (200):**
```json
{ "access_token": "eyJhbGciOiJIUzI1NiI..." }
```

---

## 3. Ver usuário logado (a partir do token)

Confirma que seu token é válido e mostra o que o backend extrai dele.

- **Método:** `GET`
- **Rota:** `/auth/me`
- **Protegida:** sim (Bearer)

```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta (200):**
```json
{ "userId": "uuid", "email": "maria@teste.com" }
```

---

## 4. Criar / salvar perfil (onboarding)

Salva as preferências do usuário. Todos os campos são **opcionais**.

- **Método:** `POST`
- **Rota:** `/profile`
- **Protegida:** sim (Bearer)

```bash
curl -s -X POST http://localhost:3000/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "skinType": "OILY",
    "hairType": "CURLY",
    "budget": "MEDIUM",
    "ageRange": "YOUNG_ADULT",
    "gender": "FEMALE",
    "sensitiveSkin": true,
    "veganOnly": false
  }'
```

**Valores válidos dos enums:**

| Campo | Valores aceitos |
|---|---|
| `skinType` | `OILY` (oleosa), `DRY` (seca), `COMBINATION` (mista), `SENSITIVE` (sensível) |
| `hairType` | `STRAIGHT` (liso), `WAVY` (ondulado), `CURLY` (cacheado), `COILY` (crespo) |
| `budget` | `LOW` (baixo), `MEDIUM` (médio), `HIGH` (alto) |
| `ageRange` | `TEEN`, `YOUNG_ADULT`, `ADULT`, `MATURE` |
| `gender` | `MALE`, `FEMALE`, `OTHER`, `PREFER_NOT_TO_SAY` |
| `sensitiveSkin` | `true` / `false` |
| `veganOnly` | `true` / `false` |

---

## 5. Ver meu perfil

- **Método:** `GET`
- **Rota:** `/profile/me`
- **Protegida:** sim (Bearer)

```bash
curl -s http://localhost:3000/profile/me \
  -H "Authorization: Bearer $TOKEN"
```

Retorna o perfil salvo, ou `null` se ainda não houver perfil.

---

## 6. Ver usuário + perfil juntos

- **Método:** `GET`
- **Rota:** `/profile/user`
- **Protegida:** sim (Bearer)

```bash
curl -s http://localhost:3000/profile/user \
  -H "Authorization: Bearer $TOKEN"
```

Retorna os dados do usuário com o perfil aninhado.

---

## 7. Chat (classificação de intenção) — endpoint principal

Manda a mensagem do usuário. O backend valida o limite de uso, classifica a **intenção**
via IA (Gemini pelo OpenRouter) e devolve o resultado.

- **Método:** `POST`
- **Rota:** `/chat`
- **Protegida:** sim (Bearer)
- **Body:** `message`

```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"quero um shampoo para cabelo oleoso"}'
```

**Resposta (200):**
```json
{
  "intent": "PRODUCT_SEARCH",
  "message": "Mensagem processada com sucesso",
  "context": { "profile": null, "history": [] }
}
```

**Intenções possíveis (`intent`):**

| Intenção | Quando aparece | Exemplo de mensagem |
|---|---|---|
| `PRODUCT_SEARCH` | usuário quer encontrar um produto | "quero um shampoo para cabelo oleoso" |
| `RECOMMENDATION` | usuário pede recomendação | "me indica um protetor solar" |
| `EDUCATION` | usuário quer aprender algo | "o que é ácido hialurônico?" |
| `PRODUCT_COMPARISON` | usuário compara opções | "qual é melhor, batom matte ou cremoso?" |
| `OUT_OF_SCOPE` | assunto fora de beleza | "quem descobriu o Brasil?" |

**Resposta quando bate o limite de uso (403):**
```json
{ "message": "Limite de perguntas atingido. Faça upgrade para continuar.", "statusCode": 403 }
```

---

## 8. Histórico de buscas

**Listar histórico do usuário:**

- **Método:** `GET`
- **Rota:** `/search-history`
- **Protegida:** sim (Bearer)

```bash
curl -s http://localhost:3000/search-history \
  -H "Authorization: Bearer $TOKEN"
```

**Criar entrada manual no histórico** (normalmente o `/chat` já salva sozinho):

- **Método:** `POST`
- **Rota:** `/search-history`
- **Protegida:** sim (Bearer)
- **Body:** `query` (texto, máx. 1000 caracteres)

```bash
curl -s -X POST http://localhost:3000/search-history \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"protetor solar facial"}'
```

---

## Fluxo completo de teste (copia e cola)

```bash
# 1. cria usuário
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Maria Teste","email":"maria@teste.com","password":"senha123"}'

# 2. loga e guarda o token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"maria@teste.com","password":"senha123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# 3. salva o perfil
curl -s -X POST http://localhost:3000/profile \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"skinType":"OILY","hairType":"CURLY","budget":"MEDIUM"}'

# 4. manda uma mensagem no chat
curl -s -X POST http://localhost:3000/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"quero um shampoo para cabelo oleoso"}'
```

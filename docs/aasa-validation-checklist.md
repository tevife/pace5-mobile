# Checklist de Validação — AASA e Universal Links

Use este documento após cada deploy para confirmar que o iOS consegue baixar o AASA e que Universal Links funcionam end-to-end.

> **Arquitetura importante:**
> O servidor `pace5.com.br` é um hosting **separado** do Replit (não é o `pace-mobile.replit.app`).
> As variáveis de ambiente precisam ser configuradas nesse servidor externo, não apenas no Replit.

---

## Validação automática (script)

Execute o script a partir da raiz do monorepo:

```bash
bash artifacts/pace5-mobile/scripts/validate-universal-links.sh
```

O script verifica, para os dois endpoints (`apple-app-site-association` e `assetlinks.json`):
- HTTP 200 sem redirecionamentos
- `Content-Type: application/json`
- JSON válido
- Ausência de valores placeholder (`SEU_TEAM_ID`, `SEU_SHA256_FINGERPRINT`)

---

## Estado atual (verificado em 2026-05-09)

### ✅ O que já funciona

| Verificação | Resultado |
|---|---|
| `https://pace5.com.br/.well-known/apple-app-site-association` acessível | HTTP 200, sem redirecionamentos |
| `Content-Type: application/json` no AASA | Correto |
| `https://pace5.com.br/.well-known/assetlinks.json` acessível | HTTP 200, sem redirecionamentos |
| `Content-Type: application/json` no assetlinks | Correto |
| Apple Team ID configurado no Replit Secrets | `N32B8VPXR4` ✅ |

### ❌ O que ainda precisa ser configurado

| Variável de ambiente | Servidor | Valor atual | Ação necessária |
|---|---|---|---|
| `APPLE_TEAM_ID` | pace5.com.br | `SEU_TEAM_ID` (placeholder) | Configurar `N32B8VPXR4` no servidor externo e redeployar |
| `ANDROID_SHA256_FINGERPRINT` | pace5.com.br | `SEU_SHA256_FINGERPRINT` (placeholder) | Configurar o fingerprint real do keystore EAS e redeployar |

---

## Passo 1 — Configurar APPLE_TEAM_ID no servidor pace5.com.br

O Team ID correto já está configurado no Replit (`N32B8VPXR4`).
O que falta é configurá-lo no servidor externo que hospeda `pace5.com.br`:

1. Acesse o painel do servidor/hosting que serve `pace5.com.br`
2. Configure a variável de ambiente `APPLE_TEAM_ID=N32B8VPXR4`
3. Faça um novo deploy/restart do servidor

**Verificação:**
```bash
curl https://pace5.com.br/.well-known/apple-app-site-association
# Deve retornar: {"applinks":{"apps":[],"details":[{"appID":"N32B8VPXR4.com.pace5.app","paths":["*"]}]}}
```

---

## Passo 2 — Configurar ANDROID_SHA256_FINGERPRINT no servidor pace5.com.br

1. Acesse https://expo.dev → seu projeto → **Credentials** → **Android** → **Production Keystore**
2. Copie o campo **SHA-256 Certificate Fingerprint** (formato: `AA:BB:CC:...:FF`)
3. Configure `ANDROID_SHA256_FINGERPRINT=<seu_fingerprint>` no servidor que hospeda `pace5.com.br`
4. Faça um novo deploy/restart do servidor

**Verificação:**
```bash
curl https://pace5.com.br/.well-known/assetlinks.json
# O campo "sha256_cert_fingerprints" deve conter o fingerprint real, não o placeholder
```

---

## Passo 3 — Validar via branch.io

Após configurar as variáveis e redeployar o servidor:

1. Acesse https://branch.io/resources/aasa-validator/
2. Cole `pace5.com.br` no campo de domínio
3. Clique em **Validate**
4. Confirme que não há erros — o arquivo deve ser reconhecido como válido com `appID: N32B8VPXR4.com.pace5.app`

---

## Passo 4 — Testar Universal Links no iPhone

> Este passo exige um build de produção ou TestFlight instalado. Não funciona com Expo Go.

1. Reinstale o app via TestFlight (o iOS baixa o AASA na instalação/reinstalação)
2. No iPhone, abra o Safari e acesse:
   ```
   https://pace5.com.br/auth/magic?token=teste
   ```
3. O iOS deve abrir o app Pace5 diretamente, **sem** passar pelo Safari

**Se abrir no Safari em vez do app:**
- Confirme que o `APPLE_TEAM_ID` está correto no AASA (`N32B8VPXR4`)
- Confirme que o entitlement `applinks:pace5.com.br` está no build (veja `eas-build-guide.md`, seção 6)
- Reinstale o app — o iOS só baixa o AASA na instalação

---

## Referências

- Validador online: https://branch.io/resources/aasa-validator/
- Guia de build EAS: `docs/eas-build-guide.md`
- Configuração de magic links: `docs/magic-link-setup.md`
- Script de validação: `scripts/validate-universal-links.sh`

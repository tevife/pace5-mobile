# Configuração de Magic Links — Pace5

Há duas formas complementares de fazer os magic links abrirem o app. Recomendamos usar **ambas**.

---

## Opção A — Esquema personalizado `pace5://` (mais simples, sem servidor)

Configure o seu sistema de paywall para gerar magic links com o prefixo `pace5://` em vez de `https://`.

**Exemplo:**
```
pace5://auth/magic?token=SEU_TOKEN_AQUI
```

Ao clicar nesse link no e-mail, o iOS e o Android abrem o app Pace5 automaticamente. O app converte internamente o endereço para `https://pace5.com.br/auth/magic?token=SEU_TOKEN_AQUI` e navega o WebView para lá, completando o login.

**Onde configurar:**
- Acesse o painel do seu provedor de paywall (ex.: Hotmart, Kiwify, Memberkit, etc.)
- Localize o campo de "URL de redirecionamento após pagamento" ou "Magic link redirect URL"
- Substitua `https://pace5.com.br/...` por `pace5://...` mantendo o mesmo caminho e parâmetros

---

## Opção B — Universal Links / App Links (requer acesso ao servidor)

Esta opção permite que links `https://pace5.com.br` abram o app sem nenhuma mudança no paywall. Exige hospedar dois arquivos estáticos no servidor do pace5.com.br.

### iOS — Apple App Site Association (AASA)

1. Abra o arquivo `docs/apple-app-site-association.json` deste projeto
2. **Substitua `TEAMID`** pelo seu Apple Team ID (encontrado em https://developer.apple.com/account → Membership → Team ID)
3. Hospede o arquivo **sem extensão .json** na URL exata:
   ```
   https://pace5.com.br/.well-known/apple-app-site-association
   ```
4. O servidor deve responder com `Content-Type: application/json`
5. O arquivo **não pode exigir redirecionamento** — deve ser acessível diretamente por essa URL

**Conteúdo do arquivo (após substituir TEAMID):**
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "A1B2C3D4E5.com.pace5.app",
        "paths": ["*"]
      }
    ]
  }
}
```

### Android — Asset Links

O servidor já serve `/.well-known/assetlinks.json` automaticamente. Você só precisa configurar o fingerprint SHA-256 do keystore de produção como variável de ambiente.

1. **Obtenha o fingerprint SHA-256 do keystore de produção:**
   - Via EAS Build: acesse https://expo.dev → seu projeto → Credentials → Android → Production Keystore → copie o campo "SHA-256 Certificate Fingerprint"
   - Via keytool: `keytool -list -v -keystore seu-arquivo.jks` e copie a linha `SHA256:`

2. **Configure a variável de ambiente `ANDROID_SHA256_FINGERPRINT`** no painel Secrets do Replit (ou via CLI):
   ```
   ANDROID_SHA256_FINGERPRINT=AA:BB:CC:DD:...:FF
   ```
   O formato esperado é o fingerprint hexadecimal com dois pontos separando cada byte (ex.: `A1:B2:C3:...`).

3. O servidor injeta o valor automaticamente em cada requisição a `/.well-known/assetlinks.json`. Não é necessário editar o arquivo `server/well-known/assetlinks.json` diretamente.

4. **Verifique após o deploy:**
   ```
   https://pace5.com.br/.well-known/assetlinks.json
   ```
   O campo `sha256_cert_fingerprints` deve conter seu fingerprint real (não o placeholder).

**Verificação:**
- iOS: https://branch.io/resources/aasa-validator/ — cole `pace5.com.br` e valide
- Android: `adb shell pm get-app-links com.pace5.app` após instalar o build

---

## Fluxo completo após configuração

```
Usuário recebe e-mail com magic link
        ↓
Clica no link (pace5:// ou https://pace5.com.br/...)
        ↓
iOS/Android abre o app Pace5 (sem passar pelo Safari/Chrome)
        ↓
App navega o WebView para https://pace5.com.br/auth/magic?token=...
        ↓
Usuário é autenticado automaticamente
```

---

## Observação sobre o Expo Go

O roteamento por esquema personalizado (`pace5://`) **só funciona em builds de produção** gerados via `eas build`. No Expo Go, os deep links não funcionam porque o esquema do app é `exp://` e não `pace5://`.

Para testar deep links localmente, use:
```bash
# iOS Simulator
xcrun simctl openurl booted "pace5://auth/magic?token=teste123"

# Android Emulator
adb shell am start -W -a android.intent.action.VIEW -d "pace5://auth/magic?token=teste123" com.pace5.app
```

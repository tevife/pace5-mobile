# Guia de Build EAS — Pace5 iOS

Este guia cobre o processo completo para gerar um build de produção do app Pace5 no iPhone via EAS Build, incluindo o que é necessário para que deep links (`pace5://` e Universal Links) funcionem corretamente em um dispositivo real.

---

## Pré-requisitos

| Requisito | Onde obter |
|---|---|
| Conta Expo (gratuita) | https://expo.dev/signup |
| Apple Developer Account | https://developer.apple.com (U$ 99/ano) |
| Node.js ≥ 18 | https://nodejs.org |
| EAS CLI | `npm install -g eas-cli` |

---

## 1. Login e configuração inicial

```bash
# Faça login na sua conta Expo
eas login

# Clone o projeto (se ainda não tiver localmente)
# e entre na pasta do app mobile
cd artifacts/pace5-mobile

# Conecte o projeto ao Expo (apenas na primeira vez)
eas init --id SEU_PROJECT_ID
```

> **Nota:** `eas init` cria o campo `"extra.eas.projectId"` no `app.json`. Execute apenas uma vez.

---

## 2. Configurar as credenciais iOS

O EAS pode gerenciar certificados e provisioning profiles automaticamente:

```bash
eas credentials --platform ios
```

Selecione **"Managed by EAS"** para que o EAS crie e renove o certificado de distribuição e o provisioning profile automaticamente. Você precisará ter acesso à Apple Developer Account.

### Obter o Apple Team ID

1. Acesse https://developer.apple.com/account
2. Clique em **Membership** no menu lateral
3. Copie o **Team ID** (formato: `A1B2C3D4E5`)
4. O EAS solicita o Team ID durante `eas credentials` e armazena automaticamente nas credenciais gerenciadas — não é necessário editar nenhum arquivo.

---

## 3. Gerar o build de produção

### Opção A — TestFlight (recomendado para testes reais)

```bash
# A partir da raiz do monorepo:
pnpm --filter @workspace/pace5-mobile exec eas build --platform ios --profile production

# Ou diretamente na pasta do app:
cd artifacts/pace5-mobile
eas build --platform ios --profile production
```

O EAS vai:
1. Empacotar o código JavaScript
2. Compilar o app nos servidores da Expo (máquina virtual Apple Silicon)
3. Assinar o `.ipa` com o certificado de distribuição
4. Disponibilizar o `.ipa` para download no painel do Expo

Tempo estimado: **10–20 minutos**.

### Opção B — Build interno (sem TestFlight, instala direto via link)

```bash
eas build --platform ios --profile preview
```

Gera um build com distribuição interna. Instale pelo link enviado por e-mail ou no painel do Expo escaneando o QR code.

---

## 4. Enviar para o TestFlight

Após o build de produção concluir:

```bash
eas submit --platform ios --profile production --latest
```

Isso envia o `.ipa` mais recente para o App Store Connect. Após o processamento (5–15 min), o build aparece no TestFlight e pode ser instalado via link de convite.

---

## 5. Testar os deep links no iPhone

### Esquema personalizado `pace5://`

Após instalar o app (TestFlight ou build interno), abra o Safari no iPhone e acesse:

```
pace5://auth/magic?token=TOKEN_DE_TESTE
```

Ou envie o link por e-mail/WhatsApp e toque nele. O iOS deve abrir o Pace5 automaticamente.

**Se não abrir:** Verifique se o app está instalado e reinicie o iPhone antes de testar.

### Universal Links `https://pace5.com.br`

Para testar Universal Links, o servidor `pace5.com.br` precisa hospedar o arquivo AASA. Veja o arquivo `docs/magic-link-setup.md` para detalhes de configuração.

Após configurar o AASA, reinstale o app (o iOS baixa o AASA na instalação) e teste:

```
https://pace5.com.br/auth/magic?token=TOKEN_DE_TESTE
```

---

## 6. Verificação dos deep links no build

### iOS — conferir o entitlement `associated-domains`

No painel do Expo (https://expo.dev → seu projeto → Builds → selecione o build):

1. Clique em **"Build artifact"** e baixe o `.ipa`
2. Renomeie para `.zip` e extraia
3. Abra `Payload/pace5.app/Entitlements.plist`
4. Confirme que existe a entrada:
   ```xml
   <key>com.apple.developer.associated-domains</key>
   <array>
     <string>applinks:pace5.com.br</string>
   </array>
   ```

### Validar o AASA

- Ferramenta online: https://branch.io/resources/aasa-validator/
- Cole `pace5.com.br` e valide se o arquivo está acessível e correto

---

## 7. Publicar na App Store

Após validar o app no TestFlight, o próximo passo é a publicação na App Store. Consulte o guia dedicado:

**[appstore-submission.md](./appstore-submission.md)** — Passo a passo completo: configurar `eas.json`, preencher metadados, screenshots, submeter via `eas submit` e acompanhar a revisão da Apple.

---

## 8. Troubleshooting

| Problema | Solução |
|---|---|
| "No bundle url" ao abrir o app | O build precisa ser production/preview, não development client |
| Deep link não abre o app | Confirme que o app está instalado via TestFlight/internal, não via Expo Go |
| Universal Link abre no Safari | O AASA pode estar incorreto ou com redirect — valide em branch.io |
| Build falha com erro de certificado | Rode `eas credentials --platform ios` e regenere |
| `react-native-health` falhando no build | Confirme que o plugin está listado no `app.json` (já configurado) |

---

## Configuração atual do app.json (referência)

```json
{
  "expo": {
    "scheme": "pace5",
    "ios": {
      "bundleIdentifier": "com.pace5.app",
      "associatedDomains": ["applinks:pace5.com.br"]
    }
  }
}
```

Esses valores já estão configurados corretamente no projeto.

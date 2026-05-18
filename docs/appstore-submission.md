# Publicação na App Store — Pace5

Este guia cobre o processo completo para submeter o app Pace5 para revisão da Apple e publicá-lo na App Store, após validação via TestFlight.

---

## Pré-requisitos

Antes de começar, confirme que:

- [ ] Build de produção gerado com sucesso via `eas build --platform ios --profile production`
- [ ] App testado e validado no TestFlight (deep links, magic links, fluxos principais)
- [ ] Conta Apple Developer ativa (U$ 99/ano)
- [ ] Acesso ao App Store Connect (https://appstoreconnect.apple.com)
- [ ] EAS CLI instalado: `npm install -g eas-cli`

---

## Passo 1 — Configurar os valores no eas.json

Abra o arquivo `eas.json` e substitua os placeholders na seção `submit.production.ios`:

```json
"submit": {
  "production": {
    "ios": {
      "appleTeamId": "SEU_APPLE_TEAM_ID",
      "ascAppId": "SEU_ASC_APP_ID",
      "language": "pt-BR",
      "appleId": "seu@email.com"
    }
  }
}
```

### Onde encontrar cada valor

| Campo | Onde encontrar |
|---|---|
| `appleTeamId` | https://developer.apple.com/account → Membership → Team ID |
| `ascAppId` | App Store Connect → seu app → Informações do App → Apple ID (número de 10 dígitos) |
| `appleId` | O e-mail da sua conta Apple Developer |

> **Recomendação de segurança:** Em vez de `appleId`/senha, use uma **App Store Connect API Key** para autenticação sem senha. Veja o Passo 1b abaixo.

### Passo 1b (opcional, recomendado) — Usar ASC API Key

1. Acesse https://appstoreconnect.apple.com → Usuários e Acesso → Chaves de API
2. Clique em **+** e gere uma chave com função **App Manager**
3. Baixe o arquivo `.p8` (disponível apenas uma vez)
4. No EAS CLI, configure a chave:

```bash
eas credentials --platform ios
# Selecione "App Store Connect API Key" e forneça o Issuer ID, Key ID e o arquivo .p8
```

Após configurar, remova `appleId` do `eas.json` — a chave será usada automaticamente.

---

## Passo 2 — Criar o app no App Store Connect

Se o app ainda não existe no App Store Connect:

1. Acesse https://appstoreconnect.apple.com
2. Clique em **Meus Apps** → **+** → **Novo App**
3. Preencha:
   - **Plataformas:** iOS
   - **Nome:** Pace5
   - **Idioma principal:** Português (Brasil)
   - **Bundle ID:** `com.pace5.app`
   - **SKU:** `pace5-app` (identificador interno, pode ser qualquer string única)
4. Clique em **Criar**

Após criar, anote o **Apple ID** do app (número de 10 dígitos) — esse é o `ascAppId` do `eas.json`.

---

## Passo 3 — Preencher os metadados da App Store

No App Store Connect, acesse **Meus Apps → Pace5 → Distribuição → Informações do App**:

### Informações obrigatórias

| Campo | Valor sugerido |
|---|---|
| **Nome do app** | Pace5 |
| **Subtítulo** | Treinos e corridas com IA |
| **Categoria principal** | Saúde e fitness |
| **Categoria secundária** | Esportes |
| **Classificação etária** | 4+ (nenhum conteúdo restrito) |
| **URL de suporte** | https://pace5.com.br/suporte |
| **URL de privacidade** | https://pace5.com.br/privacidade |

### Descrição em português (sugestão)

```
O Pace5 é seu parceiro de treino inteligente para corridas e atividades físicas.

Conecte-se com o Apple Health para sincronizar automaticamente suas corridas, passos e frequência cardíaca. Acompanhe sua evolução, receba planos de treino personalizados e mantenha a consistência com metas adaptadas ao seu ritmo.

Funcionalidades:
• Sincronização automática com o Apple Health
• Histórico completo de corridas e treinos
• Planos de treino personalizados com IA
• Metas semanais e relatórios de progresso
• Suporte a Universal Links para acesso direto

Comece hoje mesmo e descubra o seu melhor ritmo.
```

### Palavras-chave (máximo 100 caracteres)

```
corrida,treino,pace,running,fitness,saúde,corredor,maratona,health,sport
```

---

## Passo 4 — Adicionar screenshots

A Apple exige screenshots para cada tamanho de tela obrigatório:

| Tamanho | Dispositivo equivalente | Quantidade |
|---|---|---|
| 6,9" (1320 × 2868 px) | iPhone 16 Pro Max | 3–10 |
| 6,5" (1242 × 2688 px) | iPhone 11 Pro Max | 3–10 |
| 5,5" (1242 × 2208 px) | iPhone 8 Plus | 3–10 |

### Como gerar screenshots

**Opção A — Simulador Xcode (mais rápido):**
```bash
# No Mac, abra o simulador iOS
xcrun simctl openurl booted "pace5://auth/magic?token=teste"

# No simulador, pressione Cmd+S para capturar screenshot
```

**Opção B — iPhone físico ou TestFlight:**
```bash
eas build --platform ios --profile preview
# Instale o build em um iPhone via TestFlight
# No iPhone, capture as telas com o botão lateral + volume
# Exporte as fotos em resolução original pelo AirDrop ou cabo
```

Salve os arquivos como `.png` e faça upload no App Store Connect → **Capturas de tela do app**.

---

## Passo 5 — Selecionar o build para revisão

1. No App Store Connect, acesse **Pace5 → Distribuição → iOS**
2. Na seção **Build**, clique em **+**
3. Aguarde o processamento do build (pode levar 10–30 min após o upload)
4. Selecione o build mais recente de produção

---

## Passo 6 — Submeter via EAS CLI

Após preencher todos os metadados no App Store Connect:

```bash
# A partir da pasta do app mobile:
cd artifacts/pace5-mobile

# Submeter o build mais recente
eas submit --platform ios --profile production --latest

# Ou especificar um build ID específico:
eas submit --platform ios --profile production --id SEU_BUILD_ID
```

O EAS vai:
1. Autenticar no App Store Connect (via API Key ou Apple ID)
2. Fazer upload do `.ipa` para o processamento da Apple
3. Associar o build ao app `com.pace5.app`

---

## Passo 7 — Enviar para revisão

Após o upload e seleção do build:

1. No App Store Connect, revise todas as informações
2. Responda às perguntas de conformidade (criptografia, publicidade):
   - **Usa criptografia exportável?** Sim (HTTPS padrão) — selecione a isenção EAR99
   - **Usa IDFA/publicidade?** Não
3. Clique em **Adicionar à revisão** → **Enviar para revisão**

O tempo de revisão da Apple é geralmente **24–48 horas** para apps novos.

---

## Acompanhar o status da revisão

- App Store Connect → Meus Apps → Pace5 → status no topo da página
- Você receberá um e-mail quando o status mudar

| Status | Significado |
|---|---|
| Em espera para revisão | Na fila da Apple |
| Em revisão | Revisor da Apple analisando |
| Aprovado para venda | Pronto para publicar |
| Rejeitado | Ver feedback da Apple e corrigir |

---

## Após a aprovação

Quando o status mudar para **"Aprovado para venda"**:

1. Acesse App Store Connect → Meus Apps → Pace5
2. Clique em **Publicar esta versão**
3. O app estará disponível na App Store em até **1 hora**

Link público do app: `https://apps.apple.com/br/app/pace5/idSEU_ASC_APP_ID`

---

## Troubleshooting

| Problema | Solução |
|---|---|
| "Missing compliance" no App Store Connect | Responda às perguntas de conformidade de criptografia (isenção EAR99 para HTTPS) |
| Build não aparece no App Store Connect | Aguarde 15–30 min após o `eas submit`; verifique o e-mail da Apple |
| Rejeição por "Guideline 4.0 – Design" | Adicione screenshots reais do app (não mockups ou placeholders) |
| Rejeição por "Guideline 5.1.1 – Privacy" | Certifique-se de que a URL de privacidade está ativa e acessível |
| `eas submit` falha com erro de autenticação | Reconfigure as credenciais: `eas credentials --platform ios` |
| Rejeição por falta de funcionalidade | O app deve funcionar sem login — adicione uma tela de demonstração ou onboarding |

---

## Referências

- [EAS Submit — documentação oficial](https://docs.expo.dev/submit/ios/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)

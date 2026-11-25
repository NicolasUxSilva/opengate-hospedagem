# OpenGate Hospedagem — landing page

Página estática (HTML/CSS/JS, sem build) para anfitriões, pousadas e administradoras de imóveis de temporada.
Teste de demanda da campanha Meta "Hospedagem". Mesma identidade e estrutura da página de integradores.

## Rodar e testar
```bash
npm ci
npm start            # http://localhost:4173
npm run check        # checagens estáticas (referências, formulário, Pixel, JS/CSS)
npm run test:e2e     # Playwright (Web3Forms simulado, Pixel bloqueado)
```

## Formulário e mensuração
- Web3Forms (mesma chave da página de integradores), assunto e campo `Página` = `lp-hospedagem`.
- Campos: nome, WhatsApp, perfil, unidades, cidade/UF, consentimento LGPD; UTMs em campos ocultos.
- Pixel 351480523756375: `PageView` no carregamento; `Lead` só após `success: true` do Web3Forms.
- Conversão personalizada na Meta: "Lead – Hospedagem" (URL contém `opengate-hospedagem.vercel.app`).
- Política de privacidade em `/privacidade/`.

## Deploy
Vercel ligado ao repositório: cada push em `main` publica automaticamente.

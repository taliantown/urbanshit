# Telas reativas — Paisagens urbanas

Cada obra impressa tem um QR que aponta pra uma URL desta página. Ao escanear,
o celular abre uma tela preta com a forma vetorial da obra e um botão **▶ tocar**.
Ao tocar, o stem da obra começa, e a forma reage a ele em tempo real.

5 obras = 5 stems = 5 telas reativas. Cada uma reage a uma faixa diferente do
espectro, então quando vários espectadores estão tocando simultaneamente as
formas ganham vida em sintonia com a paisagem sonora emergente.

## Estrutura

```
web/
├── index.html              ← template universal
├── app.js                  ← lógica de reatividade (Web Audio + animação SVG)
├── app.css                 ← visual minimalista
├── config.json             ← mapeamento obra → svg/audio/banda/efeitos
├── svgs/
│   ├── obra1.svg ... obra5.svg
└── audio/
    └── obra1.wav ... obra5.wav
```

## URLs

| Obra | URL |
|---|---|
| 1 — Multidão     | `…/web/?n=1` |
| 2 — Elétrico     | `…/web/?n=2` |
| 3 — Conversas    | `…/web/?n=3` |
| 4 — Tráfego      | `…/web/?n=4` |
| 5 — Ritmo        | `…/web/?n=5` |

Cada QR aponta pra uma dessas.

## Testar localmente

Browsers bloqueiam `fetch()` de `file://`. Suba um servidor estático simples:

```powershell
cd C:\Users\TALIAN\Desktop\plotter-project\web
py -3.12 -m http.server 8000
```

Abre `http://localhost:8000/?n=1` no navegador (use o do celular na mesma rede
pra ver o tamanho real). Clica em **▶ tocar**.

## Substituir os SVGs (formas finais)

1. No app Streamlit do gerador, configure **canvas 180×320 mm** e gere a forma
   da obra (algoritmo + seed + parâmetros).
2. Clique em **⬇ Exportar SVG**.
3. Renomeie o arquivo pra `obra1.svg`, `obra2.svg`, etc, e jogue em `web/svgs/`
   substituindo o dummy.
4. Recarregue a página no browser.

## Substituir os áudios

1. Coloque os arquivos em `web/audio/` com os mesmos nomes (`obra1.wav` ... `obra5.wav`).
2. Se for `.mp3`, edite `config.json` trocando a extensão correspondente.

Áudios podem ser de qualquer duração. O `<audio>` está com `loop` ativado.
Se o loop tiver corte audível, use **cross-fade no editor** antes de exportar
(ou aumente a duração pra ficar irrelevante).

## Ajustar a reatividade de uma obra

Tudo está em `config.json`. Pra cada obra:

- `banda_hz`: `[lo, hi]` da banda de frequência que define a "energia" da obra.
- `efeitos`: pesos de 0.0 a 1.0+ para cada efeito. Zerar desliga; subir intensifica.
  - `vibracao`: cada vértice oscila em senos. Boa pra texturas orgânicas.
  - `stroke_pulso`: espessura da linha modula com a energia.
  - `glow`: filtro de blur dinâmico. Forma "respira" em halo.
  - `cor_migra`: hue rotaciona com o tempo (subtle). Multiplicador da velocidade.
  - `onset_glitch`: pulso de deslocamento em picos súbitos do som.

## Hospedar no GitHub Pages

1. Crie um repo no GitHub e suba a pasta `web/` na raiz (ou em `docs/`).
2. Em **Settings → Pages**, aponte para a branch `main` (ou `docs/`).
3. URL ficará tipo `https://seu-usuario.github.io/seu-repo/?n=1`.
4. Encurte com bit.ly ou similar se quiser QR menos denso.

Pra fazer os QRs, qualquer gerador serve (ex: <https://www.qr-code-generator.com>).
Aponte pra URL final de cada obra.

## Notas técnicas

- Áudio em browsers só toca depois de **interação do usuário** (clicar/tocar) —
  por isso o botão **▶ tocar**. Não tem como auto-play.
- iOS Safari: pode pedir pra tocar duas vezes em algumas versões. Sem solução
  prática além de avisar.
- Performance: vibração mexe em todos os vértices a cada frame. Pra SVGs com
  >10k vértices (flow_field denso) pode pesar em celular antigo. Se acontecer,
  baixe `n_particles` no gerador antes de exportar a forma final.

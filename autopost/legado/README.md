# Fontes dos apps antigos (só para consulta)

Antes do ERP AutoPost havia dois programas separados. Estes são os fontes deles, guardados aqui porque
viviam fora do git (pasta `autopost marketplace/`, ignorada) e uma parte já tinha se perdido
(`helpers/scraper.py`, recuperado a partir dos `.exe` e reescrito como `autopost/navegador.py`).

| Arquivo | Era o programa | O que virou |
|---|---|---|
| `facebook_marketplace_antigo.py` | ERP AutoPost Facebook (mar/2026) | `plataformas/facebook.py` |
| `olx_antigo.py` | ERP AutoPost OLX (abr/2026) | `plataformas/olx.py` (o fluxo de publicação foi copiado quase sem mudança) |

A versão mais antiga do app do Facebook continua em `cliente_autopost_facebook/`.

Não são usados pelo app novo e não rodam sozinhos (dependem do `helpers/` que se perdeu).

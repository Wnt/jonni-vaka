<!--
SPDX-FileCopyrightText: 2017-2026 City of Espoo

SPDX-License-Identifier: LGPL-2.1-or-later
-->

# Sovellusavaimet: vuototilanne ja avainkierto

Toimintaohje ylläpidolle ja kunnan tietoturvayhteyshenkilölle, kun kuntalaisen sovellusavain (`evaka_pat_…`) on vuotanut tai käyttäytyy epäilyttävästi.

## Pikaviite

| Tilanne | Komento |
| --- | --- |
| Kaikki avainliikenne pysäytettävä heti (nopein keino) | `valkey-cli -h <host> SET citizen-api-tokens-disabled incident-<pvm>` — vaikuttaa ~10 s:ssa, ei koske evästekirjautuneita. Palautus: `DEL citizen-api-tokens-disabled` |
| Kuntalainen ilmoittaa vuodosta | Pyydä perumaan avain itse (Omat tiedot → Sovellusavaimet) — vaikuttaa heti |
| Kuntalaista ei tavoiteta | `UPDATE citizen_api_token SET revoked_at = now() WHERE id = '<id>';` |
| Raaka avain käsissä (repo, loki) | `SELECT id FROM citizen_api_token WHERE token_hash = sha256('evaka_pat_…'::bytea);` → peru |
| Yhden avaimen liikenne epäilyttävää | Katso `apiTokenId` lokista → `UPDATE citizen_api_token SET revoked_at = now() WHERE id = '<id>';` |
| Laaja vuoto, kaikki avaimet epäluotettavia | `UPDATE citizen_api_token SET revoked_at = now() WHERE revoked_at IS NULL;` |
| Uusien avainten luonti estettävä (ilman deployta) | `SADD disabled-endpoints "POST /citizen/api-tokens"` |
| Koko ominaisuus pois kunnalta (vaatii deployn) | `evaka.citizen_api_tokens.enabled=false` + service uudelleenkäynnistys |

Peruutus tehoaa välittömästi: avaimen validointia ei välimuistiteta, vaan api-gw hakee sen servicestä jokaisella pyynnöllä. Tyhjennettävää välimuistia ei siis ole.

## Tilanne 1: kuntalainen ilmoittaa vuodosta

1. Ohjaa kuntalainen perumaan avain itse käyttöliittymästä.
2. Jos hän ei pääse kirjautumaan, hae ja peru: `UPDATE citizen_api_token SET revoked_at = now() WHERE citizen_user_id = '<person-id>' AND revoked_at IS NULL RETURNING id;`
3. Tarkista `last_used_at` ja sovellusloki (`apiTokenId = '<id>'`) tuntemattomien osoitteiden varalta.

## Tilanne 2: avain löytyy repositoriosta tai lokista

1. `SELECT id FROM citizen_api_token WHERE token_hash = sha256('evaka_pat_…'::bytea);`
2. Peru: `UPDATE citizen_api_token SET revoked_at = now() WHERE token_hash = sha256('evaka_pat_…'::bytea) AND revoked_at IS NULL RETURNING id;`
3. Secret scanning -sääntö repoihin ja lokivalvontaan: `evaka_pat_[A-Za-z0-9_-]{43}`.

## Tilanne 3: yhden avaimen liikennemäärä epäilyttävä

1. Laske kutsut sovellusloki-kentällä `apiTokenId` (otsake `X-Evaka-Api-Token-Id`).
2. Katso api-gw:n lokista `evaka.citizen_api_token.scope_denied`- ja `.rate_limited`-tapahtumat (`meta.tokenId`).
3. Peru: `UPDATE citizen_api_token SET revoked_at = now() WHERE id = '<id>';`
4. Jos yksittäinen peruminen ei riitä, käytä `citizen-api-tokens-disabled`-kytkintä (yllä). Älä sulje `DELETE /citizen/api-tokens/*` — se estäisi kuntalaisia perumasta avaimiaan.

## Avainkierto

| Sääntö | Arvo | Mistä |
| --- | --- | --- |
| Pakollinen vanheneminen | enintään 180 vrk | `MAX_API_TOKEN_LIFETIME` |
| Avaimia kuntalaista kohti | enintään 10 | `MAX_API_TOKENS_PER_CITIZEN` |
| Vanhentuneiden/peruttujen poisto | 90 vrk kuluttua, automaattinen yöajo | `deleteOldCitizenApiTokens` |
| Automaattinen uusiminen | ei ole, tarkoituksella: vanheneminen pakottaa tarkistamaan tarpeen | — |

Kierto: 1) luo uusi avain, 2) vaihda integraatioon, 3) peru vanha (`DELETE /citizen/api-tokens/{id}`).

## Seuranta

- Audit: `CitizenApiTokenCreate`, `CitizenApiTokenRevoke` (service); `evaka.citizen_api_token.auth_failed` / `.scope_denied` / `.rate_limited` (api-gw, `meta.tokenId`) — hälytä toistuvasta osumasta.
- `citizen_api_token.last_used_at`: hälyttää, jos avain on käytössä, vaikka integraatio on ilmoitettu lopetetuksi.

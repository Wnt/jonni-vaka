<!--
SPDX-FileCopyrightText: 2017-2026 City of Espoo

SPDX-License-Identifier: LGPL-2.1-or-later
-->

# Tekninen tiivistelmä

## Yhteenveto

Kuntalainen voi luoda rajatun, määräaikaisen ja peruutettavan sovellusavaimen (`evaka_pat_…`), joka tunnistautuu **heikosti tunnistautuneena kuntalaisena** (`CitizenAuthLevel.WEAK`) — samana identiteettinä kuin sähköposti+salasana-kirjautuminen — joten service ei tarvitse riviäkään uutta valtuutuslogiikkaa. Oikeudet (scope) ovat suljettu, käsin kirjoitettu sanasto: 11 oikeutta, joista kukin luettelee täsmälleen ne endpointit (HTTP-metodi ja polkumalli), jotka se kattaa — yhteensä 24 endpointtia 116:sta. Mikään muu ei ole avaimella tavoitettavissa. Oikeuksien valvonta tapahtuu api-gw:ssä, joka on jo ainoa tunnistautumisen portti; service tarkistaa toisena kerroksena vain sen, että pyynnön kohde on luettelossa.

## Keskeiset valinnat ja perustelut

| Valinta | Perustelu |
| --- | --- |
| Avain tunnistautuu heikosti tunnistautuneena kuntalaisena (`CitizenAuthLevel.WEAK`) | Sama identiteetti kuin nykyinen kirjautuminen → service ei tarvitse uutta valtuutuslogiikkaa. Kaikki olemassa oleva pääsynvalvonta (lapset, yksiköt, dokumentit) toimii sellaisenaan. Avain ei voi koskaan antaa enemmän kuin kuntalaisella itsellään on: efektiivinen pääsy on kuntalaisen oikeuksien ja avaimen scopejen leikkaus. |
| Oikeuksien valvonta api-gw:ssä, servicessä vain luettelo | api-gw on jo ainoa tunnistaja: service luottaa `X-User`-otsakkeeseen täysin, JWT:n varmistamana. Scope-tarkistus on yksi päätös lisää samassa pisteessä, ei uusi luottamusoletus. Service ei tunne scopeja; `CitizenApiTokenAccessControl` (`HttpFilterConfig.kt`) hylkää 403:lla `X-Evaka-Api-Token-Id`-otsakkeellisen pyynnön, jonka kohde ei ole luettelossa, servletin omalla polulla, jotta gatewayn middlewaren ohi rekisteröity reitti tai normalisointiero ei ohita tarkistusta. Tarkistus sulkeutuu itsestään: tunnistamaton metodi tai polku ei ole listalla. |
| Sallittujen luettelo, ei johtamista polusta | Aiempi malli johti oikeuden polusta ja metodista ja rajasi poikkeuksia estolistalla, jolloin uusi endpoint oli tavoitettavissa heti kirjoitettuaan, kenenkään päättämättä. Nyt uusi endpoint ei ole tavoitettavissa ennen kuin se lisätään tauluun tarkoituksella, katselmoitavassa commitissa. Oikeuden nimi ei ole polun funktio, joten se nimetään sen mukaan, mihin kuntalainen suostuu (`CHILDREN_READ`, `MESSAGES_MARK_READ`), ja yksi endpoint kuuluu täsmälleen yhteen oikeuteen. |
| SHA-256, ei hidas tiiviste | Syöte on 256 bittiä satunnaisuutta (avain), ei arvattava salasana — ei ole mitä iteroida. Tiiviste lasketaan joka pyynnöllä, joten nopeus on oikea valinta. |
| Ei täyttä OAuth-valtuutuspalvelinta ensimmäisessä versiossa | Ei asiakasrekisteröintiä, ei suostumusnäyttöä, ei uudistuvia refresh-tokeneita — se tarvitaan vasta kun *kolmannen osapuolen* sovellus haluaa pääsyn *toisen* kuntalaisen dataan. Malli on GitHubin henkilökohtaiset access tokenit. Suunnittelu on silti eteenpäin yhteensopiva: myöhempi valtuutusendpoint olisi vain toinen tapa luoda rivi samaan tauluun samalla scope-sanastolla. |

## Pyynnön kulku

```
Asiakas               api-gw                                    service
  |                     |                                          |
  |-- GET /citizen/calendar-events -------->                       |
  |   Authorization: Bearer evaka_pat_…    |                       |
  |                     |                                          |
  |                     |-- POST /system/citizen-api-token-login -->|
  |                     |   { token }                              |  sha256 -> haku,
  |                     |<-- { personId, tokenId, scopes } --------|  vanhenemis-/peruutus-
  |                     |                                          |  tarkistus, last_used_at
  |                     |                                          |
  |                     | luettelossa? -> calendar:read             |
  |                     | myönnetty? -> kyllä                       |
  |                     |                                          |
  |                     |-- GET /citizen/calendar-events ---------->|
  |                     |   X-User: {"type":"citizen_weak","id":…}  |  luettelossa? -> kyllä;
  |                     |   X-Evaka-Api-Token-Id: …                 |  pääsynvalvonta ennallaan
  |<-- 200 -------------|<-----------------------------------------|
```

Validointia ei välimuistiteta: api-gw kutsuu `/system/citizen-api-token-login`-endpointtia jokaisella avainpyynnöllä, joten peruutus, vanheneminen ja kuntakohtainen kytkin tehoavat välittömästi rakenteesta johtuen eivätkä välimuistin mitätöinnin varassa. Kustannus on yksi uniikki-indeksihaku pyyntöä kohti (`last_used_at`-kirjoitus on jo rajoitettu 5 minuutin tarkkuuteen), ja liikenne on valinnaista, enintään 10 avainta kuntalaista kohti ja kutsurajoitettua. Mobiililaitteen pitkäikäisellä tunnisteella ei myöskään ole validointivälimuistia. Bearer-pyynnöt eivät kuljeta evästeitä eivätkä ole CSRF-alttiita (`csrf.ts`:n `requiresCsrfCheck`). Jos sekä avain että istunto ovat läsnä, avain voittaa (`app.ts`, `citizenProxy.getUserHeader`). Julkiset `/citizen/public/*`-reitit on kiinnitetty ennen avain-middlewarea (`app.ts`), joten niissä avain ohitetaan eikä hylätä: asiakkaan oletus-`Authorization`-otsake ei riko julkisia kutsuja. Kutsuja on lisäksi rajoitettu: 60/min avaimen id:tä kohti oletuksena (`CITIZEN_API_TOKEN_RATE_LIMIT`, 0 poistaa käytöstä, `429 RATE_LIMITED` + `Retry-After`, `citizen-api-token-rate-limit.ts`).

## Sallittujen luettelo

`CitizenApiScope` (`service/src/main/kotlin/evaka/core/shared/apiscopes/CitizenApiScopes.kt`) on `@ConstList`-annotoitu enum, jonka jokainen vakio kantaa oman `List<CitizenApiEndpoint>`-listansa: oikeus → (HTTP-metodi, Springin polkumalli polkumuuttujineen). Sanasto on siis tyyppi, ei merkkijono: tuntematon oikeus on 400 jo Jacksonin deserialisoinnissa, ja frontendin käännös puuttuvasta oikeudesta on käännösvirhe. Kaksi sääntöä pitävät taulun katselmoitavana. **Luku oletuksena:** ainoat kirjoitukset ovat kuittauksia — `NOTIFICATIONS_DISMISS` (`POST /citizen/daily-service-time-notifications/dismiss`) ja `MESSAGES_MARK_READ` (`PUT /citizen/messages/threads/{threadId}/read`) — eikä mikään, mikä luo, peruu, lähettää, irtisanoo tai arkistoi, ole listalla. **Ei etuliitteitä:** rivi nimeää yhden endpointin, joten pidempi polku listatun alla ei kuulu siihen, eikä sisarendpointin lisääminen laajenna oikeutta. `POST /citizen/preschool-operational-dates` on kysely ja listattu `CALENDAR_READ`-oikeuteen; erillistä luokittelumekanismia ei tarvita, koska taulu sanoo sen suoraan. Sanasto: `PERSONAL_DATA_READ` (2 endpointtia), `CHILDREN_READ` (3), `CALENDAR_READ` (5), `RESERVATIONS_READ` (1), `ABSENCES_READ` (1), `HOLIDAY_PERIODS_READ` (2), `NOTIFICATIONS_READ` (3), `NOTIFICATIONS_DISMISS` (1), `MESSAGES_READ` (4), `MESSAGES_MARK_READ` (1), `ATTACHMENTS_READ` (1). Tarkoituksella poissa, syineen, luokan KDoc:issa: hakemukset, päätökset, tulotiedot, lapsen ja pedagogiset asiakirjat (paitsi lukemattomien lukumäärät — `GET /citizen/child-documents/unanswered` palauttaisi asiakirjapohjan nimen ja tyypin), asian käsittelytiedot, lasten kuvat, `/citizen/personal-data/family`, tunnusten hallinta, `/citizen/auth` ja jokainen muu kirjoitus.

Valvonta: api-gw:ssä `requiredScope` (`apigw/src/enduser/citizen-api-token.ts`) sovittaa normalisoidun polun (`normalizeRequestPath`) generoidun luettelon ankkuroituihin lausekkeisiin, joissa polkumuuttuja vastaa täsmälleen yhtä segmenttiä; mikä ei täsmää, on `forbidden`. Servicessä `citizenApiTokenAllows` tekee saman `AntPathMatcher`illa. Codegen (`service/codegen/src/main/kotlin/evaka/codegen/apiscopes/CitizenApiScopes.kt`) generoi `apigw/src/enduser/generated/citizen-api-scopes.ts`: sanaston (`citizenApiScopes`), luettelon (`citizenApiScopeEndpoints`) ja audit-taulun jokaisesta kuntalaisen endpointista oikeuksineen tai `null` (`citizenEndpointScopes`), jotta uusi endpoint näkyy katselmoinnissa `null`-rivinä. `assertAllowlistedEndpointsExist` kaataa buildin, jos luettelossa on olematon endpoint, ja `./gradlew :codegen:codegenCheck` varmistaa CI:ssä, että tiedosto vastaa koodia. Sama enum generoituu myös frontendin `lib-common/generated/api-types/shared.ts`-tiedostoon (`citizenApiScopes`, `CitizenApiScope`).

## Tietomalli

Taulu `citizen_api_token` (`V609__citizen_api_token.sql`). Sarakkeet, joiden tarkoitus ei käy ilmi nimestä:

| Sarake | Selitys |
| --- | --- |
| `citizen_user_id` | FK → `citizen_user(id)`, ei suoraan `person`-tauluun: rivi luodaan `upsertCitizenUserForApiToken`-kutsulla ensimmäisen avaimen luonnin yhteydessä |
| `token_hash` | SHA-256 raakatunnisteesta; raakatunniste näytetään vain kerran luontihetkellä eikä sitä tallenneta |
| `last_used_at` | Päivittyy rajoitetulla tarkkuudella (`LAST_USED_RESOLUTION`, 5 min), jotta pollaava asiakas ei aiheuta jatkuvaa rivilukitusta/WAL-kuormaa |

## Rajapinta ja käyttöönotto

| Otsake | Ennen | Jälkeen |
| --- | --- | --- |
| `X-User` | `{"type":"citizen_weak","id":…}` | Ennallaan — sama muoto avaimella kuin istunnolla |
| `X-Evaka-Api-Token-Id` | Puuttuu | Avaimen id, **vain auditointiin ja lokitukseen**, ei valtuutukseen |

Kirjautuminen (`POST /system/citizen-api-token-login`, `SystemController.kt`) palauttaa `{ personId, tokenId, scopes }`; api-gw on ainoa kutsuja. Avaimen hallinta (`ApiTokenControllerCitizen.kt`) vaatii vahvan tunnistautumisen, enintään 180 vrk voimassaolon (`MAX_API_TOKEN_LIFETIME`) eikä ole itse luettelossa. Kuntakohtainen kytkin `evaka.citizen_api_tokens.enabled` palauttaa 404:n kirjautumis- ja hallintapäätepisteistä, kun pois päältä, ja sama arvo kulkee käyttöliittymälle `accessibleFeatures.apiTokens`-kenttänä (`AccessControlCitizen.getPermittedFeatures`), joten erillistä frontend-lippua ei ole synkronoitavana. Häiriötilanteessa Valkey-avain `citizen-api-tokens-disabled` pysäyttää kaiken avainliikenteen (`503 API_TOKENS_DISABLED`) koskematta istuntoihin (`apigw/src/enduser/citizen-api-token.ts`). Tunnistautumista vaatimaton `GET /api/citizen/public/api-manifest` (`apigw/src/enduser/routes/citizen-api-manifest.ts`) palauttaa ajossa olevan version (`apiVersion`), etuliitteen (`tokenPrefix`), sanaston (`scopes`), luettelon (`scopeEndpoints`) ja audit-taulun (`endpoints`) suoraan generoidusta tiedostosta.

## Testit ja avoimet kohdat

Testit: `service/src/test/kotlin/evaka/core/shared/apiscopes/CitizenApiScopesTest.kt` (luettelon semantiikka: metodi osana riviä, polkuun muuttuja täsmälleen yksi segmentti, ei etuliitteitä, vain kuittauskirjoitukset, "unread counts are exposed but the listing that names documents is not", jokainen oikeus kattaa vähintään yhden endpointin), `apigw/src/enduser/__tests__/citizen-api-token.ts` (`requiredScope`, polun normalisointi, häiriökytkin sekä ristiintarkistus, joka kävelee generoidun audit-taulun ja vaatii gatewayn tuloksen täsmäävän jokaisessa 116 endpointissa), `service/src/test/kotlin/evaka/core/shared/config/CitizenApiTokenAccessControlTest.kt`, `apigw/src/enduser/__tests__/citizen-api-manifest.ts` sekä E2E-testin esivalintatapaukset (lomake avautuu tyhjänä). Sanaston ja käyttöliittymän erkanemista ei enää tarvitse testata: `citizenApiScopes` on generoitu enumista, ja puuttuva käännös tai luokittelu on käännösvirhe. E2E-testi `frontend/src/e2e-test/specs/0_citizen/citizen-api-tokens.spec.ts` on kirjoitettu, mutta sitä ei ole vielä ajettu kertaakaan. Avoin: lapsikohtaista rajausta ei ole, ja luettelossa on endpointteja, jotka service hylkää heikolta tunnistautumiselta (uhkamalli, päätös 5). Hyökkääjäasemat ja jäännösriskit: [uhkamalli](https://github.com/Wnt/evaka-sovellusavaimet/blob/main/uhkamalli.md); perustelu: [tietoturva-arvio](https://github.com/Wnt/evaka-sovellusavaimet/blob/main/tietoturva-arvio.md), luku 3.

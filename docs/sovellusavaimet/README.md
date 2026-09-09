<!--
SPDX-FileCopyrightText: 2017-2026 City of Espoo

SPDX-License-Identifier: LGPL-2.1-or-later
-->

# eVakan sovellusavaimet

Kuntalainen voi antaa valitsemalleen ohjelmalle rajatun, määräaikaisen ja peruutettavan pääsyn **omiin** eVaka-tietoihinsa — ilman että hän luovuttaa eVaka-tunnuksiaan.

Hyväksyntämateriaali (päätösesitys, tietoturva-arvio, DPIA-aineisto, uhkamalli, integraattorin opas)
ja esimerkkisovellus ovat kunnan päätöksentekoa varten omassa repositoriossaan:
[Wnt/evaka-sovellusavaimet](https://github.com/Wnt/evaka-sovellusavaimet).

## Tähän repositorioon jäävät dokumentit

| Dokumentti | Kenelle | Sisältö |
| --- | --- | --- |
| [Tekninen tiivistelmä](tekninen-tiivistelma.md) | Kehittäjät, arkkitehdit | Toteutus, rajapinnat, tietomalli, ylläpito |
| [Vuototilanne ja avainkierto](vuototilanne-ja-avainkierto.md) | Ylläpito, kunnan tietoturvayhteyshenkilö | Toimintaohje vuototilanteessa, komennot, avainkierron periaatteet |

## Tilanne

Toteutus on tässä haarassa valmis katselmoitavaksi: tietokantataulu, avainten hallinta, api-gw:n tunnistus ja oikeuksien valvonta sallittujen endpointtien luettelon perusteella (11 oikeutta, 25 endpointtia 116:sta), servicen toinen valvontakerros, rajapintamanifesti ja testit. E2E-testit on kirjoitettu, mutta niitä ei ole vielä ajettu.

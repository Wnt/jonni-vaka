// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.emailclient

import evaka.core.shared.HtmlSafe

/**
 * Default content for the citizen API token access notification, sent to a co-guardian when the
 * other guardian creates an API token. Municipalities that need different wording should override
 * [IEmailMessageProvider.apiTokenAccessNotification] instead of duplicating this object.
 */
object ApiTokenAccessNotificationEmailContent {
    fun default(childNames: List<HtmlSafe<String>>): EmailContent {
        fun join(conjunction: String) =
            when (childNames.size) {
                1 -> childNames[0].toString()
                else ->
                    childNames.dropLast(1).joinToString(", ") + " $conjunction " + childNames.last()
            }
        val childLabelFi = if (childNames.size == 1) "lapsi" else "lapset"
        val childLabelEn = if (childNames.size == 1) "child" else "children"
        return EmailContent.fromHtml(
            subject =
                "Sovellusohjelma on saanut pääsyn eVaka-tietoihin / Ett program har fått åtkomst till eVaka-uppgifter / An application has been granted access to eVaka information",
            html =
                """
<p>Toinen huoltaja on ottanut eVakassa käyttöön sovellusohjelman, jolla on nyt pääsy lapsenne tietoihin eVakassa ($childLabelFi: ${join("ja")}).</p>
<p>Pääsy voi kattaa esimerkiksi yhteisissä viestiketjuissanne lähetettyjä viestejä.</p>
<p>Voitte käyttää eVakaa ja hallita omia tietojanne siellä normaalisti.</p>
<hr>
<p>En annan vårdnadshavare har i eVaka tagit i bruk ett program som nu har åtkomst till ert barns uppgifter i eVaka (barn: ${join("och")}).</p>
<p>Åtkomsten kan till exempel omfatta meddelanden i era gemensamma meddelandetrådar.</p>
<p>Du kan använda eVaka och hantera dina egna uppgifter där som vanligt.</p>
<hr>
<p>The other guardian has enabled an application in eVaka that now has access to your child's information in eVaka ($childLabelEn: ${join("and")}).</p>
<p>This access can include, for example, messages in shared message threads.</p>
<p>You can use eVaka and manage your own information there as usual.</p>
""",
        )
    }
}

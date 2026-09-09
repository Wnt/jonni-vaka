// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.user

import evaka.core.EmailEnv
import evaka.core.daycare.domain.Language
import evaka.core.emailclient.Email
import evaka.core.emailclient.EmailClient
import evaka.core.emailclient.IEmailMessageProvider
import evaka.core.pis.EmailMessageType
import evaka.core.pis.getPersonNameDetailsById
import evaka.core.pis.service.getGuardianChildIds
import evaka.core.pis.service.getGuardiansForChildren
import evaka.core.shared.HtmlSafe
import evaka.core.shared.PersonId
import evaka.core.shared.async.AsyncJob
import evaka.core.shared.async.AsyncJobRunner
import evaka.core.shared.db.Database
import evaka.core.shared.domain.EvakaClock
import evaka.core.shared.domain.HelsinkiDateTime
import org.springframework.stereotype.Service

/**
 * A citizen API token grants its holder some of the owner's own data, but eVaka puts all guardians
 * of a shared child in the same message thread and lets the owner's absences, holiday answers etc.
 * be visible alongside the co-guardian's. The co-guardian never chose the token's scopes and cannot
 * see or revoke it, so they are notified instead.
 */
@Service
class ApiTokenAccessNotificationEmailService(
    private val asyncJobRunner: AsyncJobRunner<AsyncJob>,
    private val emailClient: EmailClient,
    private val emailMessageProvider: IEmailMessageProvider,
    private val emailEnv: EmailEnv,
) {
    init {
        asyncJobRunner.registerHandler(::sendNotification)
    }

    /** Notifies every other guardian of every child [ownerId] is a guardian of. */
    fun planNotifications(tx: Database.Transaction, ownerId: PersonId, now: HelsinkiDateTime) {
        val childIds = tx.getGuardianChildIds(ownerId)
        if (childIds.isEmpty()) return
        val otherGuardianIds =
            tx.getGuardiansForChildren(childIds).values.flatten().toSet() - ownerId
        if (otherGuardianIds.isEmpty()) return
        asyncJobRunner.plan(
            tx,
            otherGuardianIds.map { recipientId ->
                AsyncJob.SendApiTokenAccessNotificationEmail(ownerId, recipientId)
            },
            runAt = now,
        )
    }

    fun sendNotification(
        db: Database.Connection,
        clock: EvakaClock,
        msg: AsyncJob.SendApiTokenAccessNotificationEmail,
    ) {
        // Re-resolved at send time in case the guardianship no longer holds
        val childNames = db.read { tx ->
            val sharedChildIds =
                tx.getGuardianChildIds(msg.ownerId).toSet() intersect
                    tx.getGuardianChildIds(msg.recipientId).toSet()
            tx.getPersonNameDetailsById(sharedChildIds)
        }
        if (childNames.isEmpty()) return

        Email.create(
                dbc = db,
                personId = msg.recipientId,
                emailType = EmailMessageType.API_TOKEN_ACCESS_NOTIFICATION,
                fromAddress = emailEnv.sender(Language.fi),
                content =
                    emailMessageProvider.apiTokenAccessNotification(
                        childNames.sortedBy { it.firstName }.map { HtmlSafe(it.firstName) }
                    ),
                traceId = "${msg.ownerId}/${msg.recipientId}",
            )
            ?.also { emailClient.send(it) }
    }
}

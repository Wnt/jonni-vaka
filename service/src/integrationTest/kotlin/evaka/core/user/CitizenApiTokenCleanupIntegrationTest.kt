// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.user

import evaka.core.FullApplicationTest
import evaka.core.shared.CitizenApiTokenId
import evaka.core.shared.apiscopes.CitizenApiScope
import evaka.core.shared.dev.DevPerson
import evaka.core.shared.dev.DevPersonType
import evaka.core.shared.dev.insert
import evaka.core.shared.domain.HelsinkiDateTime
import evaka.core.shared.domain.MockEvakaClock
import evaka.core.shared.job.ScheduledJobs
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired

class CitizenApiTokenCleanupIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var scheduledJobs: ScheduledJobs

    private val clock = MockEvakaClock(2026, 9, 8, 12, 0)
    private val person = DevPerson()

    @BeforeEach
    fun setUp() {
        db.transaction { tx ->
            tx.insert(person, DevPersonType.ADULT)
            tx.upsertCitizenUserForApiToken(person.id)
        }
    }

    @Test
    fun `nightly cleanup deletes tokens revoked or expired over 90 days ago, and keeps the active one`() {
        val active = insertToken("active", expiresAt = clock.now().plusDays(30))
        val revokedLongAgo = insertToken("revoked", expiresAt = clock.now().plusDays(30))
        val expiredLongAgo = insertToken("expired", expiresAt = clock.now().minusDays(100))
        db.transaction { tx ->
            tx.revokeCitizenApiToken(person.id, revokedLongAgo, clock.now().minusDays(100))
        }

        scheduledJobs.deleteOldCitizenApiTokens(db, clock)

        assertEquals(listOf(active), remainingTokenIds())
        // sanity check that the three inserted tokens above were in fact distinct rows
        assertEquals(3, setOf(active, revokedLongAgo, expiredLongAgo).size)
    }

    private fun insertToken(name: String, expiresAt: HelsinkiDateTime): CitizenApiTokenId =
        db.transaction { tx ->
            tx.insertCitizenApiToken(
                person = person.id,
                name = name,
                tokenHash = hashCitizenApiToken("$name-token"),
                scopes = listOf(CitizenApiScope.PERSONAL_DATA_READ),
                expiresAt = expiresAt,
            )
        }

    private fun remainingTokenIds(): List<CitizenApiTokenId> = db.read {
        it.createQuery { sql("SELECT id FROM citizen_api_token") }.toList<CitizenApiTokenId>()
    }
}

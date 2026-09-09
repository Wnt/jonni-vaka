// SPDX-FileCopyrightText: 2017-2026 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package evaka.core.pis.controller

import evaka.core.FullApplicationTest
import evaka.core.pis.SystemController
import evaka.core.pis.controllers.ApiTokenControllerCitizen
import evaka.core.pis.controllers.MAX_API_TOKENS_PER_CITIZEN
import evaka.core.pis.controllers.MAX_API_TOKEN_LIFETIME
import evaka.core.shared.CitizenApiTokenId
import evaka.core.shared.PersonId
import evaka.core.shared.apiscopes.CitizenApiScope
import evaka.core.shared.auth.AuthenticatedUser
import evaka.core.shared.auth.CitizenAuthLevel
import evaka.core.shared.dev.DevGuardian
import evaka.core.shared.dev.DevPerson
import evaka.core.shared.dev.DevPersonType
import evaka.core.shared.dev.insert
import evaka.core.shared.domain.BadRequest
import evaka.core.shared.domain.Forbidden
import evaka.core.shared.domain.HelsinkiDateTime
import evaka.core.shared.domain.MockEvakaClock
import evaka.core.shared.domain.NotFound
import evaka.core.user.CitizenApiToken
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import tools.jackson.core.JacksonException

class CitizenApiTokenIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var controller: ApiTokenControllerCitizen
    @Autowired private lateinit var systemController: SystemController

    private val clock = MockEvakaClock(2024, 1, 1, 12, 0)

    private val validScope = CitizenApiScope.PERSONAL_DATA_READ

    private val person = DevPerson()
    private val user = person.user(CitizenAuthLevel.STRONG)

    private fun insertPerson(p: DevPerson = person) {
        db.transaction { tx -> tx.insert(p, DevPersonType.ADULT) }
    }

    @Test
    fun `creating a token requires strong authentication`() {
        insertPerson()
        assertThrows<Forbidden> { createApiToken(citizen = person.user(CitizenAuthLevel.WEAK)) }
    }

    @Test
    fun `name must not be blank`() {
        insertPerson()
        val error = assertThrows<BadRequest> { createApiToken(name = "   ") }
        assertEquals("Name must not be blank", error.message)
    }

    @Test
    fun `at least one scope is required`() {
        insertPerson()
        val error = assertThrows<BadRequest> { createApiToken(scopes = emptyList()) }
        assertEquals("At least one scope is required", error.message)
    }

    @Test
    fun `a scope outside the vocabulary never reaches the controller`() {
        // The request body names the enum, so an unknown scope is a 400 from deserialization
        // rather than a check the controller could forget to make
        for (scope in listOf("passkeys:read", "API_TOKENS_WRITE", "personal_data_read")) {
            val body = """{"name":"t","scopes":["$scope"],"expiresAt":"2024-02-01T12:00:00"}"""
            assertThrows<JacksonException> {
                jsonMapper.readValue(body, ApiTokenControllerCitizen.ApiTokenRequest::class.java)
            }
        }
    }

    @Test
    fun `an expiry in the past is rejected`() {
        insertPerson()
        val error =
            assertThrows<BadRequest> { createApiToken(expiresAt = clock.now().minusDays(1)) }
        assertEquals("Expiry must be in the future", error.message)
    }

    @Test
    fun `an expiry beyond the maximum lifetime is rejected`() {
        insertPerson()
        val error =
            assertThrows<BadRequest> {
                createApiToken(expiresAt = clock.now().plus(MAX_API_TOKEN_LIFETIME).plusDays(1))
            }
        assertEquals("Expiry is too far in the future", error.message)
    }

    @Test
    fun `the per-citizen token limit is enforced`() {
        insertPerson()
        repeat(MAX_API_TOKENS_PER_CITIZEN) { i -> createApiToken(name = "token $i") }
        val error = assertThrows<BadRequest> { createApiToken(name = "one too many") }
        assertEquals("Too many API tokens", error.message)
    }

    @Test
    fun `listing shows only unrevoked tokens`() {
        insertPerson()
        val kept = createApiToken(name = "kept")
        val revoked = createApiToken(name = "revoked")

        revokeApiToken(revoked.id)

        val tokens = getApiTokens()
        assertEquals(listOf(kept.id), tokens.map(CitizenApiToken::id))
    }

    @Test
    fun `revoking another citizen's token gives NotFound`() {
        insertPerson()
        val otherPerson = DevPerson(ssn = null)
        insertPerson(otherPerson)
        val otherUser = otherPerson.user(CitizenAuthLevel.STRONG)

        val token = createApiToken()

        assertThrows<NotFound> { revokeApiToken(token.id, citizen = otherUser) }

        // still there and unrevoked from the owner's perspective
        assertEquals(listOf(token.id), getApiTokens().map(CitizenApiToken::id))
    }

    @Test
    fun `citizenApiTokenLogin resolves a freshly created token to the right person, id and scopes`() {
        insertPerson()
        val scopes = listOf(CitizenApiScope.PERSONAL_DATA_READ, CitizenApiScope.CHILDREN_READ)
        val created = createApiToken(scopes = scopes)

        val identity = citizenApiTokenLogin(created.token)

        assertEquals(person.id, identity.personId)
        assertEquals(created.id, identity.tokenId)
        assertEquals(scopes.sortedBy { it.name }, identity.scopes.sortedBy { it.name })
    }

    @Test
    fun `last_used_at is updated on use and throttled within the resolution window`() {
        insertPerson()
        val created = createApiToken()

        assertNull(getLastUsedAt(created.id))

        citizenApiTokenLogin(created.token)
        val firstUsedAt = getLastUsedAt(created.id)
        assertEquals(clock.now(), firstUsedAt)

        // Well within the 5 minute throttle window: last_used_at must not move
        clock.tick(Duration.ofMinutes(4))
        citizenApiTokenLogin(created.token)
        assertEquals(firstUsedAt, getLastUsedAt(created.id))

        // Past the throttle window: last_used_at must be refreshed
        clock.tick(Duration.ofMinutes(1).plusSeconds(1))
        citizenApiTokenLogin(created.token)
        val secondUsedAt = getLastUsedAt(created.id)
        assertEquals(clock.now(), secondUsedAt)
        assertNotEquals(firstUsedAt, secondUsedAt)
    }

    @Test
    fun `an unknown token gives NotFound`() {
        insertPerson()
        assertThrows<NotFound> { citizenApiTokenLogin("evaka_pat_does-not-exist") }
    }

    @Test
    fun `an expired token gives NotFound, indistinguishable from an unknown one`() {
        insertPerson()
        val created = createApiToken(expiresAt = clock.now().plusMinutes(1))

        clock.tick(Duration.ofMinutes(2))

        val error = assertThrows<NotFound> { citizenApiTokenLogin(created.token) }
        val unknownError =
            assertThrows<NotFound> { citizenApiTokenLogin("evaka_pat_does-not-exist") }
        assertEquals(unknownError.message, error.message)
    }

    @Test
    fun `a revoked token gives NotFound, indistinguishable from an unknown one`() {
        insertPerson()
        val created = createApiToken()
        revokeApiToken(created.id)

        val error = assertThrows<NotFound> { citizenApiTokenLogin(created.token) }
        val unknownError =
            assertThrows<NotFound> { citizenApiTokenLogin("evaka_pat_does-not-exist") }
        assertEquals(unknownError.message, error.message)
    }

    @Test
    fun `with the feature toggle off, creating a token gives NotFound`() {
        insertPerson()
        whenever(evakaEnv.citizenApiTokensEnabled).thenReturn(false)

        assertThrows<NotFound> { createApiToken() }
    }

    @Test
    fun `creating a token plans an access notification to the co-guardian of a shared child`() {
        insertPerson()
        val child = DevPerson()
        val otherGuardian = DevPerson(ssn = null)
        db.transaction { tx ->
            tx.insert(child, DevPersonType.CHILD)
            tx.insert(otherGuardian, DevPersonType.ADULT)
            tx.insert(DevGuardian(person.id, child.id))
            tx.insert(DevGuardian(otherGuardian.id, child.id))
        }

        createApiToken()

        assertEquals(listOf(otherGuardian.id), getPlannedApiTokenNotificationRecipients())
    }

    @Test
    fun `creating a token as a sole guardian plans no access notification`() {
        insertPerson()
        val child = DevPerson()
        db.transaction { tx ->
            tx.insert(child, DevPersonType.CHILD)
            tx.insert(DevGuardian(person.id, child.id))
        }

        createApiToken()

        assertEquals(emptyList(), getPlannedApiTokenNotificationRecipients())
    }

    @Test
    fun `creating a token with no children plans no access notification`() {
        insertPerson()

        createApiToken()

        assertEquals(emptyList(), getPlannedApiTokenNotificationRecipients())
    }

    @Test
    fun `the token owner is not among the notified co-guardians`() {
        insertPerson()
        val child = DevPerson()
        val otherGuardian = DevPerson(ssn = null)
        db.transaction { tx ->
            tx.insert(child, DevPersonType.CHILD)
            tx.insert(otherGuardian, DevPersonType.ADULT)
            tx.insert(DevGuardian(person.id, child.id))
            tx.insert(DevGuardian(otherGuardian.id, child.id))
        }

        createApiToken()

        assertFalse(getPlannedApiTokenNotificationRecipients().contains(person.id))
    }

    @Test
    fun `with the feature toggle off, token login gives NotFound`() {
        insertPerson()
        val created = createApiToken()

        whenever(evakaEnv.citizenApiTokensEnabled).thenReturn(false)

        assertThrows<NotFound> { citizenApiTokenLogin(created.token) }
    }

    private fun getApiTokens(citizen: AuthenticatedUser.Citizen = user): List<CitizenApiToken> =
        controller.getApiTokens(dbInstance(), citizen, clock)

    private fun createApiToken(
        name: String = "test token",
        scopes: List<CitizenApiScope> = listOf(validScope),
        expiresAt: HelsinkiDateTime = clock.now().plusDays(30),
        citizen: AuthenticatedUser.Citizen = user,
    ): ApiTokenControllerCitizen.NewApiTokenResponse =
        controller.createApiToken(
            dbInstance(),
            citizen,
            clock,
            ApiTokenControllerCitizen.ApiTokenRequest(
                name = name,
                scopes = scopes,
                expiresAt = expiresAt,
            ),
        )

    private fun revokeApiToken(
        id: CitizenApiTokenId,
        citizen: AuthenticatedUser.Citizen = user,
    ) = controller.revokeApiToken(dbInstance(), citizen, clock, id)

    private fun citizenApiTokenLogin(token: String) =
        systemController.citizenApiTokenLogin(
            dbInstance(),
            AuthenticatedUser.SystemInternalUser,
            clock,
            SystemController.CitizenApiTokenLoginRequest(token),
        )

    private fun getLastUsedAt(id: CitizenApiTokenId): HelsinkiDateTime? = db.read { tx ->
        tx.createQuery { sql("SELECT last_used_at FROM citizen_api_token WHERE id = ${bind(id)}") }
            .exactlyOne<HelsinkiDateTime?>()
    }

    private fun getPlannedApiTokenNotificationRecipients(): List<PersonId> = db.read { tx ->
        tx.createQuery {
                sql(
                    "SELECT (payload->>'recipientId')::uuid FROM async_job WHERE type = 'SendApiTokenAccessNotificationEmail'"
                )
            }
            .mapTo<PersonId>()
            .toList()
    }
}

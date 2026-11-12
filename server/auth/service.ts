import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  businessAudit,
  businessInvitations,
  businessLocations,
  businessPasswordResets,
  businessMemberships,
  businessOrganizations,
  businessSessions,
  businessUsers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  csrfTokenForSession,
  hashPassword,
  normalizeEmail,
  randomToken,
  tokenHash,
  verifyPassword,
  type BusinessRole,
} from "./security";

const unavailable = () => new Error("SERVICE_UNAVAILABLE");
const duplicateKey = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
};

let dummyPasswordHash: Promise<string> | undefined;
async function getDummyPasswordHash() {
  dummyPasswordHash ??= hashPassword(randomToken());
  try {
    return await dummyPasswordHash;
  } catch (error) {
    dummyPasswordHash = undefined;
    throw error;
  }
}

export async function organizationExists() {
  const db = await getDb();
  if (!db) throw unavailable();
  const rows = await db
    .select({ id: businessOrganizations.id })
    .from(businessOrganizations)
    .limit(1);
  return rows.length > 0;
}

export async function bootstrap(input: {
  organizationName: string;
  locationName: string;
  ownerName: string;
  email: string;
  password: string;
}) {
  const db = await getDb();
  if (!db) throw unavailable();
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: businessOrganizations.id })
      .from(businessOrganizations)
      .limit(1);
    if (existing.length) throw new Error("BOOTSTRAP_CLOSED");

    let organizationId: number;
    try {
      const [organization] = await tx
        .insert(businessOrganizations)
        .values({ name: input.organizationName.trim() })
        .$returningId();
      organizationId = organization.id;
    } catch (error) {
      // The unique singleton key is the final guard when two first-owner requests race.
      if (duplicateKey(error)) throw new Error("BOOTSTRAP_CLOSED");
      throw error;
    }

    const [location] = await tx
      .insert(businessLocations)
      .values({
        organizationId,
        name: input.locationName.trim(),
        city: "Bauru",
        state: "SP",
        timezone: "America/Sao_Paulo",
      })
      .$returningId();
    const [owner] = await tx
      .insert(businessUsers)
      .values({
        email: normalizeEmail(input.email),
        name: input.ownerName.trim(),
        passwordHash,
      })
      .$returningId();

    await tx.insert(businessMemberships).values({
      userId: owner.id,
      organizationId,
      locationId: location.id,
      role: "owner",
    });
    await tx.insert(businessAudit).values({
      organizationId,
      locationId: location.id,
      actorUserId: owner.id,
      event: "business.bootstrap",
      targetId: owner.id,
    });

    return {
      userId: owner.id,
      organizationId,
      locationId: location.id,
    };
  });
}

export async function issueSession(userId: number) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: businessUsers.id, disabledAt: businessUsers.disabledAt })
      .from(businessUsers)
      .where(eq(businessUsers.id, userId))
      .limit(1)
      .for("update");
    if (!user || user.disabledAt) return null;

    const [membership] = await tx
      .select({ id: businessMemberships.id })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.userId, userId),
          eq(businessMemberships.active, true),
        ),
      )
      .limit(1)
      .for("update");
    if (!membership) return null;

    const token = randomToken();
    const csrf = csrfTokenForSession(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await tx.insert(businessSessions).values({
      tokenHash: tokenHash(token),
      userId,
      csrfHash: tokenHash(csrf),
      expiresAt,
    });
    return { token, expiresAt };
  });
}

export async function resolveSession(token: string) {
  const db = await getDb();
  if (!db || !token) return null;

  const [session] = await db
    .select()
    .from(businessSessions)
    .where(
      and(
        eq(businessSessions.tokenHash, tokenHash(token)),
        isNull(businessSessions.revokedAt),
        gt(businessSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) return null;

  const [user] = await db
    .select()
    .from(businessUsers)
    .where(
      and(
        eq(businessUsers.id, session.userId),
        isNull(businessUsers.disabledAt),
      ),
    )
    .limit(1);
  if (!user) return null;

  const [membership] = await db
    .select()
    .from(businessMemberships)
    .where(
      and(
        eq(businessMemberships.userId, user.id),
        eq(businessMemberships.active, true),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const [organization] = await db
    .select()
    .from(businessOrganizations)
    .where(eq(businessOrganizations.id, membership.organizationId))
    .limit(1);
  const [location] = await db
    .select()
    .from(businessLocations)
    .where(
      and(
        eq(businessLocations.id, membership.locationId),
        eq(businessLocations.organizationId, membership.organizationId),
      ),
    )
    .limit(1);
  if (!organization || !location) return null;

  return {
    session: {
      id: session.id,
      userId: session.userId,
      csrfHash: session.csrfHash,
      csrfToken: csrfTokenForSession(token),
    },
    user: { id: user.id, name: user.name, email: user.email },
    membership: {
      id: membership.id,
      role: membership.role,
      organizationId: membership.organizationId,
      locationId: membership.locationId,
      active: membership.active,
    },
    organization: { id: organization.id, name: organization.name },
    location: {
      id: location.id,
      name: location.name,
      city: location.city,
      state: location.state,
      timezone: location.timezone,
    },
  };
}

export async function revokeSession(token: string) {
  const db = await getDb();
  if (!db || !token) return;
  await db
    .update(businessSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(businessSessions.tokenHash, tokenHash(token)),
        isNull(businessSessions.revokedAt),
      ),
    );
}

export async function authenticate(email: string, password: string) {
  const db = await getDb();
  if (!db) return null;

  const [user] = await db
    .select()
    .from(businessUsers)
    .where(eq(businessUsers.email, normalizeEmail(email)))
    .limit(1);
  const hash = user?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(password, hash);
  if (!user || user.disabledAt || !passwordMatches) return null;

  const [membership] = await db
    .select()
    .from(businessMemberships)
    .where(
      and(
        eq(businessMemberships.userId, user.id),
        eq(businessMemberships.active, true),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const [organization] = await db
    .select()
    .from(businessOrganizations)
    .where(eq(businessOrganizations.id, membership.organizationId))
    .limit(1);
  const [location] = await db
    .select()
    .from(businessLocations)
    .where(
      and(
        eq(businessLocations.id, membership.locationId),
        eq(businessLocations.organizationId, membership.organizationId),
      ),
    )
    .limit(1);
  if (!organization || !location) return null;

  return {
    user: { id: user.id, name: user.name, email: user.email },
    membership: {
      id: membership.id,
      role: membership.role,
      organizationId: membership.organizationId,
      locationId: membership.locationId,
    },
    organization: { id: organization.id, name: organization.name },
    location: {
      id: location.id,
      name: location.name,
      city: location.city,
      state: location.state,
      timezone: location.timezone,
    },
  };
}

export async function createInvitation(
  actorId: number,
  organizationId: number,
  locationId: number,
  email: string,
  role: Exclude<BusinessRole, "owner">,
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const normalized = normalizeEmail(email);
  const raw = randomToken();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: businessUsers.id })
      .from(businessUsers)
      .where(eq(businessUsers.email, normalized))
      .limit(1);
    if (existingUser) throw new Error("BUSINESS_USER_EXISTS");

    const [existingInvitation] = await tx
      .select({ id: businessInvitations.id })
      .from(businessInvitations)
      .where(
        and(
          eq(businessInvitations.organizationId, organizationId),
          eq(businessInvitations.locationId, locationId),
          eq(businessInvitations.email, normalized),
          isNull(businessInvitations.acceptedAt),
          gt(businessInvitations.expiresAt, now),
        ),
      )
      .limit(1);
    if (existingInvitation) throw new Error("INVITATION_PENDING");

    const [invitation] = await tx
      .insert(businessInvitations)
      .values({
        organizationId,
        locationId,
        email: normalized,
        role,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        createdBy: actorId,
      })
      .$returningId();
    await tx.insert(businessAudit).values({
      organizationId,
      locationId,
      actorUserId: actorId,
      event: "business.invitation.created",
      targetId: invitation.id,
    });
    return raw;
  });
}

export async function acceptInvitation(
  raw: string,
  name: string,
  password: string,
) {
  const db = await getDb();
  if (!db) throw unavailable();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(businessInvitations)
      .where(
        and(
          eq(businessInvitations.tokenHash, tokenHash(raw)),
          isNull(businessInvitations.acceptedAt),
          gt(businessInvitations.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");
    if (!invitation) return null;

    const [existingUser] = await tx
      .select({ id: businessUsers.id })
      .from(businessUsers)
      .where(eq(businessUsers.email, normalizeEmail(invitation.email)))
      .limit(1);
    if (existingUser) return null;

    const passwordHash = await hashPassword(password);
    const acceptedAt = new Date();
    if (invitation.expiresAt.getTime() <= acceptedAt.getTime()) return null;
    const [user] = await tx
      .insert(businessUsers)
      .values({
        email: normalizeEmail(invitation.email),
        name: name.trim(),
        passwordHash,
      })
      .$returningId();
    await tx
      .update(businessInvitations)
      .set({ acceptedAt })
      .where(
        and(
          eq(businessInvitations.id, invitation.id),
          isNull(businessInvitations.acceptedAt),
          gt(businessInvitations.expiresAt, acceptedAt),
        ),
      );
    await tx.insert(businessMemberships).values({
      userId: user.id,
      organizationId: invitation.organizationId,
      locationId: invitation.locationId,
      role: invitation.role,
    });
    await tx.insert(businessAudit).values({
      organizationId: invitation.organizationId,
      locationId: invitation.locationId,
      actorUserId: user.id,
      event: "business.invitation.accepted",
      targetId: invitation.id,
    });
    return user.id;
  });
}

export async function listMembers(organizationId: number, locationId: number) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db
    .select({
      id: businessMemberships.id,
      email: businessUsers.email,
      name: businessUsers.name,
      role: businessMemberships.role,
      active: businessMemberships.active,
      createdAt: businessMemberships.createdAt,
    })
    .from(businessMemberships)
    .innerJoin(businessUsers, eq(businessUsers.id, businessMemberships.userId))
    .where(
      and(
        eq(businessMemberships.organizationId, organizationId),
        eq(businessMemberships.locationId, locationId),
      ),
    );
}

export async function listInvitations(
  organizationId: number,
  locationId: number,
) {
  const db = await getDb();
  if (!db) throw unavailable();
  return db
    .select({
      id: businessInvitations.id,
      email: businessInvitations.email,
      role: businessInvitations.role,
      status: sql<string>`'pending'`,
      expiresAt: businessInvitations.expiresAt,
    })
    .from(businessInvitations)
    .where(
      and(
        eq(businessInvitations.organizationId, organizationId),
        eq(businessInvitations.locationId, locationId),
        isNull(businessInvitations.acceptedAt),
      ),
    );
}

export async function setMemberStatus(
  actorId: number,
  organizationId: number,
  locationId: number,
  membershipId: number,
  active: boolean,
) {
  const db = await getDb();
  if (!db) throw unavailable();

  return db.transaction(async (tx) => {
    const [targetHint] = await tx
      .select({
        id: businessMemberships.id,
        userId: businessMemberships.userId,
      })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.id, membershipId),
          eq(businessMemberships.organizationId, organizationId),
          eq(businessMemberships.locationId, locationId),
        ),
      )
      .limit(1);
    if (!targetHint) throw new Error("NOT_FOUND");

    // Lock the user first. All status changes for one account now share one lock order.
    const [user] = await tx
      .select({ id: businessUsers.id })
      .from(businessUsers)
      .where(eq(businessUsers.id, targetHint.userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("NOT_FOUND");

    const [target] = await tx
      .select()
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.id, targetHint.id),
          eq(businessMemberships.organizationId, organizationId),
          eq(businessMemberships.locationId, locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!target) throw new Error("NOT_FOUND");
    if (target.userId === actorId && !active) {
      throw new Error("SELF_DEACTIVATION");
    }
    if (target.role === "owner" && !active) {
      throw new Error("OWNER_ACCOUNT_PROTECTED");
    }
    if (target.active === active) return { success: true };

    await tx
      .update(businessMemberships)
      .set({ active })
      .where(eq(businessMemberships.id, membershipId));
    if (!active) {
      await tx
        .update(businessSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(businessSessions.userId, target.userId),
            isNull(businessSessions.revokedAt),
          ),
        );
    }

    const activeMemberships = await tx
      .select({ id: businessMemberships.id })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.userId, target.userId),
          eq(businessMemberships.active, true),
        ),
      )
      .limit(1)
      .for("update");
    await tx
      .update(businessUsers)
      .set({ disabledAt: activeMemberships.length ? null : new Date() })
      .where(eq(businessUsers.id, target.userId));

    await tx.insert(businessAudit).values({
      organizationId,
      locationId,
      actorUserId: actorId,
      event: active ? "business.member.activated" : "business.member.disabled",
      targetId: membershipId,
    });
    return { success: true };
  });
}

export async function setMemberRole(
  actorId: number,
  organizationId: number,
  locationId: number,
  membershipId: number,
  role: Exclude<BusinessRole, "owner">,
) {
  const db = await getDb();
  if (!db) throw unavailable();

  return db.transaction(async (tx) => {
    const [hint] = await tx
      .select({
        id: businessMemberships.id,
        userId: businessMemberships.userId,
      })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.id, membershipId),
          eq(businessMemberships.organizationId, organizationId),
          eq(businessMemberships.locationId, locationId),
        ),
      )
      .limit(1);
    if (!hint) throw new Error("NOT_FOUND");

    const [user] = await tx
      .select({ id: businessUsers.id })
      .from(businessUsers)
      .where(eq(businessUsers.id, hint.userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("NOT_FOUND");

    const [target] = await tx
      .select()
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.id, hint.id),
          eq(businessMemberships.organizationId, organizationId),
          eq(businessMemberships.locationId, locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!target || target.role === "owner") throw new Error("NOT_FOUND");
    if (target.role === role) return { success: true };

    await tx
      .update(businessMemberships)
      .set({ role })
      .where(eq(businessMemberships.id, membershipId));
    await tx
      .update(businessSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(businessSessions.userId, target.userId),
          isNull(businessSessions.revokedAt),
        ),
      );
    await tx.insert(businessAudit).values({
      organizationId,
      locationId,
      actorUserId: actorId,
      event: "business.member.role_changed",
      targetId: membershipId,
      metadata: JSON.stringify({ from: target.role, to: role }),
    });
    return { success: true };
  });
}

async function createPasswordResetForMembership(
  actorId: number,
  organizationId: number,
  locationId: number,
  membershipId: number,
  allowOwnerTarget = false,
) {
  const db = await getDb();
  if (!db) throw unavailable();

  return db.transaction(async (tx) => {
    const [hint] = await tx
      .select({
        id: businessMemberships.id,
        userId: businessMemberships.userId,
      })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.id, membershipId),
          eq(businessMemberships.organizationId, organizationId),
          eq(businessMemberships.locationId, locationId),
        ),
      )
      .limit(1);
    if (!hint) throw new Error("NOT_FOUND");

    const [user] = await tx
      .select({ id: businessUsers.id })
      .from(businessUsers)
      .where(eq(businessUsers.id, hint.userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("NOT_FOUND");

    const [target] = await tx
      .select()
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.id, hint.id),
          eq(businessMemberships.organizationId, organizationId),
          eq(businessMemberships.locationId, locationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!target) throw new Error("NOT_FOUND");
    if (
      target.role === "owner" &&
      !(allowOwnerTarget && target.userId === actorId)
    ) {
      throw new Error("OWNER_ACCOUNT_PROTECTED");
    }

    const now = new Date();
    await tx
      .update(businessPasswordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(businessPasswordResets.userId, target.userId),
          isNull(businessPasswordResets.usedAt),
        ),
      );

    const token = randomToken();
    const [reset] = await tx
      .insert(businessPasswordResets)
      .values({
        userId: target.userId,
        organizationId,
        locationId,
        tokenHash: tokenHash(token),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        createdBy: actorId,
      })
      .$returningId();
    await tx.insert(businessAudit).values({
      organizationId,
      locationId,
      actorUserId: actorId,
      event: "business.password_reset.created",
      targetId: reset.id,
    });
    return token;
  });
}

export async function createPasswordReset(
  actorId: number,
  organizationId: number,
  locationId: number,
  membershipId: number,
) {
  return createPasswordResetForMembership(
    actorId,
    organizationId,
    locationId,
    membershipId,
  );
}

export async function createOwnerPasswordReset() {
  const db = await getDb();
  if (!db) throw unavailable();
  const [owner] = await db
    .select({
      id: businessMemberships.id,
      userId: businessMemberships.userId,
      organizationId: businessMemberships.organizationId,
      locationId: businessMemberships.locationId,
    })
    .from(businessMemberships)
    .where(
      and(
        eq(businessMemberships.role, "owner"),
        eq(businessMemberships.active, true),
      ),
    )
    .limit(1);
  if (!owner) return null;
  return createPasswordResetForMembership(
    owner.userId,
    owner.organizationId,
    owner.locationId,
    owner.id,
    true,
  );
}

export async function acceptPasswordReset(raw: string, password: string) {
  const db = await getDb();
  if (!db || !raw) return false;
  const tokenDigest = tokenHash(raw);
  const now = new Date();
  const [hint] = await db
    .select({
      id: businessPasswordResets.id,
      userId: businessPasswordResets.userId,
    })
    .from(businessPasswordResets)
    .where(
      and(
        eq(businessPasswordResets.tokenHash, tokenDigest),
        isNull(businessPasswordResets.usedAt),
        gt(businessPasswordResets.expiresAt, now),
      ),
    )
    .limit(1);
  if (!hint) return false;

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: businessUsers.id })
      .from(businessUsers)
      .where(eq(businessUsers.id, hint.userId))
      .limit(1)
      .for("update");
    if (!user) return false;

    const [reset] = await tx
      .select()
      .from(businessPasswordResets)
      .where(
        and(
          eq(businessPasswordResets.id, hint.id),
          eq(businessPasswordResets.userId, user.id),
          eq(businessPasswordResets.tokenHash, tokenDigest),
          isNull(businessPasswordResets.usedAt),
          gt(businessPasswordResets.expiresAt, new Date()),
        ),
      )
      .limit(1)
      .for("update");
    if (!reset) return false;

    const passwordHash = await hashPassword(password);
    const completedAt = new Date();
    if (reset.expiresAt.getTime() <= completedAt.getTime()) return false;
    await tx
      .update(businessUsers)
      .set({ passwordHash })
      .where(eq(businessUsers.id, user.id));
    await tx
      .update(businessPasswordResets)
      .set({ usedAt: completedAt })
      .where(
        and(
          eq(businessPasswordResets.userId, user.id),
          isNull(businessPasswordResets.usedAt),
        ),
      );
    await tx
      .update(businessSessions)
      .set({ revokedAt: completedAt })
      .where(
        and(
          eq(businessSessions.userId, user.id),
          isNull(businessSessions.revokedAt),
        ),
      );
    await tx.insert(businessAudit).values({
      organizationId: reset.organizationId,
      locationId: reset.locationId,
      actorUserId: user.id,
      event: "business.password_reset.completed",
      targetId: reset.id,
    });
    return true;
  });
}

export async function revokeInvitation(
  actorId: number,
  organizationId: number,
  locationId: number,
  invitationId: number,
) {
  const db = await getDb();
  if (!db) throw unavailable();

  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({ id: businessInvitations.id })
      .from(businessInvitations)
      .where(
        and(
          eq(businessInvitations.id, invitationId),
          eq(businessInvitations.organizationId, organizationId),
          eq(businessInvitations.locationId, locationId),
          isNull(businessInvitations.acceptedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!invitation) throw new Error("NOT_FOUND");

    await tx
      .delete(businessInvitations)
      .where(eq(businessInvitations.id, invitationId));
    await tx.insert(businessAudit).values({
      organizationId,
      locationId,
      actorUserId: actorId,
      event: "business.invitation.revoked",
      targetId: invitationId,
    });
    return { success: true };
  });
}

import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from './index.ts';
import { RouteWaypoint, runRsvps, runs, users } from './schema.ts';

export interface RunAttendeeDTO {
  id: number;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RunDTO {
  id: number;
  title: string;
  city: string;
  countryCode: string;
  startsAt: string;
  distanceKm: number;
  paceSecPerKm: number;
  paceGroup: 'social' | 'tempo' | 'threshold' | 'long';
  surfaceType: 'road' | 'park' | 'trail' | 'waterfront';
  meetingPoint: string;
  description: string;
  startLat: number;
  startLng: number;
  waypoints: RouteWaypoint[];
  maxRunners: number;
  createdAt: string;
  host: {
    id: number;
    uid: string;
    displayName: string;
    avatarUrl: string | null;
  };
  attendees: RunAttendeeDTO[];
  attendeeCount: number;
  isJoined: boolean;
  isHost: boolean;
}

export interface ListRunsFilters {
  city?: string;
  paceGroup?: string;
  distanceBracket?: string;
  search?: string;
  mineOnly?: boolean;
  currentUserUid?: string;
}

export interface CreateRunPayload {
  title: string;
  city: string;
  countryCode: string;
  startsAt: string;
  distanceKm: number;
  paceSecPerKm: number;
  paceGroup: 'social' | 'tempo' | 'threshold' | 'long';
  surfaceType: 'road' | 'park' | 'trail' | 'waterfront';
  meetingPoint: string;
  description: string;
  startLat: number;
  startLng: number;
  waypoints: RouteWaypoint[];
  maxRunners?: number;
}

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const safeName =
    params.displayName?.trim() ||
    params.email.split('@')[0] ||
    'Club Runner';

  try {
    const result = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        displayName: safeName,
        avatarUrl: params.avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          displayName: safeName,
          avatarUrl: params.avatarUrl ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize runner profile. Please try again.', {
      cause: error,
    });
  }
}

export async function listRuns(filters: ListRunsFilters = {}): Promise<RunDTO[]> {
  try {
    const conditions = [];

    if (filters.city && filters.city !== 'all') {
      conditions.push(eq(runs.city, filters.city));
    }

    if (filters.paceGroup && filters.paceGroup !== 'all') {
      conditions.push(eq(runs.paceGroup, filters.paceGroup));
    }

    if (filters.distanceBracket === '5k') {
      conditions.push(lte(runs.distanceKm, 7));
    } else if (filters.distanceBracket === '10k') {
      conditions.push(and(gte(runs.distanceKm, 7.01), lte(runs.distanceKm, 12)));
    } else if (filters.distanceBracket === 'long') {
      conditions.push(gte(runs.distanceKm, 12.01));
    }

    const baseRuns = await db
      .select({
        run: runs,
        host: users,
      })
      .from(runs)
      .innerJoin(users, eq(runs.hostUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(runs.startsAt));

    if (baseRuns.length === 0) {
      return [];
    }

    const runIds = baseRuns.map((row) => row.run.id);

    const allRsvps = await db
      .select({
        runId: runRsvps.runId,
        user: users,
      })
      .from(runRsvps)
      .innerJoin(users, eq(runRsvps.userId, users.id))
      .where(inArray(runRsvps.runId, runIds))
      .orderBy(asc(runRsvps.createdAt));

    const rsvpsByRunId: Record<number, RunAttendeeDTO[]> = {};
    for (const row of allRsvps) {
      if (!rsvpsByRunId[row.runId]) {
        rsvpsByRunId[row.runId] = [];
      }
      rsvpsByRunId[row.runId].push({
        id: row.user.id,
        uid: row.user.uid,
        displayName: row.user.displayName,
        avatarUrl: row.user.avatarUrl,
      });
    }

    const searchLower = filters.search?.trim().toLowerCase() || '';

    let mapped: RunDTO[] = baseRuns.map(({ run, host }) => {
      const attendees = rsvpsByRunId[run.id] ?? [];
      const isJoined = filters.currentUserUid
        ? attendees.some((a) => a.uid === filters.currentUserUid)
        : false;
      const isHost = filters.currentUserUid
        ? host.uid === filters.currentUserUid
        : false;

      return {
        id: run.id,
        title: run.title,
        city: run.city,
        countryCode: run.countryCode,
        startsAt: run.startsAt.toISOString(),
        distanceKm: Number(run.distanceKm),
        paceSecPerKm: run.paceSecPerKm,
        paceGroup: run.paceGroup as RunDTO['paceGroup'],
        surfaceType: run.surfaceType as RunDTO['surfaceType'],
        meetingPoint: run.meetingPoint,
        description: run.description,
        startLat: Number(run.startLat),
        startLng: Number(run.startLng),
        waypoints: Array.isArray(run.waypoints) ? run.waypoints : [],
        maxRunners: run.maxRunners,
        createdAt: run.createdAt.toISOString(),
        host: {
          id: host.id,
          uid: host.uid,
          displayName: host.displayName,
          avatarUrl: host.avatarUrl,
        },
        attendees,
        attendeeCount: attendees.length,
        isJoined,
        isHost,
      };
    });

    if (searchLower) {
      mapped = mapped.filter(
        (r) =>
          r.title.toLowerCase().includes(searchLower) ||
          r.city.toLowerCase().includes(searchLower) ||
          r.meetingPoint.toLowerCase().includes(searchLower) ||
          r.description.toLowerCase().includes(searchLower),
      );
    }

    if (filters.mineOnly && filters.currentUserUid) {
      mapped = mapped.filter((r) => r.isHost || r.isJoined);
    }

    return mapped;
  } catch (error) {
    console.error('Database query failed in listRuns:', error);
    throw new Error('Unable to load upcoming runs. Please try again later.', {
      cause: error,
    });
  }
}

export async function getRunById(
  runId: number,
  currentUserUid?: string,
): Promise<RunDTO | null> {
  try {
    const rows = await db
      .select({ run: runs, host: users })
      .from(runs)
      .innerJoin(users, eq(runs.hostUserId, users.id))
      .where(eq(runs.id, runId))
      .limit(1);

    if (rows.length === 0) return null;

    const { run, host } = rows[0];
    const rsvpRows = await db
      .select({ user: users })
      .from(runRsvps)
      .innerJoin(users, eq(runRsvps.userId, users.id))
      .where(eq(runRsvps.runId, runId))
      .orderBy(asc(runRsvps.createdAt));

    const attendees: RunAttendeeDTO[] = rsvpRows.map(({ user }) => ({
      id: user.id,
      uid: user.uid,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }));

    return {
      id: run.id,
      title: run.title,
      city: run.city,
      countryCode: run.countryCode,
      startsAt: run.startsAt.toISOString(),
      distanceKm: Number(run.distanceKm),
      paceSecPerKm: run.paceSecPerKm,
      paceGroup: run.paceGroup as RunDTO['paceGroup'],
      surfaceType: run.surfaceType as RunDTO['surfaceType'],
      meetingPoint: run.meetingPoint,
      description: run.description,
      startLat: Number(run.startLat),
      startLng: Number(run.startLng),
      waypoints: Array.isArray(run.waypoints) ? run.waypoints : [],
      maxRunners: run.maxRunners,
      createdAt: run.createdAt.toISOString(),
      host: {
        id: host.id,
        uid: host.uid,
        displayName: host.displayName,
        avatarUrl: host.avatarUrl,
      },
      attendees,
      attendeeCount: attendees.length,
      isJoined: currentUserUid
        ? attendees.some((a) => a.uid === currentUserUid)
        : false,
      isHost: currentUserUid ? host.uid === currentUserUid : false,
    };
  } catch (error) {
    console.error('Database query failed in getRunById:', error);
    throw new Error('Unable to load run details. Please try again later.', {
      cause: error,
    });
  }
}

export async function createRun(
  hostUser: { id: number; uid: string },
  payload: CreateRunPayload,
): Promise<RunDTO> {
  try {
    const inserted = await db
      .insert(runs)
      .values({
        hostUserId: hostUser.id,
        title: payload.title.trim(),
        city: payload.city.trim(),
        countryCode: (payload.countryCode || 'INT').trim().toUpperCase().slice(0, 4),
        startsAt: new Date(payload.startsAt),
        distanceKm: Number(payload.distanceKm),
        paceSecPerKm: Math.round(Number(payload.paceSecPerKm)),
        paceGroup: payload.paceGroup,
        surfaceType: payload.surfaceType,
        meetingPoint: payload.meetingPoint.trim(),
        description: payload.description.trim(),
        startLat: Number(payload.startLat),
        startLng: Number(payload.startLng),
        waypoints: payload.waypoints,
        maxRunners: payload.maxRunners ?? 40,
      })
      .returning();

    const created = inserted[0];

    // Automatically RSVP the host to their own run
    await db
      .insert(runRsvps)
      .values({
        runId: created.id,
        userId: hostUser.id,
      })
      .onConflictDoNothing();

    const full = await getRunById(created.id, hostUser.uid);
    if (!full) {
      throw new Error('Run created but could not be reloaded.');
    }
    return full;
  } catch (error) {
    console.error('Database query failed in createRun:', error);
    throw new Error('Unable to publish run right now. Please try again.', {
      cause: error,
    });
  }
}

export async function deleteRun(runId: number, currentUserUid: string): Promise<'deleted' | 'not_found' | 'forbidden'> {
  try {
    const existing = await db
      .select({ runId: runs.id, hostUid: users.uid })
      .from(runs)
      .innerJoin(users, eq(runs.hostUserId, users.id))
      .where(eq(runs.id, runId))
      .limit(1);

    if (existing.length === 0) return 'not_found';
    if (existing[0].hostUid !== currentUserUid) return 'forbidden';

    await db.delete(runs).where(eq(runs.id, runId));
    return 'deleted';
  } catch (error) {
    console.error('Database query failed in deleteRun:', error);
    throw new Error('Unable to cancel run. Please try again later.', {
      cause: error,
    });
  }
}

export async function joinRun(runId: number, user: { id: number; uid: string }): Promise<RunDTO | null> {
  try {
    const existingRun = await db
      .select({ id: runs.id, maxRunners: runs.maxRunners })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);

    if (existingRun.length === 0) return null;

    await db
      .insert(runRsvps)
      .values({
        runId,
        userId: user.id,
      })
      .onConflictDoNothing();

    return await getRunById(runId, user.uid);
  } catch (error) {
    console.error('Database query failed in joinRun:', error);
    throw new Error('Unable to save your RSVP. Please try again.', {
      cause: error,
    });
  }
}

export async function leaveRun(runId: number, user: { id: number; uid: string }): Promise<RunDTO | null> {
  try {
    await db
      .delete(runRsvps)
      .where(and(eq(runRsvps.runId, runId), eq(runRsvps.userId, user.id)));

    return await getRunById(runId, user.uid);
  } catch (error) {
    console.error('Database query failed in leaveRun:', error);
    throw new Error('Unable to update your RSVP. Please try again.', {
      cause: error,
    });
  }
}

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { AuthRequest, optionalAuth, requireAuth } from './src/middleware/auth.ts';
import {
  createRun,
  CreateRunPayload,
  deleteRun,
  getOrCreateUser,
  getRunById,
  joinRun,
  leaveRun,
  listRuns,
} from './src/db/queries.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Public client runtime config (returns Maps browser key if provisioned via server env)
  app.get('/api/config', (_req, res) => {
    res.json({
      mapsApiKey:
        process.env.VITE_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        '',
    });
  });

  // Public list of upcoming runs (optional auth enriches isJoined / isHost)
  app.get('/api/runs', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const city = typeof req.query.city === 'string' ? req.query.city : undefined;
      const paceGroup =
        typeof req.query.paceGroup === 'string' ? req.query.paceGroup : undefined;
      const distanceBracket =
        typeof req.query.distance === 'string' ? req.query.distance : undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search : undefined;
      const mineOnly = req.query.mine === 'true';

      const runsList = await listRuns({
        city,
        paceGroup,
        distanceBracket,
        search,
        mineOnly,
        currentUserUid: req.user?.uid,
      });

      res.json({ runs: runsList });
    } catch (error: any) {
      console.error('GET /api/runs error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to load runs.',
      });
    }
  });

  // Public single run detail
  app.get('/api/runs/:id', optionalAuth, async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid run ID.' });
    }
    try {
      const run = await getRunById(id, req.user?.uid);
      if (!run) {
        return res.status(404).json({ error: 'Run not found.' });
      }
      res.json({ run });
    } catch (error: any) {
      console.error('GET /api/runs/:id error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to load run details.',
      });
    }
  });

  // Sync authenticated member profile into Cloud SQL
  app.post('/api/me/sync', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const user = await getOrCreateUser({
        uid: req.user.uid,
        email: req.user.email || `${req.user.uid}@member.stratarun.club`,
        displayName: req.user.name,
        avatarUrl: req.user.picture,
      });
      res.json({ user });
    } catch (error: any) {
      console.error('POST /api/me/sync error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to sync user profile.',
      });
    }
  });

  // Protected: Publish a new upcoming run
  app.post('/api/runs', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body as Partial<CreateRunPayload>;
    if (
      !body.title?.trim() ||
      !body.city?.trim() ||
      !body.startsAt ||
      !body.meetingPoint?.trim() ||
      typeof body.startLat !== 'number' ||
      typeof body.startLng !== 'number' ||
      typeof body.distanceKm !== 'number' ||
      body.distanceKm <= 0 ||
      typeof body.paceSecPerKm !== 'number' ||
      body.paceSecPerKm < 150 ||
      body.paceSecPerKm > 900
    ) {
      return res.status(400).json({
        error: 'Please fill out all required run fields and choose a valid starting location.',
      });
    }

    const parsedDate = new Date(body.startsAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date and time format.' });
    }

    const allowedPaceGroups = ['social', 'tempo', 'threshold', 'long'] as const;
    const allowedSurfaces = ['road', 'park', 'trail', 'waterfront'] as const;
    const paceGroup = allowedPaceGroups.includes(body.paceGroup as any)
      ? (body.paceGroup as CreateRunPayload['paceGroup'])
      : 'social';
    const surfaceType = allowedSurfaces.includes(body.surfaceType as any)
      ? (body.surfaceType as CreateRunPayload['surfaceType'])
      : 'road';

    const sanitizedWaypoints = Array.isArray(body.waypoints)
      ? body.waypoints
          .filter(
            (w) =>
              w &&
              typeof w.lat === 'number' &&
              typeof w.lng === 'number' &&
              Number.isFinite(w.lat) &&
              Number.isFinite(w.lng),
          )
          .slice(0, 20)
          .map((w) => ({
            lat: w.lat,
            lng: w.lng,
            ...(typeof w.label === 'string' && w.label.trim()
              ? { label: w.label.trim().slice(0, 80) }
              : {}),
          }))
      : [];

    try {
      const dbUser = await getOrCreateUser({
        uid: req.user.uid,
        email: req.user.email || `${req.user.uid}@member.stratarun.club`,
        displayName: req.user.name,
        avatarUrl: req.user.picture,
      });

      const created = await createRun(
        { id: dbUser.id, uid: dbUser.uid },
        {
          title: body.title.trim().slice(0, 140),
          city: body.city.trim().slice(0, 80),
          countryCode: (body.countryCode || 'INT').trim().slice(0, 4),
          startsAt: parsedDate.toISOString(),
          distanceKm: Math.min(Math.max(body.distanceKm, 0.5), 100),
          paceSecPerKm: body.paceSecPerKm,
          paceGroup,
          surfaceType,
          meetingPoint: body.meetingPoint.trim().slice(0, 160),
          description: (body.description || '').trim().slice(0, 1200),
          startLat: body.startLat,
          startLng: body.startLng,
          waypoints: sanitizedWaypoints,
          maxRunners: Math.min(Math.max(Number(body.maxRunners) || 40, 2), 250),
        },
      );

      res.status(201).json({ run: created });
    } catch (error: any) {
      console.error('POST /api/runs error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to publish run.',
      });
    }
  });

  // Protected: Host cancels/deletes their run
  app.delete('/api/runs/:id', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid run ID.' });
    }

    try {
      const outcome = await deleteRun(id, req.user.uid);
      if (outcome === 'not_found') {
        return res.status(404).json({ error: 'Run not found.' });
      }
      if (outcome === 'forbidden') {
        return res.status(403).json({ error: 'Only the host can cancel this run.' });
      }
      res.json({ deleted: true, id });
    } catch (error: any) {
      console.error('DELETE /api/runs/:id error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to cancel run.',
      });
    }
  });

  // Protected: Join (RSVP) a run
  app.post('/api/runs/:id/rsvp', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid run ID.' });
    }

    try {
      const dbUser = await getOrCreateUser({
        uid: req.user.uid,
        email: req.user.email || `${req.user.uid}@member.stratarun.club`,
        displayName: req.user.name,
        avatarUrl: req.user.picture,
      });

      const updated = await joinRun(id, { id: dbUser.id, uid: dbUser.uid });
      if (!updated) {
        return res.status(404).json({ error: 'Run not found.' });
      }
      res.json({ run: updated });
    } catch (error: any) {
      console.error('POST /api/runs/:id/rsvp error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to save RSVP.',
      });
    }
  });

  // Protected: Leave a run
  app.delete('/api/runs/:id/rsvp', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid run ID.' });
    }

    try {
      const dbUser = await getOrCreateUser({
        uid: req.user.uid,
        email: req.user.email || `${req.user.uid}@member.stratarun.club`,
        displayName: req.user.name,
        avatarUrl: req.user.picture,
      });

      const updated = await leaveRun(id, { id: dbUser.id, uid: dbUser.uid });
      if (!updated) {
        return res.status(404).json({ error: 'Run not found.' });
      }
      res.json({ run: updated });
    } catch (error: any) {
      console.error('DELETE /api/runs/:id/rsvp error:', error);
      res.status(500).json({
        error: error?.message || 'Failed to update RSVP.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Strata Run Club server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});

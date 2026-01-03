import express from 'express';
import mongoose from 'mongoose';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import { createTeam } from '@/controllers/team';
import {
  ensureTeamMembership,
  getUserMemberships,
  userHasMembership,
} from '@/controllers/teamMembership';
import { ensureTenantClickhouseConnectionAndSources } from '@/controllers/tenantDefaults';
import User from '@/models/user';
import logger from '@/utils/logger';
import { objectIdSchema } from '@/utils/zod';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.sendStatus(401);
    }

    const memberships = await getUserMemberships(user._id);

    return res.json({
      activeTeamId:
        (req.session?.activeTeamId ?? user.team)?.toString?.() ?? null,
      data: memberships.map(m => ({
        id: m.team?._id?.toString?.() ?? m.team?.toString?.(),
        name: (m.team as any)?.name,
        role: m.role,
        status: m.status,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  validateRequest({
    body: z.object({
      name: z.string().min(1).max(100),
    }),
  }),
  async (req, res, next) => {
    try {
      const user = req.user;
      if (!user?._id) {
        return res.sendStatus(401);
      }

      const team = await createTeam({
        name: req.body.name,
        collectorAuthenticationEnforced: true,
      });

      await ensureTeamMembership({
        userId: user._id,
        teamId: team._id,
        roleIfCreate: 'owner',
      });

      // Make the new team active immediately.
      req.session.activeTeamId = team._id.toString();
      (user as any).team = new mongoose.Types.ObjectId(team._id);
      await (user as any).save?.();

      // Optional: create tenant ClickHouse resources + default sources (if enabled).
      try {
        await ensureTenantClickhouseConnectionAndSources(team._id.toString());
      } catch (error) {
        logger.error(
          { err: serializeError(error), teamId: team._id.toString() },
          'Tenant ClickHouse provisioning failed; continuing team creation',
        );
      }

      return res.status(201).json({
        team: team.toJSON(),
        activeTeamId: team._id.toString(),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/switch',
  validateRequest({
    body: z.object({
      teamId: objectIdSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const user = req.user;
      if (!user?._id) {
        return res.sendStatus(401);
      }

      const teamId = req.body.teamId as string;

      const allowed = await userHasMembership({ userId: user._id, teamId });
      if (!allowed) {
        return res.sendStatus(403);
      }

      // Persist selection in session for fast request scoping.
      req.session.activeTeamId = teamId;

      // Backward-compat: many routes still read req.user.team directly.
      // Keep user.team as the last-selected team.
      (user as any).team = new mongoose.Types.ObjectId(teamId);
      await (user as any).save?.();

      // Refresh best-effort (avoid assigning null to req.user type).
      const refreshed = await User.findById(user._id);
      if (refreshed) {
        req.user = refreshed as any;
      }

      return res.json({ activeTeamId: teamId });
    } catch (e) {
      next(e);
    }
  },
);

export default router;

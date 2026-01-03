import express from 'express';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import {
  assignIngestionTokenShard,
  createIngestionToken,
  listIngestionTokens,
  revokeIngestionToken,
  rotateIngestionToken,
} from '@/controllers/ingestionToken';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { objectIdSchema } from '@/utils/zod';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const tokens = await listIngestionTokens(teamId);
    return res.json({
      data: tokens.map(t => ({
        id: t._id.toString(),
        tokenPrefix: t.tokenPrefix,
        status: t.status,
        description: t.description,
        assignedShard: t.assignedShard,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        revokedAt: t.revokedAt,
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
      description: z.string().max(200).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const { token, tokenRecord } = await createIngestionToken({
        teamId,
        description: req.body.description,
      });

      return res.json({
        token,
        tokenRecord: {
          id: tokenRecord._id.toString(),
          tokenPrefix: tokenRecord.tokenPrefix,
          status: tokenRecord.status,
          description: tokenRecord.description,
          createdAt: tokenRecord.createdAt,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/:id/rotate',
  validateRequest({
    params: z.object({
      id: objectIdSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const { token, tokenRecord } = await rotateIngestionToken({
        teamId,
        tokenId: req.params.id,
      });

      return res.json({
        token,
        tokenRecord: {
          id: tokenRecord._id.toString(),
          tokenPrefix: tokenRecord.tokenPrefix,
          status: tokenRecord.status,
          createdAt: tokenRecord.createdAt,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  '/:id',
  validateRequest({
    params: z.object({
      id: objectIdSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const updated = await revokeIngestionToken({
        teamId,
        tokenId: req.params.id,
      });
      if (!updated) return res.sendStatus(404);
      return res.status(200).send();
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  '/:id/shard',
  validateRequest({
    params: z.object({
      id: objectIdSchema,
    }),
    body: z.object({
      assignedShard: z.string().min(1).max(100),
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const updated = await assignIngestionTokenShard({
        teamId,
        tokenId: req.params.id,
        assignedShard: req.body.assignedShard,
      });
      if (!updated) return res.sendStatus(404);
      return res.json({
        id: updated._id.toString(),
        assignedShard: updated.assignedShard,
      });
    } catch (e) {
      next(e);
    }
  },
);

export default router;


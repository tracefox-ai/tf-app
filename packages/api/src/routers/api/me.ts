import express from 'express';

import { ANTHROPIC_API_KEY, USAGE_STATS_ENABLED } from '@/config';
import { getTeam } from '@/controllers/team';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { Api404Error } from '@/utils/errors';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    if (req.user == null) {
      throw new Api404Error('Request without user found');
    }

    const { _id: id, accessKey, createdAt, email, name } = req.user;

    const { teamId } = getNonNullUserWithTeam(req);
    const team = await getTeam(teamId);

    return res.json({
      accessKey,
      createdAt,
      email,
      id,
      name,
      team,
      usageStatsEnabled: USAGE_STATS_ENABLED,
      aiAssistantEnabled: !!ANTHROPIC_API_KEY,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
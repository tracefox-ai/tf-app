import express from 'express';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import * as config from '@/config';
import {
  generateAlertSilenceToken,
  silenceAlertByToken,
} from '@/controllers/alerts';
import { createTeam, isTeamExisting } from '@/controllers/team';
import { ensureTeamMembership } from '@/controllers/teamMembership';
import { ensureTenantClickhouseConnectionAndSources } from '@/controllers/tenantDefaults';
import { handleAuthError, redirectToDashboard } from '@/middleware/auth';
import TeamInvite from '@/models/teamInvite';
import User from '@/models/user'; // TODO -> do not import model directly
import { setupTeamDefaults } from '@/setupDefaults';
import logger from '@/utils/logger';
import passport from '@/utils/passport';
import { validatePassword } from '@/utils/validators';

const registrationSchema = z
  .object({
    teamName: z.string().min(1).max(100).optional(),
    email: z.string().email(),
    password: z
      .string()
      .min(12, 'Password must have at least 12 characters')
      .refine(
        pass => /[a-z]/.test(pass) && /[A-Z]/.test(pass),
        'Password must include both lower and upper case characters',
      )
      .refine(
        pass => /\d/.test(pass),
        'Password must include at least one number',
      )
      .refine(
        pass => /[!@#$%^&*(),.?":{}|<>;\-+=]/.test(pass),
        'Password must include at least one special character',
      ),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const router = express.Router();

router.get('/health', async (req, res) => {
  res.send({
    data: 'OK',
    version: config.CODE_VERSION,
    ip: req.ip,
    env: config.NODE_ENV,
  });
});

router.get('/installation', async (req, res, next) => {
  try {
    const _isTeamExisting = await isTeamExisting();
    return res.json({
      isTeamExisting: _isTeamExisting,
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/login/password',
  passport.authenticate('local', {
    failWithError: true,
    failureMessage: true,
  }),
  redirectToDashboard,
  handleAuthError,
);

router.post(
  '/register/password',
  validateRequest({ body: registrationSchema }),
  async (req, res, next) => {
    try {
      const { email, password, teamName } = req.body;

      (User as any).register(
        new User({ email }),
        password,
        async (err: Error, user: any) => {
          if (err) {
            logger.error(
              { err: serializeError(err) },
              'User registration error',
            );
            return res.status(400).json({ error: 'invalid' });
          }

          try {
            const team = await createTeam({
              name: (teamName?.trim() || `${email}'s Team`) as string,
              collectorAuthenticationEnforced: true,
            });
            user.team = team._id;
            user.name = email;
            await user.save();

            // Multi-tenant: make the new team active for this session.
            req.session.activeTeamId = team._id.toString();

            // SaaS: ensure membership for creator (backward-compatible; role checks can be tightened later)
            await ensureTeamMembership({
              userId: user._id,
              teamId: team._id,
              roleIfCreate: 'owner',
            });

            // SaaS: optionally provision an isolated ClickHouse database/user for this tenant and create core Sources.
            // Controlled by CLICKHOUSE_TENANT_PROVISIONING_ENABLED.
            try {
              await ensureTenantClickhouseConnectionAndSources(
                team._id.toString(),
              );
            } catch (error) {
              // Don't block signup if ClickHouse admin credentials/endpoint aren't configured.
              logger.error(
                { err: serializeError(error), teamId: team._id.toString() },
                'Tenant ClickHouse provisioning failed; continuing registration',
              );
            }

            // Set up default connections and sources for this new team
            try {
              await setupTeamDefaults(team._id.toString());
            } catch (error) {
              logger.error(
                { err: serializeError(error) },
                'Failed to setup team defaults',
              );
              // Continue with registration even if setup defaults fails
            }

            return passport.authenticate('local')(req, res, () => {
              if (req?.user?.team) {
                return res.status(200).json({ status: 'success' });
              }

              logger.error(
                { userId: req?.user?._id },
                'Password login for user failed, user or team not found',
              );
              return res.status(400).json({ error: 'invalid' });
            });
          } catch (error) {
            logger.error(
              { err: serializeError(error) },
              'Failed during post-registration setup',
            );
            return res.status(500).json({ error: 'invalid' });
          }
        },
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get('/logout', (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect(`${config.FRONTEND_URL}/login`);
  });
});

// TODO: rename this ?
router.post('/team/setup/:token', async (req, res, next) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    if (!validatePassword(password)) {
      return res.redirect(
        `${config.FRONTEND_URL}/join-team?err=invalid&token=${token}`,
      );
    }

    const teamInvite = await TeamInvite.findOne({
      token: req.params.token,
    });
    if (!teamInvite) {
      return res.status(401).send('Invalid token');
    }

    (User as any).register(
      new User({
        email: teamInvite.email,
        name: teamInvite.email,
        team: teamInvite.teamId,
      }),
      password, // TODO: validate password
      async (err: Error, user: any) => {
        if (err) {
          logger.error({ err: serializeError(err) }, 'Team setup error');
          return res.redirect(
            `${config.FRONTEND_URL}/join-team?token=${token}&err=500`,
          );
        }

        await TeamInvite.findByIdAndRemove(teamInvite._id);

        // SaaS: create membership for invited user
        await ensureTeamMembership({
          userId: user._id,
          teamId: teamInvite.teamId,
          roleIfCreate: 'member',
        });

        req.login(user, err => {
          if (err) {
            return next(err);
          }
          redirectToDashboard(req, res);
        });
      },
    );
  } catch (e) {
    next(e);
  }
});

router.get('/ext/silence-alert/:token', async (req, res) => {
  let isError = false;

  try {
    const token = req.params.token;
    await silenceAlertByToken(token);
  } catch (e) {
    isError = true;
    logger.error({ err: e }, 'Failed to silence alert');
  }

  // TODO: Create a template for utility pages
  return res.send(`
  <html>
    <head>
      <title>HyperDX</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css" />
    </head>
    <body>
      <header>
        <img src="https://www.hyperdx.io/Icon32.png" />
      </header>
      <main>
        ${
          isError
            ? '<p><strong>Link is invalid or expired.</strong> Please try again.</p>'
            : '<p><strong>Alert silenced.</strong> You can close this window now.</p>'
        }
        <a href="${config.FRONTEND_URL}">Back to HyperDX</a>
      </main>
    </body>
  </html>`);
});

export default router;

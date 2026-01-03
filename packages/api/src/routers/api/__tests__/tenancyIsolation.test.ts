import { Types } from 'mongoose';

import { getTeam } from '@/controllers/team';
import { findUserByEmail } from '@/controllers/user';
import { getAgent, getServer } from '@/fixtures';
import Connection from '@/models/connection';
import { Source } from '@/models/source';

async function registerAndLogin(server: any, email: string) {
  const agent = getAgent(server);
  const password = 'TacoCat!2#4X';

  await agent
    .post('/register/password')
    .send({ email, password, confirmPassword: password })
    .expect(200);

  await agent.post('/login/password').send({ email, password }).expect(302);

  const user = await findUserByEmail(email);
  const team = await getTeam(user?.team as any);
  if (!user || !team) throw new Error('failed to create user/team');

  return { agent, user, team };
}

describe('tenant isolation', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('cannot read or delete another team’s sources', async () => {
    const { agent: agentA } = await registerAndLogin(server, 'a@tenant.test');
    const { team: teamB } = await registerAndLogin(server, 'b@tenant.test');

    const source = await Source.create({
      kind: 'log',
      name: 'B Logs',
      connection: new Types.ObjectId().toString(),
      from: { databaseName: 'tenant_b', tableName: 'otel_logs' },
      timestampValueExpression: 'TimestampTime',
      team: teamB._id,
    });

    const listRes = await agentA.get('/sources').expect(200);
    expect(listRes.body).toEqual([]);

    // Delete returns 200 even when not found; ensure it did not delete cross-tenant.
    await agentA.delete(`/sources/${source._id}`).expect(200);
    const stillThere = await Source.findById(source._id);
    expect(stillThere).not.toBeNull();
  });

  it('cannot list another team’s connections', async () => {
    const { agent: agentA } = await registerAndLogin(server, 'c@tenant.test');
    const { team: teamB } = await registerAndLogin(server, 'd@tenant.test');

    await Connection.create({
      team: teamB._id,
      name: 'B ClickHouse',
      host: 'http://example.invalid',
      username: 'u',
      password: 'p',
    });

    const res = await agentA.get('/connections').expect(200);
    expect(res.body).toEqual([]);
  });
});

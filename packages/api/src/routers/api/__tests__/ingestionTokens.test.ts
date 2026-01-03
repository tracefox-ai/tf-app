import { resolveIngestionToken } from '@/controllers/ingestionAuth';
import { getAgent, getServer } from '@/fixtures';

describe('ingestion tokens', () => {
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

  it('creates, resolves, rotates, and revokes ingestion tokens', async () => {
    const agent = getAgent(server);
    const email = 'ingest@test.local';
    const password = 'TacoCat!2#4X';

    await agent
      .post('/register/password')
      .send({ email, password, confirmPassword: password })
      .expect(200);
    await agent.post('/login/password').send({ email, password }).expect(302);

    const createRes = await agent
      .post('/ingestion-tokens')
      .send({})
      .expect(200);
    expect(createRes.body.token).toMatch(/^hdx_ingest_/);
    expect(createRes.body.tokenRecord?.id).toBeTruthy();

    const resolved = await resolveIngestionToken(createRes.body.token);
    expect(resolved).not.toBeNull();

    const rotateRes = await agent
      .post(`/ingestion-tokens/${createRes.body.tokenRecord.id}/rotate`)
      .send({})
      .expect(200);

    // Old token should no longer resolve.
    const resolvedOld = await resolveIngestionToken(createRes.body.token);
    expect(resolvedOld).toBeNull();

    // New token resolves.
    const resolvedNew = await resolveIngestionToken(rotateRes.body.token);
    expect(resolvedNew).not.toBeNull();

    await agent
      .delete(`/ingestion-tokens/${rotateRes.body.tokenRecord.id}`)
      .expect(200);

    const resolvedAfterRevoke = await resolveIngestionToken(
      rotateRes.body.token,
    );
    expect(resolvedAfterRevoke).toBeNull();
  });
});

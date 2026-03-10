import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCurrentUserFromRequestMock,
  listCollabProjectMembersMock,
  listCollabProjectsForUserMock,
  createCollabProjectMock,
  findUserByEmailMock,
  addCollabProjectMemberMock,
} = vi.hoisted(() => ({
  getCurrentUserFromRequestMock: vi.fn(),
  listCollabProjectMembersMock: vi.fn(),
  listCollabProjectsForUserMock: vi.fn(),
  createCollabProjectMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  addCollabProjectMemberMock: vi.fn(),
}));

vi.mock('~/lib/.server/auth', () => ({
  getCurrentUserFromRequest: getCurrentUserFromRequestMock,
}));

vi.mock('~/lib/.server/persistence', () => ({
  listCollabProjectMembers: listCollabProjectMembersMock,
  listCollabProjectsForUser: listCollabProjectsForUserMock,
  createCollabProject: createCollabProjectMock,
  findUserByEmail: findUserByEmailMock,
  addCollabProjectMember: addCollabProjectMemberMock,
}));

import { action, loader } from '~/routes/api.collab.projects';

describe('/api/collab/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserFromRequestMock.mockResolvedValue({ userId: 'u1' });
  });

  it('loader returns 401 when unauthorized', async () => {
    getCurrentUserFromRequestMock.mockResolvedValueOnce(null);
    const response = await loader({ request: new Request('http://localhost/api/collab/projects'), context: {} } as any);
    expect(response.status).toBe(401);
  });

  it('loader returns project members when projectId is provided', async () => {
    listCollabProjectMembersMock.mockResolvedValue([{ userId: 'u2' }]);

    const response = await loader({
      request: new Request('http://localhost/api/collab/projects?projectId=p1'),
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toHaveLength(1);
  });

  it('action create returns 400 when project name missing', async () => {
    const response = await action({
      request: new Request('http://localhost/api/collab/projects', {
        method: 'POST',
        body: JSON.stringify({ intent: 'create' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: {},
    } as any);

    expect(response.status).toBe(400);
  });

  it('action share returns 404 when target user not found', async () => {
    findUserByEmailMock.mockResolvedValue(null);

    const response = await action({
      request: new Request('http://localhost/api/collab/projects', {
        method: 'POST',
        body: JSON.stringify({ intent: 'share', projectId: 'p1', email: 'ghost@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: {},
    } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not registered');
  });
});

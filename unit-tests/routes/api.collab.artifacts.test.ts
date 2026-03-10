import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCurrentUserFromRequestMock,
  createArtifactMock,
  getArtifactMock,
  listArtifactsByProjectMock,
  listArtifactsByUserMock,
  updateArtifactMock,
  deleteArtifactMock,
} = vi.hoisted(() => ({
  getCurrentUserFromRequestMock: vi.fn(),
  createArtifactMock: vi.fn(),
  getArtifactMock: vi.fn(),
  listArtifactsByProjectMock: vi.fn(),
  listArtifactsByUserMock: vi.fn(),
  updateArtifactMock: vi.fn(),
  deleteArtifactMock: vi.fn(),
}));

vi.mock('~/lib/.server/auth', () => ({
  getCurrentUserFromRequest: getCurrentUserFromRequestMock,
}));

vi.mock('~/lib/.server/persistence', () => ({
  createArtifact: createArtifactMock,
  getArtifact: getArtifactMock,
  listArtifactsByProject: listArtifactsByProjectMock,
  listArtifactsByUser: listArtifactsByUserMock,
  updateArtifact: updateArtifactMock,
  deleteArtifact: deleteArtifactMock,
}));

import { action, loader } from '~/routes/api.collab.artifacts';

describe('/api/collab/artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserFromRequestMock.mockResolvedValue({ userId: 'u1' });
  });

  describe('loader', () => {
    it('returns 401 when unauthorized', async () => {
      getCurrentUserFromRequestMock.mockResolvedValueOnce(null);
      const response = await loader({
        request: new Request('http://localhost/api/collab/artifacts'),
        context: {},
      } as any);
      expect(response.status).toBe(401);
    });

    it('returns artifacts for current user when no filters provided', async () => {
      listArtifactsByUserMock.mockResolvedValue([
        { id: 'a1', name: 'Test Artifact', ownerUserId: 'u1', artifactType: 'snippet' },
      ]);

      const response = await loader({
        request: new Request('http://localhost/api/collab/artifacts'),
        context: {},
      } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.artifacts).toHaveLength(1);
      expect(listArtifactsByUserMock).toHaveBeenCalledWith('u1', undefined);
    });

    it('returns artifacts for project when projectId provided', async () => {
      listArtifactsByProjectMock.mockResolvedValue([
        { id: 'a1', name: 'Project Artifact', projectId: 'p1' },
      ]);

      const response = await loader({
        request: new Request('http://localhost/api/collab/artifacts?projectId=p1'),
        context: {},
      } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.artifacts).toHaveLength(1);
      expect(listArtifactsByProjectMock).toHaveBeenCalledWith('p1', 'u1', undefined);
    });

    it('returns single artifact when artifactId provided', async () => {
      getArtifactMock.mockResolvedValue({ id: 'a1', name: 'My Artifact' });

      const response = await loader({
        request: new Request('http://localhost/api/collab/artifacts?artifactId=a1'),
        context: {},
      } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.artifact.id).toBe('a1');
      expect(getArtifactMock).toHaveBeenCalledWith('a1', 'u1', undefined);
    });

    it('returns 404 when artifact not found', async () => {
      getArtifactMock.mockResolvedValue(null);

      const response = await loader({
        request: new Request('http://localhost/api/collab/artifacts?artifactId=a1'),
        context: {},
      } as any);

      expect(response.status).toBe(404);
    });
  });

  describe('action', () => {
    it('returns 401 when unauthorized', async () => {
      getCurrentUserFromRequestMock.mockResolvedValueOnce(null);
      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({ intent: 'create', name: 'Test' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);
      expect(response.status).toBe(401);
    });

    it('creates artifact with valid data', async () => {
      createArtifactMock.mockResolvedValue({
        id: 'a1',
        name: 'Test Artifact',
        ownerUserId: 'u1',
        artifactType: 'snippet',
        content: 'test content',
      });

      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({
            intent: 'create',
            name: 'Test Artifact',
            content: 'test content',
            artifactType: 'snippet',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.artifact.id).toBe('a1');
    });

    it('returns 400 when artifact name is missing', async () => {
      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({ intent: 'create', content: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('name is required');
    });

    it('returns 400 when artifact content is missing', async () => {
      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({ intent: 'create', name: 'Test' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('content is required');
    });

    it('updates artifact with valid data', async () => {
      updateArtifactMock.mockResolvedValue({
        id: 'a1',
        name: 'Updated Artifact',
        ownerUserId: 'u1',
      });

      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({
            intent: 'update',
            artifactId: 'a1',
            name: 'Updated Artifact',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.artifact.name).toBe('Updated Artifact');
    });

    it('returns 403 when update fails (access denied)', async () => {
      updateArtifactMock.mockResolvedValue(null);

      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({
            intent: 'update',
            artifactId: 'a1',
            name: 'Updated',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);

      expect(response.status).toBe(403);
    });

    it('deletes artifact successfully', async () => {
      deleteArtifactMock.mockResolvedValue(true);

      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({
            intent: 'delete',
            artifactId: 'a1',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('returns 403 when delete fails (access denied)', async () => {
      deleteArtifactMock.mockResolvedValue(false);

      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({
            intent: 'delete',
            artifactId: 'a1',
          }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);

      expect(response.status).toBe(403);
    });

    it('returns 400 for unsupported intent', async () => {
      const response = await action({
        request: new Request('http://localhost/api/collab/artifacts', {
          method: 'POST',
          body: JSON.stringify({ intent: 'invalid' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        context: {},
      } as any);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Unsupported intent');
    });
  });
});

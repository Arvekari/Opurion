import { describe, expect, it } from 'vitest';

import * as appJwt from '../../../app/platform/security/jwt';
import * as coreJwt from '~/platform/security/jwt';

describe('app/platform/security/jwt.ts', () => {
  it('re-exports jwt helpers from platform/security/jwt', () => {
    expect(appJwt.issueJwtToken).toBe(coreJwt.issueJwtToken);
    expect(appJwt.verifyJwtToken).toBe(coreJwt.verifyJwtToken);
  });
});

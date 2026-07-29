import {afterEach, expect, test, vi} from 'vitest';
import * as path from 'path';

import {Buildx} from '@docker/actions-toolkit/lib/buildx/buildx.js';

import {getAuthList, getInputs} from '../src/context.js';

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('INPUT_')) {
      delete process.env[key];
    }
  }
});

test('with password and username getInputs does not throw error', async () => {
  process.env['INPUT_USERNAME'] = 'dbowie';
  process.env['INPUT_PASSWORD'] = 'groundcontrol';
  process.env['INPUT_LOGOUT'] = 'true';
  expect(() => {
    getInputs();
  }).not.toThrow();
});

test('getAuthList uses the default Docker Hub registry when computing scoped config dir', async () => {
  process.env['INPUT_USERNAME'] = 'dbowie';
  process.env['INPUT_PASSWORD'] = 'groundcontrol';
  process.env['INPUT_SCOPE'] = 'myscope';
  process.env['INPUT_LOGOUT'] = 'false';
  const [auth] = getAuthList(getInputs());
  expect(auth).toMatchObject({
    registry: 'docker.io',
    configDir: path.join(Buildx.configDir, 'config', 'registry-1.docker.io', 'myscope')
  });
});

test('getAuthList skips secret masking when registry-auth password is absent', async () => {
  const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const [auth] = getAuthList({
    registry: '',
    username: '',
    password: '',
    scope: '',
    ecr: '',
    logout: true,
    registryAuth: '- registry: public.ecr.aws\n'
  });

  expect(stdoutWriteSpy.mock.calls.map(call => call[0]).join('')).not.toContain('::add-mask::');
  expect(auth).toMatchObject({
    registry: 'public.ecr.aws',
    ecr: 'auto'
  });
});

test('getAuthList supports password-less Docker Hub registry-auth for OIDC', async () => {
  const [auth] = getAuthList({
    registry: '',
    username: '',
    password: '',
    scope: '',
    ecr: '',
    logout: true,
    registryAuth: '- username: docker-org\n'
  });

  expect(auth).toMatchObject({
    registry: 'docker.io',
    username: 'docker-org',
    password: undefined,
    ecr: 'auto'
  });
});

test('getAuthList masks registry-auth password when present', async () => {
  const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  getAuthList({
    registry: '',
    username: '',
    password: '',
    scope: '',
    ecr: '',
    logout: true,
    registryAuth: '- registry: ghcr.io\n  username: dbowie\n  password: groundcontrol\n'
  });

  expect(stdoutWriteSpy.mock.calls.map(call => call[0]).join('')).toContain('::add-mask::groundcontrol');
});

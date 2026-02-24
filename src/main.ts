import * as core from '@actions/core';
import * as actionsToolkit from '@docker/actions-toolkit';

import * as context from './context';
import * as docker from './docker';
import * as stateHelper from './state-helper';
import axios, {isAxiosError} from 'axios';

export async function main(): Promise<void> {
   await validateSubscription();
  const inputs: context.Inputs = context.getInputs();
  stateHelper.setLogout(inputs.logout);

  const auths = context.getAuthList(inputs);
  stateHelper.setRegistries(Array.from(new Map(auths.map(auth => [`${auth.registry}|${auth.configDir}`, {registry: auth.registry, configDir: auth.configDir} as stateHelper.RegistryState])).values()));

  if (auths.length === 1) {
    await docker.login(auths[0]);
    return;
  }

  for (const auth of auths) {
    await core.group(`Login to ${auth.registry}`, async () => {
      await docker.login(auth);
    });
  }
}

async function post(): Promise<void> {
  await validateSubscription();
  if (!stateHelper.logout) {
    return;
  }
  for (const registryState of stateHelper.registries) {
    await core.group(`Logout from ${registryState.registry}`, async () => {
      await docker.logout(registryState.registry, registryState.configDir);
    });
  }
}

actionsToolkit.run(main, post);

async function validateSubscription(): Promise<void> {
  const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`;

  try {
    await axios.get(API_URL, {timeout: 3000});
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error('Subscription is not valid. Reach out to support@stepsecurity.io');
      process.exit(1);
    } else {
      core.info('Timeout or API not reachable. Continuing to next step.');
    }
  }
}

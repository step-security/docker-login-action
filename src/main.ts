import * as core from '@actions/core';
import * as github from '@actions/github';
import * as actionsToolkit from '@docker/actions-toolkit';

import * as context from './context.js';
import * as docker from './docker.js';
import * as stateHelper from './state-helper.js';
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

async function validateSubscription() {
  const repoPrivate = github.context?.payload?.repository?.private;
  const upstream = 'docker/login-action';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body: Record<string, string> = {action: action || ''};
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(`https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`, body, {timeout: 3000});
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

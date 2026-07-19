import { Environment } from 'aws-cdk-lib';

export interface EnvironmentConfig {
  readonly name: string;
  readonly env: Environment;
  readonly isProd: boolean;
  readonly tags: Record<string, string>;
}

/**
 * Creates an EnvironmentConfig from CDK context values.
 * No hardcoded accounts or env names — everything comes from context.
 */
export function createEnvironmentConfig(envName: string, account: string, region: string): EnvironmentConfig {
  return {
    name: envName,
    env: { account, region },
    isProd: envName === 'prod',
    tags: {
      Environment: envName,
      ManagedBy: 'cdk',
      Project: 'myapp',
    },
  };
}

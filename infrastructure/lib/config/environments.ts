import { Environment } from 'aws-cdk-lib';

export interface EnvironmentConfig {
  readonly name: string;
  readonly env: Environment;
  readonly isProd: boolean;
  readonly tags: Record<string, string>;
}

export const TEST_ENV: EnvironmentConfig = {
  name: 'test',
  env: {
    account: '626963115365',
    region: 'ap-southeast-2',
  },
  isProd: false,
  tags: {
    Environment: 'test',
    ManagedBy: 'cdk',
    Project: 'myapp',
  },
};

// Uncomment and fill in when you have your prod account
// export const PROD_ENV: EnvironmentConfig = {
//   name: 'prod',
//   env: {
//     account: 'PROD_ACCOUNT_ID',
//     region: 'ap-southeast-2',
//   },
//   isProd: true,
//   tags: {
//     Environment: 'production',
//     ManagedBy: 'cdk',
//     Project: 'myapp',
//   },
// };

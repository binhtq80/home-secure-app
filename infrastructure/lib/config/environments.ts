import { Environment } from 'aws-cdk-lib';

export interface EnvironmentConfig {
  readonly name: string;
  readonly env: Environment;
  readonly isProd: boolean;
  readonly tags: Record<string, string>;
}

export const TEMPLATE_ENV: EnvironmentConfig = {
  name: 'template',
  env: {
    account: '210447604234',
    region: 'ap-southeast-2',
  },
  isProd: false,
  tags: {
    Environment: 'template',
    ManagedBy: 'cdk',
    Project: 'myapp',
  },
};

// Add more environments as needed:
// export const PROD_ENV: EnvironmentConfig = {
//   name: 'prod',
//   env: { account: 'YOUR_ACCOUNT_ID', region: 'ap-southeast-2' },
//   isProd: true,
//   tags: { Environment: 'production', ManagedBy: 'cdk', Project: 'myapp' },
// };

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../../config/environments';
import { FoundationStack } from '../foundation-stack';
import { AppStack } from '../app-stack';

export interface TestStageProps extends cdk.StageProps {
  readonly envConfig: EnvironmentConfig;
}

export class TestStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: TestStageProps) {
    super(scope, id, props);

    const { envConfig } = props;

    // Foundation stack - IAM roles
    new FoundationStack(this, 'Foundation', {
      envConfig,
      description: `Foundation stack for myapp ${envConfig.name} environment`,
    });

    // Application stack - Cognito, DynamoDB, Lambda, API GW, S3, CloudFront
    new AppStack(this, 'App', {
      envConfig,
      description: `Application stack for myapp ${envConfig.name} environment`,
    });
  }
}

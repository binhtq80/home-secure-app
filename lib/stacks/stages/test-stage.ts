import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../../config/environments';
import { FoundationStack } from '../foundation-stack';

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

    // Add more stacks here as your infrastructure grows:
    // new NetworkingStack(this, 'Networking', { envConfig });
    // new ComputeStack(this, 'Compute', { envConfig });
    // new DatabaseStack(this, 'Database', { envConfig });
  }
}

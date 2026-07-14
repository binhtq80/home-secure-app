import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';
import { TestStage } from './stages/test-stage';

export interface PipelineStackProps extends cdk.StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly githubBranch: string;
  readonly connectionArn: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { envConfig, githubOwner, githubRepo, githubBranch, connectionArn } = props;

    // Source: GitHub via CodeStar Connection
    const source = pipelines.CodePipelineSource.connection(
      `${githubOwner}/${githubRepo}`,
      githubBranch,
      {
        connectionArn,
        triggerOnPush: true,
      }
    );

    // The self-mutating pipeline
    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: `myapp-${envConfig.name}-pipeline`,
      crossAccountKeys: false,
      synth: new pipelines.ShellStep('Synth', {
        input: source,
        commands: [
          // Install dependencies for each package
          'cd infrastructure && npm install && cd ..',
          'cd frontend && npm install && cd ..',
          'cd backend && npm install && cd ..',

          // Build backend Lambda packages
          'cd backend && node scripts/build.js && ./scripts/prepare-lambda-packages.sh && cd ..',

          // Build frontend
          'cd frontend && npx tsc && npx vite build && cd ..',

          // Synth CDK
          'cd infrastructure && npm run build && npx cdk synth && cd ..',
        ],
        primaryOutputDirectory: 'infrastructure/cdk.out',
      }),
    });

    // Deploy Test stage
    const testStage = new TestStage(this, 'DeployTest', {
      env: envConfig.env,
      envConfig,
    });

    pipeline.addStage(testStage);

    // Future: Add prod stage with manual approval
    // const prodStage = new ProdStage(this, 'DeployProd', {
    //   env: PROD_ENV.env,
    //   envConfig: PROD_ENV,
    // });
    // pipeline.addStage(prodStage, {
    //   pre: [new pipelines.ManualApprovalStep('PromoteToProd')],
    // });
  }
}

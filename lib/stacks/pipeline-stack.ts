import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
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
      crossAccountKeys: false, // Single account for now
      synth: new pipelines.ShellStep('Synth', {
        input: source,
        commands: [
          'npm ci',
          'npm run build',
          'npx cdk synth',
        ],
      }),
    });

    // Deploy Test stage
    const testStage = new TestStage(this, 'DeployTest', {
      env: envConfig.env,
      envConfig,
    });

    pipeline.addStage(testStage);

    // Future: Add prod stage with manual approval
    // const prodStage = new ProdStage(this, 'DeployProd', { ... });
    // pipeline.addStage(prodStage, {
    //   pre: [new pipelines.ManualApprovalStep('PromoteToProd')],
    // });
  }
}

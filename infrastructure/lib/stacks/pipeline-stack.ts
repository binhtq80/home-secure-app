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
        triggerOnPush: false, // Pipeline only runs for infra changes (triggered manually or by deploy-infra.yml)
      }
    );

    // The self-mutating pipeline
    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: `myapp-${envConfig.name}-pipeline`,
      crossAccountKeys: false,
      codeBuildDefaults: {
        buildEnvironment: {
          computeType: cdk.aws_codebuild.ComputeType.MEDIUM,
        },
        cache: cdk.aws_codebuild.Cache.local(
          cdk.aws_codebuild.LocalCacheMode.CUSTOM,
          cdk.aws_codebuild.LocalCacheMode.SOURCE,
        ),
      },
      synth: new pipelines.ShellStep('Synth', {
        input: source,
        commands: [
          // Fetch enough history for diff detection
          'git fetch --depth=2 origin main 2>/dev/null || true',
          'CHANGED=$(git diff --name-only HEAD~1 2>/dev/null || echo "all")',
          'echo "Changed: $CHANGED"',

          // Install all dependencies (npm cache speeds up subsequent runs)
          'cd infrastructure && npm install --prefer-offline && cd ..',
          'cd frontend && npm install --prefer-offline && cd ..',
          'cd backend && npm install --prefer-offline && cd ..',

          // Build backend (always needed for CDK synth asset paths)
          'cd backend && node scripts/build.js && ./scripts/prepare-lambda-packages.sh && cd ..',

          // Build frontend (always needed for CDK synth asset paths)
          'cd frontend && npm run build && cd ..',

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

    pipeline.addStage(testStage, {
      post: [
        new pipelines.ShellStep('SmokeTest', {
          commands: [
            'chmod +x scripts/smoke-test.sh',
            'API_URL=https://d2ok3vs29hr98h.cloudfront.net ./scripts/smoke-test.sh',
          ],
        }),
        new pipelines.ManualApprovalStep('E2EApproval', {
          comment: 'Smoke tests passed. Please verify the deployment manually and approve if it meets requirements.',
        }),
      ],
    });

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

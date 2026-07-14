import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface FoundationStackProps extends cdk.StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class FoundationStack extends cdk.Stack {
  public readonly developerRole: iam.Role;
  public readonly pipelineRole: iam.Role;
  public readonly deploymentRole: iam.Role;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const { envConfig } = props;

    // Developer role - read access + limited write for day-to-day work
    this.developerRole = new iam.Role(this, 'DeveloperRole', {
      roleName: `myapp-${envConfig.name}-developer-role`,
      assumedBy: new iam.AccountPrincipal(this.account),
      description: 'Role for developers with read access and limited write permissions',
    });

    this.developerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')
    );

    // Add limited write permissions for developers (e.g., S3, CloudWatch)
    this.developerRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowCloudWatchLogs',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // Pipeline role - for CI/CD orchestration
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      roleName: `myapp-${envConfig.name}-pipeline-role`,
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      description: 'Role for CI/CD pipeline execution',
    });

    this.pipelineRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowPipelineActions',
      effect: iam.Effect.ALLOW,
      actions: [
        'codebuild:BatchGetBuilds',
        'codebuild:StartBuild',
        's3:GetObject',
        's3:PutObject',
        's3:GetBucketVersioning',
        'cloudformation:*',
        'iam:PassRole',
      ],
      resources: ['*'],
    }));

    // Deployment role - for CloudFormation/CDK to create resources
    this.deploymentRole = new iam.Role(this, 'DeploymentRole', {
      roleName: `myapp-${envConfig.name}-deployment-role`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('cloudformation.amazonaws.com'),
        new iam.ServicePrincipal('codebuild.amazonaws.com'),
      ),
      description: 'Role for CDK/CloudFormation deployments',
    });

    // Scoped admin for deployment - can create/modify resources but not IAM users
    this.deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowResourceManagement',
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:*',
        'ecs:*',
        'lambda:*',
        'rds:*',
        'dynamodb:*',
        's3:*',
        'sqs:*',
        'sns:*',
        'cloudwatch:*',
        'logs:*',
        'elasticloadbalancing:*',
        'autoscaling:*',
        'ecr:*',
        'ssm:*',
        'secretsmanager:*',
      ],
      resources: ['*'],
    }));

    this.deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowLimitedIAM',
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:AttachRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePolicy',
        'iam:DeleteRolePolicy',
        'iam:GetRole',
        'iam:PassRole',
        'iam:CreateServiceLinkedRole',
        'iam:TagRole',
        'iam:UntagRole',
      ],
      resources: [
        `arn:aws:iam::${this.account}:role/myapp-*`,
      ],
    }));

    // Outputs
    new cdk.CfnOutput(this, 'DeveloperRoleArn', {
      value: this.developerRole.roleArn,
      description: 'ARN of the developer role',
    });

    new cdk.CfnOutput(this, 'PipelineRoleArn', {
      value: this.pipelineRole.roleArn,
      description: 'ARN of the pipeline role',
    });

    new cdk.CfnOutput(this, 'DeploymentRoleArn', {
      value: this.deploymentRole.roleArn,
      description: 'ARN of the deployment role',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GithubOidcStackProps extends cdk.StackProps {
  readonly githubOwner: string;
  readonly githubRepo: string;
}

/**
 * Creates the GitHub OIDC identity provider and a role that GitHub Actions
 * can assume for the initial pipeline bootstrap deployment.
 *
 * This stack is deployed ONCE manually, then the CDK Pipeline takes over.
 */
export class GithubOidcStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { githubOwner, githubRepo } = props;

    // GitHub OIDC Provider
    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    // Role that GitHub Actions can assume
    this.deployRole = new iam.Role(this, 'GithubActionsRole', {
      roleName: 'myapp-github-actions-role',
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${githubOwner}/${githubRepo}:*`,
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role assumed by GitHub Actions for CDK pipeline bootstrap',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // This role needs admin to bootstrap the pipeline (one-time)
    // After pipeline is running, this role is only used for pipeline self-mutation
    this.deployRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
    );

    new cdk.CfnOutput(this, 'GithubActionsRoleArn', {
      value: this.deployRole.roleArn,
      description: 'ARN for GitHub Actions to assume',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import { EnvironmentConfig } from '../config/environments';

export interface AppStackProps extends cdk.StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { envConfig } = props;
    const prefix = `myapp-${envConfig.name}`;
    const accountSuffix = envConfig.env.account ? `-${envConfig.env.account}` : '';

    // ─── Cognito ───────────────────────────────────────────────────────────────

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: `${prefix}-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // ─── DynamoDB ──────────────────────────────────────────────────────────────

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `${prefix}-users`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    // Feature requests table
    const featureRequestsTable = new dynamodb.Table(this, 'FeatureRequestsTable', {
      tableName: `${prefix}-feature-requests`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    featureRequestsTable.addGlobalSecondaryIndex({
      indexName: 'createdBy-index',
      partitionKey: { name: 'createdBy', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    featureRequestsTable.addGlobalSecondaryIndex({
      indexName: 'status-createdAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // ─── Lambda Functions ──────────────────────────────────────────────────────
    // Single shared bundle: all functions share one asset to minimize CDK Pipeline
    // Assets stage CodeBuild tasks.
    // Handler format: 'functions/<func-name>/index.handler'

    const bundleDir = path.join(__dirname, '../../../backend/dist/bundle');
    const sharedCode = lambda.Code.fromAsset(bundleDir);

    // ─── S3 Bucket for User Assets (avatars, uploads) ─────────────────────────

    const assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `${prefix}-assets${accountSuffix}`,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !envConfig.isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const lambdaEnv: Record<string, string> = {
      USERS_TABLE: usersTable.tableName,
      FEATURE_REQUESTS_TABLE: featureRequestsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      BEDROCK_MODEL_ID: 'au.anthropic.claude-haiku-4-5-20251001-v1:0',
      ASSETS_BUCKET: assetsBucket.bucketName,
    };

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: lambdaEnv,
      code: sharedCode,
    };

    // ─── Auth Functions ────────────────────────────────────────────────────────

    const signUpFn = new lambda.Function(this, 'SignUpFn', {
      ...commonProps,
      functionName: `${prefix}-signup`,
      handler: 'functions/signup/index.handler',
    });

    const confirmSignUpFn = new lambda.Function(this, 'ConfirmSignUpFn', {
      ...commonProps,
      functionName: `${prefix}-confirm-signup`,
      handler: 'functions/confirm-signup/index.handler',
    });

    const signInFn = new lambda.Function(this, 'SignInFn', {
      ...commonProps,
      functionName: `${prefix}-signin`,
      handler: 'functions/signin/index.handler',
    });

    const getUserFn = new lambda.Function(this, 'GetUserFn', {
      ...commonProps,
      functionName: `${prefix}-get-user`,
      handler: 'functions/get-user/index.handler',
    });

    // ─── User Management Functions ─────────────────────────────────────────────

    const getUserSettingsFn = new lambda.Function(this, 'GetUserSettingsFn', {
      ...commonProps,
      functionName: `${prefix}-get-user-settings`,
      handler: 'functions/get-user-settings/index.handler',
    });

    const updateUserSettingsFn = new lambda.Function(this, 'UpdateUserSettingsFn', {
      ...commonProps,
      functionName: `${prefix}-update-user-settings`,
      handler: 'functions/update-user-settings/index.handler',
    });

    const getAvatarFn = new lambda.Function(this, 'GetAvatarFn', {
      ...commonProps,
      functionName: `${prefix}-get-avatar`,
      handler: 'functions/get-avatar/index.handler',
    });

    const updateAvatarFn = new lambda.Function(this, 'UpdateAvatarFn', {
      ...commonProps,
      functionName: `${prefix}-update-avatar`,
      handler: 'functions/update-avatar/index.handler',
    });

    const listUsersFn = new lambda.Function(this, 'ListUsersFn', {
      ...commonProps,
      functionName: `${prefix}-list-users`,
      handler: 'functions/list-users/index.handler',
    });

    const updateUserRoleFn = new lambda.Function(this, 'UpdateUserRoleFn', {
      ...commonProps,
      functionName: `${prefix}-update-user-role`,
      handler: 'functions/update-user-role/index.handler',
    });

    // ─── Feature Request Functions ─────────────────────────────────────────────

    const createFeatureRequestFn = new lambda.Function(this, 'CreateFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-create-feature-request`,
      timeout: cdk.Duration.seconds(60),
      handler: 'functions/create-feature-request/index.handler',
    });

    const confirmFeatureRequestFn = new lambda.Function(this, 'ConfirmFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-confirm-feature-request`,
      handler: 'functions/confirm-feature-request/index.handler',
    });

    const adminApproveFeatureFn = new lambda.Function(this, 'AdminApproveFeatureFn', {
      ...commonProps,
      functionName: `${prefix}-admin-approve-feature`,
      handler: 'functions/admin-approve-feature/index.handler',
    });

    const approveFeatureRequestFn = new lambda.Function(this, 'ApproveFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-approve-feature-request`,
      handler: 'functions/approve-feature-request/index.handler',
      environment: {
        ...lambdaEnv,
        PIPELINE_NAME: `${prefix}-pipeline`,
      },
    });

    const listFeatureRequestsFn = new lambda.Function(this, 'ListFeatureRequestsFn', {
      ...commonProps,
      functionName: `${prefix}-list-feature-requests`,
      handler: 'functions/list-feature-requests/index.handler',
    });

    const getFeatureRequestFn = new lambda.Function(this, 'GetFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-get-feature-request`,
      handler: 'functions/get-feature-request/index.handler',
    });

    const getFeatureRequestStatsFn = new lambda.Function(this, 'GetFeatureRequestStatsFn', {
      ...commonProps,
      functionName: `${prefix}-get-feature-request-stats`,
      handler: 'functions/get-feature-request-stats/index.handler',
    });

    const voteFeatureRequestFn = new lambda.Function(this, 'VoteFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-vote-feature-request`,
      handler: 'functions/vote-feature-request/index.handler',
    });

    const listFeatureVotesFn = new lambda.Function(this, 'ListFeatureVotesFn', {
      ...commonProps,
      functionName: `${prefix}-list-feature-votes`,
      handler: 'functions/list-feature-votes/index.handler',
    });

    // ─── Permissions ───────────────────────────────────────────────────────────

    const allFunctions = [
      signUpFn, confirmSignUpFn, signInFn, getUserFn,
      getUserSettingsFn, updateUserSettingsFn, getAvatarFn, updateAvatarFn,
      listUsersFn, updateUserRoleFn,
      createFeatureRequestFn, confirmFeatureRequestFn, adminApproveFeatureFn,
      approveFeatureRequestFn, listFeatureRequestsFn, getFeatureRequestFn,
      getFeatureRequestStatsFn, voteFeatureRequestFn, listFeatureVotesFn,
    ];

    for (const fn of allFunctions) {
      usersTable.grantReadWriteData(fn);
      featureRequestsTable.grantReadWriteData(fn);
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:SignUp',
          'cognito-idp:ConfirmSignUp',
          'cognito-idp:InitiateAuth',
          'cognito-idp:GetUser',
        ],
        resources: [userPool.userPoolArn],
      }));
    }

    // Bedrock access for feature request complexity classification
    createFeatureRequestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // S3 access for avatars and user assets
    assetsBucket.grantReadWrite(getAvatarFn);
    assetsBucket.grantReadWrite(updateAvatarFn);

    // CodePipeline access for feature approval
    approveFeatureRequestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['codepipeline:GetPipelineState', 'codepipeline:PutApprovalResult'],
      resources: [`arn:aws:codepipeline:${this.region}:${this.account}:${prefix}-pipeline`],
    }));

    // ─── API Gateway ───────────────────────────────────────────────────────────

    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `${prefix}-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
    });

    // Auth routes
    const apiResource = api.root.addResource('api');
    const authResource = apiResource.addResource('auth');
    authResource.addResource('signup').addMethod('POST', new apigateway.LambdaIntegration(signUpFn));
    authResource.addResource('confirm').addMethod('POST', new apigateway.LambdaIntegration(confirmSignUpFn));
    authResource.addResource('signin').addMethod('POST', new apigateway.LambdaIntegration(signInFn));

    // User routes
    const usersResource = apiResource.addResource('users');
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(listUsersFn));
    const userResource = usersResource.addResource('{userId}');
    userResource.addMethod('GET', new apigateway.LambdaIntegration(getUserFn));
    userResource.addResource('role').addMethod('PUT', new apigateway.LambdaIntegration(updateUserRoleFn));

    // Settings routes
    const settingsResource = apiResource.addResource('settings');
    settingsResource.addMethod('GET', new apigateway.LambdaIntegration(getUserSettingsFn));
    settingsResource.addMethod('PUT', new apigateway.LambdaIntegration(updateUserSettingsFn));

    // Avatar routes
    const avatarResource = apiResource.addResource('avatar');
    avatarResource.addMethod('GET', new apigateway.LambdaIntegration(getAvatarFn));
    avatarResource.addMethod('PUT', new apigateway.LambdaIntegration(updateAvatarFn));

    // Feature requests routes
    const featuresResource = apiResource.addResource('features');
    featuresResource.addMethod('POST', new apigateway.LambdaIntegration(createFeatureRequestFn));
    featuresResource.addMethod('GET', new apigateway.LambdaIntegration(listFeatureRequestsFn));
    featuresResource.addResource('stats').addMethod('GET', new apigateway.LambdaIntegration(getFeatureRequestStatsFn));
    const featureResource = featuresResource.addResource('{featureId}');
    featureResource.addMethod('GET', new apigateway.LambdaIntegration(getFeatureRequestFn));
    featureResource.addResource('confirm').addMethod('POST', new apigateway.LambdaIntegration(confirmFeatureRequestFn));
    featureResource.addResource('admin-approve').addMethod('POST', new apigateway.LambdaIntegration(adminApproveFeatureFn));
    featureResource.addResource('approve').addMethod('POST', new apigateway.LambdaIntegration(approveFeatureRequestFn));
    featureResource.addResource('vote').addMethod('POST', new apigateway.LambdaIntegration(voteFeatureRequestFn));
    featureResource.addResource('votes').addMethod('GET', new apigateway.LambdaIntegration(listFeatureVotesFn));

    // ─── Frontend Hosting ──────────────────────────────────────────────────────

    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${prefix}-website${accountSuffix}`,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !envConfig.isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // Deploy frontend assets
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../frontend/dist'))],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ─── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url, description: 'API Gateway URL' });
    new cdk.CfnOutput(this, 'WebsiteUrl', { value: `https://${distribution.distributionDomainName}`, description: 'CloudFront URL' });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'WebsiteBucketName', { value: websiteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}

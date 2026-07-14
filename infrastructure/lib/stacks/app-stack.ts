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

    // ─── Lambda Functions ──────────────────────────────────────────────────────

    const lambdaDir = path.join(__dirname, '../../../backend/dist/lambda-packages');

    const lambdaEnv: Record<string, string> = {
      USERS_TABLE: usersTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    };

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: lambdaEnv,
      handler: 'index.handler',
    };

    const signUpFn = new lambda.Function(this, 'SignUpFn', {
      ...commonProps,
      functionName: `${prefix}-signup`,
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'signup')),
    });

    const confirmSignUpFn = new lambda.Function(this, 'ConfirmSignUpFn', {
      ...commonProps,
      functionName: `${prefix}-confirm-signup`,
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'confirm-signup')),
    });

    const signInFn = new lambda.Function(this, 'SignInFn', {
      ...commonProps,
      functionName: `${prefix}-signin`,
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'signin')),
    });

    const getUserFn = new lambda.Function(this, 'GetUserFn', {
      ...commonProps,
      functionName: `${prefix}-get-user`,
      code: lambda.Code.fromAsset(path.join(lambdaDir, 'get-user')),
    });

    // Grant permissions
    const allFunctions = [signUpFn, confirmSignUpFn, signInFn, getUserFn];

    for (const fn of allFunctions) {
      usersTable.grantReadWriteData(fn);
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
    usersResource.addResource('{userId}').addMethod('GET', new apigateway.LambdaIntegration(getUserFn));

    // ─── Frontend Hosting ──────────────────────────────────────────────────────

    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${prefix}-website`,
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

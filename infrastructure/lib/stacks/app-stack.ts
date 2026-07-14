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

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `${prefix}-identity-pool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    // ─── DynamoDB Tables ───────────────────────────────────────────────────────

    const tableProps = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    };

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      ...tableProps,
      tableName: `${prefix}-users`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    const postsTable = new dynamodb.Table(this, 'PostsTable', {
      ...tableProps,
      tableName: `${prefix}-posts`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });
    postsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    const likesTable = new dynamodb.Table(this, 'LikesTable', {
      ...tableProps,
      tableName: `${prefix}-likes`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'postId', type: dynamodb.AttributeType.STRING },
    });
    likesTable.addGlobalSecondaryIndex({
      indexName: 'postId-index',
      partitionKey: { name: 'postId', type: dynamodb.AttributeType.STRING },
    });

    const commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      ...tableProps,
      tableName: `${prefix}-comments`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });
    commentsTable.addGlobalSecondaryIndex({
      indexName: 'postId-index',
      partitionKey: { name: 'postId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    const followsTable = new dynamodb.Table(this, 'FollowsTable', {
      ...tableProps,
      tableName: `${prefix}-follows`,
      partitionKey: { name: 'followerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'followingId', type: dynamodb.AttributeType.STRING },
    });
    followsTable.addGlobalSecondaryIndex({
      indexName: 'followingId-index',
      partitionKey: { name: 'followingId', type: dynamodb.AttributeType.STRING },
    });

    // ─── Lambda Functions ──────────────────────────────────────────────────────

    const lambdaEnv: Record<string, string> = {
      USERS_TABLE: usersTable.tableName,
      POSTS_TABLE: postsTable.tableName,
      LIKES_TABLE: likesTable.tableName,
      COMMENTS_TABLE: commentsTable.tableName,
      FOLLOWS_TABLE: followsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    };

    const lambdaDefaults: lambda.FunctionProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: lambdaEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages')),
      handler: 'index.handler',
    };

    // Auth functions
    const signUpFn = new lambda.Function(this, 'SignUpFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-signup`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/signup')),
    });

    const signInFn = new lambda.Function(this, 'SignInFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-signin`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/signin')),
    });

    const confirmSignUpFn = new lambda.Function(this, 'ConfirmSignUpFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-confirm-signup`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/confirm-signup')),
    });

    // User functions
    const getUserFn = new lambda.Function(this, 'GetUserFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-get-user`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/get-user')),
    });

    const updateUserFn = new lambda.Function(this, 'UpdateUserFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-update-user`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/update-user')),
    });

    // Post functions
    const createPostFn = new lambda.Function(this, 'CreatePostFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-create-post`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/create-post')),
    });

    const getPostsFn = new lambda.Function(this, 'GetPostsFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-get-posts`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/get-posts')),
    });

    const getPostFn = new lambda.Function(this, 'GetPostFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-get-post`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/get-post')),
    });

    const deletePostFn = new lambda.Function(this, 'DeletePostFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-delete-post`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/delete-post')),
    });

    // Social functions
    const likeFn = new lambda.Function(this, 'LikeFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-like`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/like')),
    });

    const commentFn = new lambda.Function(this, 'CommentFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-comment`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/comment')),
    });

    const followFn = new lambda.Function(this, 'FollowFn', {
      ...lambdaDefaults,
      functionName: `${prefix}-follow`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/dist/lambda-packages/follow')),
    });

    // Grant DynamoDB access to all Lambda functions
    const allFunctions = [
      signUpFn, signInFn, confirmSignUpFn,
      getUserFn, updateUserFn,
      createPostFn, getPostsFn, getPostFn, deletePostFn,
      likeFn, commentFn, followFn,
    ];

    const allTables = [usersTable, postsTable, likesTable, commentsTable, followsTable];

    for (const fn of allFunctions) {
      for (const table of allTables) {
        table.grantReadWriteData(fn);
      }
      // Grant Cognito access for auth functions
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:SignUp',
          'cognito-idp:ConfirmSignUp',
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
    const authResource = api.root.addResource('auth');
    authResource.addResource('signup').addMethod('POST', new apigateway.LambdaIntegration(signUpFn));
    authResource.addResource('signin').addMethod('POST', new apigateway.LambdaIntegration(signInFn));
    authResource.addResource('confirm').addMethod('POST', new apigateway.LambdaIntegration(confirmSignUpFn));

    // User routes
    const usersResource = api.root.addResource('users');
    const userResource = usersResource.addResource('{userId}');
    userResource.addMethod('GET', new apigateway.LambdaIntegration(getUserFn));
    userResource.addMethod('PUT', new apigateway.LambdaIntegration(updateUserFn));

    // Post routes
    const postsResource = api.root.addResource('posts');
    postsResource.addMethod('GET', new apigateway.LambdaIntegration(getPostsFn));
    postsResource.addMethod('POST', new apigateway.LambdaIntegration(createPostFn));
    const postResource = postsResource.addResource('{postId}');
    postResource.addMethod('GET', new apigateway.LambdaIntegration(getPostFn));
    postResource.addMethod('DELETE', new apigateway.LambdaIntegration(deletePostFn));

    // Social routes
    postResource.addResource('like').addMethod('POST', new apigateway.LambdaIntegration(likeFn));
    postResource.addResource('comment').addMethod('POST', new apigateway.LambdaIntegration(commentFn));
    usersResource.addResource('{targetUserId}').addResource('follow').addMethod('POST', new apigateway.LambdaIntegration(followFn));

    // ─── Frontend Hosting (S3 + CloudFront) ────────────────────────────────────

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
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Deploy frontend assets (only if build output exists)
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
    new cdk.CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new cdk.CfnOutput(this, 'WebsiteBucketName', { value: websiteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}

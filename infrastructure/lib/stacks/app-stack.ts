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
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
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

    // Devices table
    const devicesTable = new dynamodb.Table(this, 'DevicesTable', {
      tableName: `${prefix}-devices`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    devicesTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Device energy consumption table (time-series by month)
    const deviceEnergyTable = new dynamodb.Table(this, 'DeviceEnergyTable', {
      tableName: `${prefix}-device-energy`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'month', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Device history (audit trail) table
    const deviceHistoryTable = new dynamodb.Table(this, 'DeviceHistoryTable', {
      tableName: `${prefix}-device-history`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Device notes table
    const deviceNotesTable = new dynamodb.Table(this, 'DeviceNotesTable', {
      tableName: `${prefix}-device-notes`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'noteId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Device favorites table
    const deviceFavoritesTable = new dynamodb.Table(this, 'DeviceFavoritesTable', {
      tableName: `${prefix}-device-favorites`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Device tags table
    const deviceTagsTable = new dynamodb.Table(this, 'DeviceTagsTable', {
      tableName: `${prefix}-device-tags`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'tag', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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

    // ─── S3 Bucket for Device Images ──────────────────────────────────────────

    const deviceImagesBucket = new s3.Bucket(this, 'DeviceImagesBucket', {
      bucketName: `${prefix}-device-images${accountSuffix}`,
      removalPolicy: envConfig.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !envConfig.isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ─── Lambda Functions ──────────────────────────────────────────────────────
    // Single shared bundle: all functions share one asset to minimize CDK Pipeline
    // Assets stage CodeBuild tasks (31 → 1 backend asset).
    // Handler format: 'functions/<func-name>/index.handler'

    const bundleDir = path.join(__dirname, '../../../backend/dist/bundle');
    const sharedCode = lambda.Code.fromAsset(bundleDir);

    const lambdaEnv: Record<string, string> = {
      USERS_TABLE: usersTable.tableName,
      DEVICES_TABLE: devicesTable.tableName,
      DEVICE_ENERGY_TABLE: deviceEnergyTable.tableName,
      DEVICE_HISTORY_TABLE: deviceHistoryTable.tableName,
      DEVICE_NOTES_TABLE: deviceNotesTable.tableName,
      DEVICE_FAVORITES_TABLE: deviceFavoritesTable.tableName,
      DEVICE_TAGS_TABLE: deviceTagsTable.tableName,
      FEATURE_REQUESTS_TABLE: featureRequestsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      BEDROCK_MODEL_ID: 'au.anthropic.claude-haiku-4-5-20251001-v1:0',
      DEVICE_IMAGES_BUCKET: deviceImagesBucket.bucketName,
    };

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: lambdaEnv,
      code: sharedCode,
    };

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

    // Device functions
    const recognizeDeviceFn = new lambda.Function(this, 'RecognizeDeviceFn', {
      ...commonProps,
      functionName: `${prefix}-recognize-device`,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      handler: 'functions/recognize-device/index.handler',
    });

    const createDeviceFn = new lambda.Function(this, 'CreateDeviceFn', {
      ...commonProps,
      functionName: `${prefix}-create-device`,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      handler: 'functions/create-device/index.handler',
    });

    const listDevicesFn = new lambda.Function(this, 'ListDevicesFn', {
      ...commonProps,
      functionName: `${prefix}-list-devices`,
      handler: 'functions/list-devices/index.handler',
    });

    const deleteDeviceFn = new lambda.Function(this, 'DeleteDeviceFn', {
      ...commonProps,
      functionName: `${prefix}-delete-device`,
      handler: 'functions/delete-device/index.handler',
    });

    const getDeviceEnergyFn = new lambda.Function(this, 'GetDeviceEnergyFn', {
      ...commonProps,
      functionName: `${prefix}-get-device-energy`,
      handler: 'functions/get-device-energy/index.handler',
    });

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

    const getEnergyReportFn = new lambda.Function(this, 'GetEnergyReportFn', {
      ...commonProps,
      functionName: `${prefix}-get-energy-report`,
      handler: 'functions/get-energy-report/index.handler',
    });

    const updateDeviceBudgetFn = new lambda.Function(this, 'UpdateDeviceBudgetFn', {
      ...commonProps,
      functionName: `${prefix}-update-device-budget`,
      handler: 'functions/update-device-budget/index.handler',
    });

    const getDeviceStatsFn = new lambda.Function(this, 'GetDeviceStatsFn', {
      ...commonProps,
      functionName: `${prefix}-get-device-stats`,
      handler: 'functions/get-device-stats/index.handler',
    });

    const getDeviceImageFn = new lambda.Function(this, 'GetDeviceImageFn', {
      ...commonProps,
      functionName: `${prefix}-get-device-image`,
      handler: 'functions/get-device-image/index.handler',
    });

    const updateDeviceFn = new lambda.Function(this, 'UpdateDeviceFn', {
      ...commonProps,
      functionName: `${prefix}-update-device`,
      handler: 'functions/update-device/index.handler',
    });

    const getDeviceHistoryFn = new lambda.Function(this, 'GetDeviceHistoryFn', {
      ...commonProps,
      functionName: `${prefix}-get-device-history`,
      handler: 'functions/get-device-history/index.handler',
    });

    const getDeviceLastActiveFn = new lambda.Function(this, 'GetDeviceLastActiveFn', {
      ...commonProps,
      functionName: `${prefix}-get-device-last-active`,
      handler: 'functions/get-device-last-active/index.handler',
    });

    const createFeatureRequestFn = new lambda.Function(this, 'CreateFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-create-feature-request`,
      handler: 'functions/create-feature-request/index.handler',
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

    const approveFeatureRequestFn = new lambda.Function(this, 'ApproveFeatureRequestFn', {
      ...commonProps,
      functionName: `${prefix}-approve-feature-request`,
      handler: 'functions/approve-feature-request/index.handler',
      environment: {
        ...lambdaEnv,
        PIPELINE_NAME: `${prefix}-pipeline`,
      },
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

    // Device manuals functions
    const uploadDeviceManualFn = new lambda.Function(this, 'UploadDeviceManualFn', {
      ...commonProps,
      functionName: `${prefix}-upload-device-manual`,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      handler: 'functions/upload-device-manual/index.handler',
    });

    const getDeviceManualsFn = new lambda.Function(this, 'GetDeviceManualsFn', {
      ...commonProps,
      functionName: `${prefix}-get-device-manuals`,
      handler: 'functions/get-device-manuals/index.handler',
    });

    const deleteDeviceManualFn = new lambda.Function(this, 'DeleteDeviceManualFn', {
      ...commonProps,
      functionName: `${prefix}-delete-device-manual`,
      handler: 'functions/delete-device-manual/index.handler',
    });

    const deleteRoomFn = new lambda.Function(this, 'DeleteRoomFn', {
      ...commonProps,
      functionName: `${prefix}-delete-room`,
      handler: 'functions/delete-room/index.handler',
    });

    // Device notes functions
    const createDeviceNoteFn = new lambda.Function(this, 'CreateDeviceNoteFn', {
      ...commonProps,
      functionName: `${prefix}-create-device-note`,
      handler: 'functions/create-device-note/index.handler',
    });

    const listDeviceNotesFn = new lambda.Function(this, 'ListDeviceNotesFn', {
      ...commonProps,
      functionName: `${prefix}-list-device-notes`,
      handler: 'functions/list-device-notes/index.handler',
    });

    // Device favorites functions
    const toggleDeviceFavoriteFn = new lambda.Function(this, 'ToggleDeviceFavoriteFn', {
      ...commonProps,
      functionName: `${prefix}-toggle-device-favorite`,
      handler: 'functions/toggle-device-favorite/index.handler',
    });

    const listDeviceFavoritesFn = new lambda.Function(this, 'ListDeviceFavoritesFn', {
      ...commonProps,
      functionName: `${prefix}-list-device-favorites`,
      handler: 'functions/list-device-favorites/index.handler',
    });

    // Device tags function
    const manageDeviceTagsFn = new lambda.Function(this, 'ManageDeviceTagsFn', {
      ...commonProps,
      functionName: `${prefix}-manage-device-tags`,
      handler: 'functions/manage-device-tags/index.handler',
    });

    // Budget alert scheduled function (runs daily at 8am AEST)
    const budgetAlertFn = new lambda.Function(this, 'BudgetAlertFn', {
      ...commonProps,
      functionName: `${prefix}-budget-alert`,
      handler: 'functions/budget-alert/index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        ...lambdaEnv,
        SENDER_EMAIL: `noreply@myapp.${envConfig.name}.local`,
      },
    });

    // SES permissions for budget alert
    budgetAlertFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    // EventBridge rule: 8am AEST = 10pm UTC previous day (AEST = UTC+10)
    const budgetAlertRule = new events.Rule(this, 'BudgetAlertSchedule', {
      ruleName: `${prefix}-budget-alert-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '22' }),
      description: 'Triggers budget alert Lambda daily at 8am AEST (22:00 UTC)',
    });

    budgetAlertRule.addTarget(new targets.LambdaFunction(budgetAlertFn));

    // Grant permissions
    const allFunctions = [signUpFn, confirmSignUpFn, signInFn, getUserFn, recognizeDeviceFn, createDeviceFn, listDevicesFn, deleteDeviceFn, getDeviceEnergyFn, getUserSettingsFn, updateUserSettingsFn, getEnergyReportFn, updateDeviceBudgetFn, getDeviceStatsFn, getDeviceImageFn, updateDeviceFn, getDeviceHistoryFn, getDeviceLastActiveFn, createFeatureRequestFn, listFeatureRequestsFn, getFeatureRequestFn, getFeatureRequestStatsFn, approveFeatureRequestFn, confirmFeatureRequestFn, adminApproveFeatureFn, uploadDeviceManualFn, getDeviceManualsFn, deleteDeviceManualFn, deleteRoomFn, createDeviceNoteFn, listDeviceNotesFn, toggleDeviceFavoriteFn, listDeviceFavoritesFn, manageDeviceTagsFn, budgetAlertFn];

    for (const fn of allFunctions) {
      usersTable.grantReadWriteData(fn);
      devicesTable.grantReadWriteData(fn);
      deviceEnergyTable.grantReadWriteData(fn);
      deviceHistoryTable.grantReadWriteData(fn);
      deviceNotesTable.grantReadWriteData(fn);
      deviceFavoritesTable.grantReadWriteData(fn);
      deviceTagsTable.grantReadWriteData(fn);
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

    // Bedrock access for device recognition
    recognizeDeviceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // Bedrock access for energy saving tips generation on device creation
    createDeviceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // Bedrock access for feature request complexity classification
    createFeatureRequestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // CodePipeline access for feature approval
    approveFeatureRequestFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['codepipeline:GetPipelineState', 'codepipeline:PutApprovalResult'],
      resources: [`arn:aws:codepipeline:${this.region}:${this.account}:${prefix}-pipeline`],
    }));

    // S3 access for device images
    deviceImagesBucket.grantReadWrite(createDeviceFn);
    deviceImagesBucket.grantRead(getDeviceImageFn);
    deviceImagesBucket.grantReadWrite(uploadDeviceManualFn);
    deviceImagesBucket.grantRead(getDeviceManualsFn);
    deviceImagesBucket.grantReadWrite(deleteDeviceManualFn);

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

    // Device routes
    const devicesResource = apiResource.addResource('devices');
    devicesResource.addMethod('GET', new apigateway.LambdaIntegration(listDevicesFn));
    devicesResource.addMethod('POST', new apigateway.LambdaIntegration(createDeviceFn));
    devicesResource.addResource('recognize').addMethod('POST', new apigateway.LambdaIntegration(recognizeDeviceFn));
    devicesResource.addResource('stats').addMethod('GET', new apigateway.LambdaIntegration(getDeviceStatsFn));
    const deviceResource = devicesResource.addResource('{deviceId}');
    deviceResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteDeviceFn));
    deviceResource.addMethod('PUT', new apigateway.LambdaIntegration(updateDeviceFn));
    deviceResource.addResource('energy').addMethod('GET', new apigateway.LambdaIntegration(getDeviceEnergyFn));
    deviceResource.addResource('budget').addMethod('PUT', new apigateway.LambdaIntegration(updateDeviceBudgetFn));
    deviceResource.addResource('image').addMethod('GET', new apigateway.LambdaIntegration(getDeviceImageFn));
    deviceResource.addResource('history').addMethod('GET', new apigateway.LambdaIntegration(getDeviceHistoryFn));
    deviceResource.addResource('last-active').addMethod('GET', new apigateway.LambdaIntegration(getDeviceLastActiveFn));
    const manualsResource = deviceResource.addResource('manuals');
    manualsResource.addMethod('POST', new apigateway.LambdaIntegration(uploadDeviceManualFn));
    manualsResource.addMethod('GET', new apigateway.LambdaIntegration(getDeviceManualsFn));
    manualsResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteDeviceManualFn));
    const notesResource = deviceResource.addResource('notes');
    notesResource.addMethod('POST', new apigateway.LambdaIntegration(createDeviceNoteFn));
    notesResource.addMethod('GET', new apigateway.LambdaIntegration(listDeviceNotesFn));
    const tagsResource = deviceResource.addResource('tags');
    tagsResource.addMethod('GET', new apigateway.LambdaIntegration(manageDeviceTagsFn));
    tagsResource.addMethod('POST', new apigateway.LambdaIntegration(manageDeviceTagsFn));
    deviceResource.addResource('favorite').addMethod('POST', new apigateway.LambdaIntegration(toggleDeviceFavoriteFn));

    // Device favorites list route (all favorites for user)
    devicesResource.addResource('favorites').addMethod('GET', new apigateway.LambdaIntegration(listDeviceFavoritesFn));

    // Settings routes
    const settingsResource = apiResource.addResource('settings');
    settingsResource.addMethod('GET', new apigateway.LambdaIntegration(getUserSettingsFn));
    settingsResource.addMethod('PUT', new apigateway.LambdaIntegration(updateUserSettingsFn));

    // Room routes
    const roomsResource = apiResource.addResource('rooms');
    const roomResource = roomsResource.addResource('{roomName}');
    roomResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteRoomFn));

    // Reports routes
    const reportsResource = apiResource.addResource('reports');
    reportsResource.addResource('energy').addMethod('GET', new apigateway.LambdaIntegration(getEnergyReportFn));

    // Feature requests routes
    const featuresResource = apiResource.addResource('features');
    featuresResource.addMethod('POST', new apigateway.LambdaIntegration(createFeatureRequestFn));
    featuresResource.addMethod('GET', new apigateway.LambdaIntegration(listFeatureRequestsFn));
    featuresResource.addResource('stats').addMethod('GET', new apigateway.LambdaIntegration(getFeatureRequestStatsFn));
    const featureResource = featuresResource.addResource('{featureId}');
    featureResource.addMethod('GET', new apigateway.LambdaIntegration(getFeatureRequestFn));
    featureResource.addResource('approve').addMethod('POST', new apigateway.LambdaIntegration(approveFeatureRequestFn));
    featureResource.addResource('confirm').addMethod('POST', new apigateway.LambdaIntegration(confirmFeatureRequestFn));
    featureResource.addResource('admin-approve').addMethod('POST', new apigateway.LambdaIntegration(adminApproveFeatureFn));

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
    new cdk.CfnOutput(this, 'DeviceEnergyTableName', { value: deviceEnergyTable.tableName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}

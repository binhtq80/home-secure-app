# Architecture Diagrams

## Flow 1: User → Chat Agent → Orchestrator

User talks to the Chat Agent, which submits features and starts the orchestrator loop.

```mermaid
flowchart LR
    User([👤 User]) -- "chat" --> Me[Chat Agent]
    Me -- "reads on new session" --> Context[~/shared/<br/>myapp-context.md]
    Me -- "feature.sh start<br/>(ENV_FILE=)" --> ORC[orchestrator.sh]
    Me -- "feature.sh submit" --> Queue[("~/.feature-queue")]
    Me -- "feature.sh status" --> Status[("~/.feature-status")]

    ORC -- "sources config" --> EnvFiles[~/shared/<br/>myapp-envs/*.sh]
    ORC -- "uses credentials" --> AWSCreds[~/shared/<br/>.aws/credentials]
    ORC -- "reads task" --> Queue
    ORC -- "writes state" --> Status
    ORC -- "git pull --rebase" --> Repo[(GitHub<br/>main branch)]
    ORC -- "invokes" --> Kiro[kiro-cli]

    Kiro -- "reads conventions" --> Steering[.kiro/steering.md]
    Kiro -. "updates if new pattern" .-> Steering
    Kiro -- "git commit + push" --> Repo

    ORC -- "deploy-frontend.sh" --> S3[S3 + CloudFront]
    ORC -- "deploy-backend.sh" --> Lambda[Lambda Functions]
    ORC -- "infra changes" --> Pipeline[CDK Pipeline]
```

## Flow 2: User → Web App → DynamoDB → Orchestrator

User submits a feature request through the web application. The orchestrator polls DynamoDB directly for pending tasks (no bridge needed).

```mermaid
flowchart LR
    User([👤 User]) -- "opens web app" --> S3[S3 + CloudFront]
    S3 -- "serves React app" --> Browser[Feature Request Page]
    Browser -- "POST /api/features" --> FRLambda[create-feature-request<br/>Lambda]
    FRLambda -- "AI classifies complexity" --> Bedrock[Bedrock Claude]
    FRLambda -- "writes status=pending_confirmation" --> DDB[(DynamoDB<br/>feature-requests)]

    Technical([role=technical]) -- "accept/override" --> ConfirmLambda[confirm-feature-request]
    ConfirmLambda -- "status→pending_approval" --> DDB

    PM([role=product_manager]) -- "approve" --> ApproveLambda[approve-feature-request]
    ApproveLambda -- "status→pending" --> DDB

    ORC[orchestrator.sh] -- "polls status=pending" --> DDB
    ORC -- "conditional write:<br/>claimedBy=devspace-id" --> DDB
    ORC -- "invokes" --> Kiro[kiro-cli]
    Kiro -- "git commit + push" --> Repo[(GitHub<br/>main branch)]
    ORC -- "deploy" --> AWS[Lambda / S3 / CDK]
    ORC -- "status→delivered" --> DDB
```

## Persistence Model

What lives where and what survives a DevSpace restart.

```mermaid
flowchart TB
    subgraph Ephemeral["♻️ Ephemeral (dies with DevSpace)"]
        St[~/.feature-status]
        Git[~/.git-credentials]
        Proc[Running processes:<br/>orchestrator]
        Logs[~/.feature-orchestrator.log]
    end

    subgraph Shared["💾 Persistent (~/shared — survives restarts)"]
        Ctx[myapp-context.md]
        Env[myapp-envs/*.sh]
        Creds[.aws/config + credentials]
    end

    subgraph Repo["📦 In Git Repo (source of truth)"]
        Steer[.kiro/steering.md]
        Code[frontend/ backend/ infrastructure/]
        Scripts[scripts/orchestrator.sh<br/>feature.sh / setup-*.sh]
        Templates[scripts/env.custom.sh.template]
    end

    subgraph AWS["☁️ AWS (external state)"]
        DDB[(DynamoDB feature-requests<br/>task queue + status)]
        Cognito[Cognito User Pool<br/>users + roles]
    end
```

## Multi-DevSpace Parallel Processing

Multiple DevSpaces can target the same AWS account. Each orchestrator claims tasks atomically via DynamoDB conditional writes (no duplicates).

```mermaid
flowchart TB
    subgraph DDB["DynamoDB (feature-requests table)"]
        Pending["status=pending<br/>tasks"]
    end

    subgraph DS1["DevSpace A (ds-srunp40m)"]
        ORC1[orchestrator.sh]
    end

    subgraph DS2["DevSpace B (ds-ivkss8j1)"]
        ORC2[orchestrator.sh]
    end

    ORC1 -- "conditional update:<br/>set claimedBy=ds-srunp40m<br/>if status=pending" --> DDB
    ORC2 -- "conditional update:<br/>set claimedBy=ds-ivkss8j1<br/>if status=pending" --> DDB

    DDB -- "task A claimed" --> ORC1
    DDB -- "task B claimed" --> ORC2

    ORC1 -- "git push" --> Repo[(GitHub main)]
    ORC2 -- "git push" --> Repo

    ORC1 -- "deploy" --> AWS[AWS Account]
    ORC2 -- "deploy" --> AWS
```

## Role-Based Access Control

```mermaid
flowchart LR
    User([User]) -- "submits request" --> Submit[Create Feature Request]
    Submit -- "AI classifies" --> Pending[pending_confirmation]

    Pending -- "role=technical" --> Confirm[Accept/Override Complexity]
    Confirm --> Approval[pending_approval]

    Approval -- "role=product_manager" --> Approve[Approve/Reject]
    Approve -- "approved" --> Queue[pending → orchestrator picks up]
    Approve -- "rejected" --> Rejected[rejected]

    Admin([role=admin]) -- "manages roles" --> AdminPanel[Admin Panel<br/>assign roles to users]
```

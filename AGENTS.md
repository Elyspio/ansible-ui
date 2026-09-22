# AGENTS.md

Guidance for coding agents working in this repository.

## Agent rules

- Always use the `caveman` skill unless the user asks for another style.
- Use subagents only when the user explicitly requests delegation or parallel agent work.
- Preserve unrelated work in a dirty worktree. Never discard or rewrite user changes to make a task easier.
- Prefer source code, tests, and `README.md` over old prose. `CLAUDE.md` delegates to this file.

## Product

Ansible UI launches and tracks Ansible Playbook Runs from a web UI. API never runs Git or Ansible locally. It connects over SSH to a user-owned **Rebond**, where Dépôt Ansible, managed-host SSH access, and Ansible vault access live.

Normal Run path:

1. Synchronize Dépôt Ansible on Rebond with configured Révision distante.
2. Freeze repository state for Run duration.
3. Execute `ansible-playbook` on Rebond.
4. Persist streamed ANSI output and broadcast it through SignalR.
5. Parse final `PLAY RECAP` and persist terminal Run state.

Keep French ubiquitous-language terms consistent: **Rebond** is remote execution machine; **Dépôt Ansible** is Git repository exposed by Ansible UI; **Révision distante** is current commit of configured reference branch; **Synchronisation** aligns Rebond copy with that revision. Do not replace them with “control node”, “repo”, “remote”, “clone”, “pull”, or “refresh” in product-facing text.

## Repository map

```text
back/
  AnsibleUi.Abstractions/        Models, interfaces, HttpException, POSIX shell helpers
  AnsibleUi.Core/                Repository synchronization, Run queue, recap parsing
  AnsibleUi.Adapters.Ansible/    Ansible command construction and output parsing
  AnsibleUi.Adapters.Git/        Authoritative Git mirror command construction
  AnsibleUi.Adapters.MongoDB/    MongoDB Run persistence
  AnsibleUi.Adapters.Ssh/        Only SSH.NET transport implementation
  AnsibleUi.Sockets/             SignalR hub and realtime notifier
  AnsibleUi.Web/                 API, auth, composition root, static SPA hosting
  AnsibleUi.AppHost/             Aspire local stack: MongoDB, Keycloak, API, Vite
  AnsibleUi.ServiceDefaults/     Aspire health, telemetry, discovery, resilience
  AnsibleUi.Core.Tests/          Repository synchronization unit tests
  AnsibleUi.Adapters.Tests/      Git, Ansible, and POSIX shell unit tests
  AnsibleUi.E2E/                 Aspire + Keycloak + Playwright tests
front/
  src/config/                    Theme and runtime config resolution
  src/core/api/                  Axios client, TanStack Query hooks, shared API types
  src/core/auth/                 OIDC bridge and application auth context
  src/core/signalr/              Shared hub connection and realtime hooks
  src/view/                      Feature pages and shared UI components
deploy/build/                    Single-container image and deployment scripts
```

Backend uses .NET 10, ASP.NET Core, Aspire 13, MongoDB, SSH.NET, SignalR, xUnit v3 (Microsoft Testing Platform), and Shouldly. Frontend uses React 19, TypeScript, Vite+, MUI 9, TanStack Query, Axios, `react-oidc-context`, React Router, SignalR, and Vitest.

## Development commands

Requirements: .NET 10 SDK, pnpm 12, and Docker for Aspire services. Node 26 matches container build.

Start complete local stack from `root/`:

```bash
aspire run
```

Aspire starts MongoDB, Keycloak, API, and Vite. Frontend is fixed at `http://localhost:5173`; Keycloak is fixed at `http://localhost:8080`. Local realm, client, and `dev` / `dev` user come from `back/AnsibleUi.AppHost/Realms/ansible-ui-realm.json`. Standalone `pnpm dev` proxies API and hubs but does not start authenticated backend services.

AppHost injects MongoDB and OIDC settings, but normal development still needs valid Rebond, Git, and Ansible settings in `back/AnsibleUi.Web/appsettings.Local.json` or another configuration provider. E2E mode injects dummy values because its browser test does not call SSH.

Backend commands from repository root:

```bash
dotnet build back/AnsibleUi.slnx
dotnet test --solution back/AnsibleUi.slnx
dotnet test --project back/AnsibleUi.Core.Tests/AnsibleUi.Core.Tests.csproj
dotnet test --project back/AnsibleUi.Adapters.Tests/AnsibleUi.Adapters.Tests.csproj
```

`AnsibleUi.E2E` is not included in `AnsibleUi.slnx`. Run it explicitly. It needs Docker and Playwright Chromium:

```bash
dotnet build back/AnsibleUi.E2E/AnsibleUi.E2E.csproj
pwsh back/AnsibleUi.E2E/bin/Debug/net10.0/playwright.ps1 install chromium
dotnet test --project back/AnsibleUi.E2E/AnsibleUi.E2E.csproj
```

Frontend commands from `front/`:

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm check
pnpm fmt
pnpm lint
pnpm test
pnpm test:e2e
```

`pnpm check` runs `vp check`: Oxfmt, Oxlint with type-aware rules, and full TypeScript type check. It does not mutate files; `pnpm fmt` formats and `pnpm vp check --fix` applies fixes. Review resulting diff. Keep `front/package.json`, `front/pnpm-lock.yaml`, and catalog entries in `front/pnpm-workspace.yaml` consistent when dependencies change.

## Backend architecture and invariants

### Dependency direction

- `AnsibleUi.Abstractions` depends on nothing. Put shared domain models and ports here.
- `AnsibleUi.Core` depends only on abstractions. Keep domain coordination independent of SSH, Git, Ansible CLI, MongoDB, HTTP, and SignalR implementations.
- Adapters implement abstraction interfaces. `Adapters.Git` and `Adapters.Ansible` build POSIX scripts but execute them only through `IRemoteCommandExecutor`.
- `Adapters.Ssh` is only project allowed to know SSH.NET or open SSH connections.
- `AnsibleUi.Web/Program.cs` is composition root. Keep one `Add*` DI module per project and wire it there.
- Controllers stay thin: authorize, validate HTTP input, call domain interfaces/services, map response.

### Authoritative repository synchronization

`RepositorySynchronizer` is singleton owner of published repository state:

- `RepositoryWatchService` probes configured remote branch at `RepositorySynchronization:ProbeInterval`.
- Changed revision triggers clone or authoritative reset of tracked files on Rebond, then loads Playbooks and Inventory into one immutable `RepositorySnapshot`.
- Git failure marks status degraded but keeps last good snapshot readable.
- Run acquires repository lock, rechecks revision, tracked changes, origin, and branch, repairs state when needed, then holds lock through Playbook execution.
- Synchronization uses in-memory locks and assumes one API replica. Multi-replica deployment requires distributed coordination.
- Git reset intentionally preserves untracked and ignored files because Rebond can store local secrets. Never add `git clean` or equivalent deletion.

Inventory behavior matters:

- Structural Inventory comes from `ansible-inventory --list` without `_meta`, `all`, or `ungrouped` groups.
- Host facts use `ansible all -m setup` with only OS family, distribution, default IPv4, and uptime fields requested and exposed.
- Facts cache lasts 60 seconds per repository revision and is invalidated on snapshot refresh.
- Inventory requests never wait behind a running Playbook. They return cached facts or structure-only data when repository lock is busy.
- Host vars endpoint reads raw `inventory/host_vars/<host>/vars.yml`; vault blocks must remain encrypted. Never run vault decryption or expose `_meta.hostvars`.

### Run queue

`RunLauncher` is singleton `BackgroundService` and only Run scheduler:

- Exactly one Run executes at a time; later submissions remain `Queued` in an in-memory channel.
- Lifecycle is `Queued`, `Running`, then `Succeeded`, `Failed`, or `Canceled`. Startup changes orphaned `Running` records to `Interrupted` and re-enqueues persisted `Queued` records.
- Canceling a queued Run marks it immediately. Canceling a running Run cancels remote execution; SSH transport sends SIGINT, waits 10 seconds, then sends SIGKILL through another connection.
- Preparation failures are `Failed` and append a safe `[ansible-ui]` message to output.
- Persist each output chunk before realtime notification. REST detail remains recovery source after reconnect or late join.

Do not introduce another execution path around `RunLauncher` or `RepositorySynchronizer`.

### Realtime flow

SignalR hub is authenticated at `/hubs/runs`. Browser bearer token travels through `access_token` query parameter only for `/hubs` requests.

- `runChanged`: broadcast all Run status transitions.
- `runOutput`: sent only to `run-{id}` group.
- `repositoryStatusChanged`: broadcast synchronization and Run activity.
- `repositoryChanged`: broadcast newly published repository revision.
- Hub RPCs `WatchRun` and `UnwatchRun` manage per-Run output groups.

When changing event payloads, update backend notifier, frontend API types, query invalidation, and tests together.

### Shell and secret safety

- Treat every value embedded in a remote shell command as hostile. Use `PosixShell.Quote`; do not interpolate raw values.
- Host names must match `^[A-Za-z0-9._-]+$` before becoming paths or command arguments.
- `Ansible:WorkingDirectory` must be an absolute POSIX path contained within `GitRepository:Path`.
- Never return Ansible inventory hostvars or decrypted vault values.
- `Ansible:AcceptNewSshHostKeys` defaults false. When true, use `StrictHostKeyChecking=accept-new`, never disable host-key checking.
- Do not log private-key passphrases, bearer tokens, vault data, or raw secret-bearing config.
- Keep SSH PID marker internal; `__ANSIBLE_UI_PID__=...` must never appear in Run output.

## Frontend architecture and invariants

- Use `@/` alias for `front/src` imports.
- Put feature UI under `src/view/<feature>/`; keep transport, auth, runtime config, and shared data logic under `src/core` or `src/config`.
- Use shared Axios client in `core/api/client.ts`. AuthProvider owns bearer token injection.
- Keep server-state calls in TanStack Query hooks. Add query keys to centralized `qk` object and invalidate/update them from mutations and realtime handlers.
- Keep one shared SignalR connection from `core/signalr/connection.ts`. Do not create hub connections inside components.
- Preserve desired Run group membership and serialized Watch/Unwatch calls. This handles React StrictMode double effects and reconnects.
- REST Run detail is authoritative persisted output; SignalR adds live chunks only.
- `VITE_OIDC_AUTHORITY` and `VITE_OIDC_CLIENT_ID` override `window.ansibleUi.config.oauth` for Aspire development.
- `endpoints.core` defaults to same origin. Vite proxies `/api` and `/hubs`; production API serves built SPA from `wwwroot`.
- Runtime config errors must fail visibly. Do not silently invent auth defaults.
- Frontend `Run`, Inventory, and repository status types mirror backend JSON. Change both sides together.

## Configuration

Environment-specific values must stay out of source. Relevant sections:

- `SshConnection`: `Host`, `Port`, `User`, `PrivateKeyPath`, optional `PrivateKeyPassphrase`
- `GitRepository`: `Path`, `Url`, `Branch`
- `Ansible`: `WorkingDirectory`, `AcceptNewSshHostKeys`
- `RepositorySynchronization`: `ProbeInterval`
- `Auth`: required absolute HTTP(S) `Authority`, required `Audience`
- `Cors:AllowedOrigins`
- `ConnectionStrings:MongoDB`

API loads normal ASP.NET configuration plus optional `appsettings.docker.json` and gitignored `appsettings.Local.json`. Prefer `back/AnsibleUi.Web/appsettings.Local.json` for local Rebond settings and environment variables or mounted secrets in deployment. Options validate at startup; keep new required options covered by startup validation tests.

Frontend runtime config comes from `front/public/conf.js`, replaced during deployment. Redirect URI, post-logout URI, response type, and scope receive safe defaults in `src/config/runtime.ts`.

## Testing expectations

- Backend tests use xUnit v3 on Microsoft Testing Platform with Shouldly assertions (`actual.ShouldBe(expected)`), not xUnit `Assert`. String `ShouldContain` is case-insensitive by default; pass `Case.Sensitive` when asserting generated scripts.
- Core locking, degraded-state, snapshot, or fact-cache changes: extend `AnsibleUi.Core.Tests`.
- Git/Ansible command or POSIX quoting changes: extend `AnsibleUi.Adapters.Tests` and assert generated scripts precisely.
- Runtime frontend config changes: extend `front/src/config/runtime.test.ts`.
- Auth startup or local sign-in changes: run explicit `AnsibleUi.E2E` tests when Docker and Chromium are available.
- UI data-flow changes: run `pnpm check`, `pnpm test`, and `pnpm build`.
- Backend changes: run affected tests plus `dotnet build back/AnsibleUi.slnx`.
- Bug fixes should gain a focused regression test when practical.

Do not require a real Rebond, Git forge, managed host, or SSH key in unit tests. Test command construction through fake `IRemoteCommandExecutor` implementations.

## Code style

- `.editorconfig` is authoritative: UTF-8, LF, final newline, tabs at width 4. Markdown and YAML use spaces; YAML uses 2 spaces.
- C# has nullable reference types and implicit usings enabled. Follow existing file-scoped namespaces, primary constructors, records, async APIs, and cancellation-token propagation.
- TypeScript is strict. Prefer typed API boundaries and existing React hooks over ad hoc fetch/effect state.
- Comments should explain concurrency, security, or design constraints, not restate code.
- Product UI text is currently English; architecture uses defined French domain terms.

## Deployment cautions

`deploy/build/dockerfile` builds frontend with Node 26 and pnpm 12.5.1, publishes API with .NET 10, copies SPA into `wwwroot`, and runs one container on port 4000.

`deploy/build/build.ps1` builds, pushes to an external registry, and deploys an external Helm chart from a machine-specific path. Run it only when user explicitly asks to publish/deploy. `deploy/build/docker-compose.yml` is not complete Rebond configuration; required SSH, Git, Ansible settings, and key mounts must still be supplied.

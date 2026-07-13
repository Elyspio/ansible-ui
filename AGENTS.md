# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Web UI to launch and track Ansible playbook runs. The backend **never runs Ansible itself** — it connects over SSH to a *control node* ("rebond") the user owns, which holds the Ansible repo clone, SSH keys to managed hosts, and the vault password. Each run does `git pull` on that node, then `ansible-playbook`, streaming stdout back live. See [docs/adr/0001](docs/adr/0001-execution-ssh-rebond.md) for why.

## Commands

Full dev stack (from `back/`):
```bash
cd back
dotnet run --project AnsibleUi.AppHost
```
Aspire orchestrates MongoDB, Keycloak, the API, and the Vite dev server. Front on http://localhost:5173, Keycloak on http://localhost:8080 (realm `ansible-ui`, dev login `dev`/`dev`), Aspire dashboard shows all endpoints + Keycloak admin creds.

Backend build: `dotnet build back/AnsibleUi.slnx` (or a single project's `.csproj`). Requires .NET 10 SDK.

Frontend (from `front/`, pnpm) — scripts run through `vp` (vite-plus):
```bash
pnpm dev       # Vite dev server
pnpm build     # production build
pnpm check     # lint + format, autofix (vp check --fix)
pnpm test      # vitest (no test files exist yet)
```

## Backend architecture

Ports-and-adapters layering, one DI module (`Add*` extension) per project, all wired in [AnsibleUi.Web/Program.cs](back/AnsibleUi.Web/Program.cs):

- **Abstractions** — models (`Run`, `Playbook`, `Inventory`), interfaces (`IGitRepository`, `IAnsibleRebond`, `IRemoteCommandExecutor`, `IRunRepository`, `IRealtimeNotifier`), `HttpException`. Depends on nothing.
- **Core** — domain logic. `RunLauncher` is the heart (see below); `RecapParser` extracts the per-host `PLAY RECAP`.
- **Db** — MongoDB `RunRepository`.
- **Sockets** — SignalR `RunHub` (`/hubs/runs`) + `RealtimeNotifier` implementing `IRealtimeNotifier`.
- **Adapters.Ssh** — `SshRemoteCommandExecutor` (Renci.SshNet) is the **only** code touching SSH; implements `IRemoteCommandExecutor`.
- **Adapters.Git** — `GitRepository` builds Git scripts and implements `IGitRepository`.
- **Adapters.Ansible** — `AnsibleRebond` builds Ansible scripts and implements `IAnsibleRebond`.
- **Web** — composition root: controllers, auth, filters (`HttpExceptionFilter` maps `HttpException` to status codes). Serves the built front from `wwwroot` with SPA fallback (single container in prod).
- **AppHost / ServiceDefaults** — Aspire orchestration and shared telemetry/health.

### The run queue (`Core/Services/RunLauncher.cs`)

`RunLauncher` is a singleton `BackgroundService` and the concurrency model of the whole app: **exactly one run executes at a time**, everything else is `Queued`. `SubmitAsync` persists + enqueues; the background loop dequeues one at a time. On startup `RecoverFromPreviousInstanceAsync` marks any run left `Running` by a dead instance as `Interrupted` and re-enqueues `Queued` ones. Cancellation of a `Running` run cancels a `CancellationTokenSource` that interrupts the remote process; the execution loop then finalizes status. Run status lifecycle and terms are defined in [CONTEXT.md](CONTEXT.md).

### Streaming path

`AnsibleRebond.ExecutePlaybookAsync` streams through `IRemoteCommandExecutor` → `RunLauncher` appends to the repo and calls `IRealtimeNotifier` → SignalR pushes to browser. SSH transport captures remote PID (a `__ANSIBLE_UI_PID__=$$` marker line, swallowed from output) and sends SIGINT then SIGKILL over a second SSH connection. On `/hubs` routes browser passes bearer token as an `access_token` query string (JwtBearer is configured to read it there).

### Security invariants (don't regress these)

- Inventory is **read-only** and vault-encrypted values must never leave the control node: `GetInventoryAsync` strips `_meta.hostvars`; `GetHostVarsAsync` reads the raw file so inline `!vault` blocks stay encrypted.
- Host names passed to shell are validated against `SafeHostName()`; all shell args go through `Quote()` (POSIX single-quote escaping).

## Configuration

Nothing environment-specific is hardcoded. `Program.cs` layers config: `appsettings.json` (empty defaults) → `appsettings.docker.json` (prod, mounted secret) → `appsettings.Local.json` (dev, gitignored). `SshConnectionOptions`, `GitRepositoryOptions`, and `AnsibleOptions` validate at startup; Ansible working directory must remain within configured Git repository path.

**Auth** is mandatory generic OIDC bearer validation (any provider). `Auth.Authority` and `Auth.Audience` are required at API startup. Locally, Aspire runs Keycloak and injects these into the API (`Auth__*`) and the front (`VITE_OIDC_*`, which override `front/public/conf.js`). Kubernetes must inject them in production. The Keycloak realm/client/dev-user are seeded from `back/AnsibleUi.AppHost/realms/` on first run (persisted in a data volume afterward — delete the volume to re-seed). `Aspire.Hosting.Keycloak` is preview-only at 13.x.

The frontend reads runtime config from `window.ansibleUi.config` (served as `front/public/conf.js` in dev, overwritten at deploy time) — see [front/src/config/runtime.ts](front/src/config/runtime.ts).

## Conventions

- **Indentation is tabs** (`.editorconfig`), 4-wide; YAML uses 2 spaces.
- **Domain vocabulary lives in [CONTEXT.md](CONTEXT.md)** and is French ubiquitous language (Playbook, Run, Cible, Rebond, Recap…). Use these terms as-is in code and UI. ADRs in `docs/adr/` are also French.
- Frontend is React 19 + MUI v9 + TanStack Query + react-oidc-context, organized under `front/src/view/<feature>/`.

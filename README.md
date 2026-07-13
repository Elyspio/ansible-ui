# ansible-ui

Web UI to launch and track Ansible playbook runs on a remote Rebond, over SSH.

- **Launch** a playbook with `--limit` (picked from your inventory), `--check` and `--diff`.
- **Watch** the live output streamed from the Rebond.
- **Browse** the full run history with per-host recap badges.
- **Inspect** your inventory (read-only; vault-encrypted values are never shown).

The app never runs Ansible itself: it connects over SSH to a Rebond you own — a machine that
holds SSH access to your managed hosts and your vault password. The API synchronizes the Dépôt
Ansible with its configured Révision distante and freezes it for the duration of each Run.

## Architecture

- `back/` — .NET Aspire application (API, MongoDB persistence, SignalR streaming, SSH executor).
- `front/` — React SPA (Vite+, MUI). Served by the API in production (single container).
- `docs/adr/` — architecture decision records.

## Configuration

Everything specific to your environment is runtime configuration; nothing is hardcoded.

Backend (`appsettings.Local.json`, environment variables, or mounted secret):

```json
{
  "SshConnection": {
    "Host": "ansible.example.lan",
    "Port": 22,
    "User": "ansible",
    "PrivateKeyPath": "/secrets/id_ed25519"
  },
  "GitRepository": {
    "Path": "/home/ansible/infrastructure",
    "Url": "ssh://git@forge.example.lan/ops/ansible.git",
    "Branch": "main"
  },
  "Ansible": {
    "WorkingDirectory": "/home/ansible/infrastructure/ansible",
    "AcceptNewSshHostKeys": true
  },
  "RepositorySynchronization": {
    "ProbeInterval": "00:00:01"
  },
  "Auth": {
    "Authority": "https://sso.example.lan/realms/main",
    "Audience": "ansible-ui"
  }
}
```

`Ansible:WorkingDirectory` must be an absolute POSIX path inside `GitRepository:Path`.
`Ansible:AcceptNewSshHostKeys` is disabled by default. When enabled, Ansible accepts and stores
unknown OpenSSH host keys, but still rejects a host whose known key changed.

OIDC is mandatory. Kubernetes must inject backend `Auth__Authority` and `Auth__Audience`,
and deploy a frontend `conf.js` with `oauth.authority` and `oauth.client_id`.

Frontend (`public/conf.js`, replaced at deploy time):

```js
window.ansibleUi = {
  config: {
    endpoints: { core: "" },
    oauth: {
      authority: "https://sso.example.lan/realms/main",
      client_id: "ansible-ui",
    },
  },
};
```

## Development

Requirements: .NET 10 SDK, pnpm, Docker (for Aspire containers).

```bash
cd back
dotnet run --project AnsibleUi.AppHost
```

Aspire starts MongoDB, local Keycloak, the API and the Vite dev server (front on
http://localhost:5173). Sign in with `dev` / `dev`. Standalone `pnpm dev` does not provide
an authenticated application.

Run Docker-backed Keycloak browser tests separately after installing Playwright Chromium:

```bash
cd back/AnsibleUi.E2E
pwsh bin/Debug/net10.0/playwright.ps1 install chromium
dotnet test
```

# VPS, SSH, and Tailscale Guide

How to connect to a remote server safely, set reasonable defaults, and decide what is safe to delegate to an AI agent.

This guide is for solo builders and small teams setting up their first production server. It covers SSH setup, Tailscale as a private network layer, and checkpoints before anything gets handed to an agent.

## What This Guide Is Not

Read this first:

- This is not a security audit or a certified guide. It gives you a better starting posture than the defaults — that is all.
- This is not a compliance package. No SOC 2, HIPAA, PCI, or legal coverage.
- This does not replace a real system administrator or a real security review for high-stakes deployments.
- If your server handles money, health data, identity, minors, or legally regulated information: get professional help in addition to this.

**Human rule throughout this guide:** any step that changes authentication, SSH access, or firewall rules — you do it, or you read and approve every command before an agent runs it. Do not delegate access-control changes blindly.

## Who This Is For

- A solo builder with a VPS (DigitalOcean, Linode, Hetzner, Vultr, or similar) running an app, API, bot, or SaaS.
- Someone who has SSHed into a server a few times but has not set up key-based auth, disabled root login, or thought about access control.
- Someone using an AI coding agent who wants to know what is safe to delegate and what is not.

## Before You Start

You need:
- a running VPS (Ubuntu 22.04 LTS or Debian 12 are common, practical defaults)
- a local machine with a terminal (Mac, Linux, or Windows with WSL2 or Git Bash)

**Checkpoint:** Do you have root access to your VPS and know its IP address? If not, log in to your hosting provider's dashboard first.

---

## 1. First Connection

When you provision a VPS, your provider gives you a root password or injects a root SSH key. Use this once to create a non-root user.

```bash
# Replace 203.0.113.42 with your server's actual IP
ssh root@203.0.113.42
```

You will be prompted for a password, or your key will authenticate automatically.

---

## 2. Create a Non-Root Admin User

Running as root means every mistake has maximum blast radius. Create a named admin user.

```bash
# On the server, as root
adduser deploy-admin
# Follow the prompts. Set a strong password even if you plan to use keys.

# Grant sudo access for admin tasks
usermod -aG sudo deploy-admin
```

Use a role name (`deploy-admin`) rather than a personal name. Role accounts survive team changes and are clearer in logs.

---

## 3. Set Up SSH Key-Based Authentication

Passwords can be brute-forced. Keys cannot (practically). Set up key auth before you disable passwords.

### On your local machine

```bash
# Generate a key pair if you do not have one
ssh-keygen -t ed25519 -C "your-comment-here"
# Accept the default path or choose one

# Copy your public key to the server
ssh-copy-id deploy-admin@203.0.113.42
```

If `ssh-copy-id` is not available:

```bash
# Get your public key
cat ~/.ssh/id_ed25519.pub

# On the server, as deploy-admin:
mkdir -p ~/.ssh
echo "paste-your-public-key-here" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Test key auth before continuing

```bash
ssh deploy-admin@203.0.113.42
```

If you can log in without a password prompt, key auth is working.

**Checkpoint: Do not disable password auth until key auth works. Test from the exact machine you plan to use.**

---

## 4. Tighten SSH Defaults

Edit `/etc/ssh/sshd_config` on the server:

```bash
sudo nano /etc/ssh/sshd_config
```

Find or add:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

Restart SSH:

```bash
sudo systemctl restart sshd
```

**Checkpoint: Before closing your current SSH session, open a second terminal and confirm you can still log in. If you lock yourself out, your hosting provider usually has a web console fallback.**

---

## 5. Firewall Basics

Most hosting providers give you a network firewall in their dashboard. Use that first — it is harder to misconfigure than on-server rules.

If you want an on-server firewall (`ufw` on Ubuntu/Debian):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp    # HTTP if your app serves it
sudo ufw allow 443/tcp   # HTTPS if your app serves it
sudo ufw enable
```

Rule: default deny, explicit allow. Only open ports your app actually uses.

**Checkpoint: After enabling the firewall, confirm SSH still works from a second terminal.**

---

## 6. Tailscale (Optional but Strongly Recommended)

Tailscale creates a private encrypted network between your devices. Once your server and laptop are on the same Tailscale network:

- you can SSH to your server by its Tailscale machine name instead of a public IP
- you can close the public SSH port entirely
- you can restrict which devices reach which services

### Install Tailscale on the server

```bash
# Ubuntu/Debian
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

This prints an auth URL. Open it in a browser on your laptop and authorize the server.

### Install Tailscale on your laptop

Download from tailscale.com and log in with the same account.

### Test the connection

```bash
# On your laptop — Tailscale gives each machine a name
ssh deploy-admin@your-server-name
```

### Lock SSH to Tailscale only (optional)

After Tailscale SSH is confirmed working:

```bash
sudo ufw delete allow OpenSSH
sudo ufw allow in on tailscale0 to any port 22
```

**Checkpoint: Test SSH through Tailscale before removing the public rule.**

---

## 7. Create a Deploy User

Consider two separate user accounts:

| Account | Purpose | Has sudo? |
|---|---|---|
| `deploy-admin` | Your personal admin account. Server setup, emergencies, config changes. | Yes |
| `deploy-user` | Used by CI, GitHub Actions, and (carefully) AI agents for deploy operations. | No |

```bash
# On the server as deploy-admin
adduser deploy-user
su - deploy-user
mkdir -p ~/.ssh
echo "paste-deploy-key-public-here" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
exit
```

Your deploy workflow runs as `deploy-user`. Your personal admin work uses `deploy-admin`. The paths stay separate.

---

## 8. Container Defaults (If You Run Docker or Podman)

Reasonable defaults, not a certified setup:

- Run app containers as a non-root user inside the container.
- Use `--security-opt no-new-privileges` to prevent privilege escalation.
- Bind internal app ports to `127.0.0.1` only if traffic comes through a reverse proxy (nginx, Caddy, etc.). Do not expose raw app ports publicly.
- Use named volumes or explicit bind mounts.

Example fragment:

```yaml
# docker-compose.yml
services:
  app:
    image: your-app-image
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
    ports:
      - "127.0.0.1:3000:3000"   # Let nginx proxy; do not expose directly
    volumes:
      - app_data:/data
```

---

## 9. When To Let an AI Agent Near Your Server

Short answer: carefully, with a limited scope, and never for first-time setup.

**Rules:**

- You set up SSH, users, and firewall rules. Do not ask an agent to do this.
- An agent may deploy your app (copy files, restart a service) after your setup is complete.
- An agent must ask before: any `sudo` command, any firewall change, any user account change, any `.env` change, any secret rotation.
- Always read what the agent is about to run before it runs it. Even one-liners.
- Give the agent the `deploy-user` key. Not the `deploy-admin` key.
- Document what the agent is allowed to do in `AGENTS.md` so the rule is persistent.

Example `AGENTS.md` deploy access block:

```md
## Server Access

- Agent authenticates as deploy-user via SSH.
- Agent may: copy built files to /srv/app/current/, run `systemctl restart app`, tail logs.
- Agent must ask before: any sudo command, any firewall change, any .env edit, any file deletion outside /srv/app/current/.
- Admin path: deploy-admin via Tailscale only. Humans only.
```

---

## 10. Human Checkpoints Summary

| When | Who acts |
|---|---|
| Disable root login | You |
| Disable password auth | You — only after confirming key auth works in a second terminal |
| Enable firewall | You — test immediately after |
| Install and configure Tailscale | You — authorize in browser |
| Lock SSH to Tailscale only | You — test Tailscale SSH first |
| Create deploy-user | You |
| First time giving an agent SSH access | You — write AGENTS.md rules first |
| Any sudo command the agent proposes | You — read it before approving |
| Any .env change on the live server | You |

---

## 11. Signs Something Warrants Investigation

These are not guaranteed signs of a breach, but they all warrant attention before you continue:

- You cannot SSH in from your usual machine.
- Logs show logins from unexpected IP addresses or at unexpected times.
- Your app is publicly reachable on a port you did not intend to open.
- An unexpected entry appears in `~/.ssh/authorized_keys`.
- CPU or network load is high with no obvious cause.

---

## Quick-Start Checklist

- [ ] Non-root admin user created
- [ ] Key-based SSH auth working from local machine
- [ ] Key auth tested from a second terminal before disabling passwords
- [ ] Root login disabled
- [ ] Password auth disabled
- [ ] Firewall configured (default deny, explicit allow)
- [ ] Tested SSH after each lockdown step
- [ ] Tailscale installed on server and local machine (if using)
- [ ] SSH tested via Tailscale before removing public SSH rule (if using Tailscale)
- [ ] Deploy-user created with its own SSH key (if using CI or agents)
- [ ] Agent deploy rules documented in `AGENTS.md`

That is a reasonable starting posture, not a finished one. Revisit as your project grows.

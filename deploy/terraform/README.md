# Terraform — EC2 reference (untested)

> **Status: reference only — never applied.** This configuration has not been
> run against a real AWS account. Review it before use and expect to adjust it.
> The supported deployment is Render + Neon + Vercel ([`../DEPLOY.md`](../DEPLOY.md));
> for a single VM, [`../ec2-bootstrap.sh`](../ec2-bootstrap.sh) builds the stack
> from source with Docker Compose.

## What it provisions

| File | Contents |
|------|----------|
| `main.tf` | VPC, public subnet, security group and one EC2 instance |
| `userdata.sh.tpl` | First-boot script: installs Docker, pulls the API and frontend images, starts them with Compose |
| `variables.tf` | Inputs (below) |
| `outputs.tf` | `instance_public_ip`, `instance_public_dns`, `frontend_url`, `api_url` |

The user-data pulls `ghcr.io/faryanra/data-center-digital-twin/{api,frontend}:<image_tag>`.
No workflow publishes those images any more, so build and push them yourself first
(`docker build -f Dockerfile .` and `docker build -f apps/web/Dockerfile .`).
The generated compose file does not set `JWT_SECRET`; add it (same value for both
services) before relying on authentication.

## Variables

| Variable | Description |
|----------|-------------|
| `aws_region` | AWS region (default `eu-north-1`) |
| `instance_type` | EC2 instance type |
| `key_name` | EC2 SSH key pair name (required) |
| `allowed_cidr` | CIDR allowed to reach ports 3000/8000 |
| `ami_id` | AMI to launch |
| `image_tag` | Container image tag to pull |

## Usage

```bash
cd deploy/terraform
terraform init
terraform plan -var="key_name=my-key"
terraform apply
```

Never commit `.tfvars` files that contain real keys or passwords.

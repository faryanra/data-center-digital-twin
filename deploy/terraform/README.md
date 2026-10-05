# Terraform — DC-NORTH-01 Infrastructure

Infrastructure-as-Code for deploying DC-NORTH-01 Digital Twin to AWS.

## Configurations

Two deployment targets are available:

| File | Target | Notes |
|------|--------|-------|
| `main.tf` | EC2 single-instance | Low cost, single AZ — suitable for demo and staging |
| `outputs.tf` | Shared outputs | ALB DNS, ECR URLs, RDS endpoint |
| `variables.tf` | Input variables | See below |
| `userdata.sh.tpl` | EC2 bootstrap | Installs Docker, pulls images, starts compose |

## EC2 deployment

Provisions a single EC2 instance (default `t3.medium`) running Docker Compose:

- Installs Docker + Docker Compose on first boot via `userdata.sh.tpl`
- Pulls images from GitHub Container Registry (`ghcr.io/faryanra/data-center-digital-twin`)
- Starts `docker-compose.prod.yml` with environment variables from SSM Parameter Store

## ECS Fargate (planned)

A Fargate configuration is planned for production HA deployments:

- Frontend: 0.25 vCPU / 512 MB, behind ALB
- API: 0.5 vCPU / 1 GB, auto-scaling on CPU > 70%
- RDS PostgreSQL 16 (Multi-AZ optional)
- ElastiCache for session caching (optional)

## Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `eu-north-1` | AWS region |
| `instance_type` | `t3.medium` | EC2 instance type |
| `key_name` | — | EC2 SSH key pair name (required) |
| `allowed_cidr` | `0.0.0.0/0` | CIDR allowed to reach port 3000/8000 |
| `postgres_password` | — | RDS/container password (required, sensitive) |

## Usage

```bash
cd deploy/terraform
terraform init
terraform plan -var="key_name=my-key" -var="postgres_password=s3cr3t"
terraform apply
```

After apply, the ALB DNS name is printed as the `frontend_url` output.

## Secrets

Never commit `.tfvars` files containing real passwords or keys.
Use SSM Parameter Store or AWS Secrets Manager for production secrets:

```bash
aws ssm put-parameter --name /dc-north-01/postgres_password \
  --value "s3cr3t" --type SecureString
```

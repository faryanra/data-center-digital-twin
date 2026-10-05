variable "aws_region" {
  description = "AWS region"
  default     = "eu-north-1"
}

variable "app_name" {
  description = "Application name (used as resource prefix)"
  default     = "dc-north-01"
}

variable "environment" {
  description = "Deployment environment"
  default     = "production"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  default     = "latest"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "influx_token" {
  description = "InfluxDB auth token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "domain_name" {
  description = "Optional custom domain for ACM/HTTPS (leave empty to use ALB DNS)"
  default     = ""
}

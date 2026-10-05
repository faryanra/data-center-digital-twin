variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-north-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
}

variable "allowed_cidr" {
  description = "CIDR block allowed to reach the instance (HTTP, HTTPS, Modbus)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "ami_id" {
  description = "AMI ID (Ubuntu 24.04 LTS in eu-north-1 by default)"
  type        = string
  default     = "ami-0c1ac8a41498c1a9c"
}

variable "image_tag" {
  description = "Docker image tag to deploy (e.g. main or v1.2.3)"
  type        = string
  default     = "main"
}

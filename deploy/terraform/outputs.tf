output "instance_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_instance.app.public_ip
}

output "instance_public_dns" {
  description = "Public DNS of the EC2 instance"
  value       = aws_instance.app.public_dns
}

output "frontend_url" {
  description = "DC-NORTH-01 frontend URL"
  value       = "http://${aws_instance.app.public_ip}:3000"
}

output "api_url" {
  description = "FastAPI base URL"
  value       = "http://${aws_instance.app.public_ip}:8000"
}

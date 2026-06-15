terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  
  backend "gcs" {
    bucket = "codeflow-tf-state"
    prefix = "prod"
  }
}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

variable "gcp_project" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

resource "google_project_service" "services" {
  for_each = toset([
    "container.googleapis.com",
    "firestore.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
  ])
  
  service = each.value
}

resource "google_container_cluster" "primary" {
  name     = "codeflow-${var.environment}"
  location = var.gcp_region
  
  remove_default_node_pool = true
  initial_node_count       = 1
  
  workload_identity_config {
    workload_pool = "${var.gcp_project}.svc.id.goog"
  }
  
  enable_legacy_abac = false
  
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }
}

resource "google_container_node_pool" "primary_nodes" {
  name       = "codeflow-nodes"
  location   = var.gcp_region
  cluster    = google_container_cluster.primary.name
  node_count = 3
  
  node_config {
    preemptible  = false
    machine_type = "e2-standard-4"
    
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    
    labels = {
      environment = var.environment
    }
  }
}

resource "google_firestore_database" "default" {
  project = var.gcp_project
  name    = "(default)"
  type    = "DATASTORE_MODE"
  
  location_id = var.gcp_region
}

resource "google_storage_bucket" "codeflow_bucket" {
  name          = "${var.gcp_project}-codeflow"
  location      = var.gcp_region
  storage_class = "STANDARD"
  
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }
  
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each = toset([
    "gemini-api-key",
    "jwt-secret-key",
    "api-key-encryption-key",
    "redis-password",
    "database-password",
    "resend-api-key",
  ])
  
  secret_id = "${var.environment}-${each.value}"
  
  replication {
    user_managed {
      replicas {
        location = var.gcp_region
      }
    }
  }
}

resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.gcp_region
  name          = "codeflow-docker"
  repository_id = "docker"
  description   = "Docker repository for CodeFlow"
  format        = "DOCKER"
  
  docker_config {
    immutable_tags = false
  }
}

resource "google_cloudbuild_trigger" "deploy_trigger" {
  name        = "codeflow-deploy-${var.environment}"
  description = "Deploy to GKE on main branch push"
  
  github {
    owner = "your-org"
    name  = "codeflow"
    pull_request {
      branch = "^main$"
      comment_control = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS"
    }
  }
  
  build {
    step {
      name = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      args = ["run", "deploy", "codeflow-${var.environment}", "--image", "gcr.io/$PROJECT_ID/${var.environment}/app:latest"]
    }
  }
}

resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "High Error Rate - ${var.environment}"
  
  combiner = "OR"
  
  conditions {
    display_name = "Error rate > 5%"
    
    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND metric.type=\"kubernetes.io/container/restart_count\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
  
  notification_channels = var.notification_channels
}

variable "notification_channels" {
  description = "Alert notification channel IDs"
  type        = list(string)
  default     = []
}

output "cluster_name" {
  value = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  value     = google_container_cluster.primary.endpoint
  sensitive = true
}

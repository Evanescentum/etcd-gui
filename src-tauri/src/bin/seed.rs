use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use dialoguer::{Confirm, Select, theme::ColorfulTheme};
use etcd_client::{Client, ConnectOptions};
use fake::rand::Rng;
use serde_json::Value;
use std::path::PathBuf;

use etcd_gui_lib::config::{AppConfig, Profile};

/// Tauri app identifier, used to locate the config directory.
const APP_IDENTIFIER: &str = "com.etcd-gui.app";

#[derive(Parser)]
#[command(
    name = "etcd-seed",
    about = "Utility tool for seeding etcd with test data"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Populate etcd with randomly generated test data
    Populate {
        /// etcd endpoint (e.g., "localhost:2379").
        /// If not provided, reads from etcd-gui config.
        #[arg(short, long)]
        endpoint: Option<String>,

        /// Number of key-value pairs to generate
        #[arg(short = 'n', long, default_value_t = 50)]
        count: usize,

        /// Value type (currently only "json" is supported)
        #[arg(short = 't', long, default_value = "json")]
        value_type: String,

        /// Key prefix
        #[arg(short, long, default_value = "/seed/")]
        prefix: String,

        /// Username for etcd authentication
        #[arg(short, long)]
        user: Option<String>,

        /// Password for etcd authentication.
        /// If --user is set but --password is omitted, you will be prompted interactively.
        #[arg(long)]
        password: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/// Resolve the etcd-gui config path without the Tauri runtime.
///
/// Follows the same platform conventions Tauri v2 uses:
/// - Windows: `%APPDATA%/{identifier}`
/// - macOS:   `~/Library/Application Support/{identifier}`
/// - Linux:   `$XDG_CONFIG_HOME/{identifier}` (fallback `~/.config`)
fn resolve_config_path() -> Option<PathBuf> {
    let config_dir = dirs::config_dir()?;
    let path = config_dir.join(APP_IDENTIFIER).join("config.json");
    if path.exists() { Some(path) } else { None }
}

/// Interactively ask the user to pick one of the saved profiles.
fn select_profile(config: &AppConfig) -> Result<&Profile> {
    if config.profiles.is_empty() {
        bail!("No profiles found in the config file");
    }

    let profile_names: Vec<String> = config
        .profiles
        .iter()
        .map(|p| {
            let endpoints: Vec<String> = p.endpoints.iter().map(|e| e.to_string()).collect();
            format!("{} ({})", p.name, endpoints.join(", "))
        })
        .collect();

    let default_idx = config
        .current_profile
        .as_ref()
        .and_then(|name| config.profiles.iter().position(|p| &p.name == name))
        .unwrap_or(0);

    let selection = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select a profile to connect")
        .items(&profile_names)
        .default(default_idx)
        .interact()
        .context("Failed to display profile selection")?;

    Ok(&config.profiles[selection])
}

// ---------------------------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------------------------

async fn connect_with_endpoint(endpoint: &str, user: Option<(&str, &str)>) -> Result<Client> {
    let mut options = ConnectOptions::new();
    if let Some((username, password)) = user {
        options = options.with_user(username, password);
    }
    Client::connect([endpoint], Some(options))
        .await
        .context(format!("Failed to connect to etcd at {endpoint}"))
}

async fn connect_with_profile(profile: &Profile) -> Result<Client> {
    let endpoints: Vec<String> = profile
        .endpoints
        .iter()
        .map(|ep| format!("{}:{}", ep.host, ep.port))
        .collect();

    let mut options = ConnectOptions::new();
    if let Some((username, password)) = &profile.user {
        options = options.with_user(username, password.as_str());
    }
    if let Some(timeout) = profile.timeout_ms {
        options = options.with_timeout(std::time::Duration::from_millis(timeout));
    }
    if let Some(connect_timeout) = profile.connect_timeout_ms {
        options = options.with_connect_timeout(std::time::Duration::from_millis(connect_timeout));
    }

    Client::connect(endpoints, Some(options))
        .await
        .context("Failed to connect to etcd")
}

// ---------------------------------------------------------------------------
// Fake data generation
// ---------------------------------------------------------------------------

const CATEGORIES: &[&str] = &[
    "users",
    "products",
    "servers",
    "events",
    "configs",
    "jobs",
    "deployments",
    "certificates",
    "routes",
    "databases",
    "pipelines",
    "iot_devices",
    "experiments",
    "invoices",
    "policies",
];

fn generate_key(prefix: &str, category: &str, seq: usize) -> String {
    format!("{prefix}{category}/{seq:04}")
}

fn generate_value(rng: &mut impl Rng, category: &str) -> Value {
    use generators::*;
    match category {
        "users" => gen_user(rng),
        "products" => gen_product(rng),
        "servers" => gen_server(rng),
        "events" => gen_event(rng),
        "configs" => gen_config(rng),
        "jobs" => gen_job(rng),
        "deployments" => gen_deployment(rng),
        "certificates" => gen_certificate(rng),
        "routes" => gen_route(rng),
        "databases" => gen_database(rng),
        "pipelines" => gen_pipeline(rng),
        "iot_devices" => gen_iot_device(rng),
        "experiments" => gen_experiment(rng),
        "invoices" => gen_invoice(rng),
        "policies" => gen_policy(rng),
        _ => unreachable!(),
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Populate {
            endpoint,
            count,
            value_type,
            prefix,
            user,
            password,
        } => {
            if value_type != "json" {
                bail!(
                    "Unsupported value type: \"{value_type}\". Currently only \"json\" is supported."
                );
            }

            // Normalise prefix so it always ends with `/`
            let prefix = if prefix.ends_with('/') {
                prefix
            } else {
                format!("{prefix}/")
            };

            // ----- establish connection -----
            let mut client = if let Some(ref ep) = endpoint {
                // Prompt for password when --user is given without --password
                let auth = match (&user, &password) {
                    (Some(u), Some(p)) => Some((u.as_str(), p.as_str())),
                    (Some(_), None) => {
                        bail!("--user requires --password (or omit both to use a profile)");
                    }
                    _ => None,
                };
                println!("Connecting to {ep} …");
                connect_with_endpoint(ep, auth).await?
            } else {
                let config_path = resolve_config_path().context(
                    "Could not find etcd-gui config file. \
                     Please use --endpoint to specify the etcd address manually.",
                )?;
                println!("Found config at: {}", config_path.display());

                let config =
                    AppConfig::from_file(&config_path).context("Failed to read config file")?;

                let profile = select_profile(&config)?;
                println!("Connecting via profile \"{}\" …", profile.name);
                connect_with_profile(profile).await?
            };

            // ----- confirm before proceeding -----
            println!();
            println!("  Key prefix : {prefix}");
            println!("  Value type : {value_type}");
            println!(
                "  Count      : {count} pairs ({} categories × ~{} each)",
                CATEGORIES.len(),
                count.div_ceil(CATEGORIES.len()),
            );
            println!();

            let confirmed = Confirm::with_theme(&ColorfulTheme::default())
                .with_prompt("Proceed?")
                .default(true)
                .interact()
                .context("Failed to display confirmation prompt")?;

            if !confirmed {
                println!("Aborted.");
                return Ok(());
            }
            println!();

            // ----- generate & put -----
            println!("Connected. Populating {count} key-value pairs …\n");

            let mut rng = fake::rand::thread_rng();
            let mut success = 0usize;
            let mut errors = 0usize;
            // Per-category sequence counters
            let mut cat_seq = [0usize; CATEGORIES.len()];

            for i in 0..count {
                let cat_idx = i % CATEGORIES.len();
                let category = CATEGORIES[cat_idx];
                let seq = cat_seq[cat_idx];
                cat_seq[cat_idx] += 1;

                let key = generate_key(&prefix, category, seq);
                let value = generate_value(&mut rng, category);
                let value_bytes =
                    serde_json::to_string_pretty(&value).expect("serialisation should never fail");

                match client.put(key.clone(), value_bytes, None).await {
                    Ok(_) => {
                        success += 1;
                    }
                    Err(e) => {
                        errors += 1;
                        eprintln!("  ✗ {key}: {e}");
                    }
                }

                // Progress feedback every 10 items or at the end
                if (i + 1) % 10 == 0 || i + 1 == count {
                    println!(
                        "  [{:>width$}/{count}]",
                        i + 1,
                        width = count.to_string().len()
                    );
                }
            }

            println!("\nDone — {success} created, {errors} failed.");
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

mod generators {
    use fake::Fake;
    use fake::faker::{
        address::en::*, boolean::en::*, company::en::*, filesystem::en::*, internet::en::*,
        lorem::en::*, name::en::*, phone_number::en::*,
    };
    use fake::rand::Rng;
    use serde_json::{Value, json};

    pub fn gen_user(rng: &mut impl Rng) -> Value {
        let roles = ["admin", "user", "moderator", "viewer"];
        json!({
            "name":    Name().fake_with_rng::<String, _>(rng),
            "email":   FreeEmail().fake_with_rng::<String, _>(rng),
            "phone":   PhoneNumber().fake_with_rng::<String, _>(rng),
            "address": {
                "street": StreetName().fake_with_rng::<String, _>(rng),
                "city":   CityName().fake_with_rng::<String, _>(rng),
                "state":  StateName().fake_with_rng::<String, _>(rng),
                "zip":    ZipCode().fake_with_rng::<String, _>(rng),
            },
            "company": CompanyName().fake_with_rng::<String, _>(rng),
            "bio":     Sentence(25..75).fake_with_rng::<String, _>(rng),
            "labels":  Words(5..20).fake_with_rng::<Vec<String>, _>(rng),
            "active":  Boolean(50).fake_with_rng::<bool, _>(rng),
            "role":    roles[rng.gen_range(0..roles.len())],
        })
    }

    pub fn gen_product(rng: &mut impl Rng) -> Value {
        let cats = ["Electronics", "Books", "Clothing", "Home", "Sports", "Food"];
        json!({
            "name":        Words(10..25).fake_with_rng::<Vec<String>, _>(rng).join(" "),
            "price":       (rng.gen_range(99..99_999_u32) as f64) / 100.0,
            "category":    cats[rng.gen_range(0..cats.len())],
            "description": Sentence(25..75).fake_with_rng::<String, _>(rng),
            "sku":         format!("SKU-{:06}", rng.gen_range(0..999_999_u32)),
            "in_stock":    Boolean(70).fake_with_rng::<bool, _>(rng),
            "rating":      (rng.gen_range(10..50_u32) as f64) / 10.0,
            "highlights":  Words(10..30).fake_with_rng::<Vec<String>, _>(rng),
            "search_keywords": Words(15..40).fake_with_rng::<Vec<String>, _>(rng),
        })
    }

    pub fn gen_server(rng: &mut impl Rng) -> Value {
        let regions = [
            "us-east-1",
            "us-west-2",
            "eu-west-1",
            "ap-southeast-1",
            "ap-northeast-1",
        ];
        let statuses = ["running", "stopped", "maintenance", "degraded"];
        json!({
            "hostname":  format!("srv-{}", Word().fake_with_rng::<String, _>(rng)),
            "ip":        IPv4().fake_with_rng::<String, _>(rng),
            "port":      rng.gen_range(1024..65535_u16),
            "region":    regions[rng.gen_range(0..regions.len())],
            "status":    statuses[rng.gen_range(0..statuses.len())],
            "cpu_cores": rng.gen_range(1..128_u32),
            "memory_gb": rng.gen_range(1..512_u32),
            "os":        format!(
                             "Linux {}.{}.{}",
                             rng.gen_range(5..7_u32),
                             rng.gen_range(0..20_u32),
                             rng.gen_range(0..100_u32),
                         ),
            "tags":      Words(5..20).fake_with_rng::<Vec<String>, _>(rng),
            "installed_services": Words(10..30).fake_with_rng::<Vec<String>, _>(rng),
            "notes":     Sentence(20..60).fake_with_rng::<String, _>(rng),
        })
    }

    pub fn gen_event(rng: &mut impl Rng) -> Value {
        let levels = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
        let sources = [
            "api-gateway",
            "auth-service",
            "payment-service",
            "user-service",
            "notification-service",
        ];
        json!({
            "level":       levels[rng.gen_range(0..levels.len())],
            "message":     Sentence(15..50).fake_with_rng::<String, _>(rng),
            "source":      sources[rng.gen_range(0..sources.len())],
            "request_id":  format!(
                               "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
                               rng.gen_range(0..u32::MAX),
                               rng.gen_range(0..u16::MAX),
                               rng.gen_range(0..u16::MAX),
                               rng.gen_range(0..u16::MAX),
                               rng.gen_range(0..u64::MAX) & 0xFFFF_FFFF_FFFF,
                           ),
            "duration_ms": rng.gen_range(1..5000_u32),
            "user_agent":  UserAgent().fake_with_rng::<String, _>(rng),
            "context":     Words(10..30).fake_with_rng::<Vec<String>, _>(rng),
        })
    }

    pub fn gen_config(rng: &mut impl Rng) -> Value {
        let envs = ["production", "staging", "development"];
        json!({
            "service":     Word().fake_with_rng::<String, _>(rng),
            "version":     format!(
                               "{}.{}.{}",
                               rng.gen_range(0..10_u32),
                               rng.gen_range(0..20_u32),
                               rng.gen_range(0..100_u32),
                           ),
            "replicas":    rng.gen_range(1..10_u32),
            "environment": envs[rng.gen_range(0..envs.len())],
            "features": {
                "feature_a": Boolean(50).fake_with_rng::<bool, _>(rng),
                "feature_b": Boolean(50).fake_with_rng::<bool, _>(rng),
                "feature_c": Boolean(50).fake_with_rng::<bool, _>(rng),
            },
            "limits": {
                "max_connections":      rng.gen_range(100..10_000_u32),
                "timeout_seconds":      rng.gen_range(5..300_u32),
                "rate_limit_per_minute": rng.gen_range(60..6000_u32),
            },
            "notes":       Sentence(20..60).fake_with_rng::<String, _>(rng),
            "allowlist":   Words(10..30).fake_with_rng::<Vec<String>, _>(rng),
        })
    }

    pub fn gen_job(rng: &mut impl Rng) -> Value {
        let statuses = ["pending", "running", "completed", "failed", "cancelled"];
        let priorities = ["low", "normal", "high", "critical"];
        let types = [
            "batch_import",
            "report_generation",
            "data_migration",
            "cleanup",
            "indexing",
            "backup",
        ];
        let retries = rng.gen_range(0..5_u32);
        json!({
            "job_id":      format!("job-{:08x}", rng.gen_range(0..u32::MAX)),
            "type":        types[rng.gen_range(0..types.len())],
            "status":      statuses[rng.gen_range(0..statuses.len())],
            "priority":    priorities[rng.gen_range(0..priorities.len())],
            "progress":    rng.gen_range(0..=100_u8),
            "retries":     retries,
            "max_retries": retries + rng.gen_range(1..4_u32),
            "payload": {
                "input_file":  FilePath().fake_with_rng::<String, _>(rng),
                "output_file": FilePath().fake_with_rng::<String, _>(rng),
                "parameters":  Words(10..30).fake_with_rng::<Vec<String>, _>(rng),
                "runbook_notes": Sentence(20..60).fake_with_rng::<String, _>(rng),
            },
            "scheduled_by": FreeEmail().fake_with_rng::<String, _>(rng),
        })
    }

    pub fn gen_deployment(rng: &mut impl Rng) -> Value {
        let strategies = ["rolling", "blue-green", "canary", "recreate"];
        let statuses = ["deploying", "healthy", "degraded", "rolled_back", "pending"];
        let namespaces = [
            "default",
            "production",
            "staging",
            "kube-system",
            "monitoring",
        ];
        let replicas = rng.gen_range(1..20_u32);
        json!({
            "name":           format!("{}-app", Word().fake_with_rng::<String, _>(rng)),
            "namespace":      namespaces[rng.gen_range(0..namespaces.len())],
            "image":          format!(
                                  "registry.example.com/{}/{}:v{}.{}.{}",
                                  Word().fake_with_rng::<String, _>(rng),
                                  Word().fake_with_rng::<String, _>(rng),
                                  rng.gen_range(1..5_u32),
                                  rng.gen_range(0..30_u32),
                                  rng.gen_range(0..100_u32),
                              ),
            "strategy":       strategies[rng.gen_range(0..strategies.len())],
            "status":         statuses[rng.gen_range(0..statuses.len())],
            "replicas":       replicas,
            "ready_replicas": rng.gen_range(0..=replicas),
            "resources": {
                "cpu_request":    format!("{}m", rng.gen_range(100..2000_u32)),
                "cpu_limit":      format!("{}m", rng.gen_range(2000..8000_u32)),
                "memory_request": format!("{}Mi", rng.gen_range(128..2048_u32)),
                "memory_limit":   format!("{}Mi", rng.gen_range(2048..8192_u32)),
            },
            "labels": {
                "app":     Word().fake_with_rng::<String, _>(rng),
                "team":    Word().fake_with_rng::<String, _>(rng),
                "version": format!("v{}", rng.gen_range(1..20_u32)),
            },
        })
    }

    pub fn gen_certificate(rng: &mut impl Rng) -> Value {
        let issuers = [
            "Let's Encrypt",
            "DigiCert",
            "Comodo",
            "GeoTrust",
            "Self-Signed",
            "Vault PKI",
        ];
        let key_algos = [
            "RSA-2048",
            "RSA-4096",
            "ECDSA-P256",
            "ECDSA-P384",
            "Ed25519",
        ];
        let statuses = ["active", "expired", "revoked", "pending_renewal"];
        let domain: String = DomainSuffix().fake_with_rng(rng);
        json!({
            "common_name":     format!("*.{domain}"),
            "sans":            [
                                   format!("{domain}"),
                                   format!("*.{domain}"),
                                   format!("api.{domain}"),
                               ],
            "issuer":          issuers[rng.gen_range(0..issuers.len())],
            "key_algorithm":   key_algos[rng.gen_range(0..key_algos.len())],
            "serial_number":   format!("{:016X}", rng.gen_range(0..u64::MAX)),
            "status":          statuses[rng.gen_range(0..statuses.len())],
            "validity_days":   rng.gen_range(30..730_u32),
            "auto_renew":      Boolean(75).fake_with_rng::<bool, _>(rng),
            "fingerprint_sha256": format!(
                                   "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                                   rng.gen_range(0..=255_u8), rng.gen_range(0..=255_u8),
                                   rng.gen_range(0..=255_u8), rng.gen_range(0..=255_u8),
                                   rng.gen_range(0..=255_u8), rng.gen_range(0..=255_u8),
                                   rng.gen_range(0..=255_u8), rng.gen_range(0..=255_u8),
                               ),
        })
    }

    pub fn gen_route(rng: &mut impl Rng) -> Value {
        let methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
        let backends = [
            "user-svc",
            "order-svc",
            "catalog-svc",
            "auth-svc",
            "media-svc",
            "search-svc",
        ];
        let rate_limits = [100, 500, 1000, 5000, 10000];
        let path_parts = [
            "api", "v1", "v2", "internal", "public", "graphql", "webhook",
        ];
        let path = format!(
            "/{}/{}/{}",
            path_parts[rng.gen_range(0..path_parts.len())],
            Word().fake_with_rng::<String, _>(rng),
            if Boolean(50).fake_with_rng::<bool, _>(rng) {
                ":id".to_string()
            } else {
                Word().fake_with_rng::<String, _>(rng)
            },
        );
        let n = rng.gen_range(1..=3);
        let route_methods: Vec<&str> = (0..n)
            .map(|_| methods[rng.gen_range(0..methods.len())])
            .collect();
        json!({
            "path":           path,
            "methods":        route_methods,
            "backend":        backends[rng.gen_range(0..backends.len())],
            "backend_port":   rng.gen_range(3000..9000_u16),
            "timeout_ms":     rng.gen_range(1000..30_000_u32),
            "rate_limit_rps": rate_limits[rng.gen_range(0..rate_limits.len())],
            "auth_required":  Boolean(70).fake_with_rng::<bool, _>(rng),
            "cors_enabled":   Boolean(60).fake_with_rng::<bool, _>(rng),
            "strip_prefix":   Boolean(40).fake_with_rng::<bool, _>(rng),
            "middleware":     Words(3..15).fake_with_rng::<Vec<String>, _>(rng),
        })
    }

    pub fn gen_database(rng: &mut impl Rng) -> Value {
        let engines = [
            "PostgreSQL",
            "MySQL",
            "MongoDB",
            "Redis",
            "CockroachDB",
            "ClickHouse",
            "TiDB",
        ];
        let statuses = [
            "healthy",
            "read_only",
            "replicating",
            "recovering",
            "offline",
        ];
        let roles = ["primary", "replica", "arbiter"];
        let freqs = ["hourly", "daily", "weekly"];
        let replication_lag = if Boolean(30).fake_with_rng::<bool, _>(rng) {
            Value::Null
        } else {
            json!(rng.gen_range(0..5000_u32))
        };
        let backup_freq = freqs[rng.gen_range(0..freqs.len())];
        json!({
            "name":               format!("db-{}", Word().fake_with_rng::<String, _>(rng)),
            "engine":             engines[rng.gen_range(0..engines.len())],
            "version":            format!("{}.{}", rng.gen_range(10..17_u32), rng.gen_range(0..10_u32)),
            "host":               IPv4().fake_with_rng::<String, _>(rng),
            "port":               rng.gen_range(3306..27018_u16),
            "role":               roles[rng.gen_range(0..roles.len())],
            "status":             statuses[rng.gen_range(0..statuses.len())],
            "storage_gb":         rng.gen_range(10..5000_u32),
            "storage_used_gb":    rng.gen_range(1..4000_u32),
            "connections_active": rng.gen_range(0..500_u32),
            "connections_max":    rng.gen_range(500..5000_u32),
            "replication_lag_ms": replication_lag,
            "backup": {
                "enabled":        Boolean(85).fake_with_rng::<bool, _>(rng),
                "frequency":      backup_freq,
                "retention_days": rng.gen_range(7..90_u32),
            },
        })
    }

    pub fn gen_pipeline(rng: &mut impl Rng) -> Value {
        let statuses = [
            "queued",
            "running",
            "success",
            "failed",
            "cancelled",
            "skipped",
        ];
        let triggers = ["push", "merge_request", "schedule", "api", "tag"];
        let stages = [
            "lint",
            "test",
            "build",
            "security_scan",
            "deploy_staging",
            "integration_test",
            "deploy_prod",
        ];
        let num_stages = rng.gen_range(3..=stages.len());
        let pipeline_stages: Vec<Value> = stages[..num_stages]
            .iter()
            .map(|&stage| {
                json!({
                    "name":        stage,
                    "status":      statuses[rng.gen_range(0..statuses.len())],
                    "duration_s":  rng.gen_range(5..600_u32),
                })
            })
            .collect();
        json!({
            "pipeline_id":  rng.gen_range(10_000..99_999_u32),
            "project":      format!("{}/{}", Word().fake_with_rng::<String, _>(rng), Word().fake_with_rng::<String, _>(rng)),
            "branch":       format!("feature/{}", Word().fake_with_rng::<String, _>(rng)),
            "commit_sha":   format!("{:040x}", rng.gen_range(0..u64::MAX)),
            "trigger":      triggers[rng.gen_range(0..triggers.len())],
            "status":       statuses[rng.gen_range(0..statuses.len())],
            "stages":       pipeline_stages,
            "author":       Name().fake_with_rng::<String, _>(rng),
            "author_email": FreeEmail().fake_with_rng::<String, _>(rng),
        })
    }

    pub fn gen_iot_device(rng: &mut impl Rng) -> Value {
        let types = [
            "temperature_sensor",
            "humidity_sensor",
            "motion_detector",
            "smart_lock",
            "camera",
            "thermostat",
            "air_quality",
        ];
        let statuses = ["online", "offline", "sleeping", "firmware_update", "error"];
        let protocols = ["MQTT", "CoAP", "HTTP", "WebSocket", "BLE"];
        let reading_units = ["°C", "°F", "%RH", "lux", "ppm", "hPa"];
        let reading_unit = reading_units[rng.gen_range(0..reading_units.len())];
        let battery = if Boolean(60).fake_with_rng::<bool, _>(rng) {
            json!(rng.gen_range(5..100_u8))
        } else {
            Value::Null
        };
        json!({
            "device_id":      format!("DEV-{:06X}", rng.gen_range(0..0xFFFFFF_u32)),
            "type":           types[rng.gen_range(0..types.len())],
            "firmware":       format!("{}.{}.{}", rng.gen_range(1..5_u32), rng.gen_range(0..10_u32), rng.gen_range(0..50_u32)),
            "protocol":       protocols[rng.gen_range(0..protocols.len())],
            "status":         statuses[rng.gen_range(0..statuses.len())],
            "battery_pct":    battery,
            "signal_rssi":    rng.gen_range(-90..-20_i32),
            "location": {
                "latitude":  Latitude().fake_with_rng::<f64, _>(rng),
                "longitude": Longitude().fake_with_rng::<f64, _>(rng),
                "floor":     rng.gen_range(-2..30_i32),
            },
            "last_reading": {
                "value":  (rng.gen_range(0..10000_u32) as f64) / 100.0,
                "unit":   reading_unit,
            },
            "tags": Words(5..20).fake_with_rng::<Vec<String>, _>(rng),
        })
    }

    pub fn gen_experiment(rng: &mut impl Rng) -> Value {
        let statuses = ["draft", "running", "paused", "concluded", "archived"];
        let metrics = [
            "conversion_rate",
            "click_through",
            "revenue_per_user",
            "bounce_rate",
            "session_duration",
        ];
        let strategies = ["a_b_test", "multivariate", "multi_armed_bandit", "holdout"];
        let num_variants = rng.gen_range(10..=25_u32);
        let variants: Vec<Value> = (0..num_variants)
        .map(|i| {
            json!({
                "name":       if i == 0 { "control".to_string() } else { format!("variant_{}", (b'A' + i as u8 - 1) as char) },
                "weight_pct": rng.gen_range(5..60_u32),
                "metric":     (rng.gen_range(0..10000_u32) as f64) / 100.0,
            })
        })
        .collect();
        json!({
            "experiment_id":  format!("exp-{:06}", rng.gen_range(0..999_999_u32)),
            "name":           Sentence(10..25).fake_with_rng::<String, _>(rng),
            "hypothesis":     Sentence(25..75).fake_with_rng::<String, _>(rng),
            "strategy":       strategies[rng.gen_range(0..strategies.len())],
            "status":         statuses[rng.gen_range(0..statuses.len())],
            "target_metric":  metrics[rng.gen_range(0..metrics.len())],
            "traffic_pct":    rng.gen_range(1..100_u32),
            "variants":       variants,
            "owner":          FreeEmail().fake_with_rng::<String, _>(rng),
            "confidence":     (rng.gen_range(800..999_u32) as f64) / 1000.0,
        })
    }

    pub fn gen_invoice(rng: &mut impl Rng) -> Value {
        let statuses = ["draft", "sent", "paid", "overdue", "void", "refunded"];
        let currencies = ["USD", "EUR", "GBP", "JPY", "CNY", "CAD"];
        let num_items = rng.gen_range(5..=30_u32);
        let items: Vec<Value> = (0..num_items)
            .map(|_| {
                let qty = rng.gen_range(1..20_u32);
                let price = (rng.gen_range(500..50_000_u32) as f64) / 100.0;
                json!({
                    "description": Sentence(10..30).fake_with_rng::<String, _>(rng),
                    "quantity":    qty,
                    "unit_price":  price,
                    "total":       (qty as f64) * price,
                })
            })
            .collect();
        let subtotal: f64 = items
            .iter()
            .map(|i| i["total"].as_f64().unwrap_or(0.0))
            .sum();
        let tax_rates = [0.0, 0.05, 0.07, 0.10, 0.19, 0.21];
        let tax_rate = tax_rates[rng.gen_range(0..tax_rates.len())];
        let notes = if Boolean(40).fake_with_rng::<bool, _>(rng) {
            json!(Sentence(15..40).fake_with_rng::<String, _>(rng))
        } else {
            Value::Null
        };
        json!({
            "invoice_number": format!("INV-{}-{:05}", rng.gen_range(2024..2027_u32), rng.gen_range(0..99_999_u32)),
            "status":         statuses[rng.gen_range(0..statuses.len())],
            "currency":       currencies[rng.gen_range(0..currencies.len())],
            "customer": {
                "name":    CompanyName().fake_with_rng::<String, _>(rng),
                "email":   FreeEmail().fake_with_rng::<String, _>(rng),
                "address": format!("{}, {}", StreetName().fake_with_rng::<String, _>(rng), CityName().fake_with_rng::<String, _>(rng)),
            },
            "items":    items,
            "subtotal": (subtotal * 100.0).round() / 100.0,
            "tax_rate": tax_rate,
            "tax":      ((subtotal * tax_rate) * 100.0).round() / 100.0,
            "total":    ((subtotal * (1.0 + tax_rate)) * 100.0).round() / 100.0,
            "notes":    notes,
        })
    }

    pub fn gen_policy(rng: &mut impl Rng) -> Value {
        let effects = ["allow", "deny"];
        let resources = [
            "pods",
            "deployments",
            "services",
            "secrets",
            "configmaps",
            "namespaces",
            "ingresses",
            "nodes",
        ];
        let actions = [
            "create", "read", "update", "delete", "list", "watch", "exec",
        ];
        let scopes = ["cluster", "namespace", "resource"];
        let num_rules = rng.gen_range(5..=20_u32);
        let rules: Vec<Value> = (0..num_rules)
            .map(|_| {
                let num_actions = rng.gen_range(1..=4);
                let rule_actions: Vec<&str> = (0..num_actions)
                    .map(|_| actions[rng.gen_range(0..actions.len())])
                    .collect();
                json!({
                    "effect":    effects[rng.gen_range(0..effects.len())],
                    "resources": [resources[rng.gen_range(0..resources.len())]],
                    "actions":   rule_actions,
                })
            })
            .collect();
        json!({
        "policy_id":   format!("pol-{:06x}", rng.gen_range(0..0xFFFFFF_u32)),
        "name":        format!("{}-policy", Word().fake_with_rng::<String, _>(rng)),
        "description": Sentence(25..60).fake_with_rng::<String, _>(rng),
        "scope":       scopes[rng.gen_range(0..scopes.len())],
        "enabled":     Boolean(80).fake_with_rng::<bool, _>(rng),
        "rules":       rules,
        "subjects": {
            "users":  (0..rng.gen_range(0..15_u32)).map(|_| FreeEmail().fake_with_rng::<String, _>(rng)).collect::<Vec<String>>(),
            "groups": Words(5..15).fake_with_rng::<Vec<String>, _>(rng),
        },
        "priority":    rng.gen_range(1..1000_u32),
        })
    }
}

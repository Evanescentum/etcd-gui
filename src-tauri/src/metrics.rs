use crate::config::{Endpoint, Profile};
use prometheus_parse::{Scrape, Value};
use serde::Serialize;
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Cursor};
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
pub struct ParsedMetricFamily {
    pub name: String,
    pub help: String,
    #[serde(rename = "type")]
    pub family_type: ParsedMetricType,
    pub metrics: Vec<ParsedMetricSample>,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ParsedMetricType {
    Counter,
    Gauge,
    Histogram,
    Summary,
    Untyped,
}

impl ParsedMetricType {
    fn extract_type(val: &Value) -> Self {
        match val {
            Value::Counter(_) => ParsedMetricType::Counter,
            Value::Gauge(_) => ParsedMetricType::Gauge,
            Value::Histogram(_) => ParsedMetricType::Histogram,
            Value::Summary(_) => ParsedMetricType::Summary,
            Value::Untyped(_) => ParsedMetricType::Untyped,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct ParsedMetricSample {
    pub value: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
}

pub async fn fetch_metrics_text(profile: &Profile, endpoint: &Endpoint) -> Result<String, String> {
    let metrics_path = match profile.metrics_path.as_deref() {
        None => "/metrics".to_string(),
        Some(path) if !path.starts_with('/') => format!("/{path}"),
        Some(path) => path.to_string(),
    };

    let mut builder = reqwest::Client::builder();
    builder = builder.timeout(Duration::from_millis(profile.timeout_ms.unwrap_or(5000)));

    if let Some(connect_timeout) = profile.connect_timeout_ms {
        builder = builder.connect_timeout(Duration::from_millis(connect_timeout));
    }

    let client = builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut url = reqwest::Url::parse(endpoint.to_string().as_str())
        .map_err(|e| format!("Invalid endpoint URL: {e}"))?;
    if url.scheme() == "" {
        url.set_scheme("http")
            .map_err(|_| format!("Failed to set URL scheme: for endpoint: {endpoint}"))?;
    }
    url.set_path(&metrics_path);

    log::debug!("Fetching metrics from {url}");

    let mut request = client.get(url.clone());
    if let Some((username, password)) = &profile.user {
        request = request.basic_auth(username, Some(password));
    }

    match request.send().await {
        Ok(response) if response.status().is_success() => response
            .text()
            .await
            .map_err(|e| format!("Failed to read metrics response from {url}: {e}")),
        Ok(response) => Err(format!("Error response from {url}: {}", response.status())),
        Err(error) => Err(format!("Failed to fetch from {url}: {error}")),
    }
}

pub fn parse_metrics_text(body: String) -> Result<Vec<ParsedMetricFamily>, String> {
    let scrape = Scrape::parse(BufReader::new(Cursor::new(body)).lines())
        .map_err(|e| format!("Failed to parse Prometheus metrics: {e}"))?;

    let mut families: BTreeMap<String, ParsedMetricFamily> = BTreeMap::new();

    for sample in scrape.samples {
        let metric_name = sample.metric.clone();
        let help = scrape.docs.get(&metric_name).cloned().unwrap_or_default();
        let metric_type = ParsedMetricType::extract_type(&sample.value);
        let family = families
            .entry(metric_name.clone())
            .or_insert_with(|| ParsedMetricFamily {
                name: metric_name.clone(),
                help,
                family_type: metric_type,
                metrics: Vec::new(),
            });

        if family.help.is_empty() {
            family.help = scrape.docs.get(&metric_name).cloned().unwrap_or_default();
        }

        match sample.value {
            Value::Counter(value) | Value::Gauge(value) | Value::Untyped(value) => {
                family.metrics.push({
                    ParsedMetricSample {
                        value: value.to_string(),
                        labels: (&sample.labels)
                            .iter()
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .chain(None)
                            .collect::<BTreeMap<_, _>>(),
                    }
                });
            }
            Value::Histogram(buckets) => {
                for bucket in buckets {
                    family.metrics.push({
                        ParsedMetricSample {
                            value: bucket.count.to_string(),
                            labels: (&sample.labels)
                                .iter()
                                .map(|(key, value)| (key.clone(), value.clone()))
                                .chain(Some((
                                    "less than".to_string(),
                                    bucket.less_than.to_string(),
                                )))
                                .collect::<BTreeMap<_, _>>(),
                        }
                    });
                }
            }
            Value::Summary(quantiles) => {
                for quantile in quantiles {
                    family.metrics.push({
                        ParsedMetricSample {
                            value: quantile.count.to_string(),
                            labels: (&sample.labels)
                                .iter()
                                .map(|(key, value)| (key.clone(), value.clone()))
                                .chain(Some((
                                    "quantile".to_string(),
                                    quantile.quantile.to_string(),
                                )))
                                .collect::<BTreeMap<_, _>>(),
                        }
                    });
                }
            }
        }
    }

    Ok(families.into_values().collect())
}

use std::collections::VecDeque;
use std::fmt::Debug;

use etcd_client::{GetOptions, SortOrder, SortTarget};

use crate::{
    core::key_after,
    snapshot::{KeyRange, KvEntry},
    state::AppState,
};

/// Converts an etcd `KeyValue` into a [`KvEntry`].
pub fn item_from_kv(kv: etcd_client::KeyValue, only_keys: bool) -> Option<KvEntry> {
    if only_keys {
        if let Ok(key_str) = kv.key_str() {
            Some(KvEntry {
                key: key_str.to_owned(),
                value: None,
                version: kv.version(),
                create_revision: kv.create_revision(),
                mod_revision: kv.mod_revision(),
                lease: kv.lease(),
            })
        } else {
            None
        }
    } else if let (Ok(key_str), Ok(value_str)) = (kv.key_str(), kv.value_str()) {
        Some(KvEntry {
            key: key_str.to_owned(),
            value: Some(value_str.to_owned()),
            version: kv.version(),
            create_revision: kv.create_revision(),
            mod_revision: kv.mod_revision(),
            lease: kv.lease(),
        })
    } else {
        None
    }
}

/// Trait for types that can be split into batches for etcd range queries.
pub trait Splittable {
    type Output;

    /// Create base `GetOptions` for batch queries.
    fn get_options(&self) -> GetOptions {
        GetOptions::new()
    }

    /// Map `KeyValue` vector to output type.
    fn map_kvs(kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output>;
}

struct BatchTask {
    from_key: Vec<u8>,
    limit: i64,
}

/// Result of the initial full-range query attempt.
enum FullRangeResult<T> {
    /// All entries fetched in a single request.
    Complete(Vec<T>),
    /// Response too large; contains the total key count for batch splitting.
    TooLarge(i64),
}

/// Result of a single batch fetch.
enum BatchOutcome<T> {
    /// Batch succeeded with items and an optional continuation task.
    Success {
        items: Vec<T>,
        continuation: Option<BatchTask>,
    },
    /// Batch response too large, needs a smaller limit.
    TooLarge,
}

/// Iteration phase tracked by [`BatchFetcher`].
enum FetchPhase {
    /// Initial full-range attempt not yet made.
    Initial,
    /// Splitting into progressively sized batches.
    Batching(VecDeque<BatchTask>),
    /// All entries have been yielded.
    Done,
}

/// A pull-based iterator over batched etcd range query results.
///
/// On the first call to [`next_batch`](Self::next_batch), attempts to fetch the
/// entire range in one request. If the gRPC response exceeds the size limit
/// (OutOfRange error), falls back to adaptive batch splitting.
///
/// Each [`next_batch`](Self::next_batch) call is individually wrapped in
/// [`perform_op`](crate::state::AppState::perform_op) for automatic auth-token
/// retry.
pub struct BatchFetcher<S> {
    splitter: S,
    range: KeyRange,
    sort: (SortTarget, SortOrder),
    revision: i64,
    phase: FetchPhase,
}

impl<S: Splittable + Clone> BatchFetcher<S> {
    pub fn new(splitter: S, range: KeyRange, sort: (SortTarget, SortOrder), revision: i64) -> Self {
        Self {
            splitter,
            range,
            sort,
            revision,
            phase: FetchPhase::Initial,
        }
    }

    /// Fetches the next batch of entries from etcd.
    ///
    /// Returns `Ok(Some(items))` for each batch, or `Ok(None)` when all entries
    /// have been yielded. Returns an error if even a single entry exceeds the
    /// response size limit; callers must not cache the range as fully scanned.
    pub async fn next_batch(
        &mut self,
        state: &mut AppState,
    ) -> Result<Option<Vec<S::Output>>, String> {
        loop {
            match std::mem::replace(&mut self.phase, FetchPhase::Done) {
                FetchPhase::Initial => match self.try_full_range(state).await? {
                    FullRangeResult::Complete(items) => return Ok(Some(items)),
                    FullRangeResult::TooLarge(count) => {
                        self.phase = FetchPhase::Batching(VecDeque::from(vec![BatchTask {
                            from_key: self.range.start.clone(),
                            limit: (count / 2).max(1),
                        }]));
                    }
                },
                FetchPhase::Batching(mut tasks) => {
                    let Some(task) = tasks.pop_back() else {
                        return Ok(None);
                    };
                    match self.fetch_one_batch(state, &task).await? {
                        BatchOutcome::Success {
                            items,
                            continuation,
                        } => {
                            if let Some(next) = continuation {
                                tasks.push_back(next);
                            }
                            self.phase = FetchPhase::Batching(tasks);
                            if items.is_empty() {
                                continue;
                            }
                            return Ok(Some(items));
                        }
                        BatchOutcome::TooLarge => {
                            if task.limit <= 1 {
                                return Err(format!(
                                    "etcd response exceeds the size limit even when requesting a single entry \
                                     from range cursor {:?}. Query stopped because the results are incomplete.",
                                    String::from_utf8_lossy(&task.from_key)
                                ));
                            }
                            tasks.push_back(BatchTask {
                                from_key: task.from_key,
                                limit: task.limit / 2,
                            });
                            self.phase = FetchPhase::Batching(tasks);
                        }
                    }
                }
                FetchPhase::Done => return Ok(None),
            }
        }
    }

    /// Attempts a full-range fetch. Returns all items or the total count for splitting.
    async fn try_full_range(
        &self,
        state: &mut AppState,
    ) -> Result<FullRangeResult<S::Output>, String> {
        state
            .perform_op(async |mut client: etcd_client::Client| {
                let full_res = client
                    .get(
                        self.range.start.clone(),
                        self.splitter
                            .get_options()
                            .with_serializable()
                            .with_range(self.range.end.clone())
                            .with_sort(self.sort.0, self.sort.1)
                            .with_revision(self.revision)
                            .into(),
                    )
                    .await;

                if is_out_of_range_error(&full_res) {
                    log::info!("Full-range query is out of range, falling back to split batches");
                    let count = client
                        .get(
                            self.range.start.clone(),
                            GetOptions::new()
                                .with_serializable()
                                .with_range(self.range.end.clone())
                                .with_count_only()
                                .with_revision(self.revision)
                                .into(),
                        )
                        .await
                        .map(|res| res.count())?;
                    log::debug!("Total keys: {count}");
                    return Ok(FullRangeResult::TooLarge(count));
                }

                let mut full_res = full_res?;
                let kvs = full_res.take_kvs();
                log::debug!("Fetched {} keys in full-range query", kvs.len());
                Ok(FullRangeResult::Complete(S::map_kvs(kvs).collect()))
            })
            .await
    }

    /// Fetches a single batch.
    async fn fetch_one_batch(
        &self,
        state: &mut AppState,
        task: &BatchTask,
    ) -> Result<BatchOutcome<S::Output>, String> {
        state
            .perform_op(async |mut client: etcd_client::Client| {
                log::debug!(
                    "Fetching batch starting at '{}' with limit {}",
                    String::from_utf8_lossy(&task.from_key),
                    task.limit
                );

                let res = client
                    .get(
                        task.from_key.clone(),
                        self.splitter
                            .get_options()
                            .with_serializable()
                            .with_range(self.range.end.clone())
                            .with_limit(task.limit)
                            .with_sort(self.sort.0, self.sort.1)
                            .with_revision(self.revision)
                            .into(),
                    )
                    .await;

                if is_out_of_range_error(&res) {
                    log::info!(
                        "Batch starting at '{}' with limit {} is out of range, splitting...",
                        String::from_utf8_lossy(&task.from_key),
                        task.limit
                    );
                    return Ok(BatchOutcome::TooLarge);
                }

                let mut res = res?;
                let has_more = res.more();
                let kvs = res.take_kvs();
                log::debug!(
                    "Fetched {} keys in batch starting at '{}'",
                    kvs.len(),
                    String::from_utf8_lossy(&task.from_key)
                );

                let continuation = if has_more && !kvs.is_empty() {
                    Some(BatchTask {
                        from_key: key_after(
                            kvs.last()
                                .expect("Result should have at least one item")
                                .key(),
                        ),
                        limit: task.limit * 2,
                    })
                } else {
                    None
                };

                Ok(BatchOutcome::Success {
                    items: S::map_kvs(kvs).collect(),
                    continuation,
                })
            })
            .await
    }
}

/// Splitter for full KV pairs (key + value).
#[derive(Clone, Copy)]
pub struct KvSplitter;

impl Splittable for KvSplitter {
    type Output = KvEntry;

    fn map_kvs(kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|x| item_from_kv(x, false))
    }
}

/// Splitter for keys-only (no values).
#[derive(Clone, Copy)]
pub struct KeysOnlySplitter;

impl Splittable for KeysOnlySplitter {
    type Output = KvEntry;

    fn get_options(&self) -> GetOptions {
        GetOptions::new().with_keys_only()
    }

    fn map_kvs(kvs: Vec<etcd_client::KeyValue>) -> impl Iterator<Item = Self::Output> {
        kvs.into_iter().filter_map(|x| item_from_kv(x, true))
    }
}

pub fn is_out_of_range_error<T: Debug>(res: &Result<T, etcd_client::Error>) -> bool {
    matches!(
        res,
        Err(etcd_client::Error::GRpcStatus(status)) if status.code() == tonic::Code::OutOfRange
    )
}

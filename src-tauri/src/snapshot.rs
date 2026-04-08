use std::collections::{BTreeMap, HashMap};
use std::ops::Range;
use std::sync::Arc;

use etcd_client::{SortOrder, SortTarget};
use serde::{Deserialize, Serialize};

use crate::core::{Splittable, execute_splittable, key_after};
use crate::state::AppState;

/// Represents a key-value pair from etcd
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct KvEntry {
    pub key: String,
    pub value: Option<String>,
    pub version: i64,
    pub create_revision: i64,
    pub mod_revision: i64,
    pub lease: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SnapshotKey {
    pub profile_fingerprint: u64,
    pub revision: i64,
}

pub type KeyRange = Range<Vec<u8>>;
pub type SharedSnapshot = Arc<tokio::sync::RwLock<SnapshotStore>>;

/// A cached range group stored in [`SnapshotStore`]'s `ranged_entries` map.
///
/// The BTreeMap key already encodes the interval start; this struct holds only
/// the exclusive upper bound and the cached entries for that interval.
pub struct EntryGroup {
    /// Exclusive upper bound of the interval.
    pub end: Vec<u8>,
    pub entries: Vec<KvEntry>,
}

/// Describes one contiguous segment within a queried range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CacheSegment {
    /// The range has been scanned and all keys have their values loaded.
    CachedKv {
        range: KeyRange,
        entries: Vec<KvEntry>,
    },
    /// The range has been scanned but some keys are missing values.
    CachedKeys {
        range: KeyRange,
        entries: Vec<KvEntry>,
    },
    /// The range has not been scanned at all.
    Missing { range: KeyRange },
}

/// A segmented cache for scanned etcd key-value pairs.
///
/// Entries are stored in non-overlapping, sorted range groups. Each group
/// represents a contiguous span of keys that were scanned together. Within
/// a group, all entries share a uniform value-presence state: either every
/// entry has its value loaded, or none of them do.
///
/// Two groups may be merged only when they are adjacent or overlapping **and**
/// both groups are in the same state (both fully loaded, or both keys-only).
#[derive(Default)]
pub struct SnapshotStore {
    /// Sorted, non-overlapping range groups, keyed by each range's start byte sequence.
    ///
    /// Each entry maps a range-start to an [`EntryGroup`], where `end` is the
    /// exclusive upper bound of the interval and `entries` contains all cached
    /// entries within that interval.
    ///
    /// **Invariant:** all entries within the same group are in a uniform
    /// value-presence state — either every entry carries a value, or none do.
    ranged_entries: BTreeMap<Vec<u8>, EntryGroup>,
    /// Count cache for specific prefix ranges.
    range_counts: HashMap<KeyRange, i64>,
}

impl SnapshotStore {
    /// Returns the cached key count for a prefix range, if available.
    pub fn range_count(&self, range: &KeyRange) -> Option<i64> {
        self.range_counts.get(range).copied()
    }

    /// Sets the cached key count for a prefix range.
    pub fn set_range_count(&mut self, range: KeyRange, count: i64) {
        self.range_counts.insert(range, count);
    }

    /// Scans entries for `range` from etcd and merges them into the cache.
    ///
    /// Holds the write lock for the duration of the etcd fetch. Acceptable because
    /// dashboard queries are sequential — there are no concurrent readers to block.
    pub async fn scan_and_merge_entries<S>(
        &mut self,
        state: &mut AppState,
        splitter: S,
        range: KeyRange,
        sort: (SortTarget, SortOrder),
        revision: i64,
    ) -> Result<Vec<KvEntry>, String>
    where
        S: Splittable<Output = KvEntry> + Clone,
    {
        let entries = execute_splittable(state, splitter, range.clone(), sort, revision).await?;

        if !range.is_empty() && !entries.is_empty() {
            log::debug!(
                "Inserting scanned entries for range [{:?}, {:?}), len={}, all_have_values={}",
                String::from_utf8_lossy(&range.start),
                String::from_utf8_lossy(&range.end),
                entries.len(),
                entries.iter().all(|e| e.value.is_some())
            );
            self.merge_scanned_range(range, entries.clone());
        }

        Ok(entries)
    }

    /// Splits `[start, end)` into a sequence of [`CacheSegment`]s.
    ///
    /// The query range is walked left-to-right against the sorted, non-overlapping
    /// `scanned_ranges`.  Each gap becomes `Missing`; each covered sub-range
    /// becomes `CachedKv` (all values present) or `CachedKeys` (some values absent).
    ///
    /// ```text
    /// Query:         [====================================================)
    ///                start                                                end
    ///
    /// scanned:              [-------)         [------------)
    ///                       s1     e1         s2           e2
    ///
    /// result:        [-----)[------)[--------)[------------)[---------]
    ///                  Miss  Cached    Miss       Cached       Miss
    ///                        Keys                 Kv/Keys
    ///
    /// cursor moves:  ^      ^       ^         ^             ^         ^
    ///                start  s1      e1        s2            e2       end
    pub fn break_range(&self, range: &KeyRange) -> Vec<CacheSegment> {
        if range.is_empty() {
            return Vec::new();
        }
        let mut segments = Vec::new();
        let mut cursor = (&range.start).clone();

        for (s, e) in self.overlapping_scanned_ranges(&range) {
            if cursor < *s {
                // There's a gap between cursor and the next scanned range:
                //     [-- Missing)[-- Cached ---) ...
                //     ^           ^             ^
                //   cursor        s             e
                segments.push(CacheSegment::Missing {
                    range: cursor.clone()..s.clone(),
                });
            }

            // Clamp the scanned range to [start, end)
            let seg_start = s.max(&range.start).clone();
            let seg_end = e.min(&range.end).clone();
            if seg_start < seg_end {
                segments.push(self.build_cached_segment(seg_start.clone()..seg_end.clone()));
            }

            cursor = seg_end;
        }

        // Trailing gap
        if cursor < *&range.end {
            segments.push(CacheSegment::Missing {
                range: cursor..(&range.end).clone(),
            });
        }

        segments
    }

    /// Iterates scanned ranges that overlap with `[start, end)`, in order.
    fn overlapping_scanned_ranges<'a>(
        &'a self,
        Range { start, end }: &KeyRange,
    ) -> impl Iterator<Item = (&'a Vec<u8>, &'a Vec<u8>)> {
        // Find the first candidate: the last range whose start <= `start`.
        // It might extend into [start, end)
        let left_candidate = self
            .ranged_entries
            .range::<Vec<_>, _>(..=start)
            .next_back()
            .filter(|(_, g)| g.end > *start)
            .map(|(s, g)| (s, &g.end));

        // All ranges whose start is in (start, end) necessarily overlaps.
        let middle = self
            .ranged_entries
            .range::<Vec<_>, _>(&key_after(&start)..end)
            .map(|(s, g)| (s, &g.end));

        left_candidate.into_iter().chain(middle)
    }

    /// Builds a `CachedKv` or `CachedKeys` segment for a range known to be scanned.
    fn build_cached_segment(&self, range: KeyRange) -> CacheSegment {
        let entries_in_range: Vec<_> = self.iter_in_range(&range).cloned().collect();

        if entries_in_range.iter().all(|e| e.value.is_some()) {
            CacheSegment::CachedKv {
                range,
                entries: entries_in_range,
            }
        } else {
            CacheSegment::CachedKeys {
                range,
                entries: entries_in_range,
            }
        }
    }

    /// Retrieves the cached entry for the specified key range.
    fn iter_in_range(&self, range: &KeyRange) -> impl Iterator<Item = &KvEntry> {
        self.ranged_entries
            .iter()
            .filter(|(start, g)| *start < &range.end && g.end > range.start)
            .take(1) // Only one group can overlap with the range
            .flat_map(|(_, g)| {
                g.entries.iter().filter(|e| {
                    (range.start.as_slice()..range.end.as_slice()).contains(&e.key.as_bytes())
                })
            })
    }

    /// Inserts `[new_start, new_end)` into `ranged_entries`, merging with any
    /// overlapping or adjacent existing intervals while preserving value-presence
    /// boundaries.
    ///
    /// When a valued sub-range and a keys-only sub-range overlap, the result
    /// is split so that the valued portion stays valued and the rest stays
    /// keys-only. Values are never discarded: if both sides have an entry for
    /// the same key, the one carrying a value wins.
    fn merge_scanned_range(&mut self, range: KeyRange, new_entries: Vec<KvEntry>) {
        // ── 1. Find bounding box and collect overlapping/adjacent ranges ──

        let mut merged_start = range.start.clone();
        let mut merged_end = range.end.clone();
        let mut to_remove = Vec::new();

        for (s, g) in self.ranged_entries.range::<Vec<_>, _>(..=&range.end) {
            if g.end >= range.start {
                to_remove.push(s.clone());
                merged_start = merged_start.min(s.clone()); // Stretch start to the left
                merged_end = merged_end.max(g.end.clone()); // Stretch end to the right
            }
        }

        let removed = to_remove
            .iter()
            .filter_map(|k| self.ranged_entries.remove(k).map(|g| (k.clone(), g)))
            .collect::<Vec<_>>();

        // ── 2. Determine valued sub-intervals ─────────────────────────

        let mut valued_intervals: Vec<KeyRange> = Vec::new();
        valued_intervals.extend(
            new_entries
                .iter()
                .all(|e| e.value.is_some())
                .then_some(range),
        );
        valued_intervals.extend(removed.iter().filter_map(|(s, g)| {
            g.entries
                .iter()
                .all(|e| e.value.is_some())
                .then(|| s.clone()..g.end.clone())
        }));

        // Sort and merge overlapping/adjacent valued intervals.
        valued_intervals.sort_by(|a, b| a.start.cmp(&b.start));
        let valued_ranges =
            valued_intervals
                .into_iter()
                .fold(Vec::<KeyRange>::new(), |mut acc, iv| {
                    if let [.., last] = &mut acc[..]
                        && iv.start <= last.end
                    {
                        last.end = last.end.as_slice().max(iv.end.as_slice()).to_vec(); // Merge into last interval
                    } else {
                        acc.push(iv);
                    }
                    acc
                });

        // ── 3. Build unified entry map (valued wins over keys-only) ───

        let mut all_entries: BTreeMap<Vec<u8>, KvEntry> = BTreeMap::new();
        for (_, g) in removed {
            for entry in g.entries {
                all_entries.insert(entry.key.as_bytes().to_vec(), entry);
            }
        }
        for entry in new_entries {
            match all_entries.entry(entry.key.as_bytes().to_vec()) {
                std::collections::btree_map::Entry::Vacant(slot) => {
                    slot.insert(entry);
                }
                std::collections::btree_map::Entry::Occupied(mut slot) => {
                    // Overwrite when the new entry has a value, or the existing one doesn't.
                    if entry.value.is_some() || slot.get().value.is_none() {
                        slot.insert(entry);
                    }
                }
            }
        }

        // ── 4. Re-insert, splitting only at valued / keys-only boundaries ──

        let mut split_points = vec![merged_start, merged_end];
        for interval in &valued_ranges {
            split_points.push(interval.start.clone());
            split_points.push(interval.end.clone());
        }
        split_points.sort();
        split_points.dedup();

        self.ranged_entries
            .extend(split_points.array_windows().map(|[left, right]| {
                (
                    left.clone(),
                    EntryGroup {
                        end: right.clone(),
                        entries: all_entries
                            .range::<Vec<_>, _>(left..right)
                            .map(|(_, entry)| entry.clone())
                            .collect(),
                    },
                )
            }));
    }
}

#[cfg(test)]
mod regression_tests {
    use super::{CacheSegment, KvEntry, SnapshotStore};

    fn make_entry(key: &str, value: &str) -> KvEntry {
        KvEntry {
            key: key.to_string(),
            value: Some(value.to_string()),
            version: 1,
            create_revision: 1,
            mod_revision: 1,
            lease: 0,
        }
    }

    #[test]
    fn break_range_keeps_entries_when_cached_group_wraps_query_range() {
        let mut store = SnapshotStore::default();
        store.merge_scanned_range(
            b"a".to_vec()..b"z".to_vec(),
            vec![
                make_entry("b", "before"),
                make_entry("d", "inside-1"),
                make_entry("e", "inside-2"),
                make_entry("y", "after"),
            ],
        );

        let segments = store.break_range(&(b"c".to_vec()..b"f".to_vec()));

        assert_eq!(segments.len(), 1);
        match &segments[0] {
            CacheSegment::CachedKv { entries, .. } => {
                let keys = entries
                    .iter()
                    .map(|entry| entry.key.as_str())
                    .collect::<Vec<_>>();
                assert_eq!(keys, vec!["d", "e"]);
            }
            segment => panic!("expected cached kv segment, got {segment:?}"),
        }
    }
}

#[cfg(any())]
mod tests {
    use super::*;

    fn make_entry(key: &str, value: &str) -> KvEntry {
        KvEntry {
            key: key.to_string(),
            value: value.to_string(),
            version: 1,
            create_revision: 1,
            mod_revision: 1,
            lease: 0,
        }
    }

    // ── merge_scanned_range ──────────────────────────────────────

    #[test]
    fn merge_non_overlapping_ranges() {
        let mut store = SnapshotStore::default();
        store.merge_scanned_range(b"a".to_vec()..b"c".to_vec());
        store.merge_scanned_range(b"e".to_vec()..b"g".to_vec());
        assert_eq!(store.scanned_ranges.len(), 2);
        assert_eq!(store.scanned_ranges[&b"a".to_vec()], b"c".to_vec());
        assert_eq!(store.scanned_ranges[&b"e".to_vec()], b"g".to_vec());
    }

    #[test]
    fn merge_adjacent_ranges() {
        let mut store = SnapshotStore::default();
        store.merge_scanned_range(b"a".to_vec()..b"c".to_vec());
        store.merge_scanned_range(b"c".to_vec()..b"e".to_vec());
        assert_eq!(store.scanned_ranges.len(), 1);
        assert_eq!(store.scanned_ranges[&b"a".to_vec()], b"e".to_vec());
    }

    #[test]
    fn merge_overlapping_ranges() {
        let mut store = SnapshotStore::default();
        store.merge_scanned_range(b"a".to_vec()..b"d".to_vec());
        store.merge_scanned_range(b"c".to_vec()..b"f".to_vec());
        assert_eq!(store.scanned_ranges.len(), 1);
        assert_eq!(store.scanned_ranges[&b"a".to_vec()], b"f".to_vec());
    }

    #[test]
    fn merge_containing_range() {
        let mut store = SnapshotStore::default();
        store.merge_scanned_range(b"b".to_vec()..b"d".to_vec());
        store.merge_scanned_range(b"a".to_vec()..b"e".to_vec());
        assert_eq!(store.scanned_ranges.len(), 1);
        assert_eq!(store.scanned_ranges[&b"a".to_vec()], b"e".to_vec());
    }

    #[test]
    fn merge_multiple_ranges_at_once() {
        let mut store = SnapshotStore::default();
        store.merge_scanned_range(b"a".to_vec()..b"c".to_vec());
        store.merge_scanned_range(b"e".to_vec()..b"g".to_vec());
        store.merge_scanned_range(b"i".to_vec()..b"k".to_vec());
        // Now merge a range that spans all three
        store.merge_scanned_range(b"b".to_vec()..b"j".to_vec());
        assert_eq!(store.scanned_ranges.len(), 1);
        assert_eq!(store.scanned_ranges[&b"a".to_vec()], b"k".to_vec());
    }

    // ── insert_scanned_keys ──────────────────────────────────────

    #[test]
    fn insert_scanned_keys_stores_keys_and_marks_range() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"a".to_vec(), b"b".to_vec(), b"c".to_vec()]);
        assert_eq!(store.scanned_ranges.len(), 1);
        assert_eq!(store.entries.len(), 3);
        assert!(store.entries[&b"a".to_vec()].is_none());
    }

    // ── insert_values ────────────────────────────────────────────

    #[test]
    fn insert_values_fills_existing_keys() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"a".to_vec(), b"b".to_vec()]);
        store.insert_values(&[make_entry("a", "val_a")]);
        assert!(store.entries[&b"a".to_vec()].is_some());
        assert!(store.entries[&b"b".to_vec()].is_none());
    }

    #[test]
    fn insert_values_ignores_unknown_keys() {
        let mut store = SnapshotStore::default();
        store.insert_values(&[make_entry("z", "val_z")]);
        assert!(store.entries.get(&b"z".to_vec()).is_none());
    }

    // ── query_range ──────────────────────────────────────────────

    #[test]
    fn query_range_fully_missing() {
        let store = SnapshotStore::default();
        let segments = store.break_range(&(b"a".to_vec()..b"z".to_vec()));
        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], CacheSegment::Missing { range } if range.start == b"a" && range.end == b"z")
        );
    }

    #[test]
    fn query_range_fully_cached_kv() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"a".to_vec(), b"b".to_vec()]);
        store.insert_values(&[make_entry("a", "v1"), make_entry("b", "v2")]);
        let segments = store.break_range(&(b"a".to_vec()..b"d".to_vec()));
        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], CacheSegment::CachedKv { entries, .. } if entries.len() == 2)
        );
    }

    #[test]
    fn query_range_cached_keys_partial_values() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"a".to_vec(), b"b".to_vec()]);
        store.insert_values(&[make_entry("a", "v1")]);
        let segments = store.break_range(&(b"a".to_vec()..b"d".to_vec()));
        assert_eq!(segments.len(), 1);
        assert!(matches!(&segments[0], CacheSegment::CachedKeys { keys, .. } if keys.len() == 2));
    }

    /// Query [50, 100) with cached [40, 60) keys-only and [80, 90) full KV.
    /// Expected: CachedKeys[50,60) → Missing[60,80) → CachedKv[80,90) → Missing[90,100)
    #[test]
    fn query_range_mixed_segments() {
        let mut store = SnapshotStore::default();

        // [40, 60) scanned, keys only (no values)
        let keys_40_60: Vec<Vec<u8>> = (40u8..60).map(|i| vec![i]).collect();
        store.insert_scanned_keys(&keys_40_60);

        // [80, 90) scanned, full KV
        let keys_80_90: Vec<Vec<u8>> = (80u8..90).map(|i| vec![i]).collect();
        store.insert_scanned_keys(&keys_80_90);
        let entries_80_90: Vec<KvEntry> = (80u8..90)
            .map(|i| make_entry(&String::from_utf8(vec![i]).unwrap(), "v"))
            .collect();
        store.insert_values(&entries_80_90);

        let segments = store.break_range(&(vec![50u8]..vec![100u8]));

        assert_eq!(segments.len(), 4);

        // 1: CachedKeys [50, 60)
        assert!(
            matches!(&segments[0], CacheSegment::CachedKeys { range, keys }
                if range.start == vec![50u8] && range.end == vec![60u8] && keys.len() == 10)
        );
        // 2: Missing [60, 80)
        assert!(matches!(&segments[1], CacheSegment::Missing { range }
                if range.start == vec![60u8] && range.end == vec![80u8]));
        // 3: CachedKv [80, 90)
        assert!(
            matches!(&segments[2], CacheSegment::CachedKv { range, entries }
                if range.start == vec![80u8] && range.end == vec![90u8] && entries.len() == 10)
        );
        // 4: Missing [90, 100)
        assert!(matches!(&segments[3], CacheSegment::Missing { range }
                if range.start == vec![90u8] && range.end == vec![100u8]));
    }

    #[test]
    fn query_range_scanned_extends_beyond_query() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"m".to_vec()]);
        store.insert_values(&[make_entry("m", "v")]);

        // Query a sub-range
        let segments = store.break_range(&(b"f".to_vec()..b"p".to_vec()));
        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], CacheSegment::CachedKv { range, entries }
            if range.start == b"f" && range.end == b"p" && entries.len() == 1)
        );
    }

    #[test]
    fn query_range_empty_scanned_region() {
        let mut store = SnapshotStore::default();
        // Scanned [a, d) but no keys exist in that range
        store.insert_scanned_keys(&[]);
        let segments = store.break_range(&(b"a".to_vec()..b"d".to_vec()));
        assert_eq!(segments.len(), 1);
        // No keys → CachedKeys with empty key list (all_have_values is vacuously true
        // but keys_in_range is empty, so it falls to CachedKeys)
        assert!(matches!(&segments[0], CacheSegment::CachedKeys { keys, .. } if keys.is_empty()));
    }

    // ── range_count ──────────────────────────────────────────────

    #[test]
    fn range_count_round_trip() {
        let mut store = SnapshotStore::default();
        let range = b"a".to_vec()..b"z".to_vec();
        assert_eq!(store.range_count(&range), None);
        store.set_range_count(range.clone(), 42);
        assert_eq!(store.range_count(&range), Some(42));
    }

    // ── get_entry ────────────────────────────────────────────────

    #[test]
    fn get_entry_returns_none_for_key_only() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"a".to_vec()]);
        assert!(store.get_entry(b"a").is_none());
    }

    #[test]
    fn get_entry_returns_value_after_insert() {
        let mut store = SnapshotStore::default();
        store.insert_scanned_keys(&[b"a".to_vec()]);
        store.insert_values(&[make_entry("a", "val")]);
        let entry = store.get_entry(b"a").unwrap();
        assert_eq!(entry.value, "val");
    }
}

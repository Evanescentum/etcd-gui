use std::collections::{BTreeMap, HashMap};
use std::ops::{Bound::Excluded, Range};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

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
pub type SharedSnapshot = Arc<tokio::sync::Mutex<SnapshotStore>>;

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
        let mut cursor = range.start.clone();

        for (s, group) in self.overlapping_scanned_groups(range) {
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
            let seg_end = std::cmp::min(&group.end, &range.end).clone();
            if seg_start < seg_end {
                let entries_in_range: Vec<_> = group
                    .entries
                    .iter()
                    .filter(|entry| (&seg_start[..]..&seg_end[..]).contains(&entry.key.as_bytes()))
                    .cloned()
                    .collect();

                segments.push(
                    if entries_in_range.iter().all(|entry| entry.value.is_some()) {
                        CacheSegment::CachedKv {
                            range: seg_start..seg_end.clone(),
                            entries: entries_in_range,
                        }
                    } else {
                        CacheSegment::CachedKeys {
                            range: seg_start..seg_end.clone(),
                            entries: entries_in_range,
                        }
                    },
                );
            }

            cursor = seg_end;
        }

        // Trailing gap
        if cursor < range.end {
            segments.push(CacheSegment::Missing {
                range: cursor..range.end.clone(),
            });
        }

        segments
    }

    /// Iterates scanned ranges that overlap with `[start, end)`, in order.
    fn overlapping_scanned_groups<'a>(
        &'a self,
        Range { start, end }: &KeyRange,
    ) -> impl Iterator<Item = (&'a Vec<u8>, &'a EntryGroup)> {
        // Find the first candidate: the last range whose start <= `start`.
        // It might extend into [start, end)
        let left_candidate = self
            .ranged_entries
            .range::<Vec<_>, _>(..=start)
            .next_back()
            .filter(|(_, g)| g.end > *start);

        // All ranges whose start is in (start, end) necessarily overlaps.
        let middle = self
            .ranged_entries
            .range::<[u8], _>((Excluded(start.as_slice()), Excluded(end.as_slice())));

        left_candidate.into_iter().chain(middle)
    }

    /// Inserts `[new_start, new_end)` into `ranged_entries`, merging with any
    /// overlapping or adjacent existing intervals while preserving value-presence
    /// boundaries.
    ///
    /// When a valued sub-range and a keys-only sub-range overlap, the result
    /// is split so that the valued portion stays valued and the rest stays
    /// keys-only. Values are never discarded: if both sides have an entry for
    /// the same key, the one carrying a value wins.
    pub fn merge_scanned_range(&mut self, range: KeyRange, new_entries: Vec<KvEntry>) {
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
            .into_iter()
            .filter_map(|start| self.ranged_entries.remove_entry(&start))
            .collect::<Vec<_>>();

        // ── 2. Determine valued sub-intervals ─────────────────────────

        let mut valued_intervals: Vec<KeyRange> = Vec::new();
        valued_intervals.extend(
            new_entries
                .iter()
                .all(|e| e.value.is_some())
                .then_some(range),
        );
        valued_intervals.extend(
            removed
                .iter()
                .filter(|(_, g)| g.entries.iter().all(|e| e.value.is_some()))
                .map(|(s, g)| s.clone()..g.end.clone()),
        );

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

        let mut all_entries = removed
            .into_iter()
            .flat_map(|(_, group)| group.entries)
            .chain(new_entries)
            .collect::<Vec<_>>();
        all_entries.sort_by(|left, right| left.key.cmp(&right.key));

        let all_entries =
            all_entries
                .into_iter()
                .fold(Vec::<KvEntry>::new(), |mut deduped, entry| {
                    match deduped.last_mut() {
                        Some(existing) if existing.key == entry.key => {
                            // Overwrite when the new entry has a value, or the existing one doesn't.
                            if entry.value.is_some() || existing.value.is_none() {
                                *existing = entry;
                            }
                        }
                        _ => deduped.push(entry),
                    }
                    deduped
                });

        // ── 4. Re-insert, splitting only at valued / keys-only boundaries ──

        let mut split_points = vec![merged_start, merged_end];
        for interval in &valued_ranges {
            split_points.push(interval.start.clone());
            split_points.push(interval.end.clone());
        }
        split_points.sort();
        split_points.dedup();

        let mut all_entries = all_entries.into_iter().peekable();
        self.ranged_entries
            .extend(split_points.array_windows().map(|[left, right]| {
                let mut group_entries = Vec::new();
                while let Some(entry) = all_entries.next_if(|entry| {
                    (left.as_slice()..right.as_slice()).contains(&entry.key.as_bytes())
                }) {
                    group_entries.push(entry);
                }

                (
                    left.clone(),
                    EntryGroup {
                        end: right.clone(),
                        entries: group_entries,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entry(key: &str, value: Option<&str>) -> KvEntry {
        KvEntry {
            key: key.to_string(),
            value: value.map(str::to_string),
            version: 1,
            create_revision: 1,
            mod_revision: 1,
            lease: 0,
        }
    }

    fn make_ascii_entries(range: Range<u8>, value: Option<&str>) -> Vec<KvEntry> {
        range
            .map(|byte| make_entry(&String::from_utf8(vec![byte]).unwrap(), value))
            .collect()
    }

    fn keys(entries: &[KvEntry]) -> Vec<&str> {
        entries.iter().map(|entry| entry.key.as_str()).collect()
    }

    #[test]
    fn break_range_returns_empty_for_empty_query() {
        let store = SnapshotStore::default();

        assert!(store.break_range(&(Vec::new()..Vec::new())).is_empty());
    }

    #[test]
    fn merge_non_overlapping_ranges_keeps_separate_groups() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(
            b"a".to_vec()..b"c".to_vec(),
            vec![make_entry("a", None), make_entry("b", None)],
        );
        store.merge_scanned_range(
            b"e".to_vec()..b"g".to_vec(),
            vec![make_entry("e", None), make_entry("f", None)],
        );

        assert_eq!(store.ranged_entries.len(), 2);
        assert_eq!(store.ranged_entries[&b"a".to_vec()].end, b"c".to_vec());
        assert_eq!(store.ranged_entries[&b"e".to_vec()].end, b"g".to_vec());
    }

    #[test]
    fn merge_adjacent_ranges_with_same_state_coalesces() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(
            b"a".to_vec()..b"c".to_vec(),
            vec![make_entry("a", None), make_entry("b", None)],
        );
        store.merge_scanned_range(
            b"c".to_vec()..b"e".to_vec(),
            vec![make_entry("c", None), make_entry("d", None)],
        );

        assert_eq!(store.ranged_entries.len(), 1);
        let merged = &store.ranged_entries[&b"a".to_vec()];
        assert_eq!(merged.end, b"e".to_vec());
        assert_eq!(keys(&merged.entries), vec!["a", "b", "c", "d"]);
        assert!(merged.entries.iter().all(|entry| entry.value.is_none()));
    }

    #[test]
    fn merge_overlapping_ranges_with_values_stays_single_group() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(
            b"a".to_vec()..b"d".to_vec(),
            vec![
                make_entry("a", Some("va")),
                make_entry("b", Some("vb")),
                make_entry("c", Some("vc")),
            ],
        );
        store.merge_scanned_range(
            b"c".to_vec()..b"f".to_vec(),
            vec![
                make_entry("c", Some("vc-new")),
                make_entry("d", Some("vd")),
                make_entry("e", Some("ve")),
            ],
        );

        assert_eq!(store.ranged_entries.len(), 1);
        let merged = &store.ranged_entries[&b"a".to_vec()];
        assert_eq!(merged.end, b"f".to_vec());
        assert_eq!(keys(&merged.entries), vec!["a", "b", "c", "d", "e"]);
        assert_eq!(
            merged
                .entries
                .iter()
                .find(|entry| entry.key == "c")
                .and_then(|entry| entry.value.as_deref()),
            Some("vc-new")
        );
    }

    #[test]
    fn merge_keys_only_then_valued_splits_at_value_boundary() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(
            b"a".to_vec()..b"d".to_vec(),
            vec![
                make_entry("a", None),
                make_entry("b", None),
                make_entry("c", None),
            ],
        );
        store.merge_scanned_range(
            b"c".to_vec()..b"f".to_vec(),
            vec![
                make_entry("c", Some("vc")),
                make_entry("d", Some("vd")),
                make_entry("e", Some("ve")),
            ],
        );

        assert_eq!(store.ranged_entries.len(), 2);

        let keys_only = &store.ranged_entries[&b"a".to_vec()];
        assert_eq!(keys_only.end, b"c".to_vec());
        assert_eq!(keys(&keys_only.entries), vec!["a", "b"]);
        assert!(keys_only.entries.iter().all(|entry| entry.value.is_none()));

        let valued = &store.ranged_entries[&b"c".to_vec()];
        assert_eq!(valued.end, b"f".to_vec());
        assert_eq!(keys(&valued.entries), vec!["c", "d", "e"]);
        assert!(valued.entries.iter().all(|entry| entry.value.is_some()));
    }

    #[test]
    fn break_range_returns_missing_for_uncached_range() {
        let store = SnapshotStore::default();

        let segments = store.break_range(&(b"a".to_vec()..b"z".to_vec()));

        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], CacheSegment::Missing { range } if range.start == b"a" && range.end == b"z")
        );
    }

    #[test]
    fn break_range_returns_cached_kv_for_fully_loaded_group() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(
            b"a".to_vec()..b"d".to_vec(),
            vec![make_entry("a", Some("v1")), make_entry("b", Some("v2"))],
        );

        let segments = store.break_range(&(b"a".to_vec()..b"d".to_vec()));

        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], CacheSegment::CachedKv { entries, .. } if keys(entries) == vec!["a", "b"])
        );
    }

    #[test]
    fn break_range_returns_mixed_segments_for_sparse_cache() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(vec![40u8]..vec![60u8], make_ascii_entries(40..60, None));
        store.merge_scanned_range(
            vec![80u8]..vec![90u8],
            make_ascii_entries(80..90, Some("v")),
        );

        let segments = store.break_range(&(vec![50u8]..vec![100u8]));

        assert_eq!(segments.len(), 4);

        assert!(
            matches!(&segments[0], CacheSegment::CachedKeys { range, entries }
                if range.start == vec![50u8] && range.end == vec![60u8] && entries.len() == 10)
        );
        assert!(matches!(&segments[1], CacheSegment::Missing { range }
                if range.start == vec![60u8] && range.end == vec![80u8]));
        assert!(
            matches!(&segments[2], CacheSegment::CachedKv { range, entries }
                if range.start == vec![80u8] && range.end == vec![90u8] && entries.len() == 10)
        );
        assert!(matches!(&segments[3], CacheSegment::Missing { range }
                if range.start == vec![90u8] && range.end == vec![100u8]));
    }

    #[test]
    fn break_range_clamps_cached_segment_to_query_bounds() {
        let mut store = SnapshotStore::default();

        store.merge_scanned_range(
            b"d".to_vec()..b"p".to_vec(),
            vec![make_entry("d", Some("vd")), make_entry("m", Some("vm"))],
        );

        let segments = store.break_range(&(b"f".to_vec()..b"p".to_vec()));

        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], CacheSegment::CachedKv { range, entries }
            if range.start == b"f" && range.end == b"p" && keys(entries) == vec!["m"])
        );
    }

    #[test]
    fn range_count_round_trip() {
        let mut store = SnapshotStore::default();
        let range = b"a".to_vec()..b"z".to_vec();
        assert_eq!(store.range_count(&range), None);
        store.set_range_count(range.clone(), 42);
        assert_eq!(store.range_count(&range), Some(42));
    }
}

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::client::KvEntry;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SnapshotKey {
    pub profile_fingerprint: String,
    pub revision: i64,
}

pub type SharedSnapshot = Arc<RwLock<SnapshotStore>>;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct KeyRange {
    pub start: Vec<u8>,
    pub end: Vec<u8>,
}

impl KeyRange {
    pub fn new(start: Vec<u8>, end: Vec<u8>) -> Self {
        Self { start, end }
    }

    pub fn from_prefix(prefix: &str) -> Self {
        let start = prefix.as_bytes().to_vec();
        let end = range_end_of_prefix(prefix.as_bytes());
        Self { start, end }
    }

    pub fn is_empty(&self) -> bool {
        self.start >= self.end
    }
}

#[derive(Default)]
pub struct SnapshotStore {
    key_index: Vec<Vec<u8>>,
    values: HashMap<Vec<u8>, KvEntry>,
    covered_ranges: Vec<KeyRange>,
    exact_counts: HashMap<KeyRange, i64>,
}

impl SnapshotStore {
    pub fn exact_count(&self, range: &KeyRange) -> Option<i64> {
        self.exact_counts.get(range).copied()
    }

    pub fn set_exact_count(&mut self, range: KeyRange, count: i64) {
        self.exact_counts.insert(range, count);
    }

    pub fn is_range_covered(&self, range: &KeyRange) -> bool {
        self.covered_prefix_end(range) == range.end
    }

    pub fn covered_prefix_end(&self, range: &KeyRange) -> Vec<u8> {
        let mut cursor = range.start.clone();

        for covered in &self.covered_ranges {
            if covered.end <= cursor {
                continue;
            }

            if covered.start > cursor {
                break;
            }

            if covered.start <= cursor && cursor < covered.end {
                cursor = if covered.end >= range.end {
                    range.end.clone()
                } else {
                    covered.end.clone()
                };

                if cursor == range.end {
                    break;
                }
            }
        }

        cursor
    }

    pub fn mark_range_covered(&mut self, range: KeyRange) {
        if range.is_empty() {
            return;
        }

        if self.covered_ranges.is_empty() {
            self.covered_ranges.push(range);
            return;
        }

        let mut merged = Vec::with_capacity(self.covered_ranges.len() + 1);
        let mut pending = range;
        let mut inserted = false;

        for current in self.covered_ranges.drain(..) {
            if current.end < pending.start {
                merged.push(current);
                continue;
            }

            if pending.end < current.start {
                if !inserted {
                    merged.push(pending.clone());
                    inserted = true;
                }
                merged.push(current);
                continue;
            }

            pending.start = pending.start.min(current.start);
            pending.end = pending.end.max(current.end);
        }

        if !inserted {
            merged.push(pending);
        }

        self.covered_ranges = merged;
    }

    pub fn insert_keys<I>(&mut self, keys: I)
    where
        I: IntoIterator<Item = Vec<u8>>,
    {
        for key in keys {
            if let Err(index) = self.key_index.binary_search(&key) {
                self.key_index.insert(index, key);
            }
        }
    }

    pub fn upsert_items<I>(&mut self, items: I)
    where
        I: IntoIterator<Item = KvEntry>,
    {
        for item in items {
            let key = item.key.as_bytes().to_vec();
            if let Err(index) = self.key_index.binary_search(&key) {
                self.key_index.insert(index, key.clone());
            }
            self.values.insert(key, item);
        }
    }

    pub fn key_count_in_range(&self, range: &KeyRange) -> usize {
        let (start, end) = self.range_bounds(range);
        end - start
    }

    pub fn keys_in_range(&self, range: &KeyRange) -> Vec<Vec<u8>> {
        let (start, end) = self.range_bounds(range);
        self.key_index[start..end].to_vec()
    }

    pub fn page_keys(&self, range: &KeyRange, offset: usize, limit: usize) -> Vec<Vec<u8>> {
        let (start, end) = self.range_bounds(range);
        let page_start = start.saturating_add(offset).min(end);
        let page_end = page_start.saturating_add(limit).min(end);
        self.key_index[page_start..page_end].to_vec()
    }

    pub fn missing_value_keys(&self, keys: &[Vec<u8>]) -> Vec<Vec<u8>> {
        keys.iter()
            .filter(|key| !self.values.contains_key(key.as_slice()))
            .cloned()
            .collect()
    }

    pub fn cached_items_for_keys(&self, keys: &[Vec<u8>]) -> Vec<KvEntry> {
        keys.iter()
            .filter_map(|key| self.values.get(key).cloned())
            .collect()
    }

    pub fn has_all_values_for_range(&self, range: &KeyRange) -> bool {
        let (start, end) = self.range_bounds(range);
        self.key_index[start..end]
            .iter()
            .all(|key| self.values.contains_key(key))
    }

    pub fn items_in_range(&self, range: &KeyRange) -> Vec<KvEntry> {
        let (start, end) = self.range_bounds(range);
        self.key_index[start..end]
            .iter()
            .filter_map(|key| self.values.get(key).cloned())
            .collect()
    }

    fn range_bounds(&self, range: &KeyRange) -> (usize, usize) {
        let start = self
            .key_index
            .partition_point(|key| key.as_slice() < range.start.as_slice());
        let end = self
            .key_index
            .partition_point(|key| key.as_slice() < range.end.as_slice());
        (start, end)
    }
}

pub fn key_after(key: &[u8]) -> Vec<u8> {
    let mut next = Vec::with_capacity(key.len() + 1);
    next.extend_from_slice(key);
    next.push(0);
    next
}

fn range_end_of_prefix(prefix_key: &[u8]) -> Vec<u8> {
    for (index, value) in prefix_key.iter().enumerate().rev() {
        if *value < 0xFF {
            let mut end = Vec::from(&prefix_key[..=index]);
            end[index] = *value + 1;
            return end;
        }
    }

    vec![0]
}

#[cfg(test)]
mod tests {
    use super::{KeyRange, SnapshotStore};
    use crate::client::KvEntry;

    fn item(key: &str, value: &str) -> KvEntry {
        KvEntry {
            key: key.to_string(),
            value: value.to_string(),
            version: 1,
            create_revision: 1,
            mod_revision: 1,
            lease: 0,
        }
    }

    #[test]
    fn merges_adjacent_covered_ranges() {
        let mut store = SnapshotStore::default();
        store.mark_range_covered(KeyRange::new(b"/a".to_vec(), b"/c".to_vec()));
        store.mark_range_covered(KeyRange::new(b"/c".to_vec(), b"/e".to_vec()));

        assert!(store.is_range_covered(&KeyRange::new(b"/a".to_vec(), b"/e".to_vec())));
    }

    #[test]
    fn reuses_parent_prefix_coverage_for_child_prefix() {
        let mut store = SnapshotStore::default();
        let parent = KeyRange::from_prefix("/a");
        let child = KeyRange::from_prefix("/abc");

        store.insert_keys([b"/a/1".to_vec(), b"/abc/1".to_vec(), b"/abc/2".to_vec()]);
        store.mark_range_covered(parent);

        assert!(store.is_range_covered(&child));
        assert_eq!(
            store.page_keys(&child, 0, 10),
            vec![b"/abc/1".to_vec(), b"/abc/2".to_vec()]
        );
    }

    #[test]
    fn covered_prefix_end_stops_at_gap() {
        let mut store = SnapshotStore::default();
        store.mark_range_covered(KeyRange::from_prefix("/abc"));

        assert_eq!(
            store.covered_prefix_end(&KeyRange::from_prefix("/a")),
            b"/a".to_vec()
        );
    }

    #[test]
    fn items_follow_key_index_order() {
        let mut store = SnapshotStore::default();
        let range = KeyRange::from_prefix("/a");

        store.upsert_items([item("/a/2", "2"), item("/a/1", "1")]);
        store.mark_range_covered(range.clone());

        let items = store.items_in_range(&range);
        assert_eq!(
            items
                .iter()
                .map(|item| item.key.as_str())
                .collect::<Vec<_>>(),
            vec!["/a/1", "/a/2"]
        );
        assert!(store.has_all_values_for_range(&range));
    }

    #[test]
    fn page_keys_respect_offset_without_cloning_full_range_first() {
        let mut store = SnapshotStore::default();
        let range = KeyRange::from_prefix("/a");

        store.insert_keys([
            b"/a/1".to_vec(),
            b"/a/2".to_vec(),
            b"/a/3".to_vec(),
            b"/a/4".to_vec(),
        ]);
        store.mark_range_covered(range.clone());

        assert_eq!(
            store.page_keys(&range, 1, 2),
            vec![b"/a/2".to_vec(), b"/a/3".to_vec()]
        );
    }

    #[test]
    fn missing_value_keys_only_returns_uncached_entries() {
        let mut store = SnapshotStore::default();
        store.upsert_items([item("/a/1", "1")]);

        let keys = vec![b"/a/1".to_vec(), b"/a/2".to_vec()];
        assert_eq!(store.missing_value_keys(&keys), vec![b"/a/2".to_vec()]);
        assert_eq!(store.cached_items_for_keys(&keys).len(), 1);
    }
}

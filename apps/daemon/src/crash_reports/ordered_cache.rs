// Why: the crash-reporting ring buffer (retained breadcrumbs, coalesce keys) and the
// renderer-error dedupe cache all need the same shape the TS source gets for free from
// a JS `Map`: small, insertion-ordered, capacity-bounded, evict-oldest-on-overflow.
// A `Vec` scan is fine at these sizes (4 / 128 / 256 entries).

pub(super) struct BoundedOrderedMap<V> {
    entries: Vec<(String, V)>,
    capacity: usize,
}

impl<V> BoundedOrderedMap<V> {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            entries: Vec::new(),
            capacity,
        }
    }

    pub(super) fn get(&self, key: &str) -> Option<&V> {
        self.entries
            .iter()
            .find(|(existing, _)| existing == key)
            .map(|(_, value)| value)
    }

    pub(super) fn get_mut(&mut self, key: &str) -> Option<&mut V> {
        self.entries
            .iter_mut()
            .find(|(existing, _)| existing == key)
            .map(|(_, value)| value)
    }

    pub(super) fn remove(&mut self, key: &str) {
        self.entries.retain(|(existing, _)| existing != key);
    }

    pub(super) fn retain(&mut self, mut keep: impl FnMut(&V) -> bool) {
        self.entries.retain(|(_, value)| keep(value));
    }

    /// Removes any existing entry for `key` (delete-then-insert is what makes this an
    /// LRU: the entry moves to "most recent" even when its value doesn't change),
    /// pushes the new one, then evicts from the front until back within capacity.
    pub(super) fn insert_most_recent(&mut self, key: String, value: V) {
        self.remove(&key);
        self.entries.push((key, value));
        self.evict_from_front();
    }

    /// A plain JS `Map#set`: updates an existing key's value **in place** (its
    /// eviction-order position does not change), or appends a new entry. Distinct
    /// from `insert_most_recent`, which always moves the key to "most recent" —
    /// callers pick whichever one the TS source they're porting actually uses.
    pub(super) fn set_or_insert(&mut self, key: String, value: V) {
        if let Some(existing) = self.get_mut(&key) {
            *existing = value;
            return;
        }
        self.entries.push((key, value));
        self.evict_from_front();
    }

    fn evict_from_front(&mut self) {
        while self.entries.len() > self.capacity {
            self.entries.remove(0);
        }
    }

    pub(super) fn values(&self) -> impl Iterator<Item = &V> {
        self.entries.iter().map(|(_, value)| value)
    }

    pub(super) fn len(&self) -> usize {
        self.entries.len()
    }
}

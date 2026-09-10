use super::*;

pub(super) fn migrate_profile_sqlite(
    root: &Path,
    target_root: &Path,
    file_name: &str,
) -> Result<DatabaseIdentity, ProfileError> {
    let source = root.join(file_name);
    if !is_regular_source(&source)? {
        return Err(ProfileError::MigrationConflict(source));
    }
    let connection = Connection::open_with_flags(
        &source,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    if connection.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))? != "ok" {
        return Err(ProfileError::MigrationConflict(source));
    }
    let (busy, log_frames, checkpointed_frames) =
        connection.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
    if busy != 0 || log_frames != checkpointed_frames {
        return Err(ProfileError::MigrationConflict(source));
    }
    connection
        .close()
        .map_err(|(_, error)| ProfileError::Sqlite(error))?;
    sync_file_and_parent(&source)?;
    let source_identity = database_identity(&source)?;
    if source_identity.wal.is_some() {
        return Err(ProfileError::MigrationConflict(source));
    }
    copy_file_no_clobber(&source, &target_root.join(file_name))?;
    if database_identity(&source)? != source_identity {
        return Err(ProfileError::MigrationConflict(source));
    }
    Ok(source_identity)
}

pub(super) fn is_regular_source(path: &Path) -> Result<bool, ProfileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub(super) fn database_has_internal_provenance(path: &Path) -> Result<bool, ProfileError> {
    if !is_regular_source(path)? {
        return Ok(false);
    }
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    let has_provenance = table_exists(&connection, "main", DATABASE_PROVENANCE_TABLE)?;
    connection
        .close()
        .map_err(|(_, error)| ProfileError::Sqlite(error))?;
    Ok(has_provenance)
}

pub(super) fn merge_database(
    source: &Path,
    target: &Path,
    database_rows: &mut BTreeMap<String, BTreeMap<String, u64>>,
) -> Result<DatabaseIdentity, ProfileError> {
    let source_identity = database_identity(source)?;
    if let Ok(metadata) = fs::symlink_metadata(target)
        && !metadata.file_type().is_file()
    {
        return Err(ProfileError::MigrationConflict(target.to_owned()));
    }
    let mut connection = Connection::open_with_flags(
        target,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = OFF;
         PRAGMA wal_autocheckpoint = 1000;",
    )?;
    connection.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_ATTACH_CREATE, false)?;
    connection.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE, false)?;
    let source_text = source
        .to_str()
        .ok_or_else(|| ProfileError::MigrationConflict(source.to_owned()))?;
    connection.execute("ATTACH DATABASE ?1 AS legacy", [source_text])?;
    if database_identity(source)? != source_identity {
        let _ = connection.execute_batch("DETACH DATABASE legacy");
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let integrity = connection.query_row("PRAGMA legacy.quick_check", [], |row| {
        row.get::<_, String>(0)
    })?;
    if integrity != "ok" {
        let _ = connection.execute_batch("DETACH DATABASE legacy");
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let migration = merge_attached_database(&mut connection, source, database_rows);
    let detach = connection.execute_batch("DETACH DATABASE legacy");
    if let Err(error) = migration {
        let _ = detach;
        return Err(error);
    }
    detach?;
    if database_identity(source)? != source_identity {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA wal_checkpoint(TRUNCATE);",
    )?;
    if connection.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    connection
        .close()
        .map_err(|(_, error)| ProfileError::Sqlite(error))?;
    sync_file_and_parent(target)?;
    Ok(source_identity)
}

fn database_identity(path: &Path) -> Result<DatabaseIdentity, ProfileError> {
    let main = database_file_identity(path)?;
    let wal_path = sqlite_wal_path(path);
    let wal = match fs::symlink_metadata(&wal_path) {
        Ok(metadata) if metadata.file_type().is_file() && metadata.len() == 0 => None,
        Ok(metadata) if metadata.file_type().is_file() => Some(database_file_identity(&wal_path)?),
        Ok(_) => return Err(ProfileError::MigrationConflict(wal_path)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    Ok(DatabaseIdentity { main, wal })
}

fn database_file_timestamps(
    path: &Path,
    metadata: &fs::Metadata,
) -> Result<(u64, u32), ProfileError> {
    let modified = metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| ProfileError::MigrationConflict(path.to_owned()))?;
    Ok((modified.as_secs(), modified.subsec_nanos()))
}

fn database_file_identity(path: &Path) -> Result<DatabaseFileIdentity, ProfileError> {
    let identity = crate::file_identity::FileIdentity::from_path(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_file() {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    }
    let (modified_seconds, modified_nanos) = database_file_timestamps(path, &metadata)?;
    Ok(DatabaseFileIdentity {
        identity,
        length: metadata.len(),
        modified_nanos,
        modified_seconds,
    })
}

fn merge_attached_database(
    connection: &mut Connection,
    source: &Path,
    database_rows: &mut BTreeMap<String, BTreeMap<String, u64>>,
) -> Result<(), ProfileError> {
    let source_tables = source_tables(connection)?;
    if source_tables
        .iter()
        .any(|table| !PROFILE_TABLES.contains(&table.as_str()))
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let had_current_provenance = table_exists(connection, "main", DATABASE_PROVENANCE_TABLE)?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(DATABASE_PROVENANCE_SCHEMA)?;
    if table_columns(&transaction, "main", DATABASE_PROVENANCE_TABLE)?
        != ["table_name", "row_digest", "occurrences"]
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let mut prior_database_rows = if had_current_provenance {
        load_internal_database_provenance(&transaction, source, DATABASE_PROVENANCE_TABLE)?
    } else {
        database_rows.clone()
    };
    validate_database_provenance(&prior_database_rows, source)?;
    // Why: a retired table is no longer scanned, so its recorded rows would read as rows that
    // vanished from the source. They are retired, not lost, and drop out of the next provenance.
    prior_database_rows.retain(|table, _| {
        !RETIRED_PROFILE_TABLES.contains(&table.as_str()) && table != DATABASE_PROVENANCE_TABLE
    });
    if prior_database_rows
        .iter()
        .any(|(table, rows)| !rows.is_empty() && !source_tables.contains(table))
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let mut next_database_rows = BTreeMap::new();
    for table in source_tables {
        ensure_target_table(&transaction, &table, source)?;
        let source_columns = table_columns(&transaction, "legacy", &table)?;
        let target_columns = table_columns(&transaction, "main", &table)?;
        if source_columns.is_empty()
            || source_columns
                .iter()
                .any(|column| !target_columns.contains(column))
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let source_rows = database_row_digests(&transaction, "legacy", &table, &source_columns)?;
        if source_rows
            .current
            .values()
            .any(|occurrences| *occurrences > 1)
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let target_rows = database_row_digests(&transaction, "main", &table, &source_columns)?;
        let prior_source_rows = RowDigests {
            current: source_rows.current.clone(),
        };
        let prior_target_rows = RowDigests {
            current: target_rows.current.clone(),
        };
        if prior_database_rows.get(&table).is_some_and(|prior_rows| {
            prior_rows.iter().any(|(digest, occurrences)| {
                prior_source_rows.occurrences(digest) < *occurrences
                    || prior_target_rows.occurrences(digest) < *occurrences
            })
        }) {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let quoted_table = quote_identifier(&table);
        let source_projection = source_columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(",");
        let mut insert_columns = source_columns.clone();
        let mut select_expressions = source_columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>();
        add_legacy_identity_column(
            &table,
            "wire_id",
            "id",
            &source_columns,
            &target_columns,
            &mut insert_columns,
            &mut select_expressions,
        );
        add_legacy_identity_column(
            &table,
            "storage_id",
            "id",
            &source_columns,
            &target_columns,
            &mut insert_columns,
            &mut select_expressions,
        );
        let insert_columns = insert_columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(",");
        let select_expressions = select_expressions.join(",");
        let equality = source_columns
            .iter()
            .map(|column| {
                let column = quote_identifier(column);
                format!("target.{column} IS source.{column}")
            })
            .collect::<Vec<_>>()
            .join(" AND ");
        transaction.execute_batch(&format!(
            "INSERT INTO main.{quoted_table}({insert_columns})
             SELECT {select_expressions} FROM legacy.{quoted_table} AS source
             WHERE NOT EXISTS (
               SELECT 1 FROM main.{quoted_table} AS target WHERE {equality}
             )
             ON CONFLICT DO NOTHING;"
        ))?;
        let merged_rows = database_row_digests(&transaction, "main", &table, &source_columns)?;
        if source_rows
            .current
            .iter()
            .any(|(digest, occurrences)| merged_rows.occurrences(digest) < *occurrences)
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let missing = transaction.query_row(
            &format!(
                "SELECT EXISTS(
                       SELECT {source_projection} FROM legacy.{quoted_table}
                       EXCEPT SELECT {source_projection} FROM main.{quoted_table}
                     )"
            ),
            [],
            |row| row.get::<_, bool>(0),
        )?;
        if missing {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        next_database_rows.insert(table, source_rows.current);
    }
    store_internal_database_provenance(&transaction, &next_database_rows)?;
    transaction.commit()?;
    *database_rows = next_database_rows;
    Ok(())
}

fn add_legacy_identity_column(
    table: &str,
    target_column: &str,
    source_column: &str,
    source_columns: &[String],
    target_columns: &[String],
    insert_columns: &mut Vec<String>,
    select_expressions: &mut Vec<String>,
) {
    let applies = matches!(
        (table, target_column),
        ("project", "wire_id") | ("worktree_metadata", "storage_id")
    );
    if applies
        && !source_columns.iter().any(|column| column == target_column)
        && target_columns.iter().any(|column| column == target_column)
    {
        insert_columns.push(target_column.to_owned());
        select_expressions.push(quote_identifier(source_column));
    }
}

fn source_tables(connection: &Connection) -> Result<Vec<String>, ProfileError> {
    let retired = RETIRED_PROFILE_TABLES
        .iter()
        .map(|table| format!("'{table}'"))
        .collect::<Vec<_>>()
        .join(",");
    let mut statement = connection.prepare(&format!(
        "SELECT name FROM legacy.sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name != '{DATABASE_PROVENANCE_TABLE}'
           AND name NOT IN ({retired})
         ORDER BY rowid"
    ))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut tables = Vec::new();
    for row in rows {
        tables.push(row?);
        if tables.len() > PROFILE_TABLES.len() {
            return Err(ProfileError::MigrationCapacity);
        }
    }
    Ok(tables)
}

fn ensure_target_table(
    connection: &Connection,
    table: &str,
    source: &Path,
) -> Result<(), ProfileError> {
    if table_exists(connection, "main", table)? {
        return Ok(());
    }
    let sql = connection
        .query_row(
            "SELECT sql FROM legacy.sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| ProfileError::MigrationConflict(source.to_owned()))?;
    let normalized = sql.trim_start().to_ascii_uppercase();
    if !normalized.starts_with("CREATE TABLE")
        || sql.contains(';')
        || normalized.contains("ATTACH DATABASE")
        || normalized.contains("PRAGMA ")
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    connection.execute_batch(&sql)?;
    Ok(())
}

fn table_exists(
    connection: &Connection,
    schema: &str,
    table: &str,
) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        &format!(
            "SELECT EXISTS(
               SELECT 1 FROM {schema}.sqlite_master WHERE type = 'table' AND name = ?1
             )"
        ),
        [table],
        |row| row.get(0),
    )
}

fn table_columns(
    connection: &Connection,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, rusqlite::Error> {
    // Why: a `schema.` prefix on a pragma table-valued function qualifies the function, not the
    // database, so `legacy.pragma_table_info(t)` silently reports the main-database columns and the
    // legacy row digests are then taken over the Rust profile's schema. Only the pragma's second
    // argument selects the database.
    let mut statement =
        connection.prepare("SELECT name FROM pragma_table_info(?1, ?2) ORDER BY cid")?;
    let rows = statement.query_map([table, schema], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn load_internal_database_provenance(
    connection: &Connection,
    source: &Path,
    table: &str,
) -> Result<BTreeMap<String, BTreeMap<String, u64>>, ProfileError> {
    let mut statement = connection.prepare(&format!(
        "SELECT table_name,row_digest,occurrences FROM main.{} ORDER BY table_name,row_digest",
        quote_identifier(table)
    ))?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    let mut result = BTreeMap::<String, BTreeMap<String, u64>>::new();
    let mut row_count = 0_usize;
    for row in rows {
        row_count = row_count
            .checked_add(1)
            .filter(|count| *count <= MAX_COMPAT_DATABASE_ROWS)
            .ok_or(ProfileError::MigrationCapacity)?;
        let (table, digest, occurrences) = row?;
        let occurrences = u64::try_from(occurrences)
            .map_err(|_| ProfileError::MigrationConflict(source.to_owned()))?;
        if result
            .entry(table)
            .or_default()
            .insert(digest, occurrences)
            .is_some()
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
    }
    Ok(result)
}

fn store_internal_database_provenance(
    transaction: &Connection,
    database_rows: &BTreeMap<String, BTreeMap<String, u64>>,
) -> Result<(), ProfileError> {
    transaction.execute(
        &format!(
            "DELETE FROM main.{}",
            quote_identifier(DATABASE_PROVENANCE_TABLE)
        ),
        [],
    )?;
    let mut statement = transaction.prepare(&format!(
        "INSERT INTO main.{}(table_name,row_digest,occurrences) VALUES (?1,?2,?3)",
        quote_identifier(DATABASE_PROVENANCE_TABLE)
    ))?;
    for (table, rows) in database_rows {
        for (digest, occurrences) in rows {
            let occurrences =
                i64::try_from(*occurrences).map_err(|_| ProfileError::MigrationCapacity)?;
            statement.execute((table, digest, occurrences))?;
        }
    }
    Ok(())
}

fn database_row_digests(
    connection: &Connection,
    schema: &str,
    table: &str,
    columns: &[String],
) -> Result<RowDigests, ProfileError> {
    let projection = columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(",");
    let mut statement = connection.prepare(&format!(
        "SELECT {projection} FROM {}.{}",
        quote_identifier(schema),
        quote_identifier(table)
    ))?;
    let mut rows = statement.query([])?;
    let mut result = RowDigests::default();
    let mut row_count = 0_usize;
    while let Some(row) = rows.next()? {
        row_count = row_count
            .checked_add(1)
            .filter(|count| *count <= MAX_COMPAT_DATABASE_ROWS)
            .ok_or(ProfileError::MigrationCapacity)?;
        count_row_digest(
            &mut result.current,
            database_row_digest(row, columns.len(), ROW_DIGEST_DOMAIN)?,
        )?;
    }
    Ok(result)
}

fn count_row_digest(
    digests: &mut BTreeMap<String, u64>,
    digest: String,
) -> Result<(), ProfileError> {
    let occurrences = digests.entry(digest).or_insert(0_u64);
    *occurrences = occurrences
        .checked_add(1)
        .ok_or(ProfileError::MigrationCapacity)?;
    Ok(())
}

fn database_row_digest(
    row: &Row<'_>,
    column_count: usize,
    domain: &[u8],
) -> Result<String, rusqlite::Error> {
    let mut hash = Sha256::new();
    hash.update(domain);
    for index in 0..column_count {
        match row.get_ref(index)? {
            ValueRef::Null => hash.update([0]),
            ValueRef::Integer(value) => {
                hash.update([1]);
                hash.update(value.to_be_bytes());
            }
            ValueRef::Real(value) => {
                hash.update([2]);
                hash.update(value.to_bits().to_be_bytes());
            }
            ValueRef::Text(value) => {
                hash.update([3]);
                hash.update((value.len() as u64).to_be_bytes());
                hash.update(value);
            }
            ValueRef::Blob(value) => {
                hash.update([4]);
                hash.update((value.len() as u64).to_be_bytes());
                hash.update(value);
            }
        }
    }
    Ok(hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

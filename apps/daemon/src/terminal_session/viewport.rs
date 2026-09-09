use super::TerminalSessionAuthority;
use super::error::TerminalSessionError;
use super::model::TerminalResizeResult;
use super::model::{TerminalClient, TerminalClientType};
use super::state::{TerminalDisplayMode, TerminalDriver, ViewportOwner, ViewportOwnerKind};

impl TerminalSessionAuthority {
    pub(crate) fn display_mode(
        &self,
        handle: &str,
    ) -> Result<(&'static str, bool), TerminalSessionError> {
        self.state
            .with(handle, |record| {
                (
                    match record.display_mode {
                        TerminalDisplayMode::Auto => "auto",
                        TerminalDisplayMode::Desktop => "desktop",
                    },
                    record.viewport_owner.is_some(),
                )
            })
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) async fn set_display_mode(
        &self,
        handle: &str,
        mode: &str,
        client: Option<TerminalClient>,
        viewport: Option<(u16, u16)>,
    ) -> Result<u64, TerminalSessionError> {
        let revision = self
            .state
            .with_mut(handle, |record| {
                if record.process_exit_code.is_some() || record.control.is_none() {
                    return Err(TerminalSessionError::NotWritable);
                }
                record.display_mode = if mode == "desktop" {
                    record.driver = TerminalDriver::Desktop;
                    TerminalDisplayMode::Desktop
                } else {
                    TerminalDisplayMode::Auto
                };
                record.viewport_revision = record.viewport_revision.saturating_add(1);
                Ok(record.viewport_revision)
            })
            .ok_or(TerminalSessionError::NotFound)??;
        if let (Some(client), Some((cols, rows))) = (client, viewport) {
            match client.kind {
                TerminalClientType::Mobile if mode == "auto" => {
                    self.mobile_fit(handle, client.id, cols, rows).await?;
                }
                TerminalClientType::Desktop => {
                    self.desktop_fit(handle, client.id, cols, rows).await?;
                }
                _ => {}
            }
        }
        self.publish_driver(handle);
        Ok(revision)
    }

    pub(crate) async fn reclaim_desktop(&self, handle: &str) -> Result<bool, TerminalSessionError> {
        let (driver, owner, remote_viewport) = self
            .state
            .with(handle, |record| {
                let remote_viewport =
                    record
                        .desktop_viewport_owner
                        .as_ref()
                        .and_then(|client_id| {
                            record
                                .viewers
                                .get(client_id)
                                .and_then(|viewer| viewer.cols.zip(viewer.rows))
                                .map(|(cols, rows)| (client_id.clone(), cols, rows))
                        });
                (
                    record.driver.clone(),
                    record.viewport_owner.as_ref().cloned(),
                    remote_viewport,
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        self.auto_restore_fit.cancel(handle);
        let Some(owner) = owner else {
            if let Some((client_id, cols, rows)) = remote_viewport {
                self.desktop_fit(handle, client_id, cols, rows).await?;
                return Ok(true);
            }
            if matches!(driver, TerminalDriver::Mobile(_)) {
                self.state.with_mut(handle, |record| {
                    record.driver = TerminalDriver::Desktop;
                });
                self.publish_driver(handle);
                return Ok(true);
            }
            return Ok(false);
        };
        if matches!(owner.kind, ViewportOwnerKind::RemoteDesktop) {
            return Ok(true);
        }
        self.restore_fit(handle, &owner.client_id).await?;
        if let Some((client_id, cols, rows)) = remote_viewport {
            let is_current_owner = self
                .state
                .with(handle, |record| {
                    record.desktop_viewport_owner.as_deref() == Some(client_id.as_str())
                })
                .unwrap_or(false);
            if is_current_owner {
                self.desktop_fit(handle, client_id, cols, rows).await?;
            }
        }
        Ok(true)
    }

    pub(super) async fn take_mobile_input_floor(
        &self,
        handle: &str,
        client_id: &str,
    ) -> Result<bool, TerminalSessionError> {
        let viewport = self
            .state
            .with_mut(handle, |record| {
                if record.process_exit_code.is_some() || record.control.is_none() {
                    return Err(TerminalSessionError::NotWritable);
                }
                let Some(viewer) = record.viewers.get(client_id) else {
                    return Ok(None);
                };
                if viewer.client.kind != TerminalClientType::Mobile {
                    return Ok(None);
                }
                record.display_mode = TerminalDisplayMode::Auto;
                record.driver = TerminalDriver::Mobile(client_id.to_owned());
                Ok(viewer.cols.zip(viewer.rows))
            })
            .ok_or(TerminalSessionError::NotFound)??;
        if let Some((cols, rows)) = viewport {
            self.mobile_fit(handle, client_id.to_owned(), cols, rows)
                .await?;
        }
        self.publish_driver(handle);
        Ok(true)
    }

    pub(crate) async fn mobile_fit(
        &self,
        handle: &str,
        client_id: String,
        cols: u16,
        rows: u16,
    ) -> Result<TerminalResizeResult, TerminalSessionError> {
        let cols = cols.clamp(20, 240);
        let rows = rows.clamp(8, 120);
        let (control, previous_cols, previous_rows, revision, prior_owner, prior_driver) = self
            .state
            .with_mut(handle, |record| {
                let (previous_cols, previous_rows) = record
                    .viewport_owner
                    .as_ref()
                    .map_or((record.cols, record.rows), |owner| {
                        (owner.previous_cols, owner.previous_rows)
                    });
                let prior_owner = record.viewport_owner.clone();
                let prior_driver = record.driver.clone();
                record.viewport_revision = record.viewport_revision.saturating_add(1);
                let revision = record.viewport_revision;
                record.viewport_owner = Some(ViewportOwner {
                    client_id: client_id.clone(),
                    kind: ViewportOwnerKind::Mobile,
                    previous_cols,
                    previous_rows,
                });
                record.driver = TerminalDriver::Mobile(client_id);
                record.cols = cols;
                record.rows = rows;
                (
                    record.control.clone(),
                    previous_cols,
                    previous_rows,
                    revision,
                    prior_owner,
                    prior_driver,
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let Some(control) = control else {
            self.rollback_viewport(
                handle,
                revision,
                prior_owner,
                prior_driver,
                previous_cols,
                previous_rows,
            );
            return Err(TerminalSessionError::NotWritable);
        };
        if let Err(error) = control.resize(cols, rows).await {
            self.rollback_viewport(
                handle,
                revision,
                prior_owner,
                prior_driver,
                previous_cols,
                previous_rows,
            );
            return Err(error);
        }
        self.state.with_mut(handle, |record| {
            let _ = record
                .stream_events
                .send(super::model::TerminalStreamEvent::Resized {
                    cols,
                    rows,
                    sequence: record.sequence,
                });
        });
        self.publish_fit(handle, "mobile-fit", cols, rows);
        self.publish_driver(handle);
        Ok(TerminalResizeResult {
            cols,
            mode: "mobile-fit",
            previous_cols: Some(previous_cols),
            previous_rows: Some(previous_rows),
            rows,
        })
    }

    pub(crate) async fn restore_fit(
        &self,
        handle: &str,
        client_id: &str,
    ) -> Result<TerminalResizeResult, TerminalSessionError> {
        self.restore_fit_inner(handle, client_id, false)
            .await?
            .ok_or(TerminalSessionError::InvalidInput("mobile viewer active"))
    }

    pub(super) async fn auto_restore_fit(
        &self,
        handle: &str,
        client_id: &str,
    ) -> Result<Option<TerminalResizeResult>, TerminalSessionError> {
        self.restore_fit_inner(handle, client_id, true).await
    }

    async fn restore_fit_inner(
        &self,
        handle: &str,
        client_id: &str,
        requires_no_mobile_viewer: bool,
    ) -> Result<Option<TerminalResizeResult>, TerminalSessionError> {
        let restore = self
            .state
            .with_mut(handle, |record| {
                if requires_no_mobile_viewer
                    && record
                        .viewers
                        .values()
                        .any(|viewer| viewer.client.kind == TerminalClientType::Mobile)
                {
                    return None;
                }
                let owner = record.viewport_owner.clone();
                let previous_cols = record.cols;
                let previous_rows = record.rows;
                let prior_driver = record.driver.clone();
                if owner
                    .as_ref()
                    .is_some_and(|owner| owner.client_id == client_id)
                {
                    record.viewport_revision = record.viewport_revision.saturating_add(1);
                    record.viewport_owner = None;
                    record.driver = TerminalDriver::Desktop;
                }
                Some((
                    record.control.clone(),
                    owner,
                    record.viewport_revision,
                    previous_cols,
                    previous_rows,
                    prior_driver,
                ))
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let Some((control, owner, revision, previous_cols, previous_rows, prior_driver)) = restore
        else {
            return Ok(None);
        };
        let owner = owner.ok_or(TerminalSessionError::InvalidInput("no active override"))?;
        if owner.client_id != client_id {
            return Err(TerminalSessionError::InvalidInput("not override owner"));
        }
        let Some(control) = control else {
            self.rollback_viewport(
                handle,
                revision,
                Some(owner),
                prior_driver,
                previous_cols,
                previous_rows,
            );
            return Err(TerminalSessionError::NotWritable);
        };
        if let Err(error) = control
            .resize(owner.previous_cols, owner.previous_rows)
            .await
        {
            self.rollback_viewport(
                handle,
                revision,
                Some(owner.clone()),
                prior_driver,
                previous_cols,
                previous_rows,
            );
            return Err(error);
        }
        self.state.with_mut(handle, |record| {
            if record.viewport_revision == revision && record.viewport_owner.is_none() {
                record.cols = owner.previous_cols;
                record.rows = owner.previous_rows;
                let _ = record
                    .stream_events
                    .send(super::model::TerminalStreamEvent::Resized {
                        cols: record.cols,
                        rows: record.rows,
                        sequence: record.sequence,
                    });
            }
        });
        self.publish_fit(
            handle,
            "desktop-fit",
            owner.previous_cols,
            owner.previous_rows,
        );
        self.publish_driver(handle);
        Ok(Some(TerminalResizeResult {
            cols: owner.previous_cols,
            mode: "desktop-fit",
            previous_cols: None,
            previous_rows: None,
            rows: owner.previous_rows,
        }))
    }

    pub(crate) async fn update_viewport(
        &self,
        handle: &str,
        client: TerminalClient,
        cols: u16,
        rows: u16,
        claim: bool,
    ) -> Result<(bool, bool), TerminalSessionError> {
        let cols = cols.clamp(20, 240);
        let rows = rows.clamp(8, 120);
        let update = self
            .state
            .with_mut(handle, |record| {
                if record.process_exit_code.is_some() || record.control.is_none() {
                    return Err(TerminalSessionError::NotWritable);
                }
                let Some(viewer) = record.viewers.get_mut(&client.id) else {
                    return Ok(None);
                };
                if viewer.client.kind != client.kind {
                    return Ok(None);
                }
                record.viewer_activity = record.viewer_activity.saturating_add(1);
                viewer.activity = record.viewer_activity;
                viewer.cols = Some(cols);
                viewer.rows = Some(rows);
                match client.kind {
                    TerminalClientType::Mobile => {
                        if record.display_mode == TerminalDisplayMode::Desktop {
                            return Ok(Some(false));
                        }
                    }
                    TerminalClientType::Desktop => {
                        if claim {
                            record.desktop_viewport_owner = Some(client.id.clone());
                            record.driver = TerminalDriver::Desktop;
                        }
                        if record.desktop_viewport_owner.as_deref() != Some(client.id.as_str()) {
                            return Ok(Some(false));
                        }
                    }
                    TerminalClientType::Cli
                    | TerminalClientType::Daemon
                    | TerminalClientType::Extension => return Ok(Some(false)),
                }
                Ok(Some(true))
            })
            .ok_or(TerminalSessionError::NotFound)??;
        let Some(should_apply) = update else {
            return Ok((false, false));
        };
        if !should_apply {
            return Ok((true, false));
        }
        if client.kind == TerminalClientType::Mobile {
            self.mobile_fit(handle, client.id, cols, rows).await?;
        } else {
            self.desktop_fit(handle, client.id, cols, rows).await?;
        }
        Ok((true, true))
    }

    async fn desktop_fit(
        &self,
        handle: &str,
        client_id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), TerminalSessionError> {
        let (control, previous_cols, previous_rows, revision, prior_owner, prior_driver) = self
            .state
            .with_mut(handle, |record| {
                let (previous_cols, previous_rows) = record
                    .viewport_owner
                    .as_ref()
                    .map_or((record.cols, record.rows), |owner| {
                        (owner.previous_cols, owner.previous_rows)
                    });
                let prior_owner = record.viewport_owner.clone();
                let prior_driver = record.driver.clone();
                record.viewport_revision = record.viewport_revision.saturating_add(1);
                let revision = record.viewport_revision;
                record.viewport_owner = Some(ViewportOwner {
                    client_id,
                    kind: ViewportOwnerKind::RemoteDesktop,
                    previous_cols,
                    previous_rows,
                });
                record.cols = cols;
                record.rows = rows;
                record.driver = TerminalDriver::Desktop;
                (
                    record.control.clone(),
                    previous_cols,
                    previous_rows,
                    revision,
                    prior_owner,
                    prior_driver,
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let Some(control) = control else {
            self.rollback_viewport(
                handle,
                revision,
                prior_owner,
                prior_driver,
                previous_cols,
                previous_rows,
            );
            return Err(TerminalSessionError::NotWritable);
        };
        if let Err(error) = control.resize(cols, rows).await {
            self.rollback_viewport(
                handle,
                revision,
                prior_owner,
                prior_driver,
                previous_cols,
                previous_rows,
            );
            return Err(error);
        }
        self.publish_resize(handle, revision, cols, rows);
        self.publish_fit(handle, "desktop-fit", cols, rows);
        self.publish_driver(handle);
        Ok(())
    }

    fn publish_resize(&self, handle: &str, revision: u64, cols: u16, rows: u16) {
        self.state.with_mut(handle, |record| {
            if record.viewport_revision == revision {
                let _ = record
                    .stream_events
                    .send(super::model::TerminalStreamEvent::Resized {
                        cols,
                        rows,
                        sequence: record.sequence,
                    });
            }
        });
    }

    fn rollback_viewport(
        &self,
        handle: &str,
        revision: u64,
        owner: Option<ViewportOwner>,
        driver: TerminalDriver,
        cols: u16,
        rows: u16,
    ) {
        self.state.with_mut(handle, |record| {
            if record.viewport_revision == revision {
                record.viewport_owner = owner;
                record.driver = driver;
                record.cols = cols;
                record.rows = rows;
            }
        });
    }

    pub(super) fn publish_driver(&self, handle: &str) {
        if let Some((pty_id, driver)) = self.state.with(handle, |record| {
            let driver = match &record.driver {
                TerminalDriver::Idle => serde_json::json!({ "kind": "idle" }),
                TerminalDriver::Desktop => serde_json::json!({ "kind": "desktop" }),
                TerminalDriver::Mobile(client_id) => {
                    serde_json::json!({ "kind": "mobile", "clientId": client_id })
                }
            };
            (record.pty_id.clone(), driver)
        }) {
            let _ = self.driver_events.send(serde_json::json!({
                "type": "terminalDriverChanged",
                "ptyId": pty_id,
                "driver": driver
            }));
        }
    }

    fn publish_fit(&self, handle: &str, mode: &str, cols: u16, rows: u16) {
        if let Some(pty_id) = self.state.with(handle, |record| record.pty_id.clone()) {
            let _ = self.driver_events.send(serde_json::json!({
                "type": "terminalFitOverrideChanged",
                "ptyId": pty_id,
                "mode": mode,
                "cols": cols,
                "rows": rows
            }));
        }
    }
}

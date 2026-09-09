use std::sync::Arc;
use tokio::sync::watch;

use super::super::run_output;
use super::super::{SkillRunFailure, SkillUpdateRun, SkillsAuthority, clamp_output, now};

impl SkillsAuthority {
    pub(crate) async fn finish_success(
        &self,
        operation: String,
        names: Vec<String>,
        source: Option<String>,
        output: String,
    ) {
        let mut run = self.run.lock().await;
        let next = SkillUpdateRun::Success {
            operation,
            names,
            source,
            finished_at: now(),
            output: clamp_output(output),
        };
        *run = next.clone();
        drop(run);
        let _ = self.events.send(next);
    }

    pub(crate) async fn finish_error(
        &self,
        operation: String,
        names: Vec<String>,
        source: Option<String>,
        output: String,
        failure: SkillRunFailure,
    ) {
        let mut run = self.run.lock().await;
        let next = SkillUpdateRun::Error {
            operation,
            names: names.clone(),
            source,
            finished_at: now(),
            output: clamp_output(output),
            failed_names: failure.failed_names,
            kind: failure.kind.to_owned(),
            command: None,
            detail: (failure.kind == "launch-failed").then_some(failure.detail),
            exit_code: failure.exit_code,
        };
        *run = next.clone();
        drop(run);
        let _ = self.events.send(next);
    }

    pub(crate) async fn finish_cancelled(&self) {
        let mut run = self.run.lock().await;
        *run = SkillUpdateRun::Idle;
        drop(run);
        let _ = self.events.send(SkillUpdateRun::Idle);
    }

    async fn publish_output(&self, output: String) {
        let mut run = self.run.lock().await;
        let SkillUpdateRun::Running {
            output: current, ..
        } = &mut *run
        else {
            return;
        };
        if *current == output {
            return;
        }
        *current = output;
        let next = run.clone();
        drop(run);
        let _ = self.events.send(next);
    }

    pub(crate) async fn cancel(&self) -> SkillUpdateRun {
        let sender = self.cancel.lock().await.clone();
        let mut run = self.run.lock().await;
        if let SkillUpdateRun::Running { stopping, .. } = &mut *run {
            *stopping = Some(true);
        }
        let next = run.clone();
        drop(run);
        if let Some(sender) = sender {
            let _ = sender.send(true);
        }
        let _ = self.events.send(next.clone());
        next
    }

    pub(crate) async fn acknowledge(&self) -> SkillUpdateRun {
        let mut run = self.run.lock().await;
        if matches!(
            *run,
            SkillUpdateRun::Success { .. } | SkillUpdateRun::Error { .. }
        ) {
            *run = SkillUpdateRun::Idle;
        }
        run.clone()
    }

    pub(crate) async fn state(&self) -> SkillUpdateRun {
        self.run.lock().await.clone()
    }
}

pub(crate) async fn relay_output(
    authority: SkillsAuthority,
    output: Arc<run_output::SkillRunOutput>,
    mut changes: watch::Receiver<u64>,
    mut done: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            result = changes.changed() => {
                if result.is_err() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                changes.borrow_and_update();
                authority.publish_output(output.text()).await;
            }
            result = done.changed() => {
                if result.is_err() || *done.borrow() {
                    authority.publish_output(output.text()).await;
                    break;
                }
            }
        }
    }
}

use crate::feedback::FeedbackAuthority;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct FeedbackRpc {
    feedback: FeedbackAuthority,
}

impl FeedbackRpc {
    pub(super) fn new(feedback: FeedbackAuthority) -> Self {
        Self { feedback }
    }
}

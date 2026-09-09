mod authority;
mod bootstrap;
mod cohorts;
mod consent;
mod identity;
mod limits;
mod model;
mod posthog;
mod refinements;
mod validator;

pub(crate) use authority::{FeatureInteractionTelemetry, TelemetryAuthority};
pub(crate) use model::{
    ConsentDisabledReason, ConsentState, SupportDiagnosticReport, SupportReportError,
    SupportReportSubmission, TelemetryError,
};

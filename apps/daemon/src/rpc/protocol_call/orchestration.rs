use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter,
};

pub(super) enum Method {
    RunCreate,
    RunUse,
    RunCurrent,
    RunList,
    RunShow,
    TaskCreate,
    TaskList,
    TaskUpdate,
    Dispatch,
    DispatchShow,
    Send,
    Check,
    Reply,
    Inbox,
    Ask,
    Run,
    RunStop,
    GateCreate,
    GateResolve,
    GateList,
    Reset,
    WorkerStart,
    WorkerShow,
    WorkerRead,
    WorkerStop,
    WorkerAbandon,
    FederationAttachStart,
    FederationPull,
    FederationAck,
    FederationImport,
    FederationShow,
    FederationRead,
    FederationReadOutput,
    FederationStop,
}

impl ProtocolRouter {
    pub(super) async fn handle_orchestration(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::RunCreate => self
                .orchestration
                .protocol_run_create(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RunUse => self
                .orchestration
                .protocol_run_use(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RunCurrent => self
                .orchestration
                .protocol_run_current(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RunList => self
                .orchestration
                .protocol_run_list(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RunShow => self
                .orchestration
                .protocol_run_show(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TaskCreate => self
                .orchestration
                .protocol_task_create(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TaskList => self
                .orchestration
                .protocol_task_list(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TaskUpdate => self
                .orchestration
                .protocol_task_update(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Dispatch => self
                .orchestration
                .protocol_dispatch(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::DispatchShow => self
                .orchestration
                .protocol_dispatch_show(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Send => self
                .orchestration
                .protocol_send(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Check => self
                .orchestration
                .protocol_check(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Reply => self
                .orchestration
                .protocol_reply(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Inbox => self
                .orchestration
                .protocol_inbox(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Ask => self
                .orchestration
                .protocol_ask(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Run => self
                .orchestration
                .protocol_run(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RunStop => self
                .orchestration
                .protocol_run_stop(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::GateCreate => self
                .orchestration
                .protocol_gate_create(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::GateResolve => self
                .orchestration
                .protocol_gate_resolve(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::GateList => self
                .orchestration
                .protocol_gate_list(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::Reset => self
                .orchestration
                .protocol_reset(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorkerStart => self
                .orchestration
                .protocol_worker_start(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorkerShow => self
                .orchestration
                .protocol_worker_show(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorkerRead => self
                .orchestration
                .protocol_worker_read(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorkerStop => self
                .orchestration
                .protocol_worker_stop(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorkerAbandon => self
                .orchestration
                .protocol_worker_abandon(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationAttachStart => self
                .orchestration
                .protocol_federation_attach_start(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationPull => self
                .orchestration
                .protocol_federation_pull(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationAck => self
                .orchestration
                .protocol_federation_ack(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationImport => self
                .orchestration
                .protocol_federation_import(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationShow => self
                .orchestration
                .protocol_federation_show(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationRead => self
                .orchestration
                .protocol_federation_read(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationReadOutput => self
                .orchestration
                .protocol_federation_read_output(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::FederationStop => self
                .orchestration
                .protocol_federation_stop(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}

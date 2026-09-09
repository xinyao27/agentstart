#[derive(Clone)]
pub(crate) struct LayoutRecipe {
    pub(crate) name: String,
    pub(crate) panes: Vec<LayoutPane>,
}

#[derive(Clone)]
pub(crate) enum LayoutPane {
    Agent {
        agent: String,
        prompt: Option<String>,
        title: String,
    },
    Command {
        command: String,
        title: String,
    },
    Shell {
        title: String,
    },
}

pub(crate) struct LayoutAppliedPane {
    pub(crate) terminal_handle: String,
    pub(crate) title: String,
    // Why: only agent panes have a session distinct from the terminal itself (see
    // rpc/agent_session.rs AgentSessionAuthority::launch); command/shell panes leave this None.
    pub(crate) session_id: Option<String>,
}

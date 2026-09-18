# Agent Task Loop Domain

This context describes the task orchestration language shared by the command-line interface and external Agent integrations.

## Language

**Task**:
A unit of requested work whose authoritative business fields and lifecycle are owned by one Task Backend.
_Avoid_: Job, ticket

**Task Backend**:
The system of record that stores Tasks and authorizes reads and mutations for them.
_Avoid_: Task cache, Rivus Memory

**Task Run**:
One execution and review workflow for a Task, including recovery, rework, acceptance, and publication state.
_Avoid_: Rivus run, chat session

**Task Manager**:
An Agent-facing application boundary that lists, reads, creates, and starts Tasks without exposing backend credentials or Task Run internals.
_Avoid_: Task Backend, worker

**External Worker**:
The configured coding-agent process that performs a Task Run under agent-task-loop orchestration.
_Avoid_: Rivus subagent, Task Manager

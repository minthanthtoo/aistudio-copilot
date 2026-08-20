# AI OS & Harness System Research

> **Source URL:** [https://chatgpt.com/share/6a858002-346c-83ec-8782-1e624e200616](https://chatgpt.com/share/6a858002-346c-83ec-8782-1e624e200616)  
> **Topic:** Deep research about harness systems and loops (goal setting); ways to extend it to an AI OS.

---

## 👤 User Prompt

> deep research about harness system and loop (goal setting); way to extend it to AI OS

---

## 🤖 Assistant Response

Yes. I think the important conclusion from the 2025–2026 harness work is that **“the agent loop” is becoming a primitive of its own, and the next step is to turn that primitive into an operating system.**

I dug through Anthropic’s long-running harness work, its `/goal` implementation patterns, OpenAI’s newer Agents SDK architecture, and several 2026 long-horizon/AOS papers. The convergence is surprisingly strong.

# 1. The fundamental shift: Model → Agent → Harness → AI OS

The old mental model is:

```text
User
  ↓
LLM
  ↓
Answer
```

Then agent systems became:

```text
User
  ↓
LLM
 ↙ ↓ ↘
Tools / Memory / Computer
```

But the 2025–26 harness work reveals a more accurate model:

```text
                 ┌──────────────────────┐
                 │       GOAL            │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │       HARNESS        │
                 │                      │
                 │ plan → act → observe │
                 │      → evaluate      │
                 │      → repeat        │
                 └──────────┬───────────┘
                            ↓
                       FOUNDATION
                          MODEL
                            ↓
              ┌─────────────┼─────────────┐
              ↓             ↓             ↓
            Tools        Memory        Sandbox
```

The model is increasingly **the reasoning engine**, not the entire agent.

Anthropic explicitly describes an agent harness as the infrastructure that processes inputs, orchestrates tool calls and allows a model to operate as an agent. Their long-running experiments showed that simply putting an LLM in a loop isn't enough: you need decomposition, state, handoffs, verification and evaluation. citeturn1search3turn0search3

OpenAI's 2026 Agents SDK evolution is moving in essentially the same direction: model-native harness + memory + tools + sandbox + orchestration + durable execution, with the harness separated from compute. citeturn2search0

And Anthropic's Managed Agents architecture goes one level further: **session, harness and sandbox become independent abstractions**, explicitly inspired by operating-system virtualization. citeturn2search1

That's the key clue.

---

# 2. What exactly is the “loop”?

A naïve agent loop is:

```python
while not_done:
    response = model(context)
    execute(response.tool_calls)
    context += result
```

This is useful, but fundamentally weak.

The important evolution is:

```text
GOAL
 ↓
PLAN
 ↓
ACT
 ↓
OBSERVE
 ↓
VERIFY
 ↓
UPDATE STATE
 ↓
SELECT NEXT ACTION
 ↓
ACT
 ↓
...
```

And eventually:

```text
                         ┌──────────────┐
                         │     GOAL     │
                         └──────┬───────┘
                                ↓
                       ┌────────────────┐
                       │  State Manager │
                       └───────┬────────┘
                               ↓
                         Select Task
                               ↓
                    ┌────────────────────┐
                    │      Executor      │
                    │      (LLM)         │
                    └─────────┬──────────┘
                              ↓
                            ACT
                              ↓
                          ENVIRONMENT
                              ↓
                           OBSERVE
                              ↓
                    ┌────────────────────┐
                    │      AUDITOR       │
                    └─────────┬──────────┘
                              ↓
                    ┌─────────┴──────────┐
                    │                    │
                  FAIL                 PASS
                    │                    │
                    ↓                    ↓
                 REPAIR              UPDATE STATE
                    │                    │
                    └──────────┬─────────┘
                               ↓
                         NEXT TASK
```

This is very close to the **Manage–Execute–Audit (MEA)** architecture proposed in LongHorizon-Harness, published August 2026. It explicitly moves task state outside the execution context and only updates it from independently verified environmental facts. citeturn1academia48

That is much more important than it initially looks.

---

# 3. The breakthrough: `/goal` isn't really a “goal feature”

Anthropic's current long-running-agent primitives describe Claude Code's `/goal` roughly as:

```text
User defines completion condition

       ↓

Agent works

       ↓

Fast separate evaluator
       ↓
  "Is goal satisfied?"

       ↓
 NO → continue
 YES → stop
```

The crucial part is that **the agent doesn't get to decide that it is finished by itself**.

Anthropic's public long-running harness repository describes three particularly important mechanisms:

1. **Default-fail completion**
2. **Fresh-context evaluator**
3. **Agent-maintained handoff/state**

The evaluator has not seen the builder's reasoning and therefore provides an independent check. citeturn1search0turn1search1

That's a profound architectural change.

Instead of:

```text
Agent:
"I think I'm done."
```

you get:

```text
Agent:
"I performed work."

Environment:
"Here is what actually changed."

Evaluator:
"Here is whether the requirement is actually satisfied."

Harness:
"Therefore you may / may not continue."
```

This is the beginning of **AI runtime verification**.

---

# 4. Why goal-setting matters so much

A conventional program has an explicit control flow:

```text
A → B → C → D → E
```

An agent doesn't.

It has:

```text
Goal
 ↓
Reason
 ↓
choose action
 ↓
observe
 ↓
reason
 ↓
choose action
 ↓
...
```

Therefore **the goal becomes the equivalent of the program's control-flow specification.**

That means an AI OS needs to treat goals as first-class objects.

Not just:

```text
prompt = "build me a website"
```

but something like:

```yaml
goal:
  id: G-10482

  objective:
    "Launch the customer portal."

  success_conditions:
    - authentication works
    - customer can view account
    - payment works
    - tests pass
    - production deployment succeeds

  constraints:
    budget: $100
    deadline: 48h
    permissions:
      - github
      - cloud
      - database

  priority: 0.92

  authority:
    spending_limit: $500

  verification:
    mode: independent

  status:
    ACTIVE
```

Now the OS can reason about the goal itself.

---

# 5. Goal hierarchy is the missing layer

This is where I think your **AI OS idea** can go substantially beyond today's coding harnesses.

Don't have one goal.

Have a **Goal Graph**.

```text
                    LIFE / COMPANY OBJECTIVES
                              │
                ┌─────────────┼─────────────┐
                ↓             ↓             ↓
             Business       Product       Personal
                │             │
                ↓             ↓
             Revenue       Launch MVP
                │             │
         ┌──────┼──────┐      ├───────────────┐
         ↓      ↓      ↓      ↓               ↓
       Sales  Growth  Cost   Backend        Frontend
                              │
                     ┌────────┼────────┐
                     ↓        ↓        ↓
                    API      DB       Auth
```

This produces a **Goal DAG** rather than a task list.

The distinction matters:

### Task

> Send email to customer.

### Goal

> Increase probability that customer renews.

The task can change.

The goal remains.

That's exactly what an autonomous system needs.

---

# 6. Goal → Objective → Task → Action

I'd define four levels.

```text
GOAL
"What ultimately matters?"

    ↓

OBJECTIVE
"What measurable state should exist?"

    ↓

TASK
"What bounded piece of work advances it?"

    ↓

ACTION
"What should I do right now?"
```

Example:

```text
GOAL
Increase SaaS revenue

        ↓

OBJECTIVE
Reach $50k MRR

        ↓

TASK
Improve conversion rate

        ↓

SUBTASK
Analyze signup funnel

        ↓

ACTION
Query analytics database
```

After querying:

```text
OBSERVATION
Mobile conversion is 40% lower.

        ↓

NEW TASK
Investigate mobile onboarding.

        ↓

ACTION
Inspect mobile UI.

        ↓

OBSERVATION
Signup form has 7 unnecessary fields.
```

The agent isn't following a static plan.

It is **continuously transforming the goal into the next best executable state transition.**

That is much closer to an OS.

---

# 7. The AI OS loop

I would define the core loop as:

```text
┌──────────────────────────────────────────┐
│                 GOAL                     │
│                                          │
│ Desired future state                     │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│             STATE MANAGER                │
│                                          │
│ What is true now?                        │
│ What is uncertain?                       │
│ What changed?                            │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│              PLANNER                     │
│                                          │
│ What should happen next?                 │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│             SCHEDULER                    │
│                                          │
│ Which goal/task gets resources now?      │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│              EXECUTOR                    │
│                                          │
│ LLM + tools + agents + sandbox           │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│             ENVIRONMENT                  │
│                                          │
│ World / apps / files / APIs / humans     │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│             OBSERVER                     │
│                                          │
│ What actually happened?                  │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│             EVALUATOR                    │
│                                          │
│ Did reality satisfy the contract?        │
└────────────────────┬─────────────────────┘
                     ↓
              STATE UPDATE
                     │
                     └──────────→ LOOP
```

This should be the **kernel** of the AI OS.

Everything else plugs into it.

---

# 8. But there is an even more important distinction

Today's harnesses mostly optimize:

> **How can I get one agent to complete a long task?**

An AI OS should optimize:

> **How can I continuously manage thousands of goals across time, agents, environments and resources?**

That's the transition from **harness → OS**.

Compare:

| Harness | AI OS |
|---|---|
| One task | Goal ecosystem |
| One agent | Many agents |
| One session | Persistent processes |
| Prompt | Goal object |
| Context | System state |
| Tool call | System call |
| Agent loop | Scheduler |
| Memory | Persistent state |
| Evaluator | Verification subsystem |
| Sandbox | Process/container |
| Permissions | Capability/security system |
| Logs | Event journal |
| Planner | Runtime scheduler/planner |
| Handoff | Process state |
| Stop condition | Goal termination |
| Retry | Fault recovery |
| Human intervention | Operator control |
| Model | Compute resource |

This mapping isn't merely metaphorical.

The recent AOS literature explicitly argues that agent workloads stress classical OS abstractions around scheduling, memory/state management, security, observability and governance. citeturn2academia15turn2academia16

---

# 9. The AI OS kernel

I'd therefore define your AI OS kernel around **eight primitives**.

### 1. Goal

```text
Goal(id, objective, constraints, priority, authority)
```

### 2. State

```text
State(goal_state, world_state, agent_state, uncertainty)
```

### 3. Process

```text
AgentProcess(id, model, capabilities, state)
```

### 4. Action

```text
Action(tool, arguments, authority, expected_effect)
```

### 5. Event

```text
Event(timestamp, actor, action, observation, result)
```

### 6. Evaluation

```text
Evaluation(criteria, evidence, verdict, confidence)
```

### 7. Capability

```text
Capability(resource, permission, scope, expiration)
```

### 8. Schedule

```text
Schedule(goal, priority, deadline, resources)
```

Then the fundamental syscall-like interface could become:

```text
CREATE_GOAL
READ_STATE
PLAN
SPAWN_AGENT
EXECUTE
OBSERVE
EVALUATE
UPDATE_STATE
SCHEDULE
DELEGATE
CHECK_PERMISSION
CHECKPOINT
SUSPEND
RESUME
CANCEL
```

That's much more interesting than building another agent framework.

---

# 10. Persistent state must live outside the model

This is perhaps the most important engineering lesson from the recent research.

Don't make:

```text
LLM context = memory
```

Instead:

```text
                    AI OS
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
     Persistent State        Execution Context
          │                       │
      durable                  temporary
      external                 disposable
```

Anthropic's Managed Agents architecture explicitly separates the durable session event log from the harness and sandbox, allowing the harness or execution environment to fail and be replaced while preserving state. citeturn2search1

OpenAI's newer Agents SDK similarly emphasizes externalized state, sandbox snapshots and rehydration for durable execution. citeturn2search0

So:

**Context window ≠ memory.**

Context is merely:

> the working set currently loaded into the model.

That's analogous to RAM.

Persistent state is closer to disk/database.

---

# 11. I'd divide AI memory into five layers

```text
L0  Working Context
    ↓
L1  Episode State
    ↓
L2  Task State
    ↓
L3  Long-Term Memory
    ↓
L4  Institutional Knowledge
```

### L0 — Working Context

Current reasoning.

Ephemeral.

### L1 — Episode State

What happened during this execution.

```text
tool calls
observations
errors
decisions
```

### L2 — Task State

```text
completed
blocked
next action
dependencies
verification
```

### L3 — Long-Term Memory

```text
user preferences
past decisions
successful strategies
failures
learned facts
```

### L4 — Institutional Memory

For a company:

```text
policies
architecture
customers
contracts
financial rules
organizational knowledge
```

This creates a genuine **AI memory hierarchy** rather than a vector database stuffed into a prompt.

---

# 12. The evaluator becomes analogous to a CPU's correctness machinery

This is where the `/goal` idea becomes much deeper.

A model can hallucinate:

```text
"I successfully deployed the application."
```

The OS should not trust that statement.

Instead:

```text
Agent claim
     ↓
Independent observation
     ↓
Evidence
     ↓
Evaluator
     ↓
Verified state
```

For example:

```text
Agent:
"Payment integration complete."

Evaluator:
HTTP endpoint → PASS
database transaction → PASS
test suite → PASS
real sandbox transaction → PASS
security policy → PASS

VERIFIED = TRUE
```

The state database should store:

```json
{
  "payment_integration": {
    "claimed": true,
    "verified": true,
    "evidence": [...]
  }
}
```

not merely:

```json
{
  "payment_integration": "done"
}
```

That distinction is enormous.

---

# 13. Default-fail should become an OS invariant

Anthropic's public harness primitives use a **default-FAIL contract**: a criterion begins false, and evidence must be inspected before it can be marked passing. citeturn1search0

Generalize this.

```text
UNKNOWN ≠ TRUE
CLAIMED ≠ VERIFIED
PLANNED ≠ STARTED
STARTED ≠ COMPLETED
COMPLETED ≠ VERIFIED
```

I'd make this a fundamental invariant:

> **The AI OS never promotes a state merely because an agent claims it.**

This is arguably more important than having a smarter planner.

---

# 14. Fresh-context evaluation is extremely powerful

The builder knows:

```text
what it intended
what it changed
what went wrong
what shortcuts it took
```

That creates confirmation bias.

The evaluator should know only:

```text
requirement
current environment
evidence
```

So:

```text
              BUILDER
                 │
                 ↓
              WORK
                 │
                 ↓
             ENVIRONMENT
                 │
       ┌─────────┴─────────┐
       ↓                   ↓
   Builder memory      Fresh evaluator
                           │
                           ↓
                         VERDICT
```

This pattern is already explicitly used in Anthropic's long-running harness primitives. citeturn1search0

I'd make **independent verification** a first-class OS service.

---

# 15. Then add a real scheduler

This is where your AI OS can move beyond Claude Code-style harnesses.

Imagine:

```text
Goal A
Priority 0.95
Deadline 2h
Expected value $10k

Goal B
Priority 0.70
Deadline 24h
Expected value $2k

Goal C
Priority 0.30
No deadline
```

The scheduler decides:

```text
CPU / model
tokens
sandbox
tools
agents
time
budget
parallelism
```

So the scheduler becomes something like:

```text
                    GOAL QUEUE
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
        Goal A       Goal B       Goal C
          │
          ↓
      Scheduler
          │
   ┌──────┼─────────┐
   ↓      ↓         ↓
 GPT    Claude    local model
   │      │         │
   └──────┼─────────┘
          ↓
       EXECUTE
```

Now **models become compute resources**.

That's a huge conceptual improvement.

---

# 16. Model routing becomes analogous to CPU scheduling

For example:

```text
Simple classification
        ↓
cheap local model

Planning
        ↓
strong reasoning model

Coding
        ↓
coding-specialized model

Evaluation
        ↓
independent verifier

Vision
        ↓
vision model

High-risk action
        ↓
strongest available model + human approval
```

The goal doesn't care which model performs the work.

It requests:

```text
capability:
  reasoning ≥ 0.9
  cost ≤ $2
  latency ≤ 30 sec
```

The OS selects the implementation.

This is similar to Anthropic's idea of keeping stable interfaces around sessions, harnesses and sandboxes so implementations can change underneath. citeturn2search1

---

# 17. Agent spawning should become process creation

Instead of:

```text
main agent → subagent
```

think:

```text
CREATE_PROCESS(
    goal = "research competitors",
    capabilities = ["web"],
    budget = "$5",
    deadline = "30m"
)
```

The OS returns:

```text
PID = agent_392
```

Then:

```text
agent_392
    ↓
research
    ↓
produce artifact
    ↓
verify
    ↓
return result
```

The parent doesn't need to know the internal reasoning.

It only receives:

```text
result
evidence
state
cost
confidence
```

That's **agent process isolation**.

---

# 18. This leads naturally to an Agent DAG

Instead of a single loop:

```text
A → B → C
```

you get:

```text
                 GOAL
                   │
            ┌──────┼──────┐
            ↓      ↓      ↓
         Research Design  Data
            │      │      │
            └──────┼──────┘
                   ↓
                Builder
                   │
             ┌─────┴─────┐
             ↓           ↓
          Tester       Security
             │           │
             └─────┬─────┘
                   ↓
                Auditor
                   ↓
                Deploy
```

The OS can dynamically modify this DAG based on observations.

That's more powerful than fixed workflows.

---

# 19. The loop should be adaptive, not fixed

This is an emerging research direction too.

CHILL-Harness, for example, treats orchestration itself as something that can adapt based on observed advantage rather than using a fixed workflow. citeturn0academia82

EvoHarness-RL goes further by treating harness state and harness-use policies as learnable, finding that successful agents can learn when to use external state rather than blindly accessing it every time. citeturn0academia81

So eventually:

```text
Loop policy
      ↓
observations
      ↓
performance
      ↓
learn
      ↓
better loop policy
```

The harness itself becomes adaptive.

---

# 20. And this creates the self-improving AI OS

Now we get something very interesting.

Today's system:

```text
MODEL
  ↓
HARNESS
  ↓
TASK
```

Future:

```text
                  AI OS
                    │
             ┌──────┴──────┐
             ↓             ↓
          Agents       Evaluators
             ↓             ↓
          Results       Metrics
             └──────┬──────┘
                    ↓
              Experience DB
                    ↓
              Harness Learner
                    ↓
          Improved orchestration
                    ↓
                 Agents
```

Every run generates:

```text
trajectory
failure
cause
successful strategy
cost
latency
verification
```

The OS learns:

> “For this class of task, this model + this tool sequence + this evaluator configuration performs better.”

That is a **runtime learning system**.

The recent Agentic Harness Engineering work is particularly relevant here: it treats harness components as observable, editable objects and uses outcome feedback to evolve the harness itself. citeturn0academia52

---

# 21. The AI OS should therefore have two loops

This is my strongest architectural recommendation.

## Inner loop — execution

```text
GOAL
 ↓
PLAN
 ↓
ACT
 ↓
OBSERVE
 ↓
VERIFY
 ↓
REPAIR
 ↓
repeat
```

## Outer loop — learning

```text
RUN
 ↓
TRACE
 ↓
EVALUATE
 ↓
ATTRIBUTE FAILURE
 ↓
DISCOVER PATTERN
 ↓
UPDATE POLICY/HARNESS
 ↓
NEXT RUN
```

So:

```text
              ┌─────────────────────────┐
              │      OUTER LOOP         │
              │                          │
              │ Learn how to operate     │
              └───────────┬─────────────┘
                          ↓
       ┌────────────────────────────────────┐
       │             INNER LOOP             │
       │                                    │
       │ Goal → Plan → Act → Observe → Eval │
       │   ↑                         ↓       │
       │   └──────── Repair ─────────┘       │
       └────────────────────────────────────┘
```

This is much closer to an actual **AI operating system**.

---

# 22. AI OS architecture I'd recommend

Putting everything together:

```text
┌─────────────────────────────────────────────────────────┐
│                       AI OS                              │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              CONTROL PLANE                        │  │
│  │                                                   │  │
│  │ Goal Manager                                      │  │
│  │ Policy / Authority                                │  │
│  │ Scheduler                                         │  │
│  │ Resource Manager                                  │  │
│  │ Agent Manager                                     │  │
│  │ Risk Manager                                      │  │
│  │ Human Oversight                                   │  │
│  └─────────────────────────┬─────────────────────────┘  │
│                            │                            │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │              EXECUTION PLANE                      │  │
│  │                                                   │  │
│  │ Planner                                           │  │
│  │ Executor                                          │  │
│  │ Tool Router                                       │  │
│  │ Model Router                                      │  │
│  │ Evaluator                                         │  │
│  │ Repair Engine                                     │  │
│  └─────────────────────────┬─────────────────────────┘  │
│                            │                            │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │                 STATE PLANE                       │  │
│  │                                                   │  │
│  │ Event Log                                         │  │
│  │ Goal State                                        │  │
│  │ Task State                                        │  │
│  │ Memory                                            │  │
│  │ Knowledge                                         │  │
│  │ Checkpoints                                       │  │
│  └─────────────────────────┬─────────────────────────┘  │
│                            │                            │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │                 CAPABILITY PLANE                  │  │
│  │                                                   │  │
│  │ MCP / APIs / Apps / Browser / Shell / Files       │  │
│  │ Sandboxes / Devices / External Agents             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

This aligns remarkably well with the emerging AOS literature's split between a **Control & Governance Plane** and a **Runtime & Coordination Plane**, while adding the explicit goal/evaluation/learning machinery that I think is necessary for your particular direction. citeturn2academia16

---

# 23. The most important design principle: don't make the LLM the kernel

This is where I would strongly disagree with many “AI OS” proposals.

Don't build:

```text
AI OS
  =
giant LLM agent
```

Instead:

```text
AI OS
  =
deterministic runtime
+
probabilistic intelligence
```

The LLM should decide:

```text
"What should I try?"
```

The OS should decide/enforce:

```text
"Are you allowed?"
"Does the resource exist?"
"Did it actually happen?"
"Was it verified?"
"How much budget remains?"
"Which process owns it?"
"Should it continue?"
"Can this agent delegate?"
```

This distinction is critical for reliability and security.

---

# 24. Deterministic kernel / probabilistic brain

I would formalize it as:

```text
                 PROBABILISTIC
                 ──────────────
                    MODEL
                     │
              reasoning / planning
                     │
                     ▼
          ┌──────────────────────┐
          │     AI OS KERNEL     │
          │                      │
          │ deterministic rules  │
          │ state transitions    │
          │ permissions          │
          │ budgets              │
          │ scheduling           │
          │ verification gates   │
          │ durability           │
          └──────────┬───────────┘
                     │
                 REAL WORLD
                 ──────────
```

The model can propose.

The kernel commits.

That's the right boundary.

---

# 25. Security becomes capability-based

Traditional OS:

```text
process → permission → resource
```

AI OS:

```text
agent
 ↓
capability
 ↓
resource
```

Example:

```yaml
agent: sales_agent_42

capabilities:
  - read:
      crm.customers

  - write:
      crm.notes

  - send:
      email.customers

limits:
  emails_per_hour: 100
  spending: 0
```

For high-risk operations:

```text
Agent wants:
DELETE_DATABASE

       ↓

Policy Engine

       ↓

DENY
```

Or:

```text
TRANSFER $50,000

       ↓

Human approval
```

Anthropic's Managed Agents architecture makes a similar structural security argument: credentials should not simply be exposed inside the execution environment where model-generated code runs. citeturn2search1

---

# 26. A goal itself should carry authority

This is an important extension I haven't seen implemented cleanly enough.

Suppose:

```text
Goal:
"Increase sales."
```

The agent should **not infer unlimited authority** from that goal.

Instead:

```yaml
goal:
  objective: increase_sales

  authority:
    read:
      - analytics
      - crm

    write:
      - crm

    communication:
      - email

    spending:
      max: $100
```

Therefore:

> **Intent does not imply authority.**

The goal system and security system must remain separate.

---

# 27. Goal conflicts become an OS problem

Imagine:

```text
Goal A:
maximize revenue

Goal B:
minimize spending

Goal C:
maintain customer satisfaction

Goal D:
ship before Friday
```

The OS needs a utility/priority system:

```text
maximize:
  revenue
  satisfaction
  speed

subject_to:
  budget ≤ X
  risk ≤ Y
  policy = satisfied
```

This starts resembling an optimization scheduler.

The model can propose strategies, but the OS controls the feasible region.

---

# 28. Failure handling should also be kernel-level

Today's agent often does:

```text
tool failed
 ↓
LLM tries again
```

AI OS:

```text
FAILURE
  ↓
classify
  ├── transient
  ├── permission
  ├── state conflict
  ├── model error
  ├── tool error
  ├── environmental
  └── unknown
       ↓
recovery policy
```

Then:

```text
network timeout
 → retry

container died
 → rehydrate

wrong output
 → evaluator → repair

permission denied
 → don't retry blindly

goal impossible
 → replan

repeated failure
 → escalate
```

This is **fault-tolerant agent computing**.

---

# 29. Checkpointing becomes equivalent to process persistence

You want:

```text
Agent running
    ↓
checkpoint
    ↓
crash
    ↓
new runtime
    ↓
restore
    ↓
continue
```

Not:

```text
container died
→ entire agent lost
```

Anthropic explicitly describes this decoupled model: the session log survives independently of the harness and sandbox, allowing a new harness to `wake(sessionId)` and resume from the durable event stream. citeturn2search1

That is almost exactly the foundation you need.

---

# 30. The OS should treat context as a cache

This is one of my favorite abstractions.

```text
Persistent State
      ↓
Context Manager
      ↓
select working set
      ↓
LLM context
```

Instead of:

```text
stuff everything into context
```

The agent requests:

```text
GET_CONTEXT(
   goal = G42,
   task = T17,
   relevant_events = last 20,
   relevant_memory = semantic,
   constraints = current
)
```

The context manager constructs the smallest useful working set.

This also solves the fundamental long-horizon problem.

The research repeatedly identifies context growth/state loss as a major failure mode. Anthropic's harness work uses context resets and structured handoffs; LongHorizon-Harness explicitly moves task state outside execution context. citeturn0search0turn1academia48

---

# 31. So the actual AI OS abstraction stack becomes

```text
                USER INTENT
                     ↓
                   GOAL
                     ↓
                OBJECTIVE
                     ↓
                TASK GRAPH
                     ↓
                 SCHEDULER
                     ↓
                AGENT PROCESS
                     ↓
                  HARNESS
                     ↓
                  MODEL
                     ↓
                 TOOL CALL
                     ↓
                ENVIRONMENT
                     ↓
                OBSERVATION
                     ↓
                VERIFICATION
                     ↓
               STATE COMMIT
                     ↓
                 NEXT STEP
```

And around all of it:

```text
Security
Memory
Budget
Policy
Observability
Durability
Human control
```

---

# 32. What current systems already have vs what is missing

| Capability | Claude Code | OpenAI Agents SDK | Modern harness research | Your AI OS |
|---|---:|---:|---:|---:|
| Agent loop | ✓ | ✓ | ✓ | ✓ |
| Tools | ✓ | ✓ | ✓ | ✓ |
| Sandbox | ✓ | ✓ | ✓ | ✓ |
| Long-running execution | ✓ | ✓ | ✓ | ✓ |
| Handoffs | ✓ | ✓ | ✓ | ✓ |
| Evaluator loop | ✓ | partial/available patterns | ✓ | **kernel primitive** |
| Persistent task state | partial | ✓ | ✓ | **first-class** |
| Goal hierarchy | partial | partial | emerging | **core** |
| Global goal scheduler | ✗ | partial | emerging | **core** |
| Agent process model | partial | ✓ | ✓ | **core** |
| Capability-based authority | partial | ✓ | ✓ | **core** |
| Cross-agent resource scheduling | limited | ✓ | emerging | **core** |
| Independent verification | ✓ | configurable | ✓ | **kernel** |
| Durable event log | emerging | ✓ | ✓ | **core** |
| Self-evolving harness | emerging | emerging | ✓ | **outer loop** |
| Persistent organizational memory | limited | configurable | emerging | **core** |
| Model-agnostic compute routing | limited | partial | ✓ | **core** |
| Human governance plane | partial | guardrails | emerging | **core** |

The industry is converging on many individual pieces, but they are still generally exposed as **agent frameworks, managed-agent services or coding harnesses**, rather than a unified OS abstraction.

---

# 33. Your biggest opportunity is therefore not “build a better agent”

I would frame the project as:

> **Build the runtime that turns probabilistic AI models into persistent, goal-directed computer processes.**

That is substantially more ambitious.

The model becomes replaceable.

For example:

```text
AI OS
 │
 ├── GPT
 ├── Claude
 ├── Gemini
 ├── DeepSeek
 ├── local model
 └── future model
```

The same:

```text
Goal
State
Scheduler
Memory
Policy
Evaluator
Tools
```

remain.

This is exactly the kind of implementation-independent abstraction that Anthropic is moving toward with Managed Agents. citeturn2search1

---

# 34. I'd define the AI OS MVP much smaller

Do **not** build all of this initially.

Build this:

```text
                 AI OS v0.1

                   Goal
                     │
                     ↓
              Goal State DB
                     │
                     ↓
                Task Planner
                     │
                     ↓
               Agent Runner
                     │
             ┌───────┼───────┐
             ↓       ↓       ↓
           Tools   Memory  Sandbox
             │       │       │
             └───────┼───────┘
                     ↓
                Evaluator
                     │
                ┌────┴────┐
                ↓         ↓
             PASS       FAIL
                │         │
                ↓         ↓
             Commit     Repair
                │         │
                └────┬────┘
                     ↓
                   Loop
```

Only after this works should you add:

```text
multi-agent scheduling
↓
model routing
↓
persistent memory
↓
authority
↓
self-evolving harness
↓
cross-environment execution
```

---

# 35. The killer primitive: `GOAL`

If I were designing the API, I'd make this the centerpiece.

Something conceptually like:

```python
goal = os.create_goal(
    objective="Launch the product",
    success=[
        "tests pass",
        "security audit passes",
        "deployment succeeds",
        "smoke test passes"
    ],
    constraints={
        "budget": 50,
        "deadline": "48h"
    }
)

os.run(goal)
```

And internally:

```text
create_goal
      ↓
decompose
      ↓
schedule
      ↓
spawn process
      ↓
execute
      ↓
observe
      ↓
evaluate
      ↓
update state
      ↓
replan
      ↓
repeat
```

The user shouldn't need to manually operate the loop.

**The OS owns the loop.**

---

# 36. The deepest conceptual shift

Traditional software:

> **Program → executes instructions → terminates**

Agentic software:

> **Agent → pursues goal → adapts → terminates**

AI OS:

> **Persistent system → manages goals → allocates intelligence → acts on environments → verifies reality → learns → continues**

That is the jump.

And interestingly, the latest AOS research is arriving at nearly the same conclusion from the systems side: agentic systems need OS-like abstractions for scheduling, context/memory, capabilities, policy, trust, observability and governance. citeturn2academia15turn2academia16

---

# 37. My proposed architecture for *your* AI OS

Given the architecture we've previously discussed around a **Control Plane / Execution Plane**, I would evolve it into:

```text
╔════════════════════════════════════════════════════════════╗
║                    AI OPERATING SYSTEM                     ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║                  CONTROL / GOVERNANCE                      ║
║                                                            ║
║  Goal Graph ─ Priority ─ Policy ─ Authority ─ Risk         ║
║       │                                                    ║
║       ▼                                                    ║
║  Global Scheduler ─ Resource Manager ─ Human Oversight     ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║                    COGNITION RUNTIME                       ║
║                                                            ║
║  Planner → Executor → Observer → Evaluator → Repair        ║
║      │          │          │          │                    ║
║      └──────────┴──────────┴──────────┘                    ║
║                         │                                  ║
║                    Agent Processes                         ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║                       STATE OS                             ║
║                                                            ║
║  Event Journal ─ Goal State ─ Task State ─ Memory          ║
║  Checkpoints ─ Knowledge ─ Experience ─ Evidence           ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║                     CAPABILITY OS                          ║
║                                                            ║
║  Models ─ MCP ─ APIs ─ Browser ─ Files ─ Shell ─ Apps      ║
║  Sandboxes ─ Devices ─ External Agents                     ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║                    LEARNING LOOP                           ║
║                                                            ║
║  Traces → Failure Attribution → Experience →               ║
║  Harness Optimization → Policy Improvement                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### And the central invariant:

**The model proposes.  
The harness executes.  
The environment provides truth.  
The evaluator verifies.  
The kernel commits state.  
The scheduler decides what happens next.**

That's the architecture I would build around.

---

## 38. The really interesting research frontier

There are actually **three loops**, not two:

### Loop 1 — Task loop

```text
Think → Act → Observe → Verify
```

### Loop 2 — Goal loop

```text
Goal → Decompose → Execute → Replan → Complete
```

### Loop 3 — OS evolution loop

```text
Experience
   ↓
Failure attribution
   ↓
Harness modification
   ↓
Evaluation
   ↓
Better harness
```

So the eventual architecture is:

```text
                 ┌─────────────────────────────┐
                 │       OS EVOLUTION LOOP     │
                 │                             │
                 │ Learn how to run agents     │
                 └──────────────┬──────────────┘
                                ↓
                ┌───────────────────────────────┐
                │         GOAL LOOP              │
                │                                │
                │ Manage → Execute → Audit       │
                └──────────────┬────────────────┘
                               ↓
                     ┌──────────────────┐
                     │    TASK LOOP     │
                     │                  │
                     │ Think → Act      │
                     │ → Observe → Eval │
                     └──────────────────┘
```

**That is where I think the “AI OS” concept becomes technically meaningful rather than just a rebranding of an agent framework.**

The current 2026 evidence is unusually supportive of this direction: Anthropic's long-running harnesses demonstrate the goal/evaluator/handoff primitives; OpenAI is separating harness, compute, memory and sandbox for durable agents; LongHorizon-Harness makes independently verified external state central; and newer work is beginning to make the harness itself adaptive/evolvable. citeturn1search0turn2search0turn1academia48turn0academia52

**My verdict:** the next architectural unit after the **agent harness** is not simply “multi-agent.” It is a **Goal Runtime / Agent OS** in which *goals, state, authority, scheduling, verification, and durable execution become kernel-level abstractions*. Multi-agent systems then become merely one workload running on top of it.

And that is much closer to the **Survivable AI OS / Control Plane + Execution Plane** direction you've been exploring than to a conventional LangGraph/OpenHands-style agent framework. memcite

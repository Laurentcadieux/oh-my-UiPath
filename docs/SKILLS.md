# docs/SKILLS.md — UiPath skills reference (27 skills)

`oh-my-UiPath` does not hardcode UiPath knowledge. It loads the installed
skills from the catalog at `~/.agents/skills/skills.catalog.json`
(see `src/skills/skill-loader.ts`) and binds them to agents.

List skills at runtime:

```bash
omu skills                 # list all installed skills
omu skills --search case   # free-text filter
omu skill uipath-maestro-case   # show one skill
```

## The 27 canonical skills and their agent mappings

| Skill | Owned by agent(s) | What it covers (summary) |
| --- | --- | --- |
| `uipath-admin` | (platform ops, not a core agent) | Identity Server, authorization, OMS, IP restriction, audit (`uip admin`). |
| `uipath-agents` | (future agent) | Coded & low-code UiPath Agents build/integrate/deploy. |
| `uipath-aops` | (future agent) | StudioAdmin AOps source control + CICD pipelines (`uip aops`). |
| `uipath-api-workflow` | (future agent) | Author/run/pack/publish JSON API workflows (`uip api-workflow`). |
| `uipath-automation-discovery` | (future agent) | Mine opportunities from Slack/email/wikis; size delivery. |
| `uipath-automationhub` | (future agent) | Publish/read business processes in Automation Hub. |
| `uipath-coded-apps` | (future agent) | Coded Web/Action Apps: scaffold, build, deploy. |
| `uipath-connector-builder` | (future agent) | Integration Service connector authoring (`uip is connectors builder`). |
| `uipath-feedback` | (utility) | Bug reports / suggestions via `uip feedback send`. |
| `uipath-functions` | (future agent) | Deterministic Python/JS/TS functions (`uip function`). |
| `uipath-governance` | (future agent) | AOps/access policies, compliance (`uip gov`). |
| `uipath-human-in-the-loop` | (future agent) | HITL node authoring in Flow/Maestro/Case/Agents. |
| `uipath-insights` | (future agent) | Job monitoring + read-only alerts (`uip insights`). |
| `uipath-ixp` | (future agent) | Document Understanding projects (`uip ixp`). |
| `uipath-maestro-bpmn` | (future agent) | `.bpmn` process orchestration. |
| `uipath-maestro-case` | **case-architect**, **quality-gate** | Case Management `caseplan.json` build/validate/pack. |
| `uipath-maestro-flow` | (future agent) | `.flow` Maestro Flow build/run/eval. |
| `uipath-mcp-servers` | (future agent) | AgentHub MCP server registration (`uip agenthub mcp`). |
| `uipath-planner` | **orchestrator**, **case-architect** | PDD/SDD authoring; multi-skill task derivation. |
| `uipath-platform` | **orchestrator**, **deployment-manager** | Cloud/Orchestrator/IS/Data Fabric ops via `uip`. |
| `uipath-process-mining` | (future agent) | Process app build/operate from event logs (`uip pm`). |
| `uipath-review` | **quality-gate** | Read-only review of RPA/agents/flows/solutions. |
| `uipath-rpa` | **solution-builder** | `.xaml`/`.cs` RPA workflow authoring. |
| `uipath-skill-catalog` | (meta) | Skill catalog management. |
| `uipath-solution` | **orchestrator**, **solution-builder**, **deployment-manager** | `.uipx` solution lifecycle (`uip solution`). |
| `uipath-tasks` | (future agent) | Action Center HITL tasks (`uip tasks`). |
| `uipath-test` | **quality-gate** | Test Manager projects/cases/sets/executions (`uip test`). |

> The catalog also contains `uipath-troubleshoot` (root-cause investigation
> across every product), which is outside the 27-skill scope of this scaffold.

## Agent → skill ownership (inverse view)

| Agent | Skills |
| --- | --- |
| orchestrator | uipath-platform, uipath-solution, uipath-planner |
| solution-builder | uipath-solution, uipath-rpa |
| case-architect | uipath-maestro-case, uipath-planner |
| deployment-manager | uipath-solution, uipath-platform |
| quality-gate | uipath-test, uipath-maestro-case, uipath-review |

## Extending

To claim a currently-"future agent" skill, add a new agent in `src/agents/`,
register it in `src/agents/index.ts`, and add its row to the table above.

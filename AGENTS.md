# Fantassist Project Instructions

## Development Workflow

- Use the Next.js development server and its live reload during implementation.
- Keep one development server running across ordinary source edits. Do not kill or restart it after code changes that Next.js can hot reload.
- Restart the server only when required by dependency, environment, Next.js configuration, build-mode, or server-process changes.
- Prefer focused tests at high-risk boundaries such as storage compatibility, scene-engine commands, renderer output, and deployment routing. Do not pursue exhaustive UI unit coverage solely for theoretical completeness.

## Browser Verification

- Use `agent-browser` for automated interaction checks when browser verification is useful.
- Avoid screenshots unless visual correctness specifically needs image inspection or the user requests one.
- For ordinary UI changes, verify behavior and accessibility structure programmatically, then give the user the route and concise steps for final visual approval.

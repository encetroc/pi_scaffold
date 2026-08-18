# Manifest-driven wizard

Each template declares its wizard questions, variables, and commands in a
`manifest.json`; scafstak renders whatever questions a stack's manifest
declares instead of asking hardcoded questions per stack. This is what makes
"add new stacks with AI" work: a new stack brings its own questions without
touching extension code. Rejected: hardcoding questions per stack in the
extension, which would require an extension edit for every new stack.

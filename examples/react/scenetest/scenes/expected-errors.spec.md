# Expected Errors

A scene can deliberately exercise an error path and assert the resulting
browser console error with `expectConsoleError`. The error is then reported as
a success — and the scene *fails* if it doesn't happen.

Saving a reserved name makes the (simulated) server reject the update with a
409, which the app logs to the console. The `name-taken` alias is defined in
`scenetest/config.ts`, so the spec reads in domain terms.

## saving a reserved name surfaces a friendly error

user:
- openTo /
- see name-input
- typeInto name-input taken
- click submit-button
- expectConsoleError name-taken
- see error
- seeText already in use

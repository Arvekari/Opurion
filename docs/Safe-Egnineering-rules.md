\# AI Safe Engineering Rules



\## Purpose



This document defines mandatory engineering rules for AI-assisted software development.



It is intended for use with:



\- GitHub Copilot

\- ChatGPT

\- Claude

\- Cursor

\- code generation agents

\- autonomous engineering agents

\- internal AI coding assistants



The purpose is to reduce:



\- insecure code generation

\- weak architecture decisions

\- missing tests

\- performance regressions

\- database inefficiencies

\- undocumented assumptions

\- fragile implementations



AI may assist development, but AI-generated code must always meet production engineering standards.



\---



\## Core Rule



AI-generated code is never trusted by default.



All AI-generated output must be treated as draft implementation until it has been:



\- reviewed

\- tested

\- validated

\- security-checked

\- performance-checked

\- aligned with architecture rules



Generated code that compiles is not automatically acceptable.



\---



\## Mandatory Engineering Requirements



AI-generated code must always aim to be:



\- readable

\- modular

\- maintainable

\- testable

\- secure by default

\- performance-aware

\- operationally supportable

\- consistent with project conventions



AI must not produce code that is:



\- overly clever

\- fragile

\- tightly coupled

\- dependent on hidden assumptions

\- insecure by convenience

\- undocumented

\- difficult to test

\- difficult to maintain



\---



\## Test-First Safety Rule



For every meaningful function, module, endpoint, or workflow, AI must also create or update appropriate automated tests.



At minimum, AI-generated changes must include relevant coverage for:



\- unit tests

\- validation tests

\- error handling tests

\- security tests where relevant

\- performance checks where relevant

\- integration tests where relevant



No feature is complete if tests are missing.



\---



\## Security-by-Default Rules



AI must never generate code that weakens security by convenience.



\### AI must always prefer:



\- parameterized database queries

\- prepared statements

\- output escaping

\- strict input validation

\- allowlists over denylists

\- secure password hashing

\- least-privilege access

\- safe error messages

\- secure defaults



\### AI must never generate:



\- raw SQL string concatenation for user input

\- plaintext password storage

\- hardcoded credentials

\- exposed secrets in code

\- debug mode enabled in production

\- unsafe deserialization

\- unrestricted file access

\- insecure default CORS policies

\- trust of client-side authorization alone



\---



\## Authentication and Authorization Rules



AI-generated authentication flows must include:



\- password hashing

\- session or token expiry

\- failed login handling

\- safe error responses

\- access control enforcement



AI-generated authorization logic must verify access on the server side.



AI must never assume that hidden UI controls are sufficient authorization.



\---



\## Secret Management Rules



AI must never place secrets directly in:



\- source code

\- test fixtures intended for production-like environments

\- logs

\- client-side code

\- public configuration files



Secrets must be referenced through secure configuration mechanisms such as:



\- environment variables

\- secret stores

\- platform-managed secret managers



AI must generate code that fails safely when required secrets are missing.



\---



\## Database Safety Rules



AI-generated database access must be safe, efficient, and predictable.



\### AI must always consider:



\- primary keys

\- foreign keys

\- uniqueness constraints

\- not-null requirements

\- transaction boundaries

\- rollback behavior

\- query efficiency

\- index requirements



\### AI must not generate:



\- repeated N+1 query patterns

\- unnecessary full table scans

\- unbounded queries without justification

\- update or delete statements without clear scope

\- schema changes without migration logic



\### Indexing rule



If a query filters, joins, or sorts repeatedly on a field, AI must consider whether an index is required.



AI should explicitly mention likely index candidates when generating:



\- repositories

\- ORM queries

\- search endpoints

\- reporting queries

\- dashboard backends



\---



\## Performance Safety Rules



AI-generated code must be resource-aware.



\### AI must prefer:



\- efficient algorithms

\- bounded loops

\- pagination for large result sets

\- batch operations when appropriate

\- streaming for large payloads when appropriate

\- caching only with clear invalidation logic



\### AI must avoid:



\- unnecessary nested loops

\- repeated expensive database calls

\- synchronous blocking where inappropriate

\- loading large datasets into memory without need

\- excessive object creation

\- hidden polling loops



Performance-sensitive logic should include measurable expectations where relevant.



Examples:



\- maximum response time

\- maximum memory usage

\- maximum startup time

\- maximum query count per request



\---



\## Error Handling Rules



AI-generated code must fail safely and clearly.



AI must:



\- validate inputs early

\- return understandable error messages

\- avoid leaking stack traces to end users

\- preserve enough detail in logs for debugging

\- use explicit error handling paths



AI must not silently swallow exceptions unless there is a documented reason.



\---



\## Logging and Observability Rules



AI-generated code must support operations and troubleshooting.



AI should produce logging that is:



\- meaningful

\- structured where appropriate

\- safe for production

\- free of secrets and personal sensitive data unless explicitly justified and protected



Security-relevant actions should be logged where appropriate, such as:



\- failed logins

\- permission denials

\- suspicious input patterns

\- critical configuration failures



\---



\## API Design Rules



AI-generated APIs must be:



\- explicit

\- versionable where needed

\- schema-consistent

\- stable in behavior

\- predictable in error handling



AI must include validation for:



\- required fields

\- field types

\- allowed ranges

\- unknown or malformed payloads where relevant



AI must not return inconsistent response structures for similar outcomes.



\---



\## File and Upload Safety Rules



AI-generated file handling must verify:



\- file type

\- file size

\- allowed destination

\- path safety

\- filename normalization where needed



AI must never trust uploaded filenames or client-provided MIME types alone.



\---



\## Frontend and UX Safety Rules



AI-generated UI logic must improve usability, not only visual appearance.



AI should ensure:



\- clear validation messages

\- loading states

\- disabled states for invalid actions

\- predictable error feedback

\- accessibility-conscious markup where relevant



AI must not hide critical failures behind vague messages such as:



\- something went wrong

\- request failed

\- invalid input



unless more useful context is also provided safely.



\---



\## Architecture Safety Rules



AI-generated changes must respect the intended architecture.



AI must avoid:



\- circular dependencies

\- leaking business logic into presentation layers

\- data access logic spread across unrelated modules

\- tightly coupled cross-layer shortcuts

\- hidden side effects in shared utilities



AI should preserve:



\- layer boundaries

\- separation of concerns

\- clear ownership of modules

\- dependency direction rules



\---



\## Documentation Rules



AI-generated changes must include documentation when the change introduces or modifies:



\- architecture

\- workflows

\- configuration

\- public APIs

\- deployment logic

\- database behavior

\- security assumptions

\- operational constraints



Documentation should be concise, factual, and maintainable.



\---



\## Mandatory Review Questions



Every AI-generated change should be checked against the following questions:



1\. Is the logic correct?

2\. Is input validated?

3\. Is authentication or authorization affected?

4\. Are secrets handled safely?

5\. Is the database query efficient?

6\. Are indexes needed?

7\. Could this create a performance regression?

8\. Are failure cases tested?

9\. Are logs safe and useful?

10\. Does the implementation respect architecture boundaries?

11\. Is documentation needed?

12\. Are automated tests included?



If any answer is unclear, the change is not ready.



\---



\## Minimum Required Output from AI for Meaningful Changes



For non-trivial changes, AI should provide or update:



\- implementation

\- unit tests

\- relevant functional tests

\- security considerations

\- performance considerations

\- migration notes when needed

\- documentation updates when needed



\---



\## Definition of Acceptable AI-Generated Code



AI-generated code is acceptable only when it is:



\- reviewed by a human

\- supported by automated tests

\- secure by default

\- operationally understandable

\- performance-conscious

\- aligned with project standards

\- maintainable over time



\---



\## Final Rule



AI is an accelerator, not a replacement for engineering judgment.



The standard is not whether AI can generate the code.



The standard is whether the resulting software is safe, correct, efficient, and maintainable in production.


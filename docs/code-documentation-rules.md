# Code Documentation Rules

## Purpose

This document defines the documentation rules for production software.

Documentation is not optional.  
Readable and maintainable systems require structured documentation.

The purpose of documentation is to ensure that:

- other engineers can understand the system
- the system can be maintained long term
- architectural intent is preserved
- operational teams understand how the system behaves
- future modifications do not break hidden assumptions

Documentation must exist at three levels:

1. System / Architecture level
2. Module / Component level
3. Code / Function level

This is referred to as the **Three Layer Documentation Model**.

---

# The Three Layer Documentation Model

Documentation must exist at three layers.

    System Documentation
        ↓
    Module Documentation
        ↓
    Code Documentation

Each layer serves a different purpose.

---

# Layer 1 — System / Architecture Documentation

This layer explains **how the entire system works**.

It must be understandable by engineers who are new to the project.

System documentation should describe:

- overall system purpose
- architecture overview
- major components
- service boundaries
- data flow
- deployment model
- infrastructure dependencies
- external integrations
- security model
- scaling assumptions

Typical documents include:

- architecture overview
- system design document
- infrastructure overview
- deployment architecture
- service interaction diagrams
- data flow diagrams

Examples:

    docs/architecture.md
    docs/system_overview.md
    docs/deployment.md
    docs/security_model.md

System documentation answers questions such as:

- What does this system do?
- How are services connected?
- Where does data come from?
- What external systems are involved?
- What are the critical dependencies?

---

# Layer 2 — Module / Component Documentation

This layer explains **how individual components work**.

Components include:

- services
- modules
- libraries
- subsystems
- major packages

Module documentation must explain:

- the purpose of the module
- responsibilities
- inputs and outputs
- dependencies
- important design decisions
- performance considerations
- security assumptions

Module documentation must allow another engineer to quickly understand:

- why the module exists
- what problem it solves
- how it should be used
- what constraints it has

Typical locations:

    module README files
    component documentation
    service documentation

Examples:

    service/authentication/README.md
    module/payment_processor/README.md
    lib/database_access/README.md

Module documentation should contain sections such as:

- Overview
- Responsibilities
- Dependencies
- Public Interfaces
- Data Structures
- Error Handling
- Security Considerations
- Performance Notes

---

# Layer 3 — Code / Function Documentation

This layer explains **how the code itself works**.

Code documentation exists directly inside source files.

The purpose is to explain:

- intent
- assumptions
- complex logic
- non-obvious behavior
- algorithmic reasoning
- edge cases

Code comments should describe **why something exists**, not only **what it does**.

Poor example:

    increments counter

Better example:

    increment retry counter to prevent infinite retry loops

Function documentation should explain:

- what the function does
- input parameters
- return values
- expected behavior
- error conditions
- important side effects

Example structure:

    Function Purpose
    Input Parameters
    Return Value
    Error Conditions
    Notes

---

# When Documentation Is Required

Documentation must be written when:

- a new module is created
- architecture changes
- new APIs are introduced
- complex algorithms are implemented
- security-sensitive logic is added
- database schema changes
- infrastructure assumptions change
- configuration requirements change

Documentation must also be updated when existing behavior changes.

Outdated documentation is considered a defect.

---

# Documentation Quality Rules

Documentation must be:

- accurate
- concise
- technically correct
- easy to understand
- free of speculation
- updated when behavior changes

Documentation must not contain:

- outdated information
- guesses about behavior
- misleading examples
- undocumented assumptions

---

# Code Comment Rules

Code comments must follow these principles:

Comments must explain:

- intent
- constraints
- design decisions
- unusual logic
- non-obvious performance considerations
- security reasoning

Comments should not repeat obvious code behavior.

Poor example:

    set x to 5

Better example:

    initialize retry limit to prevent runaway background tasks

---

# Public Interface Documentation

Any public interface must be documented.

Examples include:

- public functions
- APIs
- service endpoints
- exported modules
- SDK interfaces

Documentation must describe:

- parameters
- return values
- expected usage
- limitations
- failure behavior

---

# Security Documentation

Security-sensitive components must include documentation describing:

- authentication requirements
- authorization rules
- data protection assumptions
- encryption behavior
- audit logging expectations

Security assumptions must never be hidden in code.

---

# Performance Documentation

Components with performance impact must document:

- expected workload
- scaling assumptions
- performance constraints
- algorithmic complexity when relevant
- caching behavior
- database indexing expectations

This prevents accidental performance regressions.

---

# Documentation Location

Recommended documentation structure:

    docs/
        architecture.md
        system_overview.md
        deployment.md
        security_model.md

    services/
        service_name/
            README.md

    modules/
        module_name/
            README.md

Documentation should live **close to the code it describes**.

---

# Documentation and Code Reviews

Code reviews must verify that documentation is:

- present where required
- accurate
- aligned with the implementation
- updated when behavior changes

Pull requests that introduce architectural changes without documentation should not be merged.

---

# Documentation and AI Assisted Development

When AI is used to generate code, documentation requirements remain the same.

AI-generated code must include:

- module documentation
- function documentation
- explanation of complex logic
- security considerations when relevant
- performance notes when relevant

AI-generated code without documentation is incomplete.

---

# Definition of Done

Code is considered complete only when:

- implementation exists
- tests exist
- documentation exists

Production-quality software requires all three.

---

# Final Principle

Good documentation ensures that software survives beyond the original author.

Systems that lack documentation become fragile, difficult to maintain, and expensive to evolve.

Documentation is therefore a core engineering responsibility.
# Architecture Overview

Target state: modular AI platform with optional external integrations.

Layers:

- core
- platform
- integrations
- infrastructure
- ui

Goal:

- preserve existing functionality
- separate concerns by layer
- keep optional integrations graceful and non-fatal

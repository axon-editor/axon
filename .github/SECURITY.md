# Security policy

## Supported versions

Axon currently provides security fixes for the latest `1.3.x` release line.
Older development builds and release lines may be asked to upgrade before a
report can be reproduced or patched.

| Version | Supported |
| ------- | --------- |
| 1.3.x   | Yes       |
| < 1.3   | No        |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use Axon's
[private vulnerability reporting](https://github.com/axon-editor/axon/security/advisories/new)
form so repository maintainers can investigate before details are disclosed.

Include the affected Axon version and platform, the smallest reproducible
example, the security impact, and any suggested mitigation. Reports involving
workspace trust, terminal execution, extension permissions, custom protocols,
updates, or packaged language servers should also describe the boundary that
was crossed and whether user interaction was required.

You should receive an initial acknowledgement within seven days. Confirmed
issues will be coordinated privately until a fix and disclosure plan are ready.

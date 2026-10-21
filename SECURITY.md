# Security

Braze is experimental. Security fixes target the current `main` branch; there
are no supported stable release lines yet.

The editor and automation server are trusted local development tools. Keep them
bound to loopback. Do not expose them to the internet or load untrusted project
scripts. Project JavaScript has browser privileges and is not sandboxed. Static
player exports are separate from the development server and must not contain
service credentials.

Report vulnerabilities privately through this repository's GitHub Security tab
using **Report a vulnerability**. Include the affected revision, reproduction
steps, impact and a minimal example without live secrets. If private reporting
is unavailable, open an issue asking for a private contact without disclosing
the vulnerability. Do not post credentials or exploit details in a public issue.

This is a volunteer project; response and fix times are not guaranteed.

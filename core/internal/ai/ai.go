// Package ai is the future home for Axon's provider routing, prompt assembly,
// and edit-application flow.
//
// I keep this package present even before the AI feature lands because the
// server layout already documents AI as a first-class subsystem. Without a
// valid package declaration, `go test ./...` fails before it can validate the
// rest of the core service, which makes release packaging harder to trust.
package ai
